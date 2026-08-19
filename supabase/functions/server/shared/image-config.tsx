// ─────────────────────────────────────────────────────────────────────────────
// shared/image-config.tsx — Centralized image generation configuration
//
// Single source of truth for per-card-type aspect ratios and models.
// All agents read from here instead of hard-coding values in prompts or routes.
// ─────────────────────────────────────────────────────────────────────────────

export type AspectRatio = "1:1" | "16:9" | "9:16" | "4:3" | "3:4";

// Available image models. Every card type names one explicitly below.
export const PRO_IMAGE_MODEL = "gemini-3-pro-image-preview";
export const FLASH_IMAGE_MODEL = "gemini-3.1-flash-image-preview";
/** Direct-merge image generation always uses Pro, regardless of card type. */
export const MERGE_IMAGE_MODEL = PRO_IMAGE_MODEL;

/** "generate" follows IMAGE_CARD_CONFIGS; "merge" always uses MERGE_IMAGE_MODEL. */
export type ImageGenPurpose = "generate" | "merge";

export interface ImageCardConfig {
  /**
   * The one model used for this card type. There is no waterfall and no
   * environment switch: when this model fails the request fails, rather than
   * silently downgrading to a cheaper model and producing an image whose
   * provenance nobody notices. Change the model by editing the line below.
   */
  model: string;
  /** Native aspect ratio passed to the Gemini / Imagen API */
  aspectRatio: AspectRatio;
  /** CSS-friendly numeric ratio (width / height) for frontend display */
  displayRatio: number;
}

/**
 * Per-card-type image generation config.
 * Agents use `resolveImageModel` / `resolveAspectRatio` to read these at
 * generation time. Callers may set purpose `"merge"` (direct merge), which
 * always uses MERGE_IMAGE_MODEL. They cannot pick an arbitrary model id.
 * Aspect ratio can still be overridden via the request body's `aspectRatio`.
 */
export const IMAGE_CARD_CONFIGS: Record<string, ImageCardConfig> = {
  "logo":             { model: FLASH_IMAGE_MODEL, aspectRatio: "1:1",  displayRatio: 1 },
  "wordmark":         { model: FLASH_IMAGE_MODEL, aspectRatio: "1:1",  displayRatio: 1 },
  "art-style":        { model: PRO_IMAGE_MODEL,   aspectRatio: "16:9", displayRatio: 16 / 9 },
  "application":      { model: PRO_IMAGE_MODEL,   aspectRatio: "16:9", displayRatio: 16 / 9 },
  "visual-snapshot":  { model: PRO_IMAGE_MODEL,   aspectRatio: "16:9", displayRatio: 16 / 9 },
  // Reachability unconfirmed: the /context route currently sends "application".
  "brand-context":    { model: FLASH_IMAGE_MODEL, aspectRatio: "16:9", displayRatio: 16 / 9 },
};

type AspectDefaults = Omit<ImageCardConfig, "model">;

const DEFAULT_ASPECT: AspectDefaults = {
  aspectRatio: "1:1",
  displayRatio: 1,
};

/**
 * Aspect / display defaults for a card type.
 * Deliberately returns no model: an unconfigured card type has to fail loudly in
 * `resolveImageModel` instead of quietly inheriting a default model.
 */
export function getImageCardConfig(cardType: string): AspectDefaults {
  return IMAGE_CARD_CONFIGS[cardType] ?? DEFAULT_ASPECT;
}

/**
 * Accept only the literal `"merge"`. Anything else (missing, typo, `"pro"`)
 * stays on the per-card generate mapping so clients cannot pick a model id.
 */
export function parseImageGenPurpose(raw: unknown): ImageGenPurpose {
  return raw === "merge" ? "merge" : "generate";
}

/** The model for a card type. Throws when the card type has no entry above. */
export function resolveImageModel(
  cardType: string | undefined,
  purpose: ImageGenPurpose = "generate",
): string {
  if (purpose === "merge") return MERGE_IMAGE_MODEL;
  const config = cardType ? IMAGE_CARD_CONFIGS[cardType] : undefined;
  if (!config) {
    throw new Error(
      `No image model configured for cardType "${cardType ?? "(missing)"}" — add it to `
      + `IMAGE_CARD_CONFIGS in shared/image-config.tsx. `
      + `Configured card types: ${Object.keys(IMAGE_CARD_CONFIGS).join(", ")}`,
    );
  }
  return config.model;
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
