// ─────────────────────────────────────────────────────────────────────────────
// shared/merge-specs.tsx — Unified merge rule table (single source of truth)
//
// Every supported source→target pair has at minimum a `mergeContext` field:
//   mergeContext   — short UI hint shown on drag + prompt sent to merge-generate
//
// Text-target pairs additionally carry:
//   allowedFields  — dot-path list of fields the LLM may modify
//   instruction    — full natural-language task sent to the text/vision model
//
// Both the frontend (via @server-shared Vite alias) and server agents import
// from this file. Do not maintain a separate MERGE_HINTS table on the frontend.
// ─────────────────────────────────────────────────────────────────────────────

import type { MergeSpec } from "./types.tsx";

export const MERGE_SPECS: Record<string, Record<string, MergeSpec>> = {
  // ── color-palette ────────────────────────────────────────────────────────
  "color-palette": {
    // image targets (hint only)
    "logo":             { mergeContext: "Apply palette to logo" },
    "texture":          { mergeContext: "Tint texture with brand colors" },
    "layout":           { mergeContext: "Color-theme the layout" },
    "visual-snapshot":  { mergeContext: "Infuse colors into snapshot" },
    "art-style":        { mergeContext: "Art style from palette mood" },
    // text targets
    "visual-concept": {
      mergeContext: "Embed palette into concept",
      allowedFields: ["visualConcept.points"],
      instruction:
        "Append ONE new point to visualConcept.points describing the color palette's emotional direction and how it anchors the visual identity. Do NOT change conceptName. Do NOT rewrite existing points. Just append.",
    },
    "font": {
      mergeContext: "Match typeface to palette mood",
      allowedFields: ["font.titleFont", "font.bodyFont"],
      instruction:
        "Recommend a Google Fonts pairing (titleFont + bodyFont) whose typographic mood matches the emotional tone of the given color palette. Change only titleFont and bodyFont.",
    },
    "brand-brief": {
      mergeContext: "Color-inspire the brand voice",
      allowedFields: ["brandBrief.description"],
      instruction:
        "Append one sentence to brandBrief.description that describes how the color palette expresses the brand's personality. Do NOT change name or tagline.",
    },
  },

  // ── visual-concept ───────────────────────────────────────────────────────
  "visual-concept": {
    // image targets (hint only)
    "logo":             { mergeContext: "Render concept as logo" },
    "texture":          { mergeContext: "Concept-driven texture" },
    "layout":           { mergeContext: "Concept-inspired layout" },
    "visual-snapshot":  { mergeContext: "Snapshot of concept style" },
    "art-style":        { mergeContext: "Art style from concept" },
    // text targets
    "color-palette": {
      mergeContext: "Derive palette from concept",
      allowedFields: ["colorPalette"],
      instruction:
        "Derive a cohesive 5-color hex palette that reflects the mood and aesthetic of the visual concept. Return only the colorPalette array. Do not change anything else.",
    },
    "font": {
      mergeContext: "Font from concept aesthetic",
      allowedFields: ["font.titleFont", "font.bodyFont"],
      instruction:
        "Recommend a Google Fonts pairing whose aesthetic matches the visual concept. Change only titleFont and bodyFont.",
    },
    "brand-brief": {
      mergeContext: "Concept-driven brand voice",
      allowedFields: ["brandBrief.description"],
      instruction:
        "Append one sentence to brandBrief.description referencing the visual concept name and its first point. Do NOT change name or tagline.",
    },
  },

  // ── font ─────────────────────────────────────────────────────────────────
  "font": {
    // image targets (hint only)
    "logo":             { mergeContext: "Wordmark logo from typeface" },
    "art-style":        { mergeContext: "Art style from typography" },
    // text targets
    "visual-concept": {
      mergeContext: "Typographic concept direction",
      allowedFields: ["visualConcept.points"],
      instruction:
        "Append ONE new point to visualConcept.points describing how the font pairing expresses the brand's typographic personality. Do NOT change conceptName or existing points.",
    },
    "brand-brief": {
      mergeContext: "Voice matched to typeface",
      allowedFields: ["brandBrief.description"],
      instruction:
        "Append one sentence to brandBrief.description describing how the font pairing reflects the brand's editorial voice. Do NOT change name or tagline.",
    },
  },

  // ── brand-brief ──────────────────────────────────────────────────────────
  "brand-brief": {
    // image targets (hint only)
    "logo":             { mergeContext: "Brief-driven logo direction" },
    "art-style":        { mergeContext: "Art style from brand voice" },
    // text targets
    "visual-concept": {
      mergeContext: "Concept distilled from brief",
      allowedFields: ["visualConcept.points"],
      instruction:
        "Replace the second point in visualConcept.points with one that references the brand tagline and its essence. Do NOT change conceptName, the first point, or any other point.",
    },
    "color-palette": {
      mergeContext: "Brief-inspired palette",
      allowedFields: ["colorPalette"],
      instruction:
        "Derive a cohesive 5-color hex palette inspired by the brand name, tagline, and description. Return only the colorPalette array.",
    },
    "font": {
      mergeContext: "Voice-matched typeface",
      allowedFields: ["font.titleFont", "font.bodyFont"],
      instruction:
        "Recommend a Google Fonts pairing whose voice matches the Brand Summary tone. Change only titleFont and bodyFont.",
    },
  },

  // ── logo ─────────────────────────────────────────────────────────────────
  "logo": {
    // image targets (hint only)
    "texture":          { mergeContext: "Texture from logo material" },
    "layout":           { mergeContext: "Layout echoing logo form" },
    "art-style":        { mergeContext: "Art style from logo aesthetic" },
    // text targets
    "visual-concept": {
      mergeContext: "Concept from logo style",
      allowedFields: ["visualConcept.points"],
      instruction:
        "Analyze the provided source image of the logo. Append ONE new point to visualConcept.points describing the logo's visual mood, style, and personality as seen in the image. Do NOT change conceptName or existing points.",
    },
    "color-palette": {
      mergeContext: "Extract logo palette",
      allowedFields: ["colorPalette"],
      instruction:
        "Analyze the colors in this logo image. Extract exactly 5 hex colors that best represent its color palette — include the primary brand color, key accent colors, and any neutral tones. Return ONLY valid JSON: { \"colorPalette\": [\"#RRGGBB\", ...] }",
      requiresSourceImage: true,
    },
    "brand-brief": {
      mergeContext: "Brief from logo character",
      allowedFields: ["brandBrief.description"],
      instruction:
        "Append one sentence to brandBrief.description that describes the character the logo brings to the brand. Do NOT change name or tagline.",
    },
    "font": {
      mergeContext: "Font inspired by logo style",
      allowedFields: ["font.titleFont", "font.bodyFont"],
      instruction:
        "Analyze the provided source image. If it contains visible text or lettering, find a Google Font that closely resembles that typeface for titleFont, then pair it with a complementary bodyFont. Otherwise, recommend a Google Fonts pairing whose typographic character echoes the image's visual mood and style. Change only titleFont and bodyFont.",
    },
  },

  // ── art-style ─────────────────────────────────────────────────────────────
  "art-style": {
    // image targets (hint only)
    "logo":             { mergeContext: "Design a logo refering to this style" },
    "layout":           { mergeContext: "Layout reflecting art style" },
    "visual-snapshot":  { mergeContext: "Snapshot in art style" },
    // text targets
    "visual-concept": {
      mergeContext: "Concept from art style",
      allowedFields: ["visualConcept.points"],
      instruction:
        "Analyze the provided source image of the art style. Append ONE new point to visualConcept.points describing the visual language, mood, and aesthetic qualities observed in the image. Do NOT change conceptName or existing points.",
    },
    "color-palette": {
      mergeContext: "Palette inspired by art style",
      allowedFields: ["colorPalette"],
      instruction:
        "Analyze the colors in this art style image. Extract exactly 5 hex colors that capture its overall color mood and atmosphere — dominant tones, characteristic accents, and any recurring neutrals. Return ONLY valid JSON: { \"colorPalette\": [\"#RRGGBB\", ...] }",
      requiresSourceImage: true,
    },
    "brand-brief": {
      mergeContext: "Brief enriched by art direction",
      allowedFields: ["brandBrief.description"],
      instruction:
        "Analyze the provided source image of the art style. Append one sentence to brandBrief.description describing how the visual qualities observed in the image express the brand's creative character. Do NOT change name or tagline.",
    },
    "font": {
      mergeContext: "Font matching art style tone",
      allowedFields: ["font.titleFont", "font.bodyFont"],
      instruction:
        "Analyze the provided source image of the art style. Recommend a Google Fonts pairing whose aesthetic matches the visual mood, texture, and atmosphere observed in the image. Change only titleFont and bodyFont.",
    },
  },

  // ── texture ───────────────────────────────────────────────────────────────
  "texture": {
    // image targets (hint only)
    "logo":             { mergeContext: "Logo with texture material" },
    "layout":           { mergeContext: "Layout with texture motif" },
    // text targets
    "color-palette": {
      mergeContext: "Colors extracted from texture",
      allowedFields: ["colorPalette"],
      instruction:
        "Analyze the provided source image of the texture. Extract a 5-color hex palette that captures its color mood and material tones. Return only the colorPalette array.",
    },
    "visual-concept": {
      mergeContext: "Concept from texture style",
      allowedFields: ["visualConcept.points"],
      instruction:
        "Append ONE new point to visualConcept.points about how the texture's tactile quality informs the visual language. Do NOT change conceptName or existing points.",
    },
  },

  // ── layout ────────────────────────────────────────────────────────────────
  "layout": {
    // image targets (hint only)
    "logo":             { mergeContext: "Logo aligned to layout" },
    "visual-snapshot":  { mergeContext: "Snapshot with layout grid" },
    // text targets
    "visual-concept": {
      mergeContext: "Concept from layout structure",
      allowedFields: ["visualConcept.points"],
      instruction:
        "Append ONE new point to visualConcept.points about how the layout's structural grid informs the visual system. Do NOT change conceptName or existing points.",
    },
    "color-palette": {
      mergeContext: "Extract layout palette",
      allowedFields: ["colorPalette"],
      instruction:
        "Analyze the colors in this layout image. Extract exactly 5 hex colors that reflect its design palette — background tones, typographic colors, accent or highlight colors, and structural neutrals. Return ONLY valid JSON: { \"colorPalette\": [\"#RRGGBB\", ...] }",
      requiresSourceImage: true,
    },
    "font": {
      mergeContext: "Font matched to layout grid",
      allowedFields: ["font.titleFont", "font.bodyFont"],
      instruction:
        "Analyze the provided source image of the layout. Recommend a Google Fonts pairing whose structure and rhythm matches the grid system and visual style observed in the image. Change only titleFont and bodyFont.",
    },
  },

  // ── visual-snapshot ───────────────────────────────────────────────────────
  "visual-snapshot": {
    // image targets (hint only)
    "logo":             { mergeContext: "Logo from snapshot style" },
    "texture":          { mergeContext: "Texture from snapshot mood" },
    // text targets
    "visual-concept": {
      mergeContext: "Concept from snapshot mood",
      allowedFields: ["visualConcept.points"],
      instruction:
        "Append ONE new point to visualConcept.points about the mood and atmosphere captured in the snapshot. Do NOT change conceptName or existing points.",
    },
    "color-palette": {
      mergeContext: "Extract snapshot palette",
      allowedFields: ["colorPalette"],
      instruction:
        "Analyze the provided source image of the visual snapshot. Extract a 5-color hex palette that captures its overall color mood and atmosphere. Return only the colorPalette array.",
    },
  },
};

