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
  getLastUsedImageModel,
  generateMoodboardImage,
  callGeminiVision,
  TEXT_MODEL,
} from "../shared/gemini.tsx";
import { MERGE_SPECS, mergeCardIdToField, applyFieldGuard } from "../shared/merge-specs.tsx";
import type { ImagePromptContext } from "../shared/types.tsx";
import { resolveAspectRatio } from "../shared/image-config.tsx";
import { buildCreativeBrief } from "./art-director.tsx";

const visualDesigner = new Hono();

// ── Agent persona (embedded into prompt context) ─────────────────────────────

const VISUAL_DESIGNER_PERSONA = `You are a visual designer specialising in refining and adapting existing visual assets.
You preserve composition, structure, and silhouette while precisely applying new colors, textures, and style treatments.
Every edit must feel seamless — as if the image was originally created with the new parameters.`;

// ── Img2img prompt builder ───────────────────────────────────────────────────
// Layers img2img-specific framing (palette / recolor instructions) on top of
// the Art Director's canonical creative brief — single source of truth for
// what each card type's prompt should look like.

export function buildImg2ImgPrompt(
  cardType: string,
  ctx: ImagePromptContext,
  hasPaletteImage = false,
): string {
  const palette = (ctx.colorPalette ?? []).join(", ");

  const palettePrefix = hasPaletteImage
    ? `I am providing two images. ` +
      `The FIRST image is a color palette showing horizontal color swatches. ` +
      `The SECOND image is the design to recolor. `
    : "";
  const colorInstr = hasPaletteImage
    ? `Recolor the SECOND image using ONLY the exact colors visible in the FIRST image's swatches. `
    : palette
      ? `Recolor using ONLY these brand colors: ${palette}. `
      : "";

  const creativeBrief = buildCreativeBrief(cardType, ctx);

  return palettePrefix + colorInstr + creativeBrief;
}

// ── Route: POST /edit ────────────────────────────────────────────────────────
// Edits an existing image (recolor, style adaptation, etc.).

visualDesigner.post("/edit", async (c) => {
  try {
    const startTime = Date.now();
    const body = await c.req.json();
    const {
      cardType,
      brandName,
      brandDescription,
      conceptName,
      conceptPoints,
      keywords,
      colorPalette,
      mergeContext,
      sourceImageUrl,
      paletteImageBase64,
      aspectRatio,
    } = body;

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return c.json({ error: "GEMINI_API_KEY not configured" }, 500);

    if (!sourceImageUrl) {
      return c.json({ error: "sourceImageUrl is required for image editing" }, 400);
    }

    // Fetch the source image for img2img editing
    console.log(`[visual-designer] Fetching source image for img2img edit…`);
    const fetched = await fetchImageAsBase64(sourceImageUrl);
    if ("error" in fetched) {
      return c.json({ error: `Source image fetch failed: ${fetched.error}` }, 400);
    }
    const sourceImage = fetched;

    const paletteImage: { b64: string; mimeType: string } | undefined =
      paletteImageBase64 ? { b64: paletteImageBase64, mimeType: "image/png" } : undefined;

    const effectiveAR = resolveAspectRatio(cardType, aspectRatio);

    const ctx: ImagePromptContext = {
      brandName, brandDescription, conceptName,
      conceptPoints, keywords, colorPalette, mergeContext,
      aspectRatio: effectiveAR,
    };

    const hasPalette = !!paletteImage;
    const prompt = buildImg2ImgPrompt(cardType, ctx, hasPalette);

    const mode = hasPalette ? "img2img+palette" : "img2img";
    console.log(`[visual-designer] Editing (${mode}) — cardType=${cardType} ar=${effectiveAR} prompt="${prompt.slice(0, 80)}…"`);

    const genResult = await generateImage(apiKey, prompt, sourceImage, paletteImage, effectiveAR);
    if (genResult.errors.length > 0) {
      console.log(`[visual-designer] Warning: some models failed: ${genResult.errors.join(" | ")}`);
    }

    const imageUrl = await uploadAndSignImage(genResult.b64, genResult.mimeType, cardType);
    const generationTime = Date.now() - startTime;
    const usedModel = getLastUsedImageModel()?.shortName ?? "unknown";

    const selectedElementLabels = [
      "Source image",
      paletteImageBase64 && "Color Palette",
    ].filter(Boolean) as string[];

    return c.json({
      imageUrl,
      _meta: {
        agent: "visual-designer",
        prompt,
        model: usedModel,
        generationTime,
        ingredients: [brandName, conceptName, ...(keywords ?? [])].filter(Boolean),
        referenceImageUrls: [sourceImageUrl],
        paletteImageDataUrl: paletteImageBase64
          ? `data:image/png;base64,${paletteImageBase64}`
          : undefined,
        selectedElementLabels: selectedElementLabels.length > 0 ? selectedElementLabels : undefined,
      },
    });
  } catch (err) {
    console.log("[visual-designer] edit error:", err);
    return c.json({ error: `Image editing failed: ${String(err)}` }, 500);
  }
});

