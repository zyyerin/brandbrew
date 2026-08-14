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
//           - Brand in Context mockup generation using a visual snapshot.
//           - Palette extraction from an image card using Gemini Vision.
// Model:    Gemini image model (gemini-3-pro-image-preview)
// ─────────────────────────────────────────────────────────────────────────────

import { Hono } from "npm:hono";
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
} from "../shared/merge-specs.tsx";
import { resolveAspectRatio } from "../shared/image-config.tsx";
import { buildBriefIdentityContextText, normalizeShortContext } from "../shared/brand-context.ts";
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

// ── Route: POST /edit ────────────────────────────────────────────────────────
// Edits an existing image (recolor, style adaptation, etc.).

visualDesigner.post("/edit", async (c) => {
  try {
    const startTime = Date.now();
    const body = await c.req.json();
    if (!hasShortContext(body)) {
      return c.json({ error: "brandContextShort is required" }, 400);
    }
    const {
      cardType,
      newHint,
      colorPalette,
      sourceImageUrl,
      referenceImageUrl,
      paletteImageBase64,
      aspectRatio,
    } = body;
    const shortContext = normalizeShortContext(body);
    const brandName = shortContext.name;
    const tagline = shortContext.tagline;

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return c.json({ error: "GEMINI_API_KEY not configured" }, 500);

    if (!sourceImageUrl) {
      return c.json({ error: "sourceImageUrl is required for image editing" }, 400);
    }

    const paletteB64Error = validateBase64(paletteImageBase64, "paletteImageBase64");
    if (paletteB64Error) return c.json({ error: paletteB64Error }, 400);

    // Fetch the source image for img2img editing
    console.log(`[visual-designer] Fetching source image for img2img edit…`);
    const fetched = await fetchImageAsBase64(sourceImageUrl);
    if ("error" in fetched) {
      console.log(`[visual-designer] Source image fetch failed: ${fetched.error}`);
      return c.json({ error: "Source image fetch failed" }, 400);
    }
    const sourceImage = fetched;

    // Fetch optional reference image (source card image in card-to-card merge)
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
      colorPaletteHex: colorPalette as string[] | undefined,
      cardType,
      brandName,
      tagline,
    });

    const mode = hasRef ? "img2img+ref" : hasPalette ? "img2img+palette" : "img2img";
    console.log(`[visual-designer] Editing (${mode}) — cardType=${cardType} ar=${effectiveAR} prompt="${prompt.slice(0, 80)}…"`);

    const genResult = await generateImage(apiKey, prompt, { cardType, sourceImage, paletteImage, referenceImage, aspectRatio: effectiveAR });
    if (genResult.errors.length > 0) {
      console.log(`[visual-designer] Warning: some models failed: ${genResult.errors.join(" | ")}`);
    }

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
});

// ── Snapshot prompt builder ──────────────────────────────────────────────────
// Builds a structured art-director-grade prompt for the visual snapshot route.
// Composition bullets use referenceImageRoles order (parallel to ref images). Optional legacy:
// paletteImageBase64 prepends a swatch as Image 1 before URL refs.

interface SnapshotPromptContext {
  brandName?: string;
  brandDescription?: string;
  keywords?: string[];
  visualConcept?: { concept: string; description: string };
  colorPalette?: string[];
  font1?: string;
  font2?: string;
  hasPalette: boolean;
  referenceImageRoles?: string[];
}

