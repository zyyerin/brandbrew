import type { MergeSpec } from "./types.tsx";

export function mergeCardIdToField(cardId: string): string | null {
  const map: Record<string, string> = {
    "color-palette": "colorPalette",
    "font": "font",
    "logo": "logoInspiration",
    "art-style": "artStyle",
  };
  return map[cardId] ?? null;
}

export function omitsCurrentTargetInTextMerge(sourceId: string, targetId: string): boolean {
  return (
    (sourceId === "color-palette" && targetId === "font") ||
    (sourceId === "font" && targetId === "color-palette")
  );
}

/**
 * Queue-slot extract-palette (logo / art-style → color-palette, no target card)
 * and upload-image extract share this path. If the current palette stays in
 * brandData, extract-palette anchors to those hexes and the new card is a clone.
 */
export function omitsCurrentPaletteInSlotExtract(
  targetId: string,
  targetVarId?: string,
): boolean {
  return targetId === "color-palette" && !targetVarId;
}

/** Drop the current palette so extract-palette cannot copy those hexes into a new card. */
export function omitCurrentPaletteIfSlotExtract<T extends { colorPalette?: unknown | null }>(
  brandData: T,
  targetId: string,
  targetVarId?: string,
): T {
  if (omitsCurrentPaletteInSlotExtract(targetId, targetVarId)) {
    brandData.colorPalette = null;
  }
  return brandData;
}

export type TextMergePrepareResult =
  | {
      ok: true;
      spec: MergeSpec;
      targetField: string;
      sourceData: unknown;
      targetData: unknown;
      omitCurrentTargetInContext: boolean;
    }
  | {
      ok: false;
      reason: "unsupported-pair" | "missing-target-field" | "missing-target-data";
    };

/**
 * Resolves a text-target /txt2txt (and /img2txt vision) request before any model call.
 * `missing-target-data` is the instant `{ patch: null }` path — no Gemini.
 */
export function prepareTextMerge(
  sourceId: string,
  targetId: string,
  brandData: Record<string, unknown>,
  spec: MergeSpec | undefined,
): TextMergePrepareResult {
  if (!spec || !spec.allowedFields?.length || !spec.instruction) {
    return { ok: false, reason: "unsupported-pair" };
  }

  const targetField = mergeCardIdToField(targetId);
  const sourceField = mergeCardIdToField(sourceId);
  if (!targetField) return { ok: false, reason: "missing-target-field" };

  const targetData = brandData[targetField];
  const sourceData = sourceField ? brandData[sourceField] : null;
  if (targetData === undefined || targetData === null) {
    return { ok: false, reason: "missing-target-data" };
  }

  return {
    ok: true,
    spec,
    targetField,
    sourceData,
    targetData,
    omitCurrentTargetInContext: omitsCurrentTargetInTextMerge(sourceId, targetId),
  };
}
