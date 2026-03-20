import { callApi } from "./apiClient";
import type { VariationMeta } from "../types/project";

const IMAGE_GEN_TIMEOUT_MS = 120_000;
const ART_DIRECTOR_LOGO_STYLE_TIMEOUT_MS = 150_000;
const ART_DIRECTOR_LAYOUT_TIMEOUT_MS = 180_000;

export type ImageCardType =
  | "logo"
  | "application"
  | "art-style"
  | "visual-snapshot";

export interface ImageGenContext {
  brandName?: string;
  brandDescription?: string;
  conceptPhrases?: string[];
  keywords?: string[];
  colorPalette?: string[];
  /** Optional merge action hint to steer the prompt, e.g. "Apply palette to logo" */
  mergeContext?: string;
  /** Existing image URL for image-to-image editing (preserves shape/structure) */
  sourceImageUrl?: string;
  /** Base64 PNG of the source card rendered as an image (e.g. color palette swatches) */
  paletteImageBase64?: string;
  /** Heading/display font name (Google Fonts) — signals wordmark generation when font→logo */
  titleFont?: string;
}

export interface ImageGenResult {
  imageUrl: string;
  _meta?: VariationMeta;
}

export interface VisualSnapshotFromElementsParams {
  brandName?: string;
  prompt: string;
  referenceImageUrls: string[];
  paletteImageBase64?: string;
  font1?: string;
  font2?: string;
}

export interface BrandContextMockupParams {
  application: string;
  brandName?: string;
  visualSnapshotUrl?: string;
}

/**
 * Calls the server-side image generation endpoint and returns a signed URL
 * for the generated image stored in Supabase Storage.
 *
 * Uses a 90-second timeout so that if the Edge Function connection is dropped
 * the caller gets a descriptive error instead of a bare "TypeError: Failed to fetch".
 */
export async function generateBrandImage(
  cardType: ImageCardType,
  ctx: ImageGenContext,
): Promise<ImageGenResult> {
  const data = await callApi<{ imageUrl?: string; _meta?: ImageGenResult["_meta"] }>(
    "generate-image",
    { body: { cardType, ...ctx }, timeoutMs: IMAGE_GEN_TIMEOUT_MS },
  );
  if (!data.imageUrl) throw new Error("No imageUrl in server response");
  return { imageUrl: data.imageUrl, _meta: data._meta };
}

export interface MergeImageContext {
  brandName?: string;
  brandDescription?: string;
  mergeContext: string;
  /** Active image URL of the source card — used as img2img reference when available */
  sourceImageUrl?: string;
}

export async function generateMergeImage(
  cardType: ImageCardType,
  ctx: MergeImageContext,
): Promise<ImageGenResult> {
  const data = await callApi<{ imageUrl?: string; _meta?: ImageGenResult["_meta"] }>(
    "visual-designer/merge-generate",
    { body: { cardType, ...ctx }, timeoutMs: IMAGE_GEN_TIMEOUT_MS },
  );
  if (!data.imageUrl) throw new Error("No imageUrl in server response");
  return { imageUrl: data.imageUrl, _meta: data._meta };
}

// ─── Art Director sequential generation API ──────────────────────────────────

export interface DesignBriefContext {
  brandName?: string;
  tagline?: string;
  description?: string;
  targetAudience?: string;
  keywords?: string[];
  visualConcept?: string[];
  colorPalette?: string[];
  font?: { titleFont: string; bodyFont: string };
  artStyleImageUrl?: string;
  logoImageUrl?: string;
  /** Touchpoint name for application mockup generation (e.g. "Business Card", "Packaging") */
  application?: string;
}

export interface PaletteFontsResult {
  colorPalette: string[];
  font: { titleFont: string; bodyFont: string };
  _meta?: VariationMeta;
}

export interface LogoStyleResult {
  artStyleImageUrl: string;
  logoImageUrl: string;
  _meta?: VariationMeta;
}

export interface ApplicationResult {
  applicationImageUrl: string;
  _meta?: VariationMeta;
}

export async function designPaletteAndFonts(ctx: DesignBriefContext): Promise<PaletteFontsResult> {
  const raw = await callApi<PaletteFontsResult & { _meta?: VariationMeta }>(
    "art-director/design-palette-fonts",
    { body: ctx, timeoutMs: 60_000 },
  );
  return { colorPalette: raw.colorPalette, font: raw.font, _meta: raw._meta };
}

export async function designLogoAndStyle(ctx: DesignBriefContext): Promise<LogoStyleResult> {
  const raw = await callApi<LogoStyleResult & { _meta?: VariationMeta }>(
    "art-director/design-logo-style",
    { body: ctx, timeoutMs: ART_DIRECTOR_LOGO_STYLE_TIMEOUT_MS },
  );
  return { artStyleImageUrl: raw.artStyleImageUrl, logoImageUrl: raw.logoImageUrl, _meta: raw._meta };
}

export async function designApplication(ctx: DesignBriefContext): Promise<ApplicationResult> {
  const raw = await callApi<ApplicationResult & { _meta?: VariationMeta }>(
    "art-director/design-application",
    { body: ctx, timeoutMs: ART_DIRECTOR_LAYOUT_TIMEOUT_MS },
  );
  return { applicationImageUrl: raw.applicationImageUrl, _meta: raw._meta };
}

/**
 * Generates a visual snapshot (moodboard) from selected element cards.
 * Uses element images (logo/layout/style refs, palette swatch) plus a fixed prompt.
 */
export async function generateVisualSnapshotFromElements(
  params: VisualSnapshotFromElementsParams,
): Promise<ImageGenResult> {
  const { brandName, ...rest } = params;
  const body = {
    cardType: "visual-snapshot" as const,
    brandName,
    ...rest,
  };

  const data = await callApi<{ imageUrl?: string; _meta?: ImageGenResult["_meta"] }>(
    "generate-image",
    { body, timeoutMs: IMAGE_GEN_TIMEOUT_MS },
  );
  if (!data.imageUrl) throw new Error("No imageUrl in server response");
  return { imageUrl: data.imageUrl, _meta: data._meta };
}

/**
 * Generates a single Brand in Context mockup image for a given application.
 * Uses the brand's visual snapshot (if available) as a reference image plus
 * the fixed prompt required by the direction spec.
 */
export async function generateBrandContextMockup(
  params: BrandContextMockupParams,
): Promise<ImageGenResult> {
  const { application, brandName, visualSnapshotUrl } = params;

  const prompt = `Create a mockup of ${application}, clean white studio background.`;

  const body: Record<string, unknown> = {
    application,
    brandName,
    prompt,
  };

  if (visualSnapshotUrl) {
    body.referenceImageUrls = [visualSnapshotUrl];
  }

  const data = await callApi<{ imageUrl?: string; _meta?: ImageGenResult["_meta"] }>(
    "visual-designer/context",
    { body, timeoutMs: IMAGE_GEN_TIMEOUT_MS },
  );
  if (!data.imageUrl) throw new Error("No imageUrl in server response");
  return { imageUrl: data.imageUrl, _meta: data._meta };
}