function buildSnapshotPrompt(ctx: SnapshotPromptContext): string {
  const paletteText = (ctx.colorPalette ?? []).length > 0
    ? `Color Palette: ${ctx.colorPalette!.join(", ")}.`
    : "";
  const fontText = [ctx.font1, ctx.font2].filter(Boolean).join(", ");

  const roles = ctx.referenceImageRoles ?? [];
  const compositionLines: string[] = [];
  let compIdx = 1;
  if (ctx.hasPalette) compIdx++;
  for (const role of roles) {
    const n = compIdx++;
    if (role === "art-style") {
      compositionLines.push(
        `- extracting and remixing individual graphic elements from Image ${n}`,
      );
    } else if (role === "logo") {
      compositionLines.push(`- the Logo (Image ${n})`);
    } else {
      console.warn(`[visual-designer] buildSnapshotPrompt: unexpected referenceImageRoles entry "${role}" (Image ${n}); no composition bullet`);
    }
  }
  if (paletteText) compositionLines.push(`- ${paletteText}`);
  if (fontText) compositionLines.push(`- Fonts: ${fontText}`);

  const intro =
    "A clean and structured modular brand identity snapshot presented in a bento box grid of distinct, separated compartments. No text labels. The composition features diverse assets:";
  return [intro, compositionLines.join("\n")].join("\n\n");
}

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

    if (genResult.errors.length > 0) {
      console.log(`[visual-designer] Visual snapshot warnings: ${genResult.errors.join(" | ")}`);
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
// using the brand's visual snapshot (if provided) as a reference.

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
      `Create a curated brand application mockup of ${application}${brandName ? ` for "${brandName}"` : ""}. Apply the reference visual selectively across the composition, varying the scale between full-bleed macro moments and smaller intentional placements. Keep the result presentation-ready, realistic, and cohesive. Avoid redundant tiled patterns, watermarks, dense illegible text, and split-screen collage layouts.`;
    if (brandDescriptionForPrompt) {
      effectivePrompt =
        `${effectivePrompt}\n\nBrand description: ${brandDescriptionForPrompt}`;
    }

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
            ...(isDevMode() && { prompt: effectivePrompt }),
            generationTime: Date.now() - startTime,
            timings,
            ingredients: [brandName, application].filter(Boolean),
          },
        });
      }
    }

    if (genResult.errors.length > 0) {
      console.log(`[visual-designer] Context warnings: ${genResult.errors.join(" | ")}`);
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
        ...(isDevMode() && { prompt: effectivePrompt }),
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

// ── Route: POST /merge-generate ──────────────────────────────────────────────
// Queue-slot image merge: palette→logo|art-style uses structured brief + 【Visual Concept】; others use buildMergeGeneratePrompt (hint → active slots → VC).
// Gemini parts: reference images first, then text. Board: optional mergeBoardContext or shortContext patch.

visualDesigner.post("/merge-generate", async (c) => {
  try {
    const startTime = Date.now();
    const body = await c.req.json() as Record<string, unknown>;
    if (!hasShortContext(body)) {
      return c.json({ error: "brandContextShort is required" }, 400);
    }
    const {
      cardType,
      newHint,
      sourceId,
      sourceImageUrl,
      sourceTextData,
      aspectRatio,
    } = body as {
      cardType: string;
      newHint: string;
      sourceId?: string;
      sourceImageUrl?: string;
      sourceTextData?: unknown;
      aspectRatio?: string;
    };
    const shortContext = normalizeShortContext(body);
    const brandName = shortContext.name;

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return c.json({ error: "GEMINI_API_KEY not configured" }, 500);

    if (!newHint) {
      return c.json({ error: "newHint is required for merge generation" }, 400);
    }
    if (newHint.length > 500)
      return c.json({ error: "newHint exceeds maximum length of 500 characters" }, 400);

    let sourceImage: { b64: string; mimeType: string } | undefined;
    if (sourceImageUrl) {
      const fetched = await fetchImageAsBase64(sourceImageUrl);
      if ("error" in fetched) {
        console.log(`[visual-designer] Source image fetch failed, falling back to txt2img: ${fetched.error}`);
      } else {
        sourceImage = fetched;
      }
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
        })
      : buildMergeGeneratePrompt({
          newHint,
          sourceId,
          sourceTextData,
          board,
          boardFormat,
          refImageGuide,
        });

    const mode = useBoardInlineImages
      ? `multi-ref(${refImages.length})`
      : sourceImage
        ? "img2img"
        : "txt2img";
    console.log(`[visual-designer] Merge-generate (${mode}) — cardType=${cardType} ar=${effectiveAR} prompt="${prompt.slice(0, 80)}…"`);

    const genResult = useBoardInlineImages && refImages.length > 0
      ? await generateImage(apiKey, prompt, {
        cardType,
        refImages,
        aspectRatio: effectiveAR,
      })
      : await generateImage(apiKey, prompt, {
        cardType,
        sourceImage,
        aspectRatio: effectiveAR,
      });
    if (genResult.errors.length > 0) {
      console.log(`[visual-designer] Merge-generate warnings: ${genResult.errors.join(" | ")}`);
    }

    const imageUrl = await uploadAndSignImage(genResult.b64, genResult.mimeType, cardType, c.req.header("X-Project-Id"));
    const generationTime = Date.now() - startTime;
    const usedModel = genResult.usedModel;

    return c.json({
      imageUrl,
      _meta: {
        agent: "visual-designer",
        prompt,
        promptKey: `${sourceId ?? "?"}->${cardType}:merge-generate`,
        model: usedModel,
        generationTime,
        ingredients: [brandName].filter(Boolean),
      },
    });
  } catch (err) {
    console.error("[visual-designer] merge-generate error:", (err as Error)?.stack ?? String(err));
    return c.json(buildErrorPayload("Merge image generation failed", err), 500);
  }
});

