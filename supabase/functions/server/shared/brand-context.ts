import type {
  BrandBriefCore,
  BrandBriefDetail,
  BrandBriefApplication,
  BrandContextFull,
  BrandContextShort,
  VisualContext,
  VisualConceptData,
} from "./types.tsx";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const arr = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    return arr.length > 0 ? arr : undefined;
  }
  if (typeof value === "string") {
    const arr = value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    return arr.length > 0 ? arr : undefined;
  }
  return undefined;
}

function asShortVisualConcept(value: unknown): BrandContextShort["visualConcept"] | undefined {
  if (!isRecord(value)) return undefined;
  const concept = asNonEmptyString(value.concept);
  if (!concept) return undefined;
  const description = asNonEmptyString(value.description);
  return description !== undefined ? { concept, description } : { concept };
}

function asVisualConcept(value: unknown): VisualConceptData | undefined {
  if (!isRecord(value)) return undefined;
  const concept = asNonEmptyString(value.concept);
  const description = asNonEmptyString(value.description) ?? "";
  if (!concept) return undefined;
  return { concept, description };
}

function pickPrimaryContext(input: unknown, key: "brandContext" | "brandContextShort"): Record<string, unknown> {
  if (!isRecord(input)) return {};
  const nested = input[key];
  return isRecord(nested) ? nested : input;
}

/** Parse BrandBriefCore from a loose input object. */
function buildCoreFromLoose(raw: Record<string, unknown>): BrandBriefCore | undefined {
  const brief = isRecord(raw.brandBrief) ? raw.brandBrief : {};
  const coreRaw = isRecord(brief.core) ? brief.core : {};

  const name =
    asNonEmptyString(coreRaw.name)
    ?? asNonEmptyString(brief.name)
    ?? asNonEmptyString(raw.brandName)
    ?? asNonEmptyString(raw.name);
  const tagline =
    asNonEmptyString(coreRaw.tagline)
    ?? asNonEmptyString(brief.tagline)
    ?? asNonEmptyString(raw.tagline);
  const keywords =
    asStringArray(coreRaw.keywords)
    ?? asStringArray(raw.keywords);

  const core: BrandBriefCore = {};
  if (name) core.name = name;
  if (tagline) core.tagline = tagline;
  if (keywords && keywords.length > 0) core.keywords = keywords;

  return Object.keys(core).length > 0 ? core : undefined;
}

/** Parse BrandBriefDetail from a loose input object. */
function buildDetailFromLoose(raw: Record<string, unknown>): BrandBriefDetail | undefined {
  const brief = isRecord(raw.brandBrief) ? raw.brandBrief : {};
  const detailRaw = isRecord(brief.detail) ? brief.detail : {};

  const targetAudience =
    asNonEmptyString(detailRaw.targetAudience)
    ?? asNonEmptyString(raw.targetAudience);
  const description =
    asNonEmptyString(detailRaw.description)
    ?? asNonEmptyString(brief.description)
    ?? asNonEmptyString(raw.description)
    ?? asNonEmptyString(raw.brandDescription);

  const detail: BrandBriefDetail = {};
  if (targetAudience) detail.targetAudience = targetAudience;
  if (description) detail.description = description;

  return Object.keys(detail).length > 0 ? detail : undefined;
}

/** Parse BrandBriefApplication from a loose input object. */
function buildApplicationsFromLoose(raw: Record<string, unknown>): BrandBriefApplication | undefined {
  const brief = isRecord(raw.brandBrief) ? raw.brandBrief : {};
  return asStringArray(brief.applications) ?? asStringArray(raw.applications);
}

function readNestedImageUrl(raw: Record<string, unknown>, key: string): string | undefined {
  const nested = raw[key];
  if (!isRecord(nested)) return undefined;
  return asNonEmptyString(nested.imageUrl);
}

// ── Normalizers ───────────────────────────────────────────────────────────────

export function normalizeFullContext(input: unknown): BrandContextFull {
  const raw = pickPrimaryContext(input, "brandContext");
  const core = buildCoreFromLoose(raw);
  const detail = buildDetailFromLoose(raw);
  const applications = buildApplicationsFromLoose(raw);
  const fontRaw = isRecord(raw.font) ? raw.font : {};

  return {
    ...(core ?? {}),
    ...(detail ?? {}),
    ...(applications ? { applications } : {}),
    visualConcept: asVisualConcept(raw.visualConcept),
    colorPalette: asStringArray(raw.colorPalette),
    font: {
      titleFont: asNonEmptyString(fontRaw.titleFont) ?? asNonEmptyString(raw.titleFont),
      bodyFont: asNonEmptyString(fontRaw.bodyFont) ?? asNonEmptyString(raw.bodyFont),
    },
    logoImageUrl: asNonEmptyString(raw.logoImageUrl)
      ?? readNestedImageUrl(raw, "logo")
      ?? readNestedImageUrl(raw, "logoInspiration"),
    artStyleImageUrl: asNonEmptyString(raw.artStyleImageUrl)
      ?? readNestedImageUrl(raw, "artStyle"),
    applicationImageUrl: asNonEmptyString(raw.applicationImageUrl),
    application: asNonEmptyString(raw.application),
  };
}

