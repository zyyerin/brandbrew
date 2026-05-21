// ─────────────────────────────────────────────────────────────────────────────
// agents/art-director.tsx — Art Direction Agent
//
// Persona:  Creative director who translates brand strategy into initial
//           visual assets and visual design decisions.
// Scope:    Sequential visual element generation — palette & fonts (text),
//           logo & art style (image + text), layout (image).
// Model:    Gemini text model + image model
// ─────────────────────────────────────────────────────────────────────────────

import { Hono } from "npm:hono";
import {
  callGeminiText,
  PRO_IMAGE_MODEL,
  TEXT_MODEL,
  generateImage,
  fetchImageAsBase64,
  uploadAndSignImage,
  safeParseJson,
} from "../shared/gemini.tsx";
import type { ImagePromptContext, VisualConceptData } from "../shared/types.tsx";
import { resolveAspectRatio } from "../shared/image-config.tsx";
import {
  ART_DIRECTOR_VARIATION_TASK_DESCRIPTIONS,
  PALETTE_FONTS_TASK_DESCRIPTION,
  PERSONA_ART_DIRECTOR,
  TEMPERATURES,
  buildPrompt,
  getArtDirectorRules,
  getVariationRouteKey,
} from "../shared/art-director-prompts.ts";
import {
  buildFullContextText,
  normalizeFullContext,
} from "../shared/brand-context.ts";

type Variables = { geminiApiKey: string };

const artDirector = new Hono<{ Variables: Variables }>();

// ── API key middleware ────────────────────────────────────────────────────────

artDirector.use("*", async (c, next) => {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return c.json({ error: "GEMINI_API_KEY not configured" }, 500);
  c.set("geminiApiKey", apiKey);
  return next();
});

// ── Shared utilities ──────────────────────────────────────────────────────────

function buildIngredients(
  brandName?: string,
  visualConcept?: VisualConceptData | null,
  keywords?: string[] | null,
  extras?: (string | undefined | null)[],
): string[] {
  return [
    brandName,
    visualConcept?.concept,
    ...(keywords ?? []),
    ...(extras ?? []),
  ].filter((x): x is string => typeof x === "string" && x.length > 0);
}

function isDevRoutesEnabled(): boolean {
  return Deno.env.get("ENABLE_DEV_ROUTES") === "true";
}

function getEffectiveOverride<T>(overrideValue: T): T | undefined {
  return isDevRoutesEnabled() ? overrideValue : undefined;
}

function hasFullContext(body: unknown): boolean {
  return !!(
    body &&
    typeof body === "object" &&
    "brandContext" in body &&
    body.brandContext &&
    typeof body.brandContext === "object"
  );
}