// ── Card-ID ↔ brandData field mapping ────────────────────────────────────────

export function mergeCardIdToField(cardId: string): string | null {
  const map: Record<string, string> = {
    "color-palette":    "colorPalette",
    "font":             "font",
    "brand-brief":      "brandBrief",
    "visual-concept":   "visualConcept",
    "logo":             "logoInspiration",
    "art-style":        "artStyle",
    "layout":           "layout",
    "visual-snapshot":  "styleReferences",
  };
  return map[cardId] ?? null;
}

// ── Field guard — enforce allowedFields after AI response ────────────────────

export function applyFieldGuard(
  original: unknown,
  updated: unknown,
  allowedFields: string[],
  fieldPrefix = "",
): unknown {
  if (typeof original !== "object" || original === null || Array.isArray(original)) {
    return updated;
  }
  if (typeof updated !== "object" || updated === null) return original;

  const orig   = original as Record<string, unknown>;
  const upd    = updated  as Record<string, unknown>;
  const result: Record<string, unknown> = { ...orig };

  for (const key of Object.keys(orig)) {
    const fullPath     = fieldPrefix ? `${fieldPrefix}.${key}` : key;
    const directAllow  = allowedFields.includes(fullPath);
    const hasChildAllow = allowedFields.some((f) => f.startsWith(`${fullPath}.`));

    if (directAllow) {
      result[key] = upd[key];
    } else if (hasChildAllow) {
      result[key] = applyFieldGuard(orig[key], upd[key], allowedFields, fullPath);
    } else {
      result[key] = orig[key];
    }
  }

  return result;
}
