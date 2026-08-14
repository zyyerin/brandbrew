export const SUPPORTED_MERGE_PAIRS = [
  ["color-palette", "logo"],
  ["color-palette", "art-style"],
  ["color-palette", "font"],
  ["font", "logo"],
  ["font", "art-style"],
  ["font", "color-palette"],
  ["logo", "art-style"],
  ["logo", "color-palette"],
  ["logo", "font"],
  ["art-style", "logo"],
  ["art-style", "color-palette"],
  ["art-style", "font"],
] as const;

type SupportedMergePair = (typeof SUPPORTED_MERGE_PAIRS)[number];

export type SupportedMergePairKey = SupportedMergePair extends infer Pair
  ? Pair extends readonly [
      infer Source extends string,
      infer Target extends string,
    ]
    ? `${Source}→${Target}`
    : never
  : never;

export function toMergePairKey(sourceId: string, targetId: string): string {
  return `${sourceId}→${targetId}`;
}
