export const LOGO_COMPOSITION_MODES = [
  "symbol-wordmark-horizontal",
  "symbol-wordmark-stacked",
  "wordmark-only",
] as const;

export type LogoCompositionMode = (typeof LOGO_COMPOSITION_MODES)[number];

export const LOGO_COMPOSITION_WEIGHTS: Record<LogoCompositionMode, number> = {
  "symbol-wordmark-horizontal": 0.4,
  "symbol-wordmark-stacked": 0.3,
  "wordmark-only": 0.3,
};

export interface LogoComposition {
  mode: LogoCompositionMode;
  rationale: string;
}

export interface LogoPromptContext {
  brandName?: string;
  description?: string;
  brandDescription?: string;
  visualConcept?: { concept: string; description?: string };
  colorPalette?: string[];
  newHint?: string;
  titleFont?: string;
  logoComposition?: LogoComposition;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatSentence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const normalized = trimmed.replace(/\.+$/u, ".");
  return /[.!?。！？]$/u.test(normalized) ? normalized : `${normalized}.`;
}

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

export type ColorSchemeApplyTo = "any" | "logo-mark";

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

export function validateLogoComposition(value: unknown): LogoComposition {
  if (!isRecord(value)) {
    throw new Error("logoComposition is required and must be an object");
  }

  const mode = value.mode;
  if (
    typeof mode !== "string"
    || !LOGO_COMPOSITION_MODES.includes(mode as LogoCompositionMode)
  ) {
    throw new Error(
      `logoComposition.mode must be one of: ${LOGO_COMPOSITION_MODES.join(", ")}`,
    );
  }

  const rationale = typeof value.rationale === "string"
    ? value.rationale.trim()
    : "";
  if (!rationale) {
    throw new Error("logoComposition.rationale must be a non-empty string");
  }

  return { mode: mode as LogoCompositionMode, rationale };
}

export function validateOptionalLogoComposition(
  value: unknown,
): LogoComposition | undefined {
  if (value === undefined || value === null) return undefined;
  return validateLogoComposition(value);
}

export function pickLogoCompositionMode(
  excluded: readonly string[] = [],
  random: () => number = Math.random,
): LogoCompositionMode {
  const excludedSet = new Set(
    excluded.filter((mode): mode is LogoCompositionMode =>
      (LOGO_COMPOSITION_MODES as readonly string[]).includes(mode)
    ),
  );
  let pool: LogoCompositionMode[] = LOGO_COMPOSITION_MODES.filter(
    (mode) => !excludedSet.has(mode),
  );
  if (pool.length === 0) pool = [...LOGO_COMPOSITION_MODES];

  const total = pool.reduce((sum, mode) => sum + LOGO_COMPOSITION_WEIGHTS[mode], 0);
  let ticket = random() * total;
  for (const mode of pool) {
    ticket -= LOGO_COMPOSITION_WEIGHTS[mode];
    if (ticket <= 0) return mode;
  }
  return pool[pool.length - 1];
}

export function parseLogoCompositionRationale(value: unknown): string {
  if (!isRecord(value)) {
    throw new Error("logoComposition is required and must be an object");
  }
  const rationale = typeof value.rationale === "string" ? value.rationale.trim() : "";
  if (!rationale) {
    throw new Error("logoComposition.rationale must be a non-empty string");
  }
  return rationale;
}

export function attachAssignedLogoComposition(
  value: unknown,
  assignedMode: LogoCompositionMode,
): LogoComposition {
  return { mode: assignedMode, rationale: parseLogoCompositionRationale(value) };
}

export function assignedLogoCompositionBlock(mode: LogoCompositionMode): string {
  return (
    `Assigned logo composition mode: ${mode}. `
    + `Write logoComposition.rationale for this assigned lockup. Do not change the mode.`
  );
}

export function compositionModeFromMeta(meta: unknown): LogoCompositionMode | undefined {
  if (!isRecord(meta)) return undefined;

  const direct = meta.logoComposition;
  if (
    isRecord(direct)
    && typeof direct.mode === "string"
    && (LOGO_COMPOSITION_MODES as readonly string[]).includes(direct.mode)
  ) {
    return direct.mode as LogoCompositionMode;
  }

  const seed = meta.pipelineSeed;
  if (isRecord(seed) && isRecord(seed.logoComposition)) {
    const nested = seed.logoComposition.mode;
    if (
      typeof nested === "string"
      && (LOGO_COMPOSITION_MODES as readonly string[]).includes(nested)
    ) {
      return nested as LogoCompositionMode;
    }
  }

  return undefined;
}

export function collectExcludedLogoCompositions(
  variations: ReadonlyArray<{ meta?: unknown }>,
): LogoCompositionMode[] {
  const seen = new Set<LogoCompositionMode>();
  for (const variation of variations) {
    const mode = compositionModeFromMeta(variation.meta);
    if (mode) seen.add(mode);
  }
  return [...seen];
}