// ── Route: POST /moodboard ───────────────────────────────────────────────────
// Generates a visual snapshot / moodboard from multiple reference images
// (palette image + one or more brand imagery references) using a fixed prompt.

visualDesigner.post("/moodboard", async (c) => {
  try {
    const startTime = Date.now();
    const body = await c.req.json();
    const {
      cardType,
      brandName,
      prompt,
      referenceImageUrls = [],
      paletteImageBase64,
      aspectRatio,
    } = body;

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return c.json({ error: "GEMINI_API_KEY not configured" }, 500);

    const hasAnyImages = (referenceImageUrls?.length ?? 0) > 0 || !!paletteImageBase64;
    if (!hasAnyImages) {
      return c.json({ error: "At least one reference image or paletteImageBase64 is required" }, 400);
    }

    const images: Array<{ b64: string; mimeType: string }> = [];

    // Optional palette swatch image (canvas-rendered on the client)
    if (paletteImageBase64) {
      images.push({ b64: paletteImageBase64, mimeType: "image/png" });
    }

    // Fetch each reference image URL into base64 for Gemini
    for (const url of referenceImageUrls ?? []) {
      const fetched = await fetchImageAsBase64(url);
      if ("error" in fetched) {
        console.log(`[visual-designer] Skipping reference image (fetch failed): ${fetched.error}`);
        continue;
      }
      images.push(fetched);
    }

    if (images.length === 0) {
      return c.json({ error: "Failed to load all reference images" }, 400);
    }

    const effectiveAR = resolveAspectRatio(cardType ?? "visual-snapshot", aspectRatio);

    console.log(
      `[visual-designer] Generating moodboard — cardType=${cardType} ar=${effectiveAR} refs=${referenceImageUrls?.length ?? 0} ` +
      `palette=${paletteImageBase64 ? "yes" : "no"} prompt="${String(prompt).slice(0, 80)}…"`,
    );

    const promptText = String(prompt ?? "");
    let genResult: Awaited<ReturnType<typeof generateMoodboardImage>> | null = null;
    let fallbackMode = "none";
    try {
      genResult = await generateMoodboardImage(apiKey, promptText, images, effectiveAR);
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
        fallbackCandidates.push({ mode: "first-reference-only", images: [images[images.length - 1]] });
      }
      if (paletteImageBase64) {
        fallbackCandidates.push({ mode: "palette-only", images: [images[0]] });
      }

      const fallbackErrors: string[] = [];
      let recovered = false;
      for (const candidate of fallbackCandidates) {
        if (!candidate.images.length) continue;
        try {
          genResult = await generateMoodboardImage(apiKey, promptText, candidate.images, effectiveAR);
          fallbackMode = candidate.mode;
          recovered = true;
          console.log(`[visual-designer] Moodboard recovered with fallback=${fallbackMode}`);
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
      throw new Error("Moodboard generation produced no result");
    }

    if (genResult.errors.length > 0) {
      console.log(`[visual-designer] Moodboard warnings: ${genResult.errors.join(" | ")}`);
    }

    const imageUrl = await uploadAndSignImage(genResult.b64, genResult.mimeType, cardType ?? "visual-snapshot");
    const generationTime = Date.now() - startTime;
    const usedModel = getLastUsedImageModel()?.shortName ?? "unknown";

    return c.json({
      imageUrl,
      _meta: {
        agent: "visual-designer-moodboard",
        prompt,
        model: usedModel,
        generationTime,
        ingredients: [brandName, fallbackMode !== "none" ? `fallback:${fallbackMode}` : null].filter(Boolean),
      },
    });
  } catch (err) {
    console.log("[visual-designer] moodboard error:", err);
    return c.json({ error: `Moodboard image generation failed: ${String(err)}` }, 500);
  }
});

// ── Route: POST /context ──────────────────────────────────────────────────────
// Generates a single Brand in Context mockup image for a given application
// using the brand's visual snapshot (if provided) as a reference.

visualDesigner.post("/context", async (c) => {
  try {
    const startTime = Date.now();
    const body = await c.req.json();
    const {
      application,
      brandName,
      prompt,
      referenceImageUrls = [],
      aspectRatio,
    } = body as {
      application?: string;
      brandName?: string;
      prompt?: string;
      referenceImageUrls?: string[];
      aspectRatio?: string;
    };

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return c.json({ error: "GEMINI_API_KEY not configured" }, 500);

    if (!application) {
      return c.json({ error: "application is required" }, 400);
    }

    const images: Array<{ b64: string; mimeType: string }> = [];
    for (const url of referenceImageUrls ?? []) {
      const fetched = await fetchImageAsBase64(url);
      if ("error" in fetched) {
        console.log(`[visual-designer] Skipping context ref image (fetch failed): ${fetched.error}`);
        continue;
      }
      images.push(fetched);
    }

    const hasAnyImages = images.length > 0;
    const effectiveAR = resolveAspectRatio("brand-context", aspectRatio);
    const effectivePrompt =
      prompt ??
      `Create a ${application} mockup for the brand. Clean composition.`;

    console.log(
      `[visual-designer] Generating context mockup — application=${application} ar=${effectiveAR} refs=${images.length} prompt="${effectivePrompt.slice(0, 80)}…"`,
    );

    const genResult = await generateMoodboardImage(apiKey, effectivePrompt, images, effectiveAR);
    if (genResult.errors.length > 0) {
      console.log(`[visual-designer] Context warnings: ${genResult.errors.join(" | ")}`);
    }

    const imageUrl = await uploadAndSignImage(
      genResult.b64,
      genResult.mimeType,
      "brand-context",
    );
    const generationTime = Date.now() - startTime;
    const usedModel = getLastUsedImageModel()?.shortName ?? "unknown";

    return c.json({
      imageUrl,
      _meta: {
        agent: "visual-designer-context",
        prompt: effectivePrompt,
        model: usedModel,
        generationTime,
        ingredients: [brandName, application, hasAnyImages ? "with-ref" : "no-ref"].filter(
          Boolean,
        ),
      },
    });
  } catch (err) {
    console.log("[visual-designer] context error:", err);
    return c.json({ error: `Context image generation failed: ${String(err)}` }, 500);
  }
});

// ── Route: POST /merge-generate ──────────────────────────────────────────────
// Generates a new image when an element card is dragged onto another element's
// queue slot (queue drop). Uses a minimal prompt: the merge hint from the client
// plus the brand name and description. When the source card has an image it is
// passed as an img2img reference so the result visually relates to the source.

visualDesigner.post("/merge-generate", async (c) => {
  try {
    const startTime = Date.now();
    const body = await c.req.json();
    const { cardType, brandName, brandDescription, mergeContext, sourceImageUrl, aspectRatio } = body;

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return c.json({ error: "GEMINI_API_KEY not configured" }, 500);

    if (!mergeContext) {
      return c.json({ error: "mergeContext is required for merge generation" }, 400);
    }

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
    const brand = brandName ?? "the brand";
    const desc = brandDescription ? ` ${brandDescription}` : "";
    const prompt = `${mergeContext}. Brand: "${brand}".${desc}`;

    const mode = sourceImage ? "img2img" : "txt2img";
    console.log(`[visual-designer] Merge-generate (${mode}) — cardType=${cardType} ar=${effectiveAR} prompt="${prompt.slice(0, 80)}…"`);

    const genResult = await generateImage(apiKey, prompt, sourceImage, undefined, effectiveAR);
    if (genResult.errors.length > 0) {
      console.log(`[visual-designer] Merge-generate warnings: ${genResult.errors.join(" | ")}`);
    }

    const imageUrl = await uploadAndSignImage(genResult.b64, genResult.mimeType, cardType);
    const generationTime = Date.now() - startTime;
    const usedModel = getLastUsedImageModel()?.shortName ?? "unknown";

    return c.json({
      imageUrl,
      _meta: {
        agent: "visual-designer",
        prompt,
        model: usedModel,
        generationTime,
        ingredients: [brandName, mergeContext].filter(Boolean),
      },
    });
  } catch (err) {
    console.log("[visual-designer] merge-generate error:", err);
    return c.json({ error: `Merge image generation failed: ${String(err)}` }, 500);
  }
});

// ── Wordmark brief builder (text → image prompt) ────────────────────────────

function buildWordmarkBrief(ctx: ImagePromptContext): string {
  const name = ctx.brandName ?? "the brand";
  const font = ctx.titleFont ?? "a display";
  const concept = ctx.conceptName ?? "";
  const hint = ctx.mergeContext ?? "";
  const focus = hint ? `Creative direction: ${hint}. ` : "";

  return (
    `${focus}Brand wordmark logo for "${name}". ` +
    `Render the brand name "${name}" in the ${font} typeface. ` +
    (concept ? `Visual mood: ${concept}. ` : "") +
    `Clean typographic logotype, white background, professional wordmark, ` +
    `letterforms only — no additional icon or graphic mark. `
  );
}

// ── Route: POST /wordmark ────────────────────────────────────────────────────
// Generates a wordmark logo (brand name as typographic logotype) via txt2img.
// Called when a Typography card is dragged onto the Logo queue.

visualDesigner.post("/wordmark", async (c) => {
  try {
    const startTime = Date.now();
    const body = await c.req.json();
    const {
      cardType,
      brandName,
      brandDescription,
      conceptName,
      conceptPoints,
      keywords,
      colorPalette,
      mergeContext,
      titleFont,
      aspectRatio,
    } = body;

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return c.json({ error: "GEMINI_API_KEY not configured" }, 500);

    const effectiveAR = resolveAspectRatio("wordmark", aspectRatio);

    const ctx: ImagePromptContext = {
      brandName, brandDescription, conceptName,
      conceptPoints, keywords, colorPalette, mergeContext, titleFont,
      aspectRatio: effectiveAR,
    };

    const prompt = buildWordmarkBrief(ctx);
    console.log(`[visual-designer] Generating wordmark (txt2img) — font=${titleFont} ar=${effectiveAR} prompt="${prompt.slice(0, 80)}…"`);

    const genResult = await generateImage(apiKey, prompt, undefined, undefined, effectiveAR);
    if (genResult.errors.length > 0) {
      console.log(`[visual-designer] Wordmark warnings: ${genResult.errors.join(" | ")}`);
    }

    const imageUrl = await uploadAndSignImage(genResult.b64, genResult.mimeType, cardType ?? "logo");
    const generationTime = Date.now() - startTime;
    const usedModel = getLastUsedImageModel()?.shortName ?? "unknown";

    const selectedElementLabels = [
      brandName && "Brand Brief",
      titleFont && "Typography",
      conceptName && "Visual Concept",
    ].filter(Boolean) as string[];

    return c.json({
      imageUrl,
      _meta: {
        agent: "visual-designer",
        prompt,
        model: usedModel,
        generationTime,
        ingredients: [brandName, titleFont, conceptName].filter(Boolean),
        selectedElementLabels: selectedElementLabels.length > 0 ? selectedElementLabels : undefined,
      },
    });
  } catch (err) {
    console.log("[visual-designer] wordmark error:", err);
    return c.json({ error: `Wordmark generation failed: ${String(err)}` }, 500);
  }
});

// ── Route: POST /extract-palette ─────────────────────────────────────────────
// Extracts a 5-color hex palette from an image card using Gemini Vision.
// Called when an image card (logo, art-style, layout) is dragged onto color-palette.

visualDesigner.post("/extract-palette", async (c) => {
  try {
    const startTime = Date.now();
    const { sourceId, sourceImageUrl } = await c.req.json();
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return c.json({ error: "GEMINI_API_KEY not configured" }, 500);

    if (!sourceImageUrl) {
      return c.json({ error: "sourceImageUrl is required" }, 400);
    }

    const spec = MERGE_SPECS[sourceId]?.["color-palette"];
    if (!spec?.requiresSourceImage || !spec.instruction) {
      return c.json({ error: `No vision-based palette spec found for source: ${sourceId}` }, 400);
    }

    const imageResult = await fetchImageAsBase64(sourceImageUrl);
    if ("error" in imageResult) {
      return c.json({ error: `Failed to fetch source image: ${imageResult.error}` }, 500);
    }

    console.log(`[visual-designer] Extracting palette — sourceId=${sourceId}`);
    const raw = await callGeminiVision(apiKey, spec.instruction, imageResult.b64, imageResult.mimeType);
    const parsed = JSON.parse(raw);
    const colorPalette: string[] = parsed.colorPalette;

    if (!Array.isArray(colorPalette) || colorPalette.length === 0) {
      return c.json({ error: "Vision model returned no colorPalette array" }, 500);
    }

    const generationTime = Date.now() - startTime;
    console.log(`[visual-designer] Palette extracted (${generationTime}ms): ${colorPalette.join(", ")}`);

    const SOURCE_LABELS: Record<string, string> = {
      "art-style": "Art Style",
      "logo": "Logo",
      "layout": "Layout",
      "visual-snapshot": "Visual Snapshot",
    };
    const sourceLabel = SOURCE_LABELS[sourceId] ?? sourceId;

    return c.json({
      patch: { colorPalette },
      _meta: {
        agent: "visual-designer",
        prompt: spec.instruction,
        model: TEXT_MODEL,
        generationTime,
        ingredients: [sourceId, sourceImageUrl],
        referenceImageUrls: [sourceImageUrl],
        selectedElementLabels: [sourceLabel],
      },
    });
  } catch (err) {
    console.log("[visual-designer] extract-palette error:", err);
    return c.json({ error: `Palette extraction failed: ${String(err)}` }, 500);
  }
});

// ── Route: POST /vision-merge ────────────────────────────────────────────────
// Merges an image source card into a text target card using Gemini Vision.
// Called when an image card is dragged onto a non-image target queue.

visualDesigner.post("/vision-merge", async (c) => {
  try {
    const startTime = Date.now();
    const { sourceId, targetId, sourceImageUrl, brandData } = await c.req.json();
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return c.json({ error: "GEMINI_API_KEY not configured" }, 500);

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
    const targetData = brandData?.[targetField];
    if (targetData === undefined || targetData === null) {
      return c.json({ patch: null });
    }

    const imageResult = await fetchImageAsBase64(sourceImageUrl);
    if ("error" in imageResult) {
      return c.json({ error: `Failed to fetch source image: ${imageResult.error}` }, 500);
    }

    const readonlyContext = JSON.stringify(
      {
        brandBrief: brandData?.brandBrief ?? {},
        visualConcept: brandData?.visualConcept ?? {},
        keywords: brandData?.keywords ?? [],
        sourceId,
        targetId,
      },
      null,
      2,
    );

    const prompt = `${spec.instruction}

Allowed fields (modify ONLY these): ${spec.allowedFields.join(", ")}

Current target card value (${targetField}):
${JSON.stringify(targetData, null, 2)}

Brand context (read-only):
${readonlyContext}

Important:
- Analyze the provided source image carefully and base your response primarily on what you observe in it.
- Keep all non-allowed fields exactly unchanged.`;

    console.log(`[visual-designer] Vision-merge — ${sourceId} -> ${targetId}`);
    const raw = await callGeminiVision(apiKey, prompt, imageResult.b64, imageResult.mimeType, { temperature: 0.7 });
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    const parsed: unknown = JSON.parse(cleaned);

    let unwrapped = parsed;
    if (Array.isArray(targetData) && !Array.isArray(parsed) && typeof parsed === "object" && parsed !== null) {
      const keys = Object.keys(parsed as Record<string, unknown>);
      if (keys.length === 1 && Array.isArray((parsed as Record<string, unknown>)[keys[0]])) {
        unwrapped = (parsed as Record<string, unknown>)[keys[0]];
      }
    }
    const guarded = applyFieldGuard(targetData, unwrapped, spec.allowedFields, targetField);

    const generationTime = Date.now() - startTime;
    return c.json({
      patch: { [targetField]: guarded },
      _meta: {
        agent: "visual-designer",
        prompt,
        model: TEXT_MODEL,
        generationTime,
        ingredients: [sourceId, targetId, sourceImageUrl],
        referenceImageUrls: [sourceImageUrl],
      },
    });
  } catch (err) {
    console.log("[visual-designer] vision-merge error:", err);
    return c.json({ error: `Vision merge failed: ${String(err)}` }, 500);
  }
});

export default visualDesigner;
