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
  TEXT_MODEL,
  generateImage,
  uploadAndSignImage,
  getLastUsedImageModel,
} from "../shared/gemini.tsx";
import type { ImagePromptContext } from "../shared/types.tsx";
import { resolveAspectRatio } from "../shared/image-config.tsx";

const artDirector = new Hono();

// ── Agent persona (embedded into prompt context) ─────────────────────────────

const ART_DIRECTOR_PERSONA = `You are a creative director translating brand strategy into compelling visual concepts.
You think in terms of composition, symbolism, color psychology, and visual narrative.
Every image you direct must feel intentional — reinforcing the brand's core identity.`;

const ART_DIRECTOR_TEXT_PERSONA = `You are a creative director with deep expertise in color theory, typography, and art direction.
You make precise visual design decisions grounded in brand strategy — every color, font, and style choice must feel intentional.
You always return ONLY valid JSON — no markdown, no explanation, no code fences.`;

// ── Sequential generation prompts ─────────────────────────────────────────────

const PALETTE_FONTS_PROMPT = `Given the brand brief and visual concept, design a color palette and typography system.
Return ONLY valid JSON with this exact structure:
{
  "colorPalette": ["#RRGGBB", ...],
  "font": {
    "titleFont": "Google Fonts display/heading font name",
    "bodyFont": "Google Fonts body font name"
  }
}
Rules:
- Color palette: 3 to 5 harmonious hex colors that reflect the brand mood and visual concept direction.
- Colors should form a usable system: 1 primary, 1-2 secondary, 1-2 neutral/accent.
- Font names must be real Google Fonts. Choose fonts that embody the brand personality.
- The title font should have strong character; the body font should be highly readable.
- Typography and color choices must reinforce the visual concept's aesthetic direction.`;

// ── Creative brief builder (text → image prompt) ─────────────────────────────

export function buildCreativeBrief(
  cardType: string,
  ctx: ImagePromptContext,
): string {
  const name    = ctx.brandName ?? "the brand";
  const desc    = (ctx.brandDescription ?? "").slice(0, 180);
  const phrases = ctx.conceptPhrases ?? [];
  const conceptStr = phrases.join(". ");
  const kwds    = (ctx.keywords ?? []).join(", ");
  const focus   = ctx.mergeContext ? `Creative direction: ${ctx.mergeContext}. ` : "";

  switch (cardType) {
    case "logo":
      return (
        `${focus}Brand logo design concept for "${name}". ` +
        `${conceptStr ? `Visual concept: ${conceptStr}. ` : ""}` +
        `Minimal clean graphic, white background, professional brand mark, ` +
        `no photorealism, no text labels, vector illustration style.`
      );
    case "art-style":
      return (
        `${focus}Art style reference image for "${name}" brand. ` +
        `${conceptStr ? `Visual concept: ${conceptStr}. ` : ""}` +
        `${kwds ? `Keywords: ${kwds}. ` : ""}` +
        `Create a visual art direction reference board showing the brand's aesthetic style, ` +
        `mood, texture, and visual language.`
      );
    case "application": {
      const touchpoint = ctx.application ?? "brand packaging";
      return (
        `${focus}Brand application mockup: ${touchpoint} for "${name}". ` +
        `${conceptStr ? `Visual concept: ${conceptStr}. ` : ""}` +
        `Show the brand identity applied to a realistic ${touchpoint}. ` +
        `Use the brand's colors, typography, and visual style. ` +
        `Clean studio photography, white background, professional product mockup.`
      );
    }
    case "visual-snapshot":
      return (
        `${focus}Brand moodboard image for "${name}". ` +
        `${kwds ? `Keywords: ${kwds}. ` : ""}${conceptStr ? `${conceptStr}. ` : ""}` +
        `${desc.slice(0, 100)}. ` +
        `Lifestyle editorial photography, aspirational brand imagery, creative direction.`
      );
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
    const {
      cardType,
      brandName,
      brandDescription,
      conceptPhrases,
      keywords,
      colorPalette,
      mergeContext,
      aspectRatio,
    } = body;

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return c.json({ error: "GEMINI_API_KEY not configured" }, 500);

    const effectiveAR = resolveAspectRatio(cardType, aspectRatio);

    const ctx: ImagePromptContext = {
      brandName, brandDescription, conceptPhrases,
      keywords, colorPalette, mergeContext,
      aspectRatio: effectiveAR,
    };

    const prompt = buildCreativeBrief(cardType, ctx);
    console.log(`[art-director] Generating (txt2img) — cardType=${cardType} ar=${effectiveAR} prompt="${prompt.slice(0, 80)}…"`);

    const genResult = await generateImage(apiKey, prompt, undefined, undefined, effectiveAR);
    if (genResult.errors.length > 0) {
      console.log(`[art-director] Warning: some models failed: ${genResult.errors.join(" | ")}`);
    }

    const imageUrl = await uploadAndSignImage(genResult.b64, genResult.mimeType, cardType);
    const generationTime = Date.now() - startTime;
    const usedModel = getLastUsedImageModel()?.shortName ?? "unknown";

    const selectedElementLabels = [
      brandName && "Brand Brief",
      (conceptPhrases?.length ?? 0) > 0 && "Visual Concept",
      (colorPalette?.length ?? 0) > 0 && "Color Palette",
    ].filter(Boolean) as string[];

    return c.json({
      imageUrl,
      _meta: {
        agent: "art-director",
        prompt,
        model: usedModel,
        generationTime,
        ingredients: [brandName, ...(conceptPhrases ?? []).slice(0, 1), ...(keywords ?? [])].filter(Boolean),
        selectedElementLabels: selectedElementLabels.length > 0 ? selectedElementLabels : undefined,
      },
    });
  } catch (err) {
    console.log("[art-director] generate error:", err);
    return c.json({ error: `Image generation failed: ${String(err)}` }, 500);
  }
});

