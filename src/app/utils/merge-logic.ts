import type { VariationMeta, ImageElementData, FontData, ColorPaletteData } from "../types/project";
import { callApi } from "./apiClient";
import { MERGE_SPECS } from "@server-shared/merge-specs.tsx";

export function getMergeHint(sourceId: string, targetId: string): string {
  return MERGE_SPECS[sourceId]?.[targetId]?.mergeContext ?? "Combine cards";
}

export function isMergeSupported(sourceId: string, targetId: string): boolean {
  if (sourceId === targetId) return false;
  return !!MERGE_SPECS[sourceId]?.[targetId];
}

// ── API context type — defines the shape sent to merge/comment endpoints ──────

export interface MergeBrandContext {
  brandBrief?: { name: string; tagline: string; description: string };
  targetAudience?: string;
  keywords?: string[];
  visualConcept?: string | null;
  artStyle?: ImageElementData | null;
  colorPalette?: ColorPaletteData | null;
  font?: FontData | null;
  logoInspiration?: ImageElementData | null;
  application?: ImageElementData | null;
}

// ── Core merge function — delegates to server ─────────────────────────────────

export interface MergeResult {
  patch: Partial<MergeBrandContext> | null;
  _meta?: VariationMeta;
}

export async function performMerge(
  sourceId: string,
  targetId: string,
  brandContext: MergeBrandContext,
): Promise<MergeResult> {
  if (!isMergeSupported(sourceId, targetId)) return { patch: null };

  try {
    const result = await callApi<{ patch?: Partial<MergeBrandContext>; _meta?: VariationMeta; error?: string }>(
      "merge-cards",
      { body: { sourceId, targetId, brandData: brandContext } },
    );
    if (result.error) throw new Error(`[performMerge] server error: ${result.error}`);
    return { patch: result.patch ?? null, _meta: result._meta };
  } catch (err) {
    console.error("[performMerge] failed:", err);
    return { patch: null };
  }
}

export async function performPaletteExtraction(
  sourceId: string,
  sourceImageUrl: string,
  brandContext: MergeBrandContext,
): Promise<MergeResult> {
  try {
    const result = await callApi<{ patch?: Partial<MergeBrandContext>; _meta?: VariationMeta; error?: string }>(
      "extract-palette",
      { body: { sourceId, sourceImageUrl, brandData: brandContext } },
    );
    if (result.error) throw new Error(`[performPaletteExtraction] server error: ${result.error}`);
    return { patch: result.patch ?? null, _meta: result._meta };
  } catch (err) {
    console.error("[performPaletteExtraction] failed:", err);
    return { patch: null };
  }
}

export async function performVisionTextMerge(
  sourceId: string,
  targetId: string,
  sourceImageUrl: string,
  brandContext: MergeBrandContext,
): Promise<MergeResult> {
  try {
    const result = await callApi<{ patch?: Partial<MergeBrandContext>; _meta?: VariationMeta; error?: string }>(
      "visual-designer/vision-merge",
      { body: { sourceId, targetId, sourceImageUrl, brandData: brandContext } },
    );
    if (result.error) throw new Error(`[performVisionTextMerge] server error: ${result.error}`);
    return { patch: result.patch ?? null, _meta: result._meta };
  } catch (err) {
    console.error("[performVisionTextMerge] failed:", err);
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