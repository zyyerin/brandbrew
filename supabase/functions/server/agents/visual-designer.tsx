// ─────────────────────────────────────────────────────────────────────────────
// agents/visual-designer.tsx — Visual Designer Agent
//
// Persona:  Visual designer who refines existing visual elements — recoloring,
//           applying palettes, adapting style while preserving structure and
//           composition.
// Scope:    Handles everything once the visual concept and initial elements are created. 
//           This includes:
//           - Img2img editing — takes an existing image and modifies it
//           (recolor with palette, style transfer, etc.). 
//           - Standalone txt2img generation for element (except visual concept) regeneration.
//           - Visual snapshot generation from multiple sources.
//           - Brand in Context mockup generation using the logo lockup as reference.
//           - Palette extraction and vision text merge via POST /img2txt.
// Model:    Gemini image model (gemini-3-pro-image-preview)
// ─────────────────────────────────────────────────────────────────────────────

import { Hono } from "npm:hono";
import type { Context } from "npm:hono";
import {
  generateImage,
  uploadAndSignImage,
  fetchImageAsBase64,
  callGeminiText,
  callGeminiVision,
  TEXT_MODEL,
  safeParseJson,
} from "../shared/gemini.tsx";
import {
  MERGE_SPECS,
  mergeCardIdToField,
  applyFieldGuard,
  COMMENT_MODIFY_FIELDS,
  MERGE_TEMPERATURES,
  buildCommentModifyPrompt,
  buildEditImagePrompt,
  buildExtractPalettePrompt,
  buildMergeJsonPrompt,
  buildVisionMergePrompt,
  buildMergeGeneratePrompt,
  buildMergeGeneratePromptColorPaletteStructured,
  isMergeGenerateColorPaletteStructuredSlot,
  formatMergeBoardPromptContext,
  mergeBoardContextFromBrandData,
  normalizeMergeBoardFromBody,
  withLogoWhiteCanvas,
} from "../shared/merge-specs.tsx";
import { prepareTextMerge } from "../shared/merge-text.ts";
import {
  resolveImg2ImgImpl,
  resolveImg2TxtImpl,
  resolveMergeKind,
  resolveTxt2ImgImpl,
  type MergeKind,
} from "../shared/merge-routes.ts";
import { parseImageGenPurpose, resolveAspectRatio } from "../shared/image-config.tsx";
import { IMAGE_TEXT_POLICY } from "../shared/image-text-policy.ts";
import { buildSnapshotPrompt } from "../shared/snapshot-prompts.ts";
import {
  buildBriefIdentityContextText,
  normalizeShortContext,
  omitTaglineForLogo,
} from "../shared/brand-context.ts";
import { createTimer, logTimingReport } from "../shared/timing.ts";

const visualDesigner = new Hono();

// ── Base64 payload guard ──────────────────────────────────────────────────────
// Client-supplied base64 is not fetched through fetchImageAsBase64, so it has
// no server-side size check. ~8 MB decoded → ~11.2 MB base64.

const MAX_B64_LENGTH = 11_200_000;