// ── Route: POST /design-palette-fonts ─────────────────────────────────────────
// Step 1: Generate color palette and typography from brand brief + visual concept.

artDirector.post("/design-palette-fonts", async (c) => {
  try {
    const startTime = Date.now();
    const { brandName, tagline, description, targetAudience, keywords, visualConcept } = await c.req.json();
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return c.json({ error: "GEMINI_API_KEY not configured" }, 500);

    const briefContext = [
      brandName && `Brand name: "${brandName}"`,
      tagline && `Tagline: "${tagline}"`,
      description && `Description: ${description}`,
      targetAudience && `Target audience: ${targetAudience}`,
      keywords?.length && `Keywords: ${(Array.isArray(keywords) ? keywords : [keywords]).join(", ")}`,
    ].filter(Boolean).join("\n");

    const conceptBlock = Array.isArray(visualConcept) && visualConcept.length > 0
      ? `\n\nVisual concept phrases:\n- ${visualConcept.join("\n- ")}`
      : "";

    const fullPrompt =
      `${ART_DIRECTOR_TEXT_PERSONA}\n\n${PALETTE_FONTS_PROMPT}\n\nBrand brief:\n${briefContext}${conceptBlock}`;

    const text = await callGeminiText(apiKey, fullPrompt, { temperature: 0.9 });
    const result = JSON.parse(text);
    const generationTime = Date.now() - startTime;
    console.log(`[art-director] Palette + fonts designed (${generationTime}ms)`);

    return c.json({
      colorPalette: result.colorPalette,
      font: result.font,
      _meta: {
        agent: "art-director",
        prompt: fullPrompt,
        model: TEXT_MODEL,
        generationTime,
        ingredients: [brandName, ...(Array.isArray(visualConcept) ? visualConcept.slice(0, 1) : []), ...(Array.isArray(keywords) ? keywords : [])].filter(Boolean),
        selectedElementLabels: ["Brand Brief", "Visual Concept"],
      },
    });
  } catch (err) {
    console.log("[art-director] design-palette-fonts error:", err);
    return c.json({ error: `Palette & fonts generation failed: ${String(err)}` }, 500);
  }
});

// ── Route: POST /design-logo-style ────────────────────────────────────────────
// Step 2: Generate logo image + art style text in parallel.
// Receives palette and font from step 1 as additional context.