/** Shared canvas lock: palette light colors must not become the logo paper. */
export const LOGO_WHITE_CANVAS_RULE =
  "Place the lockup on a pure white background with generous padding. "
  + "The canvas must stay solid #FFFFFF. "
  + "Do not tint, wash, or replace the background with any palette color. "
  + "Off-white, cream, ivory, beige, and pale pastels from the palette are mark and wordmark inks only — never paper, never a colored field behind the lockup.";

export function withLogoWhiteCanvas(prompt: string, cardType: string): string {
  if (cardType !== "logo") return prompt;
  const rule = LOGO_WHITE_CANVAS_RULE.trim();
  if (prompt.includes(rule)) return prompt;
  return `${prompt.trim()}\n\n${rule}`;
}

function buildLegacyLogoPrompt(ctx: LogoPromptContext): string {
  const name = ctx.brandName ?? "the brand";
  const description = ctx.description ?? ctx.brandDescription;
  const focus = ctx.newHint
    ? `Creative direction: ${formatSentence(ctx.newHint)} `
    : "";
  const palette = formatColorSchemeSpec(ctx.colorPalette, { applyTo: "logo-mark" });
  const motif = ctx.visualConcept?.concept?.trim()
    ? `Visual motif: ${formatSentence(ctx.visualConcept.concept)} `
    : "";

  return (
    `${focus}Design a logo mark for a brand about: `
    + `${formatSentence(description ?? name)} `
    + `${motif}`
    + `${palette ? `${palette} ` : ""}`
    + `Rules: `
    + `Purely graphic symbol — absolutely NO text, NO letters, NO words, NO characters. `
    + `NOT an illustration, NOT a scene, NOT a mascot, NOT a badge, NOT a detailed drawing. `
    + `${LOGO_WHITE_CANVAS_RULE}`
  );
}

function buildCompositionInstruction(
  composition: LogoComposition,
  titleFont?: string,
): string {
  switch (composition.mode) {
    case "symbol-wordmark-horizontal": {
      const typeface = titleFont?.trim()
        ? `Use the visual character of the selected title typeface ${titleFont.trim()} for the wordmark.`
        : "Use the visual character of the selected display typeface for the wordmark.";
      return (
        `Create a horizontal combination mark: place one simple abstract symbol on the left `
        + `and the wordmark on the right. ${typeface}`
      );
    }
    case "symbol-wordmark-stacked": {
      const typeface = titleFont?.trim()
        ? `Use the visual character of the selected title typeface ${titleFont.trim()} for the wordmark.`
        : "Use the visual character of the selected display typeface for the wordmark.";
      return (
        `Create a stacked combination mark: place one simple abstract symbol above `
        + `and the wordmark below. ${typeface}`
      );
    }
    case "wordmark-only": {
      const typeface = titleFont?.trim()
        ? `Use the visual character of the selected title typeface ${titleFont.trim()} for the wordmark.`
        : "Use distinctive custom lettering derived from the brand personality.";
      return (
        `Create a wordmark-only logo using distinctive custom lettering derived from the brand personality. `
        + `${typeface} `
        + `Do not add a separate symbol, icon, emblem, or pictorial mark.`
      );
    }
  }
}

export function buildLogoImagePrompt(ctx: LogoPromptContext): string {
  if (!ctx.logoComposition) return buildLegacyLogoPrompt(ctx);

  const name = ctx.brandName?.trim() || "the brand";
  const concept = ctx.visualConcept;
  const focus = ctx.newHint
    ? `Creative direction: ${formatSentence(ctx.newHint)} `
    : "";
  const palette = formatColorSchemeSpec(ctx.colorPalette, { applyTo: "logo-mark" });
  const conceptText = concept?.concept?.trim()
    ? `Visual concept: ${formatSentence(concept.concept)} `
    : "";
  const compositionInstruction = buildCompositionInstruction(
    ctx.logoComposition,
    ctx.titleFont,
  );

  return [
    `${focus}Design exactly one finished logo lockup for the brand "${name}". `,
    conceptText,
    palette ? `${palette} ` : "",
    `Logo composition decision: ${ctx.logoComposition.mode}. `,
    `Brand-specific rationale: ${formatSentence(ctx.logoComposition.rationale)} `,
    `${compositionInstruction} `,
    `Rules: Render the brand name exactly as "${name}", once and only once. `,
    `Show no tagline, subtitle, explanation, label, or any other text or characters. `,
    `Create one cohesive lockup only — no logo sheet, no alternate variants, and no application mockup. `,
    `Use a minimal flat vector style. ${LOGO_WHITE_CANVAS_RULE} `,
    `Any symbol must be simple and abstract — not an illustration, scene, mascot, badge, or detailed drawing.`,
  ].join("");
}
