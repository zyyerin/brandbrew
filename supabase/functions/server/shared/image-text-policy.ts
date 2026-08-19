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
   * forbids text outright — unless `preserveExistingText` is set or `purpose`
   * is `identity-board` (specimens are allowed there).
   */
  renderable?: (string | undefined | null)[];
  /**
   * For img2img and reference-guided generation, where the source already
   * carries lettering. Forbidding all text there would erase the existing
   * wordmark, so the policy caps new text instead of banning it.
   */
  preserveExistingText?: boolean;
  /**
   * identity-board: snapshot/kit — live type specimens are wanted; hex and
   *   font names are not.
   * packaging: mockup — only pack copy; do not photocopy the identity board.
   */
  purpose?: "graphic" | "identity-board" | "packaging";
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

export type ColorSchemeApplyTo = "any" | "logo-mark";

/**
 * Color as a drawing instruction, not a caption. Hex values stay unquoted so
 * they are less likely to be copied onto the image as swatch labels.
 * `logo-mark` keeps light palette colors off the canvas — they are inks, not paper.
 */
export function formatColorSchemeSpec(
  colors?: (string | undefined | null)[] | null,
  opts?: { applyTo?: ColorSchemeApplyTo },
): string {
  const cleaned = cleanList(colors ?? []);
  if (cleaned.length === 0) return "";
  const values = cleaned.join(", ");
  if (opts?.applyTo === "logo-mark") {
    return (
      `Apply this color scheme as fills and inks of the mark and wordmark only — `
      + `never as the canvas, paper, or background, and do not write the values: ${values}.`
    );
  }
  return `Apply this color scheme as fills and inks only — do not write the values: ${values}.`;
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
  const quoted = renderable.map((v) => `"${v}"`).join(" and ");

  if (options.purpose === "identity-board") {
    const named = quoted
      ? `Live lettering should include ${quoted} plus short type specimens such as Aa, a headline word, and a body-copy line.`
      : "Live lettering should include short type specimens such as Aa, a headline word, and a body-copy line.";
    return `${named} Fill every compartment; do not leave blank or white-only panels.`;
  }

  if (options.purpose === "packaging") {
    const copy = quoted
      ? `The only pack copy that may appear is ${quoted}.`
      : "Add no pack copy.";
    const keep = options.preserveExistingText
      ? "Keep the brand mark already present in the reference images. "
      : "";
    return `${keep}${copy} Treat any reference as a brand identity board to extract from, not artwork to reprint: take color, motif, and lettering style, but do not reproduce the board — no bento grid, no swatch legends, no type-specimen sheets, no hex codes, no typeface names.`;
  }

  if (options.preserveExistingText) {
    return quoted
      ? `Keep the text already present in the source image and add no new text beyond ${quoted}.`
      : "Keep the text already present in the source image and add no new text.";
  }

  return quoted
    ? `The only literal text that may appear is ${quoted}.`
    : "Render no text, letters, or numbers at all.";
}

function buildPurposeLead(purpose: ImageTextPolicyOptions["purpose"]): string {
  if (purpose === "identity-board") {
    return "This is a filled brand identity board: compartments hold visual assets, including live lettering specimens. Hex values and typeface names are drawing specs, not captions.";
  }
  if (purpose === "packaging") {
    return "This is a product mockup. Color and typography values are drawing specs, not copy to print on the pack.";
  }
  return "Text policy: the color and typography values above are specifications for how to draw, not content to write.";
}

/**
 * The contract clause to append to an image prompt. Callers place it last, after
 * the specification values it governs.
 */
export function buildImageTextPolicy(options: ImageTextPolicyOptions = {}): string {
  const forbidden = [...NEVER_RENDER, ...(options.alsoForbid ?? [])];
  return [
    buildPurposeLead(options.purpose),
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