artDirector.post("/design-logo-style", async (c) => {
  try {
    const startTime = Date.now();
    const {
      brandName, tagline, description, targetAudience, keywords,
      visualConcept, colorPalette, font, aspectRatio,
    } = await c.req.json();
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return c.json({ error: "GEMINI_API_KEY not configured" }, 500);

    const logoAR = resolveAspectRatio("logo", aspectRatio);
    const artStyleAR = resolveAspectRatio("art-style", aspectRatio);

    const baseCtx = {
      brandName,
      brandDescription: description,
      conceptPhrases: Array.isArray(visualConcept) ? visualConcept : undefined,
      keywords: Array.isArray(keywords) ? keywords : undefined,
      colorPalette,
    };

    const logoPrompt = buildCreativeBrief("logo", { ...baseCtx, aspectRatio: logoAR });
    const artStylePrompt = buildCreativeBrief("art-style", { ...baseCtx, aspectRatio: artStyleAR });

    const [logoGenResult, artStyleGenResult] = await Promise.all([
      generateImage(apiKey, logoPrompt, undefined, undefined, logoAR),
      generateImage(apiKey, artStylePrompt, undefined, undefined, artStyleAR),
    ]);

    if (logoGenResult.errors.length > 0) {
      console.log(`[art-director] Logo generation warnings: ${logoGenResult.errors.join(" | ")}`);
    }
    if (artStyleGenResult.errors.length > 0) {
      console.log(`[art-director] Art style generation warnings: ${artStyleGenResult.errors.join(" | ")}`);
    }

    const [logoImageUrl, artStyleImageUrl] = await Promise.all([
      uploadAndSignImage(logoGenResult.b64, logoGenResult.mimeType, "logo"),
      uploadAndSignImage(artStyleGenResult.b64, artStyleGenResult.mimeType, "art-style"),
    ]);

    const generationTime = Date.now() - startTime;
    const usedModel = getLastUsedImageModel()?.shortName ?? "unknown";

    console.log(`[art-director] Logo + art style designed (${generationTime}ms)`);

    return c.json({
      artStyleImageUrl,
      logoImageUrl,
      _meta: {
        agent: "art-director",
        prompt: `[art-style] ${artStylePrompt.slice(0, 100)}… | [logo] ${logoPrompt.slice(0, 100)}…`,
        model: usedModel,
        generationTime,
        ingredients: [brandName, ...(Array.isArray(visualConcept) ? visualConcept.slice(0, 1) : []), ...(Array.isArray(keywords) ? keywords : [])].filter(Boolean),
        selectedElementLabels: ["Visual Concept", "Color Palette", "Font"],
      },
    });
  } catch (err) {
    console.log("[art-director] design-logo-style error:", err);
    return c.json({ error: `Logo & art style generation failed: ${String(err)}` }, 500);
  }
});

// ── Route: POST /design-application ──────────────────────────────────────────
// Step 3: Generate application mockup using full visual context from prior steps.

artDirector.post("/design-application", async (c) => {
  try {
    const startTime = Date.now();
    const {
      brandName, description, keywords,
      visualConcept, colorPalette, font,
      artStyleImageUrl, logoImageUrl,
      aspectRatio,
      application,
    } = await c.req.json();
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return c.json({ error: "GEMINI_API_KEY not configured" }, 500);

    const effectiveAR = resolveAspectRatio("application", aspectRatio);

    const ctx: ImagePromptContext = {
      brandName,
      brandDescription: description,
      conceptPhrases: Array.isArray(visualConcept) ? visualConcept : undefined,
      keywords: Array.isArray(keywords) ? keywords : undefined,
      colorPalette,
      aspectRatio: effectiveAR,
      application,
    };

    let applicationPrompt = buildCreativeBrief("application", ctx);
    if (font) {
      applicationPrompt += ` Typography: "${font.titleFont}" for headings, "${font.bodyFont}" for body.`;
    }

    console.log(`[art-director] Generating application — touchpoint="${application}" ar=${effectiveAR} prompt="${applicationPrompt.slice(0, 80)}…"`);

    const genResult = await generateImage(apiKey, applicationPrompt, undefined, undefined, effectiveAR);
    if (genResult.errors.length > 0) {
      console.log(`[art-director] Application generation warnings: ${genResult.errors.join(" | ")}`);
    }

    const applicationImageUrl = await uploadAndSignImage(genResult.b64, genResult.mimeType, "application");
    const generationTime = Date.now() - startTime;
    const usedModel = getLastUsedImageModel()?.shortName ?? "unknown";

    console.log(`[art-director] Application designed (${generationTime}ms)`);

    const referenceImageUrls = [artStyleImageUrl, logoImageUrl].filter(Boolean);

    return c.json({
      applicationImageUrl,
      _meta: {
        agent: "art-director",
        prompt: applicationPrompt,
        model: usedModel,
        generationTime,
        ingredients: [brandName, application, ...(Array.isArray(visualConcept) ? visualConcept.slice(0, 1) : []), ...(Array.isArray(keywords) ? keywords : [])].filter(Boolean),
        selectedElementLabels: ["Visual Concept", "Color Palette", "Font", "Art Style", "Logo"],
        referenceImageUrls: referenceImageUrls.length > 0 ? referenceImageUrls : undefined,
      },
    });
  } catch (err) {
    console.log("[art-director] design-application error:", err);
    return c.json({ error: `Application generation failed: ${String(err)}` }, 500);
  }
});

export default artDirector;
