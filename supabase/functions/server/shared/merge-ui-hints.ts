import {
  SUPPORTED_MERGE_PAIRS,
  toMergePairKey,
  type SupportedMergePairKey,
} from "./merge-pairs.ts";

export type MergeUiHintMode = "slot" | "card";

export type MergeUiHintCopy = Readonly<
  Record<MergeUiHintMode, string>
>;

export const MERGE_UI_HINTS = {
  "color-palette→font": {
    slot: "Create font pairing inspired by colors",
    card: "Match font pairing to colors",
  },
  "color-palette→logo": {
    slot: "Create logo from palette",
    card: "Recolor logo",
  },
  "color-palette→art-style": {
    slot: "Create art style from palette",
    card: "Recolor art style",
  },
  "font→color-palette": {
    slot: "Create palette from typography",
    card: "Match palette to typography",
  },
  "font→logo": {
    slot: "Create wordmark from typography",
    card: "Replace logo typography",
  },
  "font→art-style": {
    slot: "Create art style from typography",
    card: "Apply typography to art style",
  },
  "logo→color-palette": {
    slot: "Extract palette from logo",
    card: "Match palette to logo",
  },
  "logo→font": {
    slot: "Create font pairing from logo",
    card: "Match font pairing to logo",
  },
  "logo→art-style": {
    slot: "Create art style from logo",
    card: "Replace logo in art style",
  },
  "art-style→color-palette": {
    slot: "Extract palette from art style",
    card: "Match palette to art style",
  },
  "art-style→font": {
    slot: "Create font pairing from art style",
    card: "Match font pairing to art style",
  },
  "art-style→logo": {
    slot: "Create logo from art style",
    card: "Apply art style to logo",
  },
} as const satisfies Record<SupportedMergePairKey, MergeUiHintCopy>;

const ELEMENT_LABELS: Readonly<Record<string, string>> = {
  "color-palette": "Color Palette",
  font: "Typography",
  logo: "Logo",
  "art-style": "Art Style",
};

const FALLBACK_HINT = "Combine cards";

function elementLabel(elementId: string): string {
  return ELEMENT_LABELS[elementId] ?? elementId;
}

export function resolveMergeUiHint(
  mode: MergeUiHintMode,
  sourceId: string,
  targetId: string,
): string {
  const key = toMergePairKey(sourceId, targetId);
  const hints = (
    MERGE_UI_HINTS as Readonly<Record<string, MergeUiHintCopy>>
  )[key];
  return hints?.[mode] ?? FALLBACK_HINT;
}

export function resolveMoveUiHint(
  sourceId: string,
  targetId: string,
): string {
  return `Move ${elementLabel(sourceId)} to ${elementLabel(targetId)}`;
}

export function resolveSnapshotUiHint(sourceId: string): string {
  return `Update snapshot with ${elementLabel(sourceId)}`;
}

export function supportedMergeUiHintKeys(): string[] {
  return SUPPORTED_MERGE_PAIRS.map(([sourceId, targetId]) =>
    toMergePairKey(sourceId, targetId)
  );
}
