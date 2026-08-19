import { callApi } from "./apiClient";
import type { VariationMeta } from "../types/project";
import type { BrandContextFull, BrandContextShort, MergeBoardPromptContext } from "@server-shared/types.tsx";
import type { LogoComposition, LogoCompositionMode } from "@server-shared/logo-prompts.ts";
import { omitTaglineDeep, omitTaglineForLogo } from "@server-shared/brand-context.ts";
import type { MergeBrandContext, MergeResult } from "./variation-helpers";
import { isMergeSupported } from "@server-shared/merge-routes.ts";

const IMAGE_GEN_TIMEOUT_MS = 180_000;
// One image per request only needs room for a single model attempt plus upload.
const ART_DIRECTOR_SINGLE_IMAGE_TIMEOUT_MS = 120_000;
const ART_DIRECTOR_LAYOUT_TIMEOUT_MS = 180_000;

export type ImageCardType =
  | "logo"
  | "art-style"
  | "visual-snapshot";

export interface ImageGenContext {
  /** Optional merge action hint to steer the prompt, e.g. "Apply palette to logo" */
  newHint?: string;
  /** Existing image URL for image-to-image editing (preserves shape/structure) */
  sourceImageUrl?: string;
  /** Reference image URL from the dragged source card (used in image→image card-to-card merges) */
  referenceImageUrl?: string;
  /** Base64 PNG of the source card rendered as an image (e.g. color palette swatches) */
  paletteImageBase64?: string;
  /** Hex colors for recoloring when no palette image is available */
  colorPalette?: string[];
  /** Heading/display font name (Google Fonts) */
  titleFont?: string;
  bodyFont?: string;
  brandContext?: BrandContextFull;
  brandContextShort?: BrandContextShort;
  /** Required for cardType "logo" txt2img generation — decides icon+wordmark vs wordmark-only composition. */
  logoComposition?: LogoComposition;
}

export interface ImageGenResult {
  imageUrl: string;
  _meta?: VariationMeta;
}

export interface VisualSnapshotFromElementsParams {
  brandName?: string;
  /** Kept for backward-compat; backend ignores this when new context fields are present. */
  prompt: string;
  referenceImageUrls: string[];
  /** ElementId for each entry in referenceImageUrls (parallel array, same order). */
  referenceImageRoles?: string[];
  paletteImageBase64?: string;
  font1?: string;
  font2?: string;
  brandDescription?: string;
  keywords?: string[];
  visualConcept?: { concept: string; description: string };
  /** Hex color array for text-based palette description in prompt. */
  colorPalette?: string[];
}

export interface BrandContextMockupParams {
  application: string;
  brandName?: string;
  /** Appended to the image prompt on the server (after the base mockup instruction). */
  brandDescription?: string;
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
  const sc = ctx.brandContextShort;
  const brandContext: BrandContextFull = ctx.brandContext ?? {
    ...sc,
    visualConcept: sc?.visualConcept
      ? { concept: sc.visualConcept.concept, description: sc.visualConcept.description ?? "" }
      : undefined,
  };
  const brandContextShort: BrandContextShort = ctx.brandContextShort ?? {};
  const data = await callApi<{ imageUrl?: string; _meta?: ImageGenResult["_meta"] }>(
    "generate-image",
    {
      body: omitTaglineForLogo(cardType, { cardType, ...ctx, brandContext, brandContextShort }),
      timeoutMs: IMAGE_GEN_TIMEOUT_MS,
    },
  );
  if (!data.imageUrl) throw new Error("No imageUrl in server response");
  return { imageUrl: data.imageUrl, _meta: data._meta };
}

/**
 * Edits an existing image using a free-form user comment as the modification
 * instruction.  Calls /visual-designer/edit directly so it always uses
 * img2img (bypasses the generate-image routing that can mis-route to txt2img).
 */
