import { buildPrompt } from "./prompt-builder.ts";
import { RULE_OUTPUT_JSON } from "./prompt-rules.ts";

export const PERSONA_ART_DIRECTOR = `You are a creative director with deep expertise in color theory, typography, and art direction.
You make precise visual design decisions grounded in brand strategy - every color, font, and style choice must feel intentional.`;

export type ArtDirectorRouteKey =
  | "design-palette-fonts"
  | "variation-color-palette"
  | "variation-font";

export const TEMPERATURES: Record<ArtDirectorRouteKey, number> = {
  "design-palette-fonts": 1.0,
  "variation-color-palette": 1.0,
  "variation-font": 1.0,
};

export const PALETTE_FONTS_TASK_DESCRIPTION = `Given the brand brief and visual concept, design a color palette and typography system.
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
- Font names must be real Google Fonts.
- The title font should have strong character; the body font should be readable.
- Typography and color choices must reinforce the visual concept's aesthetic direction.`;

export const ART_DIRECTOR_VARIATION_TASK_DESCRIPTIONS: Record<"color-palette" | "font", string> = {
  "color-palette": `Given the brand context, generate a color palette that is distinctly different from the current one.
Explore a different mood, temperature, or contrast level - shift the emotional register while still fitting the brand.
The new palette must differ in at least 2 of 3 dimensions: hue range, saturation level, and lightness contrast.
Return ONLY valid JSON: {"colorPalette":["#RRGGBB","#RRGGBB","#RRGGBB","#RRGGBB","#RRGGBB"]}.`,
  "font": `Given the brand context, recommend a font pairing with a clearly different personality from the current one.
Choose a different style category (e.g. switch from geometric sans-serif to humanist, from modern serif to slab, from neutral to expressive).
The title font should have strong character; the body font should be highly readable at small sizes.
Return ONLY valid JSON: {"titleFont":"Google Font Name","bodyFont":"Google Font Name"}. Use only real Google Fonts names.`,
};

export function getVariationRouteKey(cardType: "color-palette" | "font"): ArtDirectorRouteKey {
  return cardType === "color-palette" ? "variation-color-palette" : "variation-font";
}

export function getArtDirectorRules(
  _route: ArtDirectorRouteKey,
): string[] {
  return [RULE_OUTPUT_JSON];
}

export { buildPrompt };
export { RULE_OUTPUT_JSON };
