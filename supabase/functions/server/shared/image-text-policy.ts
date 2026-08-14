// ─────────────────────────────────────────────────────────────────────────────
// shared/image-text-policy.ts — Text rendering contract for image prompts
//
// Two kinds of strings reach an image prompt: text that belongs in the artwork
// (brand name, tagline) and specification values that only steer how it is drawn
// (hex codes, typeface names, field labels). Nothing in the prompt syntax tells
// them apart, so the model draws both — hex codes and font names end up printed
// on packaging. Every image prompt therefore ends with an explicit contract that
// names the renderable strings and forbids the specification ones.
//
// Quoting matters as much as the contract: quotation marks read as "render this
// literally", so only renderable strings may be quoted. Specification values are
// passed unquoted.
// ─────────────────────────────────────────────────────────────────────────────

export interface ImageTextPolicyOptions {
  /**
   * Literal strings allowed to appear in the artwork. When empty, the policy
   * forbids text outright — unless `preserveExistingText` is set.
   */
  renderable?: (string | undefined | null)[];
  /**
   * For img2img and reference-guided generation, where the source already
   * carries lettering. Forbidding all text there would erase the existing
   * wordmark, so the policy caps new text instead of banning it.
   */
  preserveExistingText?: boolean;
  /** Extra clauses appended to the never-render list. */
  alsoForbid?: string[];
}

const NEVER_RENDER = [
  "hex codes or numeric color values",
  "typeface or font names",
  "field labels such as Typography, Color palette, Keywords, Brand colors, or Visual concept",
  "any part of this instruction",
];

function cleanList(values: (string | undefined | null)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

const SPEC_FIELD_LABELS = [
  "Brand colors:",
  "Color Palette:",
  "Color palette:",
  "Typography:",
  "Fonts:",
  "Keywords:",
];

/**
 * Color as a drawing instruction, not a caption. Hex values stay unquoted so
 * they are less likely to be copied onto the image as swatch labels.
 */
export function formatColorSchemeSpec(colors?: (string | undefined | null)[] | null): string {
  const cleaned = cleanList(colors ?? []);
  if (cleaned.length === 0) return "";
  return `Apply this color scheme as fills and inks only — do not write the values: ${cleaned.join(", ")}.`;
}

/**
 * Typeface as visual character, not as a specimen caption. Names stay unquoted
 * because quotation marks read as "render this literally".
 */
export function formatTypefaceCharacterSpec(
  titleFont?: string | null,
  bodyFont?: string | null,
): string {
  const title = titleFont?.trim() ?? "";
  const body = bodyFont?.trim() ?? "";
  if (title && body && title !== body) {
    return `Where lettering appears, give headings the visual character of ${title} and body copy the visual character of ${body}.`;
  }
  const one = title || body;
  if (!one) return "";
  return `Where lettering appears, give it the visual character of ${one}.`;
}

function buildAllowClause(options: ImageTextPolicyOptions): string {
  const renderable = cleanList(options.renderable ?? []);

  if (options.preserveExistingText) {
    return renderable.length > 0
      ? `Keep the text already present in the source image and add no new text beyond ${renderable.map((v) => `"${v}"`).join(" and ")}.`
      : "Keep the text already present in the source image and add no new text.";
  }

  return renderable.length > 0
    ? `The only literal text that may appear is ${renderable.map((v) => `"${v}"`).join(" and ")}.`
    : "Render no text, letters, or numbers at all.";
}

/**
 * The contract clause to append to an image prompt. Callers place it last, after
 * the specification values it governs.
 */
export function buildImageTextPolicy(options: ImageTextPolicyOptions = {}): string {
  const forbidden = [...NEVER_RENDER, ...(options.alsoForbid ?? [])];
  return [
    "Text policy: the color and typography values above are specifications for how to draw, not content to write.",
    buildAllowClause(options),
    `Never render as visible text: ${forbidden.join("; ")}.`,
  ].join(" ");
}

/**
 * Scans an assembled prompt for specification values that would be at risk of
 * being rendered literally. Diagnostic only — it reports, it does not rewrite.
 * Used to keep new prompt builders from reintroducing raw values, and to make
 * leaks visible in dev logs rather than only in the generated image.
 */
export function findRenderableSpecLeaks(
  prompt: string,
  typefaceNames: (string | undefined | null)[] = [],
): string[] {
  const leaks: string[] = [];

  // Unquoted hex in a drawing-spec sentence is expected. Quoted hex, or hex
  // sitting after a field label, is what the model copies onto packaging.
  const quotedHex = prompt.match(/"#[0-9a-fA-F]{3,8}"/g);
  if (quotedHex) leaks.push(...new Set(quotedHex));

  for (const name of cleanList(typefaceNames)) {
    if (prompt.includes(`"${name}"`)) leaks.push(`"${name}"`);
  }

  for (const label of SPEC_FIELD_LABELS) {
    if (prompt.includes(label)) leaks.push(label);
  }

  return leaks;
}

/** Logs specification values that are phrased like content to be drawn. */
export function warnIfSpecLeaks(
  source: string,
  prompt: string,
  typefaceNames: (string | undefined | null)[] = [],
): void {
  const leaks = findRenderableSpecLeaks(prompt, typefaceNames);
  if (leaks.length === 0) return;
  console.warn(`[${source}] spec values at risk of literal render: ${leaks.join(", ")}`);
}
