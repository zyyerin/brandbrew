/**
 * Parse a free-text tag field into individual tags.
 *
 * Delimiters: comma, newline, markdown-style bullets (`- `, `* `, `• `),
 * and inline ` - ` (hyphen with surrounding spaces). Word-internal hyphens
 * such as `eco-friendly` are preserved.
 */
export function parseTagList(raw: string | null | undefined): string[] {
  if (!raw) return [];

  const text = raw.replace(/\r\n/g, "\n").trim();
  if (!text) return [];

  const withoutLineBullets = text.replace(/(^|[\n,])\s*[-*•]\s+/g, "$1");
  const withInlineHyphens = withoutLineBullets.replace(/\s+-\s+/g, ",");

  return withInlineHyphens
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
