import { callApi } from "./apiClient";
import type { CardMeta } from "../types/project";

export type ImageCardType =
  | "logo"
  | "layout"
  | "art-style"
  | "visual-snapshot";

export interface ImageGenContext {
  brandName?: string;
  brandDescription?: string;
  conceptName?: string;
  conceptPoints?: string[];
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
  _meta?: CardMeta;
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
    { body: { cardType, ...ctx }, timeoutMs: 90_000 },
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
    { body: { cardType, ...ctx }, timeoutMs: 90_000 },
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
  visualConcept?: { conceptName: string; points: string[] };
  colorPalette?: string[];
  font?: { titleFont: string; bodyFont: string };
  artStyleImageUrl?: string;
  logoImageUrl?: string;
}

export interface PaletteFontsResult {
  colorPalette: string[];
  font: { titleFont: string; bodyFont: string };
  _meta?: CardMeta;
}

export interface LogoStyleResult {
  artStyleImageUrl: string;
  logoImageUrl: string;
  _meta?: CardMeta;
}

export interface LayoutResult {
  layoutImageUrl: string;
  _meta?: CardMeta;
}

export async function designPaletteAndFonts(ctx: DesignBriefContext): Promise<PaletteFontsResult> {
  const raw = await callApi<PaletteFontsResult & { _meta?: CardMeta }>(
    "art-director/design-palette-fonts",
    { body: ctx, timeoutMs: 60_000 },
  );
  return { colorPalette: raw.colorPalette, font: raw.font, _meta: raw._meta };
}

export async function designLogoAndStyle(ctx: DesignBriefContext): Promise<LogoStyleResult> {
  const raw = await callApi<LogoStyleResult & { _meta?: CardMeta }>(
    "art-director/design-logo-style",
    { body: ctx, timeoutMs: 90_000 },
  );
  return { artStyleImageUrl: raw.artStyleImageUrl, logoImageUrl: raw.logoImageUrl, _meta: raw._meta };
}

export async function designLayout(ctx: DesignBriefContext): Promise<LayoutResult> {
  const raw = await callApi<LayoutResult & { _meta?: CardMeta }>(
    "art-director/design-layout",
    { body: ctx, timeoutMs: 90_000 },
  );
  return { layoutImageUrl: raw.layoutImageUrl, _meta: raw._meta };
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
    { body, timeoutMs: 90_000 },
  );
  if (!data.imageUrl) throw new Error("No imageUrl in server response");
  return { imageUrl: data.imageUrl, _meta: data._meta };
}

/**
 * Generates a single Brand in Context mockup image for a given application.
 * Uses the brand's visual snapshot (if available) as a reference image plus
 * the fixed prompt required by the guideline spec.
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
    { body, timeoutMs: 90_000 },
  );
  if (!data.imageUrl) throw new Error("No imageUrl in server response");
  return { imageUrl: data.imageUrl, _meta: data._meta };
}