function isMeaningfulFullContext(body: unknown): boolean {
  const ctx = normalizeFullContext(body);
  const bn = ctx.name;
  const hasBrandName = typeof bn === "string" && bn.trim().length > 0;
  const kws = ctx.keywords;
  const hasSupportingContext = Boolean(
    (ctx.tagline && ctx.tagline.trim().length > 0)
    || (ctx.description && ctx.description.trim().length > 0)
    || (ctx.targetAudience && ctx.targetAudience.trim().length > 0)
    || (kws && kws.length > 0)
    || (ctx.visualConcept && ctx.visualConcept.concept.trim().length > 0)
    || (ctx.colorPalette && ctx.colorPalette.length > 0)
    || (ctx.font?.titleFont && ctx.font.titleFont.trim().length > 0)
    || (ctx.font?.bodyFont && ctx.font.bodyFont.trim().length > 0)
    || (ctx.application && ctx.application.trim().length > 0)
  );
  return hasBrandName && hasSupportingContext;
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function normalizeVisualConcept(
  visualConceptRaw: unknown,
  conceptPhrases?: unknown,
): VisualConceptData | undefined {
  if (
    visualConceptRaw &&
    typeof visualConceptRaw === "object" &&
    "concept" in visualConceptRaw &&
    "description" in visualConceptRaw
  ) {
    return visualConceptRaw as VisualConceptData;
  }
  if (Array.isArray(conceptPhrases) && conceptPhrases.length > 0) {
    const concept = typeof conceptPhrases[0] === "string" ? conceptPhrases[0] : "";
    const description = conceptPhrases
      .slice(1)
      .filter((item): item is string => typeof item === "string" && item.length > 0)
      .join(". ");
    if (concept) return { concept, description };
  }
  return undefined;
}

function buildDevDebugPayload(rawGeminiText?: string): { _debug?: { rawText: string } } {
  if (!isDevRoutesEnabled() || rawGeminiText === undefined) return {};
  return { _debug: { rawText: rawGeminiText.slice(0, 500) } };
}

// ── Creative brief builder (text → image prompt) ─────────────────────────────

function buildCreativeBrief(
  cardType: string,
  ctx: ImagePromptContext,
): string {
  const name       = ctx.brandName ?? "the brand";
  const description = ctx.description ?? ctx.brandDescription;
  const tagline    = ctx.tagline ? `Tagline: "${ctx.tagline}". ` : "";
  const audience   = ctx.targetAudience ? `Target audience: ${ctx.targetAudience}. ` : "";
  const vc         = ctx.visualConcept;
  const conceptStr = vc ? `${vc.concept}. ${vc.description}` : "";
  const kwds       = (ctx.keywords ?? []).join(", ");
  const focus      = ctx.newHint ? `Creative direction: ${ctx.newHint}. ` : "";
  const palette    = (ctx.colorPalette ?? []).length > 0
    ? `Brand colors: ${ctx.colorPalette!.join(", ")}. `
    : "";

  switch (cardType) {
    case "logo": {
      const motif = vc?.concept
        ? `Visual motif: ${vc.concept}. `
        : "";
      return (
        `${focus}Design a logo mark for a brand about: ` +
        `${description ?? name}. ` +
        `${motif}` +
        `${palette}` +
        `Rules: ` +
        `Purely graphic symbol — absolutely NO text, NO letters, NO words, NO characters. ` +
        `NOT an illustration, NOT a scene, NOT a mascot, NOT a badge, NOT a detailed drawing. ` +
        `Centered on pure white background with generous padding.`
      );
    }
    case "art-style":
      return (
        `${focus}Art style reference image for "${name}" brand. ` +
        `${description ? `Brand description: ${description}. ` : ""}` +
        `${tagline}${audience}` +
        `${conceptStr ? `Visual concept: ${conceptStr}. ` : ""}` +
        `${kwds ? `Keywords: ${kwds}. ` : ""}` +
        `${palette}` +
        `Create a graphic style board that defines the brand's 2D visual language: ` +
        `shape grammar, pattern rhythm, contrast hierarchy, and abstract textures. ` +
        `Flat or semi-flat composition, poster-like design layout. ` +
        `No photorealism, no people, no products, no environments, no text labels.`
      );
    case "application": {
      const touchpoint = ctx.application ?? "brand packaging";
      const fontHint = ctx.titleFont && ctx.bodyFont
        ? ` Typography: "${ctx.titleFont}" for headings, "${ctx.bodyFont}" for body.`
        : ctx.titleFont
          ? ` Typography: "${ctx.titleFont}".`
          : "";
      return (
        `${focus}Brand application mockup: ${touchpoint} for "${name}". ` +
        `${description ? `Brand description: ${description}. ` : ""}` +
        `${tagline}${audience}` +
        `${conceptStr ? `Visual concept: ${conceptStr}. ` : ""}` +
        `${palette}` +
        `Show the brand identity applied to a realistic ${touchpoint}. ` +
        `Use the brand's colors, typography, and visual style. ` +
        `Clean studio photography, white background, professional product mockup.` +
        `${fontHint}`
      );
    }
    default:
      return `Professional brand design image for "${name}". ${conceptStr}. Minimal, modern.`;
  }
}

// ── Route: POST /generate ────────────────────────────────────────────────────
// Generates a brand image from text context only (no source image).

artDirector.post("/generate", async (c) => {
  try {
    const startTime = Date.now();
    const body = await c.req.json();
    if (!hasFullContext(body)) {
      return c.json({ error: "brandContext is required" }, 400);
    }
    if (!isMeaningfulFullContext(body)) {
      return c.json({ error: "brandContext must include brand name and at least one contextual field" }, 400);
    }
    const {
      cardType,
      brandName,
      brandDescription,
      conceptPhrases,
      visualConcept: visualConceptRaw,
      keywords,
      colorPalette,
      newHint,
      aspectRatio,
    } = body;
    const fullContext = normalizeFullContext(body);

    if (typeof cardType !== "string" || !cardType.trim()) {
      return c.json({ error: "cardType is required" }, 400);
    }

    const apiKey = c.get("geminiApiKey");
    const effectiveAR = resolveAspectRatio(cardType, aspectRatio);
    const vc = fullContext.visualConcept ?? normalizeVisualConcept(visualConceptRaw, conceptPhrases);
    const normalizedKeywords = fullContext.keywords ?? normalizeStringArray(keywords);
    const normalizedPalette = fullContext.colorPalette ?? normalizeStringArray(colorPalette);

    const ctx: ImagePromptContext = {
      brandName: fullContext.name ?? brandName,
      tagline: fullContext.tagline,
      description: fullContext.description ?? brandDescription,
      targetAudience: fullContext.targetAudience,
      visualConcept: vc,
      keywords: normalizedKeywords,
      colorPalette: normalizedPalette,
      newHint,
      aspectRatio: effectiveAR,
    };

    const prompt = buildCreativeBrief(cardType, ctx);
    console.log(`[art-director] Generating (txt2img) — cardType=${cardType} ar=${effectiveAR} prompt="${prompt.slice(0, 80)}…"`);

    const genResult = await generateImage(apiKey, prompt, { cardType, aspectRatio: effectiveAR });
    if (genResult.errors.length > 0) {
      console.log(`[art-director] Warning: some models failed: ${genResult.errors.join(" | ")}`);
    }

    const imageUrl = await uploadAndSignImage(genResult.b64, genResult.mimeType, cardType, c.req.header("X-Project-Id"));
    const generationTime = Date.now() - startTime;
    const usedModel = genResult.usedModel;

    const selectedElementLabels = [
      (fullContext.name ?? brandName) && "Brand Brief",
      vc && "Visual Concept",
      (normalizedPalette?.length ?? 0) > 0 && "Color Palette",
    ].filter(Boolean) as string[];

    return c.json({
      imageUrl,
      _meta: {
        agent: "art-director",
        prompt,
        model: usedModel,
        generationTime,
        contextMode: "full",
        ingredients: buildIngredients(fullContext.name ?? brandName, vc, normalizedKeywords),
        selectedElementLabels: selectedElementLabels.length > 0 ? selectedElementLabels : undefined,
      },
    });
  } catch (err) {
    console.error("[art-director] generate error:", (err as Error)?.stack ?? String(err));
    return c.json({ error: `Image generation failed: ${String(err)}` }, 500);
  }
});

// ── Route: POST /design-palette-fonts ─────────────────────────────────────────
// Step 1: Generate color palette and typography from brand brief + visual concept.

artDirector.post("/design-palette-fonts", async (c) => {
  let _rawGeminiText: string | undefined;
  try {
    const startTime = Date.now();
    const body = await c.req.json();
    if (!hasFullContext(body)) {
      return c.json({ error: "brandContext is required" }, 400);
    }
    if (!isMeaningfulFullContext(body)) {
      return c.json({ error: "brandContext must include brand name and at least one contextual field" }, 400);
    }
    const { brandName, keywords, visualConcept, excludedPalettes, excludedFonts, _promptOverride } = body;
    const fullContext = normalizeFullContext(body);
    const effectiveBrandName = fullContext.name ?? brandName;
    const effectiveVisualConcept = fullContext.visualConcept ?? normalizeVisualConcept(visualConcept);

    if (typeof effectiveBrandName !== "string" || !effectiveBrandName.trim()) {
      return c.json({ error: "brandName is required" }, 400);
    }
    if (keywords !== undefined && !Array.isArray(keywords)) {
      return c.json({ error: "keywords must be an array" }, 400);
    }

    const effectiveOverride = getEffectiveOverride(_promptOverride) as
      | { fullPrompt?: string; persona?: string; taskPrompt?: string }
      | undefined;
    const apiKey = c.get("geminiApiKey");
    const normalizedKeywords = fullContext.keywords ?? normalizeStringArray(keywords);
    const contextBody = buildFullContextText({
      ...fullContext,
      name: effectiveBrandName,
      ...(normalizedKeywords !== undefined ? { keywords: normalizedKeywords } : {}),
      visualConcept: effectiveVisualConcept,
    }) || "No brand context provided.";

    const extraBlocks: string[] = [];

    const palettes: string[][] = Array.isArray(excludedPalettes) ? excludedPalettes : [];
    if (palettes.length > 0) {
      extraBlocks.push(
        `Previously generated palettes (the new palette MUST be distinctly different — shift hue range, saturation, or lightness contrast so it feels like a different brand mood):\n${palettes.map((p, i) => `${i + 1}. [${p.join(", ")}]`).join("\n")}`,
      );
    }

    const fonts: string[] = Array.isArray(excludedFonts) ? excludedFonts.filter((f: unknown): f is string => typeof f === "string") : [];
    if (fonts.length > 0) {
      extraBlocks.push(
        `Fonts already used in this project (DO NOT reuse any of these — choose entirely different fonts from different style categories):\n${fonts.join(", ")}`,
      );
    }

    const fullPrompt = effectiveOverride?.fullPrompt ?? buildPrompt({
      persona: effectiveOverride?.persona ?? PERSONA_ART_DIRECTOR,
      taskDescription: effectiveOverride?.taskPrompt ?? PALETTE_FONTS_TASK_DESCRIPTION,
      contextBody,
      rules: getArtDirectorRules("design-palette-fonts"),
      extraBlocks: extraBlocks.length > 0 ? extraBlocks : undefined,
    });

    _rawGeminiText = await callGeminiText(apiKey, fullPrompt, { temperature: TEMPERATURES["design-palette-fonts"] });
    const result = safeParseJson<{ colorPalette: string[]; font: { titleFont: string; bodyFont: string } }>(_rawGeminiText, "design-palette-fonts");
    const generationTime = Date.now() - startTime;
    console.log(`[art-director] Palette + fonts designed (${generationTime}ms)`);

    return c.json({
      colorPalette: result.colorPalette,
      font: result.font,
      _meta: {
        agent: "art-director",
        ...(isDevRoutesEnabled() && { prompt: fullPrompt }),
        model: TEXT_MODEL,
        generationTime,
        contextMode: "full",
        ingredients: buildIngredients(effectiveBrandName, effectiveVisualConcept, normalizedKeywords ?? null),
        selectedElementLabels: ["Brand Brief", "Visual Concept"],
      },
    });
  } catch (err) {
    console.error("[art-director] design-palette-fonts error:", (err as Error)?.stack ?? String(err));
    return c.json({
      error: `Palette & fonts generation failed: ${String(err)}`,
      ...buildDevDebugPayload(_rawGeminiText),
    }, 500);
  }
});

// ── Route: POST /design-logo-style ────────────────────────────────────────────
// Step 2: Generate logo image + art style image in parallel.
// Uses Promise.allSettled so a single failure doesn't discard the other result.

artDirector.post("/design-logo-style", async (c) => {
  try {
    const startTime = Date.now();
    const body = await c.req.json();
    if (!hasFullContext(body)) {
      return c.json({ error: "brandContext is required" }, 400);
    }
    if (!isMeaningfulFullContext(body)) {
      return c.json({ error: "brandContext must include brand name and at least one contextual field" }, 400);
    }
    const {
      brandName, description, keywords,
      visualConcept, colorPalette, aspectRatio, _promptOverride,
    } = body;
    const fullContext = normalizeFullContext(body);
    const effectiveBrandName = fullContext.name ?? brandName;
    const effectiveDescription = fullContext.description ?? description;
    const effectiveTagline = fullContext.tagline;
    const effectiveTargetAudience = fullContext.targetAudience;

    if (typeof effectiveBrandName !== "string" || !effectiveBrandName.trim()) {
      return c.json({ error: "brandName is required" }, 400);
    }
    if (keywords !== undefined && !Array.isArray(keywords)) {
      return c.json({ error: "keywords must be an array" }, 400);
    }
    if (colorPalette !== undefined && !Array.isArray(colorPalette)) {
      return c.json({ error: "colorPalette must be an array" }, 400);
    }

    const effectiveOverride = getEffectiveOverride(_promptOverride) as
      | { logoPrompt?: string; artStylePrompt?: string }
      | undefined;
    const apiKey = c.get("geminiApiKey");
    const normalizedKeywords = fullContext.keywords ?? normalizeStringArray(keywords);
    const normalizedPalette = fullContext.colorPalette ?? normalizeStringArray(colorPalette);

    const logoAR     = resolveAspectRatio("logo", aspectRatio);
    const artStyleAR = resolveAspectRatio("art-style", aspectRatio);

    const vc2 = fullContext.visualConcept ?? normalizeVisualConcept(visualConcept);
    const baseCtx = {
      brandName: effectiveBrandName,
      tagline: effectiveTagline,
      description: effectiveDescription,
      targetAudience: effectiveTargetAudience,
      visualConcept: vc2,
      keywords: normalizedKeywords,
      colorPalette: normalizedPalette,
    };

    const logoPrompt     = effectiveOverride?.logoPrompt     ?? buildCreativeBrief("logo",      { ...baseCtx, aspectRatio: logoAR });
    const artStylePrompt = effectiveOverride?.artStylePrompt ?? buildCreativeBrief("art-style", { ...baseCtx, aspectRatio: artStyleAR });

    const [logoSettled, artStyleSettled] = await Promise.allSettled([
      generateImage(apiKey, logoPrompt,     { cardType: "logo", aspectRatio: logoAR }),
      generateImage(apiKey, artStylePrompt, { cardType: "art-style", aspectRatio: artStyleAR, modelOverride: PRO_IMAGE_MODEL }),
    ]);

    const partialErrors: string[] = [];
    let logoImageUrl:     string | null = null;
    let artStyleImageUrl: string | null = null;
    let usedModel = "unknown";
    let logoModel: string | undefined;
    let artStyleModel: string | undefined;

    if (logoSettled.status === "fulfilled") {
      const r = logoSettled.value;
      if (r.errors.length > 0) console.log(`[art-director] Logo generation warnings: ${r.errors.join(" | ")}`);
      try {
        logoImageUrl = await uploadAndSignImage(r.b64, r.mimeType, "logo", c.req.header("X-Project-Id"));
        logoModel = r.usedModel;
        usedModel = r.usedModel;
      } catch (err) {
        console.error("[art-director] Logo upload failed:", err);
        partialErrors.push(`logo upload: ${String(err)}`);
      }
    } else {
      console.error("[art-director] Logo generation failed:", logoSettled.reason);
      partialErrors.push(`logo: ${String(logoSettled.reason)}`);
    }

    if (artStyleSettled.status === "fulfilled") {
      const r = artStyleSettled.value;
      if (r.errors.length > 0) console.log(`[art-director] Art style generation warnings: ${r.errors.join(" | ")}`);
      try {
        artStyleImageUrl = await uploadAndSignImage(r.b64, r.mimeType, "art-style", c.req.header("X-Project-Id"));
        artStyleModel = r.usedModel;
        if (usedModel === "unknown") usedModel = r.usedModel;
      } catch (err) {
        console.error("[art-director] Art style upload failed:", err);
        partialErrors.push(`art-style upload: ${String(err)}`);
      }
    } else {
      console.error("[art-director] Art style generation failed:", artStyleSettled.reason);
      partialErrors.push(`art-style: ${String(artStyleSettled.reason)}`);
    }

    if (!logoImageUrl && !artStyleImageUrl) {
      return c.json({ error: `Logo & art style generation failed: ${partialErrors.join(" | ")}` }, 500);
    }

    const generationTime = Date.now() - startTime;
    console.log(`[art-director] Logo + art style designed (${generationTime}ms)`);

    return c.json({
      artStyleImageUrl,
      logoImageUrl,
      logoModel,
      artStyleModel,
      ...(partialErrors.length > 0 && { errors: partialErrors }),
      _meta: {
        agent: "art-director",
        ...(isDevRoutesEnabled() && { prompt: `[art-style] ${artStylePrompt} | [logo] ${logoPrompt}` }),
        model: usedModel,
        generationTime,
        contextMode: "full",
        ingredients: buildIngredients(effectiveBrandName, vc2, normalizedKeywords ?? null),
        selectedElementLabels: ["Visual Concept", "Color Palette", "Font"],
      },
    });
  } catch (err) {
    console.error("[art-director] design-logo-style error:", (err as Error)?.stack ?? String(err));
    return c.json({ error: `Logo & art style generation failed: ${String(err)}` }, 500);
  }
});

// ── Route: POST /design-application ──────────────────────────────────────────
// Step 3: Generate application mockup using full visual context from prior steps.
// artStyleImageUrl and logoImageUrl are fetched as base64 and passed to Gemini
// as reference images for visual grounding. Gracefully falls back to text-only
// generation if the remote fetch fails.

artDirector.post("/design-application", async (c) => {
  try {
    const startTime = Date.now();
    const body = await c.req.json();
    if (!hasFullContext(body)) {
      return c.json({ error: "brandContext is required" }, 400);
    }
    if (!isMeaningfulFullContext(body)) {
      return c.json({ error: "brandContext must include brand name and at least one contextual field" }, 400);
    }
    const {
      brandName, description, keywords,
      visualConcept, colorPalette, font,
      artStyleImageUrl, logoImageUrl,
      aspectRatio,
      application,
      _promptOverride,
    } = body;
    const fullContext = normalizeFullContext(body);
    const effectiveBrandName = fullContext.name ?? brandName;
    const effectiveDescription = fullContext.description ?? description;
    const effectiveTagline = fullContext.tagline;
    const effectiveTargetAudience = fullContext.targetAudience;

    if (typeof effectiveBrandName !== "string" || !effectiveBrandName.trim()) {
      return c.json({ error: "brandName is required" }, 400);
    }
    if (keywords !== undefined && !Array.isArray(keywords)) {
      return c.json({ error: "keywords must be an array" }, 400);
    }

    const effectiveOverride = getEffectiveOverride(_promptOverride) as
      | { applicationPrompt?: string }
      | undefined;
    const apiKey = c.get("geminiApiKey");
    const normalizedKeywords = fullContext.keywords ?? normalizeStringArray(keywords);

    const effectiveAR = resolveAspectRatio("application", aspectRatio);

    const vc3 = fullContext.visualConcept ?? normalizeVisualConcept(visualConcept);
    const normalizedPalette = fullContext.colorPalette ?? normalizeStringArray(colorPalette);
    const normalizedFont = fullContext.font ?? font;
    const ctx: ImagePromptContext = {
      brandName: effectiveBrandName,
      tagline: effectiveTagline,
      description: effectiveDescription,
      targetAudience: effectiveTargetAudience,
      visualConcept: vc3,
      keywords: normalizedKeywords,
      colorPalette: normalizedPalette,
      aspectRatio: effectiveAR,
      application: fullContext.application ?? application,
      titleFont: normalizedFont?.titleFont,
      bodyFont: normalizedFont?.bodyFont,
    };

    const applicationPrompt = effectiveOverride?.applicationPrompt
      ?? buildCreativeBrief("application", ctx);

    console.log(`[art-director] Generating application — touchpoint="${application}" ar=${effectiveAR} prompt="${applicationPrompt.slice(0, 80)}…"`);

    // Fetch reference images in parallel; silently skip any that fail to load.
    const refUrls = [artStyleImageUrl, logoImageUrl].filter(
      (u): u is string => typeof u === "string" && u.length > 0,
    );
    const refImages: Array<{ b64: string; mimeType: string }> = [];
    if (refUrls.length > 0) {
      const fetchResults = await Promise.all(refUrls.map(fetchImageAsBase64));
      for (const r of fetchResults) {
        if (!("error" in r)) {
          refImages.push(r);
        } else {
          console.log(`[art-director] Reference image fetch skipped: ${r.error}`);
        }
      }
    }

    const genResult = await generateImage(apiKey, applicationPrompt, {
      cardType: "application",
      refImages: refImages.length > 0 ? refImages : undefined,
      aspectRatio: effectiveAR,
    });

    if (genResult.errors.length > 0) {
      console.log(`[art-director] Application generation warnings: ${genResult.errors.join(" | ")}`);
    }

    const applicationImageUrl = await uploadAndSignImage(genResult.b64, genResult.mimeType, "application", c.req.header("X-Project-Id"));
    const generationTime = Date.now() - startTime;
    const usedModel = genResult.usedModel;

    console.log(`[art-director] Application designed (${generationTime}ms)`);

    const referenceImageUrls = [artStyleImageUrl, logoImageUrl].filter(Boolean);

    return c.json({
      applicationImageUrl,
      _meta: {
        agent: "art-director",
        ...(isDevRoutesEnabled() && { prompt: applicationPrompt }),
        model: usedModel,
        generationTime,
        contextMode: "full",
        ingredients: buildIngredients(effectiveBrandName, vc3, normalizedKeywords ?? null, [ctx.application]),
        selectedElementLabels: ["Visual Concept", "Color Palette", "Font", "Art Style", "Logo"],
        referenceImageUrls: referenceImageUrls.length > 0 ? referenceImageUrls : undefined,
      },
    });
  } catch (err) {
    console.error("[art-director] design-application error:", (err as Error)?.stack ?? String(err));
    return c.json({ error: `Application generation failed: ${String(err)}` }, 500);
  }
});

// ── Route: POST /variation ────────────────────────────────────────────────────
// Generates a visual design variation for color-palette or font card types.

artDirector.post("/variation", async (c) => {
  let _rawGeminiText: string | undefined;
  try {
    const startTime = Date.now();
    const body = await c.req.json();
    if (!hasFullContext(body)) {
      return c.json({ error: "brandContext is required" }, 400);
    }
    if (!isMeaningfulFullContext(body)) {
      return c.json({ error: "brandContext must include brand name and at least one contextual field" }, 400);
    }
    const { cardType, brandBrief } = body;
    const apiKey = c.get("geminiApiKey");

    const taskPrompt = ART_DIRECTOR_VARIATION_TASK_DESCRIPTIONS[cardType as "color-palette" | "font"];
    if (!taskPrompt) return c.json({ error: `Unknown card type for art-director variation: ${cardType}` }, 400);

    const fullContext = normalizeFullContext(body);
    const brandNameFromCtx = fullContext.name;
    const normalizedKeywords = fullContext.keywords ?? [];
    const context = buildFullContextText(fullContext);
    const existingContent = brandBrief?.existingContent;
    const excludedFonts: string[] = Array.isArray(brandBrief?.excludedFonts)
      ? brandBrief.excludedFonts as string[]
      : [];

    const existingBlock = existingContent
      ? `\n\nCurrent card content (the new variation must be meaningfully different):\n${JSON.stringify(existingContent, null, 2)}`
      : "";

    const excludedFontsBlock = cardType === "font" && excludedFonts.length > 0
      ? `\n\nFonts already used in this project (DO NOT use any of these — choose entirely different fonts):\n${excludedFonts.join(", ")}`
      : "";

    const routeKey = getVariationRouteKey(cardType as "color-palette" | "font");
    const fullPrompt = buildPrompt({
      persona: PERSONA_ART_DIRECTOR,
      taskDescription: taskPrompt,
      contextBody: context || "No brand context provided.",
      rules: getArtDirectorRules(routeKey),
      extraBlocks: [existingBlock, excludedFontsBlock].filter(Boolean),
    });

    _rawGeminiText = await callGeminiText(apiKey, fullPrompt, { temperature: TEMPERATURES[routeKey] });
    const variation = safeParseJson<Record<string, unknown>>(_rawGeminiText, `art-director/variation/${cardType}`);
    const generationTime = Date.now() - startTime;
    console.log(`[art-director] Variation generated: ${cardType} (${generationTime}ms)`);

    return c.json({
      ...variation,
      _meta: {
        agent: "art-director",
        ...(isDevRoutesEnabled() && { prompt: fullPrompt }),
        model: TEXT_MODEL,
        generationTime,
        contextMode: "full",
        ingredients: [
          brandNameFromCtx,
          fullContext.visualConcept?.concept,
          ...normalizedKeywords,
        ].filter(Boolean),
      },
    });
  } catch (err) {
    console.error("[art-director] variation error:", (err as Error)?.stack ?? String(err));
    return c.json({
      error: `Variation generation failed: ${String(err)}`,
      ...buildDevDebugPayload(_rawGeminiText),
    }, 500);
  }
});

export default artDirector;