export async function commentEditImage(
  cardType: ImageCardType,
  ctx: {
    sourceImageUrl: string;
    comment: string;
    brandContextShort?: BrandContextShort;
  },
): Promise<ImageGenResult> {
  const data = await callApi<{ imageUrl?: string; _meta?: ImageGenResult["_meta"] }>(
    "visual-designer/edit",
    {
      body: omitTaglineForLogo(cardType, {
        cardType,
        newHint: ctx.comment,
        sourceImageUrl: ctx.sourceImageUrl,
        brandContextShort: ctx.brandContextShort ?? {},
      }),
      timeoutMs: IMAGE_GEN_TIMEOUT_MS,
    },
  );
  if (!data.imageUrl) throw new Error("No imageUrl in server response");
  return { imageUrl: data.imageUrl, _meta: data._meta };
}

export interface MergeImageContext {
  brandName?: string;
  newHint: string;
  sourceId: string;
  targetId: string;
  /** Source card image — used for img2img generate (no target bitmap). */
  sourceImageUrl?: string;
  /** Existing target card image — used for img2img edit. */
  targetImageUrl?: string;
  /** Source card image when editing a target (logo/art-style → image card). */
  referenceImageUrl?: string;
  paletteImageBase64?: string;
  colorPalette?: string[];
  /** Text source payload (palette hex array, font pairing). Wordmark reads titleFont from this. */
  sourceTextData?: unknown;
  brandContextShort?: BrandContextShort;
  mergeBoardContext?: MergeBoardPromptContext;
}

export async function generateTxt2Img(ctx: MergeImageContext): Promise<ImageGenResult> {
  const data = await callApi<{ imageUrl?: string; _meta?: ImageGenResult["_meta"] }>(
    "visual-designer/txt2img",
    {
      body: omitTaglineForLogo(ctx.targetId, {
        sourceId: ctx.sourceId,
        targetId: ctx.targetId,
        newHint: ctx.newHint,
        sourceTextData: ctx.sourceTextData,
        brandContextShort: ctx.brandContextShort ?? {
          name: ctx.brandName,
        },
        mergeBoardContext: ctx.mergeBoardContext,
      }),
      timeoutMs: IMAGE_GEN_TIMEOUT_MS,
    },
  );
  if (!data.imageUrl) throw new Error("No imageUrl in server response");
  return { imageUrl: data.imageUrl, _meta: data._meta };
}

export async function generateImg2Img(ctx: MergeImageContext): Promise<ImageGenResult> {
  const data = await callApi<{ imageUrl?: string; _meta?: ImageGenResult["_meta"] }>(
    "visual-designer/img2img",
    {
      body: omitTaglineForLogo(ctx.targetId, {
        sourceId: ctx.sourceId,
        targetId: ctx.targetId,
        newHint: ctx.newHint,
        sourceImageUrl: ctx.sourceImageUrl,
        targetImageUrl: ctx.targetImageUrl,
        referenceImageUrl: ctx.referenceImageUrl,
        paletteImageBase64: ctx.paletteImageBase64,
        colorPalette: ctx.colorPalette,
        sourceTextData: ctx.sourceTextData,
        brandContextShort: ctx.brandContextShort ?? {
          name: ctx.brandName,
        },
        mergeBoardContext: ctx.mergeBoardContext,
      }),
      timeoutMs: IMAGE_GEN_TIMEOUT_MS,
    },
  );
  if (!data.imageUrl) throw new Error("No imageUrl in server response");
  return { imageUrl: data.imageUrl, _meta: data._meta };
}

// ─── Art Director sequential generation API ──────────────────────────────────

export interface PipelineContext {
  brandContext?: BrandContextFull;
  brandName?: string;
  tagline?: string;
  description?: string;
  targetAudience?: string;
  keywords?: string[];
  visualConcept?: { concept: string; description: string };
  colorPalette?: string[];
  font?: { titleFont: string; bodyFont: string };
  logoComposition?: LogoComposition;
  artStyleImageUrl?: string;
  logoImageUrl?: string;
  /** Touchpoint name for application mockup generation (e.g. "Business Card", "Packaging") */
  application?: string;
  /** Existing palettes to avoid (each entry is an array of hex strings). */
  excludedPalettes?: string[][];
  /** Font names already used — the AI should choose entirely different fonts. */
  excludedFonts?: string[];
  /** Logo lockup modes already used — the server samples a different mode. */
  excludedCompositions?: LogoCompositionMode[];
}

export interface PaletteFontsResult {
  colorPalette: string[];
  font: { titleFont: string; bodyFont: string };
  logoComposition: LogoComposition;
  _meta?: VariationMeta;
}

