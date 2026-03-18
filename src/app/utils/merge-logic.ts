import type { BrandData } from "../types/brand";
import type { CardMeta } from "../types/project";
import { callApi } from "./apiClient";
import { MERGE_SPECS } from "@server-shared/merge-specs.tsx";

export function getMergeHint(sourceId: string, targetId: string): string {
  return MERGE_SPECS[sourceId]?.[targetId]?.mergeContext ?? "Combine cards";
}

export function isMergeSupported(sourceId: string, targetId: string): boolean {
  if (sourceId === targetId) return false;
  return !!MERGE_SPECS[sourceId]?.[targetId];
}

// ── Core merge function — delegates to server ─────────────────────────────────

export interface MergeResult {
  patch: Partial<BrandData> | null;
  _meta?: CardMeta;
}

export async function performMerge(
  sourceId: string,
  targetId: string,
  brandData: BrandData,
): Promise<MergeResult> {
  if (!isMergeSupported(sourceId, targetId)) return { patch: null };

  try {
    const result = await callApi<{ patch?: Partial<BrandData>; _meta?: CardMeta; error?: string }>(
      "merge-cards",
      { body: { sourceId, targetId, brandData } },
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
  brandData: BrandData,
): Promise<MergeResult> {
  try {
    const result = await callApi<{ patch?: Partial<BrandData>; _meta?: CardMeta; error?: string }>(
      "extract-palette",
      { body: { sourceId, sourceImageUrl, brandData } },
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
  brandData: BrandData,
): Promise<MergeResult> {
  try {
    const result = await callApi<{ patch?: Partial<BrandData>; _meta?: CardMeta; error?: string }>(
      "visual-designer/vision-merge",
      { body: { sourceId, targetId, sourceImageUrl, brandData } },
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
  brandData: BrandData,
): Promise<MergeResult> {
  try {
    const result = await callApi<{ patch?: Partial<BrandData>; _meta?: CardMeta; error?: string }>(
      "comment-modify",
      { body: { targetId, comment, brandData } },
    );
    if (result.error) throw new Error(`[performCommentModify] server error: ${result.error}`);
    return { patch: result.patch ?? null, _meta: result._meta };
  } catch (err) {
    console.error("[performCommentModify] failed:", err);
    return { patch: null };
  }
}