export const LOGO_COMPOSITION_MODES = [
  "symbol-wordmark-horizontal",
  "symbol-wordmark-stacked",
  "wordmark-only",
] as const;

export type LogoCompositionMode = (typeof LOGO_COMPOSITION_MODES)[number];

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

function buildLegacyLogoPrompt(ctx: LogoPromptContext): string {
  const name = ctx.brandName ?? "the brand";
  const description = ctx.description ?? ctx.brandDescription;
  const focus = ctx.newHint
    ? `Creative direction: ${formatSentence(ctx.newHint)} `
    : "";
  const palette = (ctx.colorPalette ?? []).length > 0
    ? `Brand colors: ${ctx.colorPalette!.join(", ")}. `
    : "";
  const motif = ctx.visualConcept?.concept?.trim()
    ? `Visual motif: ${formatSentence(ctx.visualConcept.concept)} `
    : "";

  return (
    `${focus}Design a logo mark for a brand about: `
    + `${formatSentence(description ?? name)} `
    + `${motif}`
    + `${palette}`
    + `Rules: `
    + `Purely graphic symbol — absolutely NO text, NO letters, NO words, NO characters. `
    + `NOT an illustration, NOT a scene, NOT a mascot, NOT a badge, NOT a detailed drawing. `
    + `Centered on pure white background with generous padding.`
  );
}

function buildCompositionInstruction(
  composition: LogoComposition,
  titleFont?: string,
): string {
  switch (composition.mode) {
    case "symbol-wordmark-horizontal": {
      const typeface = titleFont?.trim()
        ? `Use the visual character of the selected title typeface "${titleFont.trim()}" for the wordmark.`
        : "Use the visual character of the selected display typeface for the wordmark.";
      return (
        `Create a horizontal combination mark: place one simple abstract symbol on the left `
        + `and the wordmark on the right. ${typeface}`
      );
    }
    case "symbol-wordmark-stacked": {
      const typeface = titleFont?.trim()
        ? `Use the visual character of the selected title typeface "${titleFont.trim()}" for the wordmark.`
        : "Use the visual character of the selected display typeface for the wordmark.";
      return (
        `Create a stacked combination mark: place one simple abstract symbol above `
        + `and the wordmark below. ${typeface}`
      );
    }
    case "wordmark-only":
      return (
        `Create a wordmark-only logo using distinctive custom lettering derived from the brand personality. `
        + `Do not add a separate symbol, icon, emblem, or pictorial mark.`
      );
  }
}

export function buildLogoImagePrompt(ctx: LogoPromptContext): string {
  if (!ctx.logoComposition) return buildLegacyLogoPrompt(ctx);

  const name = ctx.brandName?.trim() || "the brand";
  const concept = ctx.visualConcept;
  const focus = ctx.newHint
    ? `Creative direction: ${formatSentence(ctx.newHint)} `
    : "";
  const palette = (ctx.colorPalette ?? []).length > 0
    ? `Brand colors: ${ctx.colorPalette!.join(", ")}. `
    : "";
  const conceptText = concept?.concept?.trim()
    ? `Visual concept: ${formatSentence(concept.concept)} `
    : "";
  const compositionInstruction = buildCompositionInstruction(
    ctx.logoComposition,
    ctx.titleFont,
  );

  return (
    `${focus}Design exactly one finished logo lockup for the brand "${name}". `
    + `${conceptText}`
    + `${palette}`
    + `Logo composition decision: ${ctx.logoComposition.mode}. `
    + `Brand-specific rationale: ${formatSentence(ctx.logoComposition.rationale)} `
    + `${compositionInstruction} `
    + `Rules: Render the brand name exactly as "${name}", once and only once. `
    + `Show no tagline, subtitle, explanation, label, or any other text or characters. `
    + `Create one cohesive lockup only — no logo sheet, no alternate variants, and no application mockup. `
    + `Use a minimal flat vector style on a pure white background with generous padding. `
    + `Any symbol must be simple and abstract — not an illustration, scene, mascot, badge, or detailed drawing.`
  );
}