// ── Route: POST /wordmark ────────────────────────────────────────────────────
// Generates a wordmark logo (brand name as typographic logotype) via txt2img.
// Called when a Typography card is dragged onto the Logo queue.

visualDesigner.post("/wordmark", async (c) => {
  try {
    const startTime = Date.now();
    const body = await c.req.json();
    if (!hasShortContext(body)) {
      return c.json({ error: "brandContextShort is required" }, 400);
    }
    const {
      cardType,
      newHint,
      titleFont,
      aspectRatio,
    } = body;
    const shortContext = normalizeShortContext(body);
    const brandName = shortContext.name;
    const effectiveTitleFont = shortContext.titleFont ?? titleFont;

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return c.json({ error: "GEMINI_API_KEY not configured" }, 500);

    const effectiveAR = resolveAspectRatio("wordmark", aspectRatio);
    const name = brandName ?? "the brand";
    const font = effectiveTitleFont ?? "a display typeface";

    // Concise prompt: one sentence, brand name + font
    const hint = newHint ? `${newHint}. ` : "";
    const prompt = `${hint}Brand wordmark logo for "${name}" in ${font} typeface`;

    console.log(`[visual-designer] Generating wordmark (txt2img) — font=${effectiveTitleFont} ar=${effectiveAR} prompt="${prompt.slice(0, 80)}…"`);

    const genResult = await generateImage(apiKey, prompt, { cardType, aspectRatio: effectiveAR });
    if (genResult.errors.length > 0) {
      console.log(`[visual-designer] Wordmark warnings: ${genResult.errors.join(" | ")}`);
    }

    const imageUrl = await uploadAndSignImage(genResult.b64, genResult.mimeType, cardType ?? "logo", c.req.header("X-Project-Id"));
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
});

// ── Route: POST /extract-palette ─────────────────────────────────────────────
// Extracts a 5-color hex palette from an image card using Gemini Vision.
// Called when an image card (logo, art-style, layout) is dragged onto color-palette.

visualDesigner.post("/extract-palette", async (c) => {
  let _rawGeminiText: string | undefined;
  try {
    const startTime = Date.now();
    const { sourceId, sourceImageUrl, brandData, _promptOverride } = await c.req.json();
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return c.json({ error: "GEMINI_API_KEY not configured" }, 500);

    if (!sourceId || typeof sourceId !== "string") {
      return c.json({ error: "sourceId is required" }, 400);
    }
    if (!sourceImageUrl) {
      return c.json({ error: "sourceImageUrl is required" }, 400);
    }

    const spec = MERGE_SPECS[sourceId]?.["color-palette"];
    if (!spec?.instruction) {
      return c.json({ error: `No vision-based palette spec found for source: ${sourceId}` }, 400);
    }

    const imageResult = await fetchImageAsBase64(sourceImageUrl);
    if ("error" in imageResult) {
      console.log(`[visual-designer] extract-palette source image fetch failed: ${imageResult.error}`);
      return c.json({ error: "Failed to fetch source image" }, 500);
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
        ...(isDevMode() && { prompt: instruction }),
        promptKey: `${sourceId}->color-palette:extract-palette`,
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
});

// ── Route: POST /vision-merge ────────────────────────────────────────────────
// Merges an image source card into a text target card using Gemini Vision.
// Called when an image card is dragged onto a non-image target queue.

visualDesigner.post("/vision-merge", async (c) => {
  let _rawGeminiText: string | undefined;
  try {
    const startTime = Date.now();
    const { sourceId, targetId, sourceImageUrl, brandData, _promptOverride } = await c.req.json();
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return c.json({ error: "GEMINI_API_KEY not configured" }, 500);

    if (!sourceId || !targetId) {
      return c.json({ error: "sourceId and targetId are required" }, 400);
    }
    if (!isRecord(brandData)) {
      return c.json({ error: "brandData must be an object" }, 400);
    }
    if (!sourceImageUrl) {
      return c.json({ error: "sourceImageUrl is required" }, 400);
    }

    const spec = MERGE_SPECS[sourceId]?.[targetId];
    if (!spec || !spec.allowedFields?.length || !spec.instruction) {
      return c.json({ patch: null });
    }

    const targetField = mergeCardIdToField(targetId);
    if (!targetField) {
      return c.json({ patch: null });
    }
    const targetData = brandData[targetField];
    if (targetData === undefined || targetData === null) {
      return c.json({ patch: null });
    }

    const imageResult = await fetchImageAsBase64(sourceImageUrl);
    if ("error" in imageResult) {
      console.log(`[visual-designer] vision-merge source image fetch failed: ${imageResult.error}`);
      return c.json({ error: "Failed to fetch source image" }, 500);
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
        promptKey: `${sourceId}->${targetId}:vision-merge`,
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
        ...(isDevMode() && { prompt: fullPrompt }),
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

// ── Route: POST /merge ───────────────────────────────────────────────────────
// Text-to-text merge: applies a source card's influence to a text target card.
// Handles all spec-driven merges where both source and target are text elements.

visualDesigner.post("/merge", async (c) => {
  let _rawGeminiText: string | undefined;
  try {
    const startTime = Date.now();
    const { sourceId, targetId, brandData, _promptOverride } = await c.req.json();
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return c.json({ error: "GEMINI_API_KEY not configured" }, 500);

    if (!sourceId || !targetId) {
      return c.json({ error: "sourceId and targetId are required" }, 400);
    }
    if (!isRecord(brandData)) {
      return c.json({ error: "brandData must be an object" }, 400);
    }

    const spec = MERGE_SPECS[sourceId]?.[targetId];
    if (!spec || !spec.allowedFields?.length || !spec.instruction) {
      return c.json({ patch: null });
    }

    const targetField = mergeCardIdToField(targetId);
    const sourceField = mergeCardIdToField(sourceId);
    if (!targetField) return c.json({ patch: null });

    const targetData = brandData[targetField];
    const sourceData = sourceField ? brandData[sourceField] : null;
    if (targetData === undefined || targetData === null) return c.json({ patch: null });

    const boardAppendix = formatMergeBoardPromptContext(
      mergeBoardContextFromBrandData(brandData as Record<string, unknown>, { targetId, sourceId }),
      { omitArtStyleUrl: true, omitLogoUrl: true },
    );

    const omitCurrentTargetInContext =
      (sourceId === "color-palette" && targetId === "font") ||
      (sourceId === "font" && targetId === "color-palette");

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
        ...(isDevMode() && { prompt: fullPrompt }),
        promptKey: `${sourceId}->${targetId}:merge`,
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
});

export default visualDesigner;
