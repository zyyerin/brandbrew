import { SUPPORTED_MERGE_PAIRS } from "./merge-pairs.ts";

export type MergeKind = "txt2txt" | "txt2img" | "img2txt" | "img2img";

export type Txt2ImgImpl = "wordmark" | "generate";
export type Img2TxtImpl = "extract-palette" | "vision";
export type Img2ImgImpl = "generate" | "edit";

/** Image board slots for merge media classification. Same set as frontend IMAGE_ELEMENT_IDS. */
export const MERGE_IMAGE_IDS: ReadonlySet<string> = new Set(["logo", "art-style"]);

function isSupportedPair(source: string, target: string): boolean {
  return SUPPORTED_MERGE_PAIRS.some(([from, to]) => from === source && to === target);
}

export function isMergeSupported(source: string, target: string): boolean {
  return resolveMergeKind(source, target) !== null;
}

/**
 * Classifies a merge by media, not by backend path.
 * Absence of targetVarId = queue-slot create; presence = drop onto an existing card.
 * The only slot/card split is text→image: slot is txt2img, card is img2img (base bitmap is the target card).
 */
export function resolveMergeKind(
  source: string,
  target: string,
  targetVarId?: string,
): MergeKind | null {
  if (!isSupportedPair(source, target)) return null;
  const srcImg = MERGE_IMAGE_IDS.has(source);
  const tgtImg = MERGE_IMAGE_IDS.has(target);
  if (!srcImg && !tgtImg) return "txt2txt";
  if (srcImg && !tgtImg) return "img2txt";
  if (!srcImg && tgtImg) return targetVarId ? "img2img" : "txt2img";
  return "img2img";
}

/** font→logo is a wordmark generator; every other txt2img pair uses merge-generate. */
export function resolveTxt2ImgImpl(source: string, target: string): Txt2ImgImpl {
  return source === "font" && target === "logo" ? "wordmark" : "generate";
}

/** Palette targets extract hex colors; font targets use vision JSON merge. */
export function resolveImg2TxtImpl(target: string): Img2TxtImpl {
  return target === "color-palette" ? "extract-palette" : "vision";
}

/** A target bitmap means edit-in-place of that card; otherwise generate from the source image. */
export function resolveImg2ImgImpl(hasTargetImage: boolean): Img2ImgImpl {
  return hasTargetImage ? "edit" : "generate";
}