export interface LogoResult {
  logoImageUrl?: string | null;
  logoModel?: string;
  logoComposition?: LogoComposition;
  _meta?: VariationMeta;
}

export interface ArtStyleResult {
  artStyleImageUrl?: string | null;
  artStyleModel?: string;
  _meta?: VariationMeta;
}

export interface ApplicationResult {
  applicationImageUrl: string;
  _meta?: VariationMeta;
}

export async function designPaletteAndFonts(
  ctx: PipelineContext,
  opts?: { signal?: AbortSignal },
): Promise<PaletteFontsResult> {
  const brandContext: BrandContextFull = ctx.brandContext ?? {
    name: ctx.brandName,
    tagline: ctx.tagline,
    keywords: ctx.keywords,
    description: ctx.description,
    targetAudience: ctx.targetAudience,
    visualConcept: ctx.visualConcept,
    colorPalette: ctx.colorPalette,
    font: ctx.font,
    artStyleImageUrl: ctx.artStyleImageUrl,
    logoImageUrl: ctx.logoImageUrl,
    application: ctx.application,
  };
  const raw = await callApi<PaletteFontsResult & { _meta?: VariationMeta }>(
    "art-director/design-palette-fonts",
    { body: { ...ctx, brandContext }, timeoutMs: 60_000, signal: opts?.signal },
  );
  return {
    colorPalette: raw.colorPalette,
    font: raw.font,
    logoComposition: raw.logoComposition,
    _meta: raw._meta,
  };
}

/**
 * The logo and the art style are always requested as two independent calls, so
 * each image can be shown as soon as it is ready, and callers that only need
 * one of them don't pay for the other.
 */
async function designDrawingStageCard<T>(
  route: "art-director/design-logo" | "art-director/design-art-style",
  ctx: PipelineContext,
  opts?: { signal?: AbortSignal },
): Promise<T> {
  const brandContext: BrandContextFull = ctx.brandContext ?? {
    name: ctx.brandName,
    tagline: ctx.tagline,
    keywords: ctx.keywords,
    description: ctx.description,
    targetAudience: ctx.targetAudience,
    visualConcept: ctx.visualConcept,
    colorPalette: ctx.colorPalette,
    font: ctx.font,
    artStyleImageUrl: ctx.artStyleImageUrl,
    logoImageUrl: ctx.logoImageUrl,
    application: ctx.application,
  };
  return await callApi<T>(route, {
    body: { ...ctx, brandContext },
    timeoutMs: ART_DIRECTOR_SINGLE_IMAGE_TIMEOUT_MS,
    signal: opts?.signal,
  });
}

export function designLogo(
  ctx: PipelineContext,
  opts?: { signal?: AbortSignal },
): Promise<LogoResult> {
  return designDrawingStageCard<LogoResult>(
    "art-director/design-logo",
    omitTaglineDeep(ctx),
    opts,
  );
}

export function designArtStyle(
  ctx: PipelineContext,
  opts?: { signal?: AbortSignal },
): Promise<ArtStyleResult> {
  return designDrawingStageCard<ArtStyleResult>("art-director/design-art-style", ctx, opts);
}

export async function designApplication(
  ctx: PipelineContext,
  opts?: { signal?: AbortSignal },
): Promise<ApplicationResult> {
  const brandContext: BrandContextFull = ctx.brandContext ?? {
    name: ctx.brandName,
    tagline: ctx.tagline,
    keywords: ctx.keywords,
    description: ctx.description,
    targetAudience: ctx.targetAudience,
    visualConcept: ctx.visualConcept,
    colorPalette: ctx.colorPalette,
    font: ctx.font,
    artStyleImageUrl: ctx.artStyleImageUrl,
    logoImageUrl: ctx.logoImageUrl,
    application: ctx.application,
  };
  const raw = await callApi<ApplicationResult & { _meta?: VariationMeta }>(
    "art-director/design-application",
    { body: { ...ctx, brandContext }, timeoutMs: ART_DIRECTOR_LAYOUT_TIMEOUT_MS, signal: opts?.signal },
  );
  return { applicationImageUrl: raw.applicationImageUrl, _meta: raw._meta };
}