function validateBase64(b64: string | undefined, label: string): string | null {
  if (!b64) return null;
  if (b64.length > MAX_B64_LENGTH) return `${label} exceeds size limit`;
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDevMode(): boolean {
  return Deno.env.get("ENABLE_DEV_ROUTES") === "true";
}

function getEffectiveOverride<T>(overrideValue: T): T | undefined {
  return isDevMode() ? overrideValue : undefined;
}

function hasShortContext(body: unknown): boolean {
  return !!(
    body &&
    typeof body === "object" &&
    "brandContextShort" in body &&
    body.brandContextShort &&
    typeof body.brandContextShort === "object"
  );
}

function buildErrorPayload(publicMessage: string, err: unknown, debug?: Record<string, unknown>) {
  const detail = err instanceof Error ? err.message : String(err);
  const payload: Record<string, unknown> = { error: publicMessage };
  if (detail && detail !== "[object Object]") {
    payload.details = detail.length > 500 ? `${detail.slice(0, 500)}…` : detail;
  }
  if (isDevMode()) {
    payload.error = `${publicMessage}: ${detail}`;
    if (debug) payload._debug = debug;
  }
  return payload;
}

// ── Unwrap single-key LLM wrappers ──────────────────────────────────────────
// LLM responses often wrap the value in {"fieldName": value}. This helper
// unwraps when the parsed result has exactly one key whose value type matches
// the expected target shape (array, string, or object).

function unwrapSingleKeyWrapper(targetData: unknown, parsed: unknown): unknown {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return parsed;
  const keys = Object.keys(parsed as Record<string, unknown>);
  if (keys.length !== 1) return parsed;
  const inner = (parsed as Record<string, unknown>)[keys[0]];
  if (Array.isArray(targetData) && Array.isArray(inner)) return inner;
  if (typeof targetData === "string" && typeof inner === "string") return inner;
  if (typeof targetData === "object" && targetData !== null && !Array.isArray(targetData) &&
      typeof inner === "object" && inner !== null && !Array.isArray(inner)) return inner;
  return parsed;
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function requireMergeIds(
  body: Record<string, unknown>,
): { sourceId: string; targetId: string } | { error: string } {
  const sourceId = asNonEmptyString(body.sourceId);
  const targetId = asNonEmptyString(body.targetId);
  if (!sourceId || !targetId) return { error: "sourceId and targetId are required" };
  return { sourceId, targetId };
}

function rejectWrongMergeKind(
  c: Context,
  sourceId: string,
  targetId: string,
  expected: MergeKind,
  targetVarId?: string,
) {
  const kind = resolveMergeKind(sourceId, targetId, targetVarId);
  if (kind === expected) return null;
  return c.json(
    { error: `Expected ${expected} merge for ${sourceId}→${targetId}, got ${kind ?? "unsupported"}` },
    400,
  );
}

async function runEditImage(c: Context, body: Record<string, unknown>): Promise<Response> {
  try {
    const startTime = Date.now();
    if (!hasShortContext(body)) {
      return c.json({ error: "brandContextShort is required" }, 400);
    }
    const cardType = asNonEmptyString(body.cardType);
    const sourceId = asNonEmptyString(body.sourceId);
    const newHint = typeof body.newHint === "string" ? body.newHint : undefined;
    const sourceImageUrl = asNonEmptyString(body.sourceImageUrl);
    const referenceImageUrl = asNonEmptyString(body.referenceImageUrl);
    const paletteImageBase64 = typeof body.paletteImageBase64 === "string" ? body.paletteImageBase64 : undefined;
    const aspectRatio = asNonEmptyString(body.aspectRatio);
    const colorPalette = Array.isArray(body.colorPalette) ? body.colorPalette as string[] : undefined;
    const shortContext = omitTaglineForLogo(cardType, normalizeShortContext(body));
    const brandName = shortContext.name;
    const tagline = shortContext.tagline;

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return c.json({ error: "GEMINI_API_KEY not configured" }, 500);

    if (!sourceImageUrl) {
      return c.json({ error: "sourceImageUrl is required for image editing" }, 400);
    }

    const paletteB64Error = validateBase64(paletteImageBase64, "paletteImageBase64");
    if (paletteB64Error) return c.json({ error: paletteB64Error }, 400);

    console.log(`[visual-designer] Fetching source image for img2img edit…`);
    const fetched = await fetchImageAsBase64(sourceImageUrl);
    if ("error" in fetched) {
      console.log(`[visual-designer] Source image fetch failed: ${fetched.error}`);
      return c.json({ error: "Source image fetch failed" }, 400);
    }
    const sourceImage = fetched;

    let referenceImage: { b64: string; mimeType: string } | undefined;
    if (referenceImageUrl) {
      console.log(`[visual-designer] Fetching reference image for card-to-card merge…`);
      const refFetched = await fetchImageAsBase64(referenceImageUrl);
      if ("error" in refFetched) {
        console.log(`[visual-designer] Reference image fetch failed (proceeding without): ${refFetched.error}`);
      } else {
        referenceImage = refFetched;
      }
    }

    const paletteImage: { b64: string; mimeType: string } | undefined =
      paletteImageBase64 ? { b64: paletteImageBase64, mimeType: "image/png" } : undefined;

    const effectiveAR = resolveAspectRatio(cardType, aspectRatio);
    const hasPalette = !!paletteImage;
    const hasRef = !!referenceImage;

    const prompt = buildEditImagePrompt({
      newHint,
      hasPaletteImage: hasPalette,
      hasReferenceImage: hasRef,
      colorPaletteHex: colorPalette,
      cardType,
      sourceId,
      brandName,
      tagline,
    });

    const mode = hasRef ? "img2img+ref" : hasPalette ? "img2img+palette" : "img2img";
    console.log(`[visual-designer] Editing (${mode}) — cardType=${cardType} ar=${effectiveAR} prompt="${prompt.slice(0, 80)}…"`);

    const purpose = parseImageGenPurpose(body.purpose);
    const genResult = await generateImage(apiKey, prompt, {
      cardType,
      sourceImage,
      paletteImage,
      referenceImage,
      aspectRatio: effectiveAR,
      purpose,
    });

    const imageUrl = await uploadAndSignImage(genResult.b64, genResult.mimeType, cardType, c.req.header("X-Project-Id"));
    const generationTime = Date.now() - startTime;
    const usedModel = genResult.usedModel;

    const selectedElementLabels = [
      referenceImageUrl && "Reference image",
      "Source image",
      paletteImageBase64 && "Color Palette",
    ].filter(Boolean) as string[];

    return c.json({
      imageUrl,
      _meta: {
        agent: "visual-designer",
        prompt,
        promptKey: `edit:${cardType}`,
        model: usedModel,
        generationTime,
        ...(newHint ? { userInput: newHint } : {}),
        ingredients: [],
        referenceImageUrls: [referenceImageUrl, sourceImageUrl].filter(Boolean) as string[],
        paletteImageDataUrl: paletteImageBase64
          ? `data:image/png;base64,${paletteImageBase64}`
          : undefined,
        selectedElementLabels: selectedElementLabels.length > 0 ? selectedElementLabels : undefined,
      },
    });
  } catch (err) {
    console.error("[visual-designer] edit error:", (err as Error)?.stack ?? String(err));
    return c.json(buildErrorPayload("Image editing failed", err), 500);
  }
}

// ── Route: POST /edit ────────────────────────────────────────────────────────
// Comment-modify for image cards (recolor, free-form edit). Merge img2img uses /img2img.

visualDesigner.post("/edit", async (c) => {
  const body = await c.req.json() as Record<string, unknown>;
  return runEditImage(c, body);
});

// ── Route: POST /visual-snapshot ─────────────────────────────────────────────
// Generates a visual snapshot from reference image URLs (client: logo then art-style)
// plus optional legacy palette bitmap and text context (colors, fonts, concept).
// When new context fields are present the prompt is built server-side;
// otherwise falls back to the legacy client-supplied prompt string.

visualDesigner.post("/visual-snapshot", async (c) => {
  const timer = createTimer("visual-snapshot");
  try {
    const startTime = Date.now();
    const closeParse = timer.open("request.parseBody");
    const body = await c.req.json();
    closeParse();
    if (!hasShortContext(body)) {
      return c.json({ error: "brandContextShort is required" }, 400);
    }
    const {
      cardType,
      prompt: legacyPrompt,
      referenceImageUrls = [],
      referenceImageRoles,
      paletteImageBase64,
      aspectRatio,
      font1,
      font2,
    } = body;
    const shortContext = normalizeShortContext(body);
    const brandName = shortContext.name;
    const brandDescription = undefined;
    const keywords = shortContext.keywords;
    const visualConcept = shortContext.visualConcept
      ? {
        concept: shortContext.visualConcept.concept,
        description: shortContext.visualConcept.description ?? "",
      }
      : undefined;
    const colorPalette = shortContext.colorPalette;
    const shortFont1 = shortContext.titleFont ?? font1;
    const shortFont2 = shortContext.bodyFont ?? font2;

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return c.json({ error: "GEMINI_API_KEY not configured" }, 500);

    const hasAnyImages = (referenceImageUrls?.length ?? 0) > 0 || !!paletteImageBase64;
    if (!hasAnyImages) {
      return c.json({ error: "At least one reference image or paletteImageBase64 is required" }, 400);
    }

    const paletteB64Error = validateBase64(paletteImageBase64, "paletteImageBase64");
    if (paletteB64Error) return c.json({ error: paletteB64Error }, 400);

    const images: Array<{ b64: string; mimeType: string }> = [];

    // Optional palette swatch image (canvas-rendered on the client)
    if (paletteImageBase64) {
      images.push({ b64: paletteImageBase64, mimeType: "image/png" });
    }

    // Fetch each reference image URL into base64 for Gemini
    for (const [refIndex, url] of ((referenceImageUrls ?? []) as string[]).entries()) {
      const fetched = await fetchImageAsBase64(url, timer.child(`ref${refIndex + 1}`));
      if ("error" in fetched) {
        console.log(`[visual-designer] Skipping reference image (fetch failed): ${fetched.error}`);
        continue;
      }
      images.push(fetched);
    }

    if (images.length === 0) {
      return c.json({ error: "Failed to load reference images" }, 400);
    }

    const effectiveAR = resolveAspectRatio(cardType ?? "visual-snapshot", aspectRatio);

    // Build a structured prompt when new context fields are present;
    // fall back to the legacy client-supplied prompt string for backward compat.
    const hasNewContext = brandDescription || (keywords?.length) || visualConcept || referenceImageRoles;
    const prompt = hasNewContext
      ? buildSnapshotPrompt({
          brandName,
          brandDescription,
          keywords,
          visualConcept,
          colorPalette,
          font1: shortFont1,
          font2: shortFont2,
          hasPalette: !!paletteImageBase64,
          referenceImageRoles,
        })
      : String(legacyPrompt ?? "");

    console.log(
      `[visual-designer] Generating visual snapshot — cardType=${cardType} ar=${effectiveAR} refs=${referenceImageUrls?.length ?? 0} ` +
      `palette=${paletteImageBase64 ? "yes" : "no"} newContext=${!!hasNewContext} prompt="${prompt.slice(0, 80)}…"`,
    );

    const promptText = prompt;
    let genResult: Awaited<ReturnType<typeof generateImage>> | null = null;
    let fallbackMode = "none";
    try {
      genResult = await generateImage(apiKey, promptText, {
        cardType: cardType ?? "visual-snapshot",
        refImages: images,
        aspectRatio: effectiveAR,
        timer: timer.child("gen"),
      });
    } catch (err) {
      const errMsg = String(err);
      const likelySafetyBlock =
        errMsg.includes("blockReason") || errMsg.includes("no inlineData");

      if (!likelySafetyBlock || images.length <= 1) {
        throw err;
      }

      // Retry with reduced image sets when multimodal safety blocks image output.
      const fallbackCandidates: Array<{ mode: string; images: Array<{ b64: string; mimeType: string }> }> = [];
      if (paletteImageBase64 && images.length > 1) {
        fallbackCandidates.push({ mode: "drop-palette", images: images.slice(1) });
      }
      if (images.length > 1) {
        fallbackCandidates.push({ mode: "last-reference-only", images: [images[images.length - 1]] });
      }
      if (paletteImageBase64) {
        fallbackCandidates.push({ mode: "palette-only", images: [images[0]] });
      }

      const fallbackErrors: string[] = [];
      let recovered = false;
      for (const candidate of fallbackCandidates) {
        if (!candidate.images.length) continue;
        if (Date.now() - startTime > 120_000) {
          console.log(`[visual-designer] Fallback deadline exceeded, aborting retries`);
          break;
        }
        try {
          genResult = await generateImage(apiKey, promptText, {
            cardType: cardType ?? "visual-snapshot",
            refImages: candidate.images,
            aspectRatio: effectiveAR,
            timer: timer.child(`fallback-${candidate.mode}`),
          });
          fallbackMode = candidate.mode;
          recovered = true;
          console.log(`[visual-designer] Visual snapshot recovered with fallback=${fallbackMode}`);
          break;
        } catch (fallbackErr) {
          fallbackErrors.push(`${candidate.mode}: ${String(fallbackErr)}`);
        }
      }

      if (!recovered) {
        throw new Error(`${errMsg} | fallback attempts failed: ${fallbackErrors.join(" || ")}`);
      }
    }

    if (!genResult) {
      throw new Error("Visual snapshot generation produced no result");
    }

    const imageUrl = await uploadAndSignImage(genResult.b64, genResult.mimeType, cardType ?? "visual-snapshot", c.req.header("X-Project-Id"), timer);
    const generationTime = Date.now() - startTime;
    const usedModel = genResult.usedModel;
    const timings = timer.report();
    logTimingReport(timings);

    return c.json({
      imageUrl,
      _meta: {
        agent: "visual-designer-visual-snapshot",
        prompt,
        model: usedModel,
        generationTime,
        timings,
        ingredients: [brandName].filter(Boolean),
      },
    });
  } catch (err) {
    console.error("[visual-designer] visual-snapshot error:", (err as Error)?.stack ?? String(err));
    logTimingReport(timer.report());
    return c.json(buildErrorPayload("Visual snapshot image generation failed", err), 500);
  }
});

// ── Route: POST /context ──────────────────────────────────────────────────────
// Generates a single Brand in Context mockup image for a given application
// using the finished logo lockup (if provided) as the visual reference.

visualDesigner.post("/context", async (c) => {
  const timer = createTimer("context");
  try {
    const startTime = Date.now();
    const closeParse = timer.open("request.parseBody");
    const body = await c.req.json();
    closeParse();
    const {
      application,
      prompt,
      referenceImageUrls = [],
      aspectRatio,
      brandDescription: rawBrandDescription,
    } = body as {
      application?: string;
      prompt?: string;
      referenceImageUrls?: string[];
      aspectRatio?: string;
      brandDescription?: string;
    };
    const brandName = normalizeShortContext(body).name;
    const brandDescription =
      typeof rawBrandDescription === "string" && rawBrandDescription.trim().length > 0
        ? rawBrandDescription.trim()
        : "";
    const brandDescriptionForPrompt =
      brandDescription.length > 1500
        ? `${brandDescription.slice(0, 1500)}…`
        : brandDescription;

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return c.json({ error: "GEMINI_API_KEY not configured" }, 500);

    if (!application) {
      return c.json({ error: "application is required" }, 400);
    }

    const images: Array<{ b64: string; mimeType: string }> = [];
    for (const [refIndex, url] of (referenceImageUrls ?? []).entries()) {
      const fetched = await fetchImageAsBase64(url, timer.child(`ref${refIndex + 1}`));
      if ("error" in fetched) {
        console.log(`[visual-designer] Skipping context ref image (fetch failed): ${fetched.error}`);
        continue;
      }
      images.push(fetched);
    }

    const effectiveAR = resolveAspectRatio("brand-context", aspectRatio);
    let effectivePrompt =
      prompt ??
      `Create a curated brand application mockup of ${application}${brandName ? ` for "${brandName}"` : ""}. The reference image is the finished brand logo lockup. Place that exact mark on the physical ${application}. Vary scale between full-bleed moments and smaller placements. Keep the result presentation-ready, realistic, and cohesive. Avoid watermarks or dense illegible text.`;
    if (brandDescriptionForPrompt) {
      effectivePrompt =
        `${effectivePrompt}\n\nBrand description: ${brandDescriptionForPrompt}`;
    }
    effectivePrompt = `${effectivePrompt}\n\n${IMAGE_TEXT_POLICY}`;

    console.log(
      `[visual-designer] Generating context mockup — application=${application} ar=${effectiveAR} refs=${images.length} prompt="${effectivePrompt.slice(0, 80)}…"`,
    );

    if (images.length === 0) {
      console.log(`[visual-designer] No reference images available, generating context from text only`);
    }

    let genResult;
    try {
      genResult = await generateImage(apiKey, effectivePrompt, {
        cardType: "application",
        refImages: images,
        aspectRatio: effectiveAR,
        timer: timer.child("gen"),
      });
    } catch (err) {
      try {
        if (images.length === 0) throw err;

        console.log(`[visual-designer] Context generation failed with refs, retrying without reference images: ${String(err)}`);
        genResult = await generateImage(apiKey, effectivePrompt, {
          cardType: "application",
          refImages: [],
          aspectRatio: effectiveAR,
          timer: timer.child("gen-noRefs"),
        });
      } catch (retryErr) {
        const warning = retryErr instanceof Error ? retryErr.message : String(retryErr);
        console.warn(`[visual-designer] Context generation skipped for "${application}": ${warning}`);
        const timings = timer.report();
        logTimingReport(timings);
        return c.json({
          imageUrl: null,
          warning,
          _meta: {
            agent: "visual-designer-context",
            prompt: effectivePrompt,
            generationTime: Date.now() - startTime,
            timings,
            ingredients: [brandName, application].filter(Boolean),
          },
        });
      }
    }

    const imageUrl = await uploadAndSignImage(
      genResult.b64,
      genResult.mimeType,
      "brand-context",
      c.req.header("X-Project-Id"),
      timer,
    );
    const generationTime = Date.now() - startTime;
    const usedModel = genResult.usedModel;
    const timings = timer.report();
    logTimingReport(timings);

    return c.json({
      imageUrl,
      _meta: {
        agent: "visual-designer-context",
        prompt: effectivePrompt,
        model: usedModel,
        generationTime,
        timings,
        ingredients: [brandName, application].filter(Boolean),
      },
    });
  } catch (err) {
    console.error("[visual-designer] context error:", (err as Error)?.stack ?? String(err));
    logTimingReport(timer.report());
    return c.json(buildErrorPayload("Context image generation failed", err), 500);
  }
});

// ── Merge runners (txt2img generate / img2img generate) ──────────────────────
// Palette→logo|art-style uses structured brief + 【Visual Concept】; others use
// buildMergeGeneratePrompt (hint → active slots → VC). Gemini parts: reference
// images first, then text.

async function runMergeGenerate(
  c: Context,
  body: Record<string, unknown>,
  ids: { sourceId: string; targetId: string },
  opts: { requireSourceImage: boolean },
): Promise<Response> {
  try {
    const startTime = Date.now();
    if (!hasShortContext(body)) {
      return c.json({ error: "brandContextShort is required" }, 400);
    }
    const cardType = ids.targetId;
    const sourceId = ids.sourceId;
    const newHint = typeof body.newHint === "string" ? body.newHint : "";
    const sourceTextData = body.sourceTextData;
    const aspectRatio = asNonEmptyString(body.aspectRatio);
    const sourceImageUrl = opts.requireSourceImage
      ? asNonEmptyString(body.sourceImageUrl)
      : undefined;
    const shortContext = omitTaglineForLogo(cardType, normalizeShortContext(body));
    const brandName = shortContext.name;

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return c.json({ error: "GEMINI_API_KEY not configured" }, 500);

    if (!newHint) {
      return c.json({ error: "newHint is required for merge generation" }, 400);
    }
    if (newHint.length > 500)
      return c.json({ error: "newHint exceeds maximum length of 500 characters" }, 400);

    let sourceImage: { b64: string; mimeType: string } | undefined;
    if (opts.requireSourceImage) {
      if (!sourceImageUrl) {
        return c.json({ error: "sourceImageUrl is required for img2img generate" }, 400);
      }
      const fetched = await fetchImageAsBase64(sourceImageUrl);
      if ("error" in fetched) {
        console.log(`[visual-designer] Source image fetch failed: ${fetched.error}`);
        return c.json({ error: "Failed to fetch source image" }, 400);
      }
      sourceImage = fetched;
    }

    const effectiveAR = resolveAspectRatio(cardType, aspectRatio);

    // Only inject application touchpoint when generating application mockups
    const contextForPrompt = cardType === "application"
      ? shortContext
      : { ...shortContext, application: undefined };

    const board = normalizeMergeBoardFromBody(body, contextForPrompt);
    const be = board.boardElements;

    const seenImageUrls = new Set<string>();
    if (typeof sourceImageUrl === "string" && sourceImageUrl.trim()) {
      seenImageUrls.add(sourceImageUrl.trim());
    }

    let artBoardImage: { b64: string; mimeType: string } | undefined;
    const artStyleUrl = be.artStyle?.imageUrl?.trim();
    if (artStyleUrl && !seenImageUrls.has(artStyleUrl)) {
      const fetched = await fetchImageAsBase64(artStyleUrl);
      if ("error" in fetched) {
        console.log(`[visual-designer] merge-generate board art-style fetch failed: ${fetched.error}`);
      } else {
        artBoardImage = fetched;
        seenImageUrls.add(artStyleUrl);
      }
    }

    let logoBoardImage: { b64: string; mimeType: string } | undefined;
    const logoUrl = be.logoInspiration?.imageUrl?.trim();
    if (logoUrl && !seenImageUrls.has(logoUrl)) {
      const fetched = await fetchImageAsBase64(logoUrl);
      if ("error" in fetched) {
        console.log(`[visual-designer] merge-generate board logo fetch failed: ${fetched.error}`);
      } else {
        logoBoardImage = fetched;
        seenImageUrls.add(logoUrl);
      }
    }

    const useBoardInlineImages = !!(artBoardImage || logoBoardImage);
    const refImages: Array<{ b64: string; mimeType: string }> = [];
    const refGuideParts: string[] = [];
    let refIdx = 1;
    if (useBoardInlineImages) {
      if (sourceImage) {
        refImages.push(sourceImage);
        refGuideParts.push(`${refIdx++}) primary merge source image`);
      }
      if (artBoardImage) {
        refImages.push(artBoardImage);
        refGuideParts.push(`${refIdx++}) style reference`);
      }
      if (logoBoardImage) {
        refImages.push(logoBoardImage);
        refGuideParts.push(`${refIdx++}) logo`);
      }
    }

    const colorPaletteStructuredSlot = isMergeGenerateColorPaletteStructuredSlot(sourceId, cardType);
    const refImageGuide = colorPaletteStructuredSlot
      ? undefined
      : refGuideParts.length > 0
        ? `The ${refGuideParts.length} reference image(s) are provided before this text, in order: ${refGuideParts.join("; ")}.`
        : undefined;

    const boardFormat = {
      omitArtStyleUrl: !!artBoardImage,
      omitLogoUrl: !!logoBoardImage,
    };

    const prompt = colorPaletteStructuredSlot
      ? buildMergeGeneratePromptColorPaletteStructured({
          taskLine: newHint.trim(),
          board,
          brandCoreText: buildBriefIdentityContextText(shortContext),
          boardFormat,
          sourceTextData,
          cardType,
        })
      : buildMergeGeneratePrompt({
          newHint,
          sourceId,
          sourceTextData,
          board,
          boardFormat,
          refImageGuide,
        });

    const textPolicy = cardType === "application" ? IMAGE_TEXT_POLICY : "";
    const promptWithPolicy = withLogoWhiteCanvas(
      textPolicy ? `${prompt}\n\n${textPolicy}` : prompt,
      cardType,
    );

    const mode = useBoardInlineImages
      ? `multi-ref(${refImages.length})`
      : sourceImage
        ? "img2img"
        : "txt2img";
    console.log(`[visual-designer] Merge-generate (${mode}) — cardType=${cardType} ar=${effectiveAR} prompt="${promptWithPolicy.slice(0, 80)}…"`);

    const genResult = useBoardInlineImages && refImages.length > 0
      ? await generateImage(apiKey, promptWithPolicy, {
        cardType,
        refImages,
        aspectRatio: effectiveAR,
        purpose: "merge",
      })
      : await generateImage(apiKey, promptWithPolicy, {
        cardType,
        sourceImage,
        aspectRatio: effectiveAR,
        purpose: "merge",
      });
    const imageUrl = await uploadAndSignImage(genResult.b64, genResult.mimeType, cardType, c.req.header("X-Project-Id"));
    const generationTime = Date.now() - startTime;
    const usedModel = genResult.usedModel;

    return c.json({
      imageUrl,
      _meta: {
        agent: "visual-designer",
        prompt: promptWithPolicy,
        promptKey: `${sourceId}->${cardType}:${opts.requireSourceImage ? "img2img" : "txt2img"}`,
        model: usedModel,
        generationTime,
        ingredients: [brandName].filter(Boolean),
      },
    });
  } catch (err) {
    console.error("[visual-designer] merge-generate error:", (err as Error)?.stack ?? String(err));
    return c.json(buildErrorPayload("Merge image generation failed", err), 500);
  }
}

// Wordmark: font→logo txt2img. Storage stays on "logo".

async function runWordmark(
  c: Context,
  body: Record<string, unknown>,
  ids: { sourceId: string; targetId: string },
): Promise<Response> {
  try {
    const startTime = Date.now();
    if (!hasShortContext(body)) {
      return c.json({ error: "brandContextShort is required" }, 400);
    }
    const newHint = typeof body.newHint === "string" ? body.newHint : undefined;
    const aspectRatio = asNonEmptyString(body.aspectRatio);
    const sourceText = isRecord(body.sourceTextData) ? body.sourceTextData : null;
    const shortContext = omitTaglineForLogo(ids.targetId, normalizeShortContext(body));
    const brandName = shortContext.name;
    const effectiveTitleFont = asNonEmptyString(body.titleFont)
      ?? asNonEmptyString(sourceText?.titleFont)
      ?? shortContext.titleFont;
    if (!effectiveTitleFont) {
      return c.json({ error: "titleFont is required for wordmark generation" }, 400);
    }
    const cardType = ids.targetId;

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return c.json({ error: "GEMINI_API_KEY not configured" }, 500);

    const effectiveAR = resolveAspectRatio("wordmark", aspectRatio);
    const name = brandName ?? "the brand";

    // Concise prompt: one sentence, brand name + font. The typeface is named
    // unquoted and framed as a character reference, since only the brand name
    // belongs in the artwork as literal text.
    const hint = newHint ? `${newHint}. ` : "";
    const typefaceClause = effectiveTitleFont
      ? `with the visual character of the ${effectiveTitleFont} typeface`
      : "with the visual character of a display typeface";
    const prompt = `${hint}Brand wordmark logo for "${name}" ${typefaceClause}`;

    console.log(`[visual-designer] Generating wordmark (txt2img) — font=${effectiveTitleFont} ar=${effectiveAR} prompt="${prompt.slice(0, 80)}…"`);

    const genResult = await generateImage(apiKey, prompt, {
      cardType: "wordmark",
      aspectRatio: effectiveAR,
      purpose: "merge",
    });

    const imageUrl = await uploadAndSignImage(genResult.b64, genResult.mimeType, cardType, c.req.header("X-Project-Id"));
    const generationTime = Date.now() - startTime;
    const usedModel = genResult.usedModel;

    const selectedElementLabels = [
      brandName && "Brand Brief",
      effectiveTitleFont && "Typography",
    ].filter(Boolean) as string[];

    return c.json({
      imageUrl,
      _meta: {
        agent: "visual-designer",
        prompt,
        promptKey: `${ids.sourceId}->${ids.targetId}:txt2img`,
        model: usedModel,
        generationTime,
        ingredients: [brandName, effectiveTitleFont].filter(Boolean),
        selectedElementLabels: selectedElementLabels.length > 0 ? selectedElementLabels : undefined,
      },
    });
  } catch (err) {
    console.error("[visual-designer] wordmark error:", (err as Error)?.stack ?? String(err));
    return c.json(buildErrorPayload("Wordmark generation failed", err), 500);
  }
}

async function runExtractPalette(
  c: Context,
  body: Record<string, unknown>,
  ids: { sourceId: string; targetId: string },
): Promise<Response> {
  let _rawGeminiText: string | undefined;
  try {
    const startTime = Date.now();
    const sourceId = ids.sourceId;
    const sourceImageUrl = asNonEmptyString(body.sourceImageUrl);
    const brandData = body.brandData;
    const _promptOverride = body._promptOverride;
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return c.json({ error: "GEMINI_API_KEY not configured" }, 500);

    if (!sourceImageUrl) {
      return c.json({ error: "sourceImageUrl is required" }, 400);
    }

    const spec = MERGE_SPECS[sourceId]?.[ids.targetId];
    if (!spec?.instruction) {
      return c.json({ error: `No vision-based palette spec found for source: ${sourceId}` }, 400);
    }

    const imageResult = await fetchImageAsBase64(sourceImageUrl);
    if ("error" in imageResult) {
      console.log(`[visual-designer] extract-palette source image fetch failed: ${imageResult.error}`);
      return c.json({ error: "Failed to fetch source image" }, 400);
    }

    // Inject current palette as a constraint so the extracted palette matches
    // the same number of colors and preserves a similar contrast structure.
    const currentPalette = isRecord(brandData) && Array.isArray(brandData.colorPalette)
      ? (brandData.colorPalette as string[])
      : undefined;
    const effectiveOverride = getEffectiveOverride(_promptOverride) as { fullPrompt?: string } | undefined;

    const hasExistingPalette = Array.isArray(currentPalette) && currentPalette.length > 0;
    const altExtract = spec.extractPaletteInstructionWithExistingTarget?.trim();
    let baseInstruction = spec.instruction ?? "";
    if (hasExistingPalette && altExtract) {
      baseInstruction = altExtract.replace(/\{sourceData\}/g, currentPalette.join(", "));
    }

    const instruction = effectiveOverride?.fullPrompt
      ?? buildExtractPalettePrompt(
        baseInstruction,
        hasExistingPalette && altExtract ? undefined : currentPalette,
        hasExistingPalette && altExtract ? { omitPaletteConstraint: true } : undefined,
      );

    console.log(`[visual-designer] Extracting palette — sourceId=${sourceId} currentPaletteSize=${currentPalette?.length ?? "unknown"}`);
    _rawGeminiText = await callGeminiVision(
      apiKey,
      instruction,
      imageResult.b64,
      imageResult.mimeType,
      { temperature: MERGE_TEMPERATURES["extract-palette"] },
      spec.textModel,
    );
    const parsed = safeParseJson<Record<string, unknown>>(_rawGeminiText, "extract-palette");
    const colorPalette = unwrapSingleKeyWrapper([], parsed?.colorPalette ?? parsed);

    if (!Array.isArray(colorPalette) || colorPalette.length === 0) {
      return c.json({ error: "Vision model returned no colorPalette array" }, 500);
    }
    const checkedPalette = applyFieldGuard(
      Array.isArray(currentPalette) ? currentPalette : [],
      colorPalette,
      ["colorPalette"],
      "colorPalette",
    ) as string[];

    const generationTime = Date.now() - startTime;
    console.log(`[visual-designer] Palette extracted (${generationTime}ms): ${checkedPalette.join(", ")}`);

    const SOURCE_LABELS: Record<string, string> = {
      "art-style": "Art Style",
      "logo": "Logo",
      "application": "Application",
      "visual-snapshot": "Visual Snapshot",
    };
    const sourceLabel = SOURCE_LABELS[sourceId] ?? sourceId;

    return c.json({
      patch: { colorPalette: checkedPalette },
      _meta: {
        agent: "visual-designer",
        prompt: instruction,
        promptKey: `${sourceId}->${ids.targetId}:img2txt`,
        model: spec.textModel ?? TEXT_MODEL,
        generationTime,
        ingredients: [],
        referenceImageUrls: [sourceImageUrl],
        selectedElementLabels: [sourceLabel],
      },
    });
  } catch (err) {
    console.error("[visual-designer] extract-palette error:", (err as Error)?.stack ?? String(err));
    return c.json(
      buildErrorPayload("Palette extraction failed", err, _rawGeminiText ? { rawText: _rawGeminiText.slice(0, 500) } : undefined),
      500,
    );
  }
}

async function runVisionMerge(
  c: Context,
  body: Record<string, unknown>,
  ids: { sourceId: string; targetId: string },
): Promise<Response> {
  let _rawGeminiText: string | undefined;
  try {
    const startTime = Date.now();
    const { sourceId, targetId } = ids;
    const sourceImageUrl = asNonEmptyString(body.sourceImageUrl);
    const brandData = body.brandData;
    const _promptOverride = body._promptOverride;
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return c.json({ error: "GEMINI_API_KEY not configured" }, 500);

    if (!isRecord(brandData)) {
      return c.json({ error: "brandData must be an object" }, 400);
    }
    if (!sourceImageUrl) {
      return c.json({ error: "sourceImageUrl is required" }, 400);
    }

    const prepared = prepareTextMerge(
      sourceId,
      targetId,
      brandData,
      MERGE_SPECS[sourceId]?.[targetId],
    );
    if (!prepared.ok) return c.json({ patch: null });
    const { spec, targetField, targetData } = prepared;

    const imageResult = await fetchImageAsBase64(sourceImageUrl);
    if ("error" in imageResult) {
      console.log(`[visual-designer] vision-merge source image fetch failed: ${imageResult.error}`);
      return c.json({ error: "Failed to fetch source image" }, 400);
    }

    const boardAppendix = formatMergeBoardPromptContext(
      mergeBoardContextFromBrandData(brandData as Record<string, unknown>, { targetId, sourceId }),
    );

    const effectiveOverride = getEffectiveOverride(_promptOverride) as { fullPrompt?: string } | undefined;
    const prompt = effectiveOverride?.fullPrompt
      ?? buildVisionMergePrompt(spec.instruction, targetField, targetData, boardAppendix);

    console.log(`[visual-designer] Vision-merge — ${sourceId} -> ${targetId}`);
    _rawGeminiText = await callGeminiVision(
      apiKey,
      prompt,
      imageResult.b64,
      imageResult.mimeType,
      { temperature: MERGE_TEMPERATURES["vision-merge"] },
      spec.textModel,
    );
    const parsed: unknown = safeParseJson<unknown>(_rawGeminiText, "vision-merge");

    let unwrapped = unwrapSingleKeyWrapper(targetData, parsed);
    if (Array.isArray(targetData) && !Array.isArray(unwrapped)) {
      console.log(`[visual-designer] Vision-merge: wrapping non-array response into array for ${targetField}`);
      unwrapped = [unwrapped];
    }
    const guarded = applyFieldGuard(targetData, unwrapped, spec.allowedFields, targetField);

    const generationTime = Date.now() - startTime;
    return c.json({
      patch: { [targetField]: guarded },
      _meta: {
        agent: "visual-designer",
        prompt,
        promptKey: `${sourceId}->${targetId}:img2txt`,
        model: spec.textModel ?? TEXT_MODEL,
        generationTime,
        ingredients: [],
        referenceImageUrls: [sourceImageUrl],
      },
    });
  } catch (err) {
    console.error("[visual-designer] vision-merge error:", (err as Error)?.stack ?? String(err));
    return c.json(
      buildErrorPayload("Vision merge failed", err, _rawGeminiText ? { rawText: _rawGeminiText.slice(0, 500) } : undefined),
      500,
    );
  }
}

async function runTextMerge(
  c: Context,
  body: Record<string, unknown>,
  ids: { sourceId: string; targetId: string },
): Promise<Response> {
  let _rawGeminiText: string | undefined;
  try {
    const startTime = Date.now();
    const { sourceId, targetId } = ids;
    const brandData = body.brandData;
    const _promptOverride = body._promptOverride;
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return c.json({ error: "GEMINI_API_KEY not configured" }, 500);

    if (!isRecord(brandData)) {
      return c.json({ error: "brandData must be an object" }, 400);
    }

    const prepared = prepareTextMerge(
      sourceId,
      targetId,
      brandData,
      MERGE_SPECS[sourceId]?.[targetId],
    );
    if (!prepared.ok) return c.json({ patch: null });
    const { spec, targetField, sourceData, targetData, omitCurrentTargetInContext } = prepared;

    const boardAppendix = formatMergeBoardPromptContext(
      mergeBoardContextFromBrandData(brandData, { targetId, sourceId }),
      { omitArtStyleUrl: true, omitLogoUrl: true },
    );

    const effectiveOverride = getEffectiveOverride(_promptOverride) as { fullPrompt?: string } | undefined;
    const fullPrompt = effectiveOverride?.fullPrompt
      ?? buildMergeJsonPrompt(spec.instruction, sourceData, targetField, targetData, boardAppendix, {
          omitCurrentTargetInContext,
        });

    _rawGeminiText = await callGeminiText(apiKey, fullPrompt, {
      temperature: MERGE_TEMPERATURES["merge"],
      maxOutputTokens: 2048,
    }, spec.textModel);

    const parsed: unknown = safeParseJson<unknown>(_rawGeminiText, "merge");

    const unwrapped = unwrapSingleKeyWrapper(targetData, parsed);

    const guarded = applyFieldGuard(targetData, unwrapped, spec.allowedFields!, targetField);
    const generationTime = Date.now() - startTime;
    console.log(`[visual-designer] Merge complete: ${sourceId} → ${targetId} (field: ${targetField}, ${generationTime}ms)`);
    return c.json({
      patch: { [targetField]: guarded },
      _meta: {
        agent: "visual-designer",
        prompt: fullPrompt,
        promptKey: `${sourceId}->${targetId}:txt2txt`,
        model: spec.textModel ?? TEXT_MODEL,
        generationTime,
        ingredients: [],
      },
    });
  } catch (err) {
    console.error("[visual-designer] merge error:", (err as Error)?.stack ?? String(err));
    return c.json(
      buildErrorPayload("Merge failed", err, _rawGeminiText ? { rawText: _rawGeminiText.slice(0, 500) } : undefined),
      500,
    );
  }
}

async function parseMergeBody(c: Context): Promise<
  { ok: true; body: Record<string, unknown>; ids: { sourceId: string; targetId: string } }
  | { ok: false; response: Response }
> {
  const body = await c.req.json() as Record<string, unknown>;
  const ids = requireMergeIds(body);
  if ("error" in ids) {
    return { ok: false, response: c.json({ error: ids.error }, 400) };
  }
  return { ok: true, body, ids };
}

// ── Merge kind routes ────────────────────────────────────────────────────────

visualDesigner.post("/txt2txt", async (c) => {
  const parsed = await parseMergeBody(c);
  if (!parsed.ok) return parsed.response;
  const rejected = rejectWrongMergeKind(c, parsed.ids.sourceId, parsed.ids.targetId, "txt2txt");
  if (rejected) return rejected;
  return runTextMerge(c, parsed.body, parsed.ids);
});

visualDesigner.post("/img2txt", async (c) => {
  const parsed = await parseMergeBody(c);
  if (!parsed.ok) return parsed.response;
  const rejected = rejectWrongMergeKind(c, parsed.ids.sourceId, parsed.ids.targetId, "img2txt");
  if (rejected) return rejected;
  return resolveImg2TxtImpl(parsed.ids.targetId) === "extract-palette"
    ? runExtractPalette(c, parsed.body, parsed.ids)
    : runVisionMerge(c, parsed.body, parsed.ids);
});

visualDesigner.post("/txt2img", async (c) => {
  const parsed = await parseMergeBody(c);
  if (!parsed.ok) return parsed.response;
  const rejected = rejectWrongMergeKind(c, parsed.ids.sourceId, parsed.ids.targetId, "txt2img");
  if (rejected) return rejected;
  return resolveTxt2ImgImpl(parsed.ids.sourceId, parsed.ids.targetId) === "wordmark"
    ? runWordmark(c, parsed.body, parsed.ids)
    : runMergeGenerate(c, parsed.body, parsed.ids, { requireSourceImage: false });
});

visualDesigner.post("/img2img", async (c) => {
  const parsed = await parseMergeBody(c);
  if (!parsed.ok) return parsed.response;
  const targetImageUrl = asNonEmptyString(parsed.body.targetImageUrl);
  const rejected = rejectWrongMergeKind(
    c,
    parsed.ids.sourceId,
    parsed.ids.targetId,
    "img2img",
    targetImageUrl ? "target" : undefined,
  );
  if (rejected) return rejected;
  if (resolveImg2ImgImpl(!!targetImageUrl) === "edit") {
    return runEditImage(c, {
      ...parsed.body,
      cardType: parsed.ids.targetId,
      sourceImageUrl: targetImageUrl,
    });
  }
  return runMergeGenerate(c, parsed.body, parsed.ids, { requireSourceImage: true });
});

// ── Route: POST /comment-modify ──────────────────────────────────────────────
// Applies a free-form user instruction to a text target card (visual-concept,
// color-palette, or font).

visualDesigner.post("/comment-modify", async (c) => {
  let _rawGeminiText: string | undefined;
  try {
    const startTime = Date.now();
    const { targetId, comment, brandData, _promptOverride } = await c.req.json();
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return c.json({ error: "GEMINI_API_KEY not configured" }, 500);

    if (!targetId || typeof targetId !== "string") {
      return c.json({ error: "targetId is required" }, 400);
    }
    if (typeof comment !== "string" || !comment.trim()) {
      return c.json({ error: "comment is required" }, 400);
    }
    if (comment.length > 1000)
      return c.json({ error: "comment exceeds maximum length of 1000 characters" }, 400);
    if (!isRecord(brandData)) {
      return c.json({ error: "brandData must be an object" }, 400);
    }

    const targetField = mergeCardIdToField(targetId);
    if (!targetField) return c.json({ patch: null });

    const targetData = brandData[targetField];
    if (targetData === undefined || targetData === null) return c.json({ patch: null });

    const allowedFields = COMMENT_MODIFY_FIELDS[targetId];
    if (!allowedFields) return c.json({ patch: null });

    const effectiveOverride = getEffectiveOverride(_promptOverride) as { fullPrompt?: string } | undefined;
    const fullPrompt = effectiveOverride?.fullPrompt
      ?? buildCommentModifyPrompt(targetField, targetData, comment);

    _rawGeminiText = await callGeminiText(apiKey, fullPrompt, {
      temperature: MERGE_TEMPERATURES["comment-modify"],
      maxOutputTokens: 2048,
    });

    const parsed: unknown = safeParseJson<unknown>(_rawGeminiText, "comment-modify");

    const unwrapped = unwrapSingleKeyWrapper(targetData, parsed);

    const guarded = applyFieldGuard(targetData, unwrapped, allowedFields, targetField);
    const generationTime = Date.now() - startTime;
    console.log(`[visual-designer] Comment-modify complete: "${comment.slice(0, 40)}" → ${targetId} (field: ${targetField}, ${generationTime}ms)`);
    return c.json({
      patch: { [targetField]: guarded },
      _meta: {
        agent: "visual-designer",
        prompt: fullPrompt,
        promptKey: `${targetId}:comment-modify`,
        model: TEXT_MODEL,
        generationTime,
        userInput: comment,
        ingredients: [],
      },
    });
  } catch (err) {
    console.error("[visual-designer] comment-modify error:", (err as Error)?.stack ?? String(err));
    return c.json(
      buildErrorPayload("Comment-modify failed", err, _rawGeminiText ? { rawText: _rawGeminiText.slice(0, 500) } : undefined),
      500,
    );
  }
});

export default visualDesigner;