export function toShortContext(full: BrandContextFull): BrandContextShort {
  return {
    name: full.name,
    tagline: full.tagline,
    keywords: full.keywords,
    visualConcept: full.visualConcept
      ? { concept: full.visualConcept.concept, description: full.visualConcept.description }
      : undefined,
    colorPalette: full.colorPalette,
    titleFont: full.font?.titleFont,
    bodyFont: full.font?.bodyFont,
    application: full.application,
  };
}

export function normalizeShortContext(input: unknown): BrandContextShort {
  const raw = pickPrimaryContext(input, "brandContextShort");
  const nestedFull = isRecord(raw.brandContext) ? raw.brandContext : undefined;

  const core = buildCoreFromLoose(raw);
  const shortFromRaw: BrandContextShort = {
    ...(core ?? {}),
    visualConcept: asShortVisualConcept(raw.visualConcept),
    colorPalette: asStringArray(raw.colorPalette),
    titleFont: asNonEmptyString(raw.titleFont),
    bodyFont: asNonEmptyString(raw.bodyFont),
    application: asNonEmptyString(raw.application),
  };

  const hasDirectShortFields =
    !!shortFromRaw.name
    || !!shortFromRaw.tagline
    || (shortFromRaw.keywords?.length ?? 0) > 0
    || !!shortFromRaw.visualConcept
    || (shortFromRaw.colorPalette?.length ?? 0) > 0
    || !!shortFromRaw.titleFont
    || !!shortFromRaw.bodyFont
    || !!shortFromRaw.application;

  if (hasDirectShortFields || !nestedFull) return shortFromRaw;
  return toShortContext(normalizeFullContext({ brandContext: nestedFull }));
}

// ── Modular text builders ─────────────────────────────────────────────────────

/** Renders BrandBriefCore fields as prompt text. */
export function coreToText(c: Partial<BrandBriefCore>): string {
  const lines = [
    c.name ? `Brand: "${c.name}"` : "",
    c.tagline ? `Tagline: "${c.tagline}"` : "",
    c.keywords?.length ? `Keywords: ${c.keywords.join(", ")}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

/** Renders BrandBriefDetail fields as prompt text. */
export function detailToText(d: Partial<BrandBriefDetail>): string {
  const lines = [
    d.description ? `Description: ${d.description}` : "",
    d.targetAudience ? `Target audience: ${d.targetAudience}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

/** Renders VisualContext fields as prompt text. */
export function visualToText(v: Partial<VisualContext>): string {
  const lines = [
    v.visualConcept?.concept
      ? `Visual concept: ${v.visualConcept.concept}${v.visualConcept.description ? ` — ${v.visualConcept.description}` : ""}`
      : "",
    v.colorPalette?.length ? `Color palette: ${v.colorPalette.join(", ")}` : "",
    v.font?.titleFont || v.font?.bodyFont
      ? `Typography: ${v.font?.titleFont ?? "N/A"} / ${v.font?.bodyFont ?? "N/A"}`
      : "",
  ];
  return lines.filter(Boolean).join("\n");
}

/** Renders BrandBriefApplication list as prompt text. */
export function applicationsToText(apps?: BrandBriefApplication): string {
  return apps?.length ? `Applications: ${apps.join(", ")}` : "";
}

// ── Convenience composite builders (backward-compatible) ─────────────────────

/** Full context: core + detail + applications + visual + selected application. */
export function buildFullContextText(context: BrandContextFull): string {
  const parts = [
    coreToText(context),
    detailToText(context),
    applicationsToText(context.applications),
    visualToText(context),
    context.application ? `Application: ${context.application}` : "",
  ];
  return parts.filter(Boolean).join("\n");
}

/** Short context: core + visual (palette, typography, concept) + selected application. */
export function buildShortContextText(context: BrandContextShort): string {
  const vcText = context.visualConcept?.concept
    ? `Visual concept: ${context.visualConcept.concept}${context.visualConcept.description ? ` — ${context.visualConcept.description}` : ""}`
    : "";
  const parts = [
    coreToText(context),
    vcText,
    context.colorPalette?.length ? `Color palette: ${context.colorPalette.join(", ")}` : "",
    context.titleFont || context.bodyFont
      ? `Typography: ${context.titleFont ?? "N/A"} / ${context.bodyFont ?? "N/A"}`
      : "",
    context.application ? `Application: ${context.application}` : "",
  ];
  return parts.filter(Boolean).join("\n");
}

/** Core identity only (name, tagline, keywords) — no visual elements. */
export function buildBriefIdentityContextText(context: BrandContextShort): string {
  return coreToText(context);
}

export function buildVisualConceptContextText(
  vc: BrandContextShort["visualConcept"] | undefined,
): string | undefined {
  if (!vc?.concept?.trim()) return undefined;
  const tail = vc.description?.trim() ? ` — ${vc.description.trim()}` : "";
  return `Visual concept: ${vc.concept.trim()}${tail}`;
}