/**
 * Generates a visual snapshot from selected element cards.
 * Sends logo and art-style image URLs (ordered: logo, then art-style); hex palette and fonts go in brandContextShort for the prompt, not as a palette bitmap.
 */
export async function generateVisualSnapshotFromElements(
  params: VisualSnapshotFromElementsParams,
): Promise<ImageGenResult> {
  const { brandName, ...rest } = params;
  const body = {
    cardType: "visual-snapshot" as const,
    brandName,
    brandContextShort: {
      name: brandName,
      keywords: params.keywords,
      visualConcept: params.visualConcept,
      colorPalette: params.colorPalette,
      titleFont: params.font1,
      bodyFont: params.font2,
    } satisfies BrandContextShort,
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
): Promise<ImageGenResult | null> {
  const { application, brandName, brandDescription, visualSnapshotUrl } = params;

  const body: Record<string, unknown> = {
    application,
  };
  if (brandName?.trim()) {
    body.brandName = brandName.trim();
  }
  if (brandDescription?.trim()) {
    body.brandDescription = brandDescription.trim();
  }

  if (visualSnapshotUrl) {
    body.referenceImageUrls = [visualSnapshotUrl];
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const data = await callApi<{ imageUrl?: string | null; warning?: string; _meta?: ImageGenResult["_meta"] }>(
        "visual-designer/context",
        { body, timeoutMs: IMAGE_GEN_TIMEOUT_MS },
      );
      if (data.warning && !data.imageUrl) {
        console.warn(`[Brand in Context] ${application}: ${data.warning}`);
        return null;
      }
      if (!data.imageUrl) throw new Error("No imageUrl in server response");
      return { imageUrl: data.imageUrl, _meta: data._meta };
    } catch (err) {
      lastError = err;
      if (attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        continue;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

// ─── Merge API calls (moved from merge-logic.ts) ─────────────────────────────

const TXT_MERGE_TIMEOUT_MS = 90_000;
const IMG2TXT_TIMEOUT_MS = 180_000;

export async function performTxt2Txt(
  sourceId: string,
  targetId: string,
  brandContext: MergeBrandContext,
): Promise<MergeResult> {
  if (!isMergeSupported(sourceId, targetId)) return { patch: null };

  try {
    const result = await callApi<{ patch?: Partial<MergeBrandContext>; _meta?: VariationMeta; error?: string }>(
      "visual-designer/txt2txt",
      { body: { sourceId, targetId, brandData: brandContext }, timeoutMs: TXT_MERGE_TIMEOUT_MS },
    );
    if (result.error) throw new Error(`[performTxt2Txt] server error: ${result.error}`);
    return { patch: result.patch ?? null, _meta: result._meta };
  } catch (err) {
    console.error("[performTxt2Txt] failed:", err);
    return { patch: null };
  }
}

export async function performImg2Txt(
  sourceId: string,
  targetId: string,
  sourceImageUrl: string,
  brandContext: MergeBrandContext,
  options: { throwOnError?: boolean } = {},
): Promise<MergeResult> {
  try {
    const result = await callApi<{ patch?: Partial<MergeBrandContext>; _meta?: VariationMeta; error?: string }>(
      "visual-designer/img2txt",
      {
        body: { sourceId, targetId, sourceImageUrl, brandData: brandContext },
        timeoutMs: IMG2TXT_TIMEOUT_MS,
      },
    );
    if (result.error) throw new Error(`[performImg2Txt] server error: ${result.error}`);
    return { patch: result.patch ?? null, _meta: result._meta };
  } catch (err) {
    console.error("[performImg2Txt] failed:", err);
    if (options.throwOnError) throw err;
    return { patch: null };
  }
}

export async function performCommentModify(
  targetId: string,
  comment: string,
  brandContext: MergeBrandContext,
): Promise<MergeResult> {
  try {
    const result = await callApi<{ patch?: Partial<MergeBrandContext>; _meta?: VariationMeta; error?: string }>(
      "comment-modify",
      { body: { targetId, comment, brandData: brandContext } },
    );
    if (result.error) throw new Error(`[performCommentModify] server error: ${result.error}`);
    return { patch: result.patch ?? null, _meta: result._meta };
  } catch (err) {
    console.error("[performCommentModify] failed:", err);
    return { patch: null };
  }
}
