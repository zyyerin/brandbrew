// ─────────────────────────────────────────────────────────────────────────────
// shared/image-config.tsx — Centralized image generation configuration
//
// Single source of truth for per-card-type aspect ratios and model preferences.
// All agents read from here instead of hard-coding values in prompts or routes.
// ─────────────────────────────────────────────────────────────────────────────

export type AspectRatio = "1:1" | "16:9" | "9:16" | "4:3" | "3:4";

export interface ImageCardConfig {
  /** Native aspect ratio passed to the Gemini / Imagen API */
  aspectRatio: AspectRatio;
  /** CSS-friendly numeric ratio (width / height) for frontend display */
  displayRatio: number;
}

/**
 * Per-card-type image generation defaults.
 * Agents use `getImageCardConfig(cardType)` to resolve these at generation time,
 * but callers can still override via the request body's `aspectRatio` field.
 */
export const IMAGE_CARD_CONFIGS: Record<string, ImageCardConfig> = {
  "logo":             { aspectRatio: "1:1",  displayRatio: 1 },
  "art-style":        { aspectRatio: "16:9",  displayRatio: 16 / 9 },
  "layout":           { aspectRatio: "16:9",  displayRatio: 16 / 9 },
  "visual-snapshot":  { aspectRatio: "16:9",  displayRatio: 16 / 9 },
  "brand-context":    { aspectRatio: "16:9", displayRatio: 16 / 9 },
  "wordmark":         { aspectRatio: "1:1",  displayRatio: 1 },
};

const DEFAULT_CONFIG: ImageCardConfig = {
  aspectRatio: "1:1",
  displayRatio: 1,
};

/** Look up config for a card type, with a safe fallback. */
export function getImageCardConfig(cardType: string): ImageCardConfig {
  return IMAGE_CARD_CONFIGS[cardType] ?? DEFAULT_CONFIG;
}

/**
 * Resolve the effective aspect ratio for a generation request.
 * Priority: explicit caller override > per-card-type config > global default.
 */
export function resolveAspectRatio(
  cardType: string,
  override?: string,
): AspectRatio {
  if (override) return override as AspectRatio;
  return getImageCardConfig(cardType).aspectRatio;
}
