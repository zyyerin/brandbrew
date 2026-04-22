// ─────────────────────────────────────────────────────────────────────────────
// shared/merge-specs.tsx — Unified merge rule table (single source of truth)
//
// Architecture: three composable layers build every MergeSpec automatically.
//
//   Layer 1 — SOURCE_DESCRIPTORS
//     Describes each source element to the AI (one entry per element type).
//     textDesc:  used in text-model prompts (brand-strategist, vision-merge).
//     imageDesc: used in image generation prompts (merge-generate).
//
//   Layer 2 — TARGET_ACTIONS
//     Defines what the target element needs from the AI (one entry per element type).
//     textAction:  the full LLM instruction template for text-target merges.
//     image targets return only a newHint (used directly as the generation prompt).
//     Null means that element type does not support that direction.
//
//   Layer 3 — PROMPT_OVERRIDES
//     Selective per-pair fine-tuning. Any field set here wins over the composed
//     default. Optional newHintNote / cardHintNote override UI copy only (toast / slot).
//     Key format: "source→target" (e.g. "font→art-style").
//
// At module load, buildAllMergeSpecs() walks every supported combination,
// composes spec fields from the three layers, and exports MERGE_SPECS.
// Consumers (agents, frontend) still read MERGE_SPECS[source][target] as before.
//
// Both frontend (via @server-shared Vite alias) and server agents import here.
//
// Out of scope: "visual-snapshot" is not a merge target here. Drag-to-update on
// the snapshot panel calls onSnapshotMerge → regenerateWithOverride (full
// snapshot re-synthesis), not MERGE_SPECS / merge-cards.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  BrandContextShort,
  MergeBoardElements,
  MergeBoardPromptContext,
  MergeSpec,
  VisualConceptData,
} from "./types.tsx";
import { buildVisualConceptContextText } from "./brand-context.ts";
import { buildPrompt } from "./prompt-builder.ts";
import { RULE_OUTPUT_JSON } from "./prompt-rules.ts";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// ── Layer 1: Source element descriptors ──────────────────────────────────────

type SourceDescriptor = {
  /** How this element is described inside a text/vision prompt. */
  textDesc: string;
  /** How this element is referenced inside an image generation prompt. */
  imageDesc: string;
};

const SOURCE_DESCRIPTORS: Record<string, SourceDescriptor> = {
  "color-palette": {
    textDesc: "reflects the emotional tone of the given color palette",
    imageDesc: "inspired by the color scheme: {sourceData}",
  },
  "font": {
    textDesc: "matches the typography's mood and character",
    imageDesc: "matches the typography's mood and character",
  },
  "logo": {
    textDesc: "the logo (see attached image)",
    imageDesc: "referencing the logo's visual style and graphic language",
  },
  "art-style": {
    textDesc: "an art style reference image showing the visual language",
    imageDesc: "in the provided visual style",
  },
};

// ── Layer 2: Target element actions ──────────────────────────────────────────

type TargetAction = {
  /**
   * Full LLM instruction for text-target merges.
   * Receives the source descriptor at the end.
   * Null = this element is not a text target.
   */
  textAction: string | null;
  /** Fields the text model may modify. Null = not a text target. */
  allowedFields: string[] | null;
};

const TARGET_ACTIONS: Record<string, TargetAction> = {
  "color-palette": {
    textAction:
      "Derive a color palette of 3 to 5 hex colors whose mood and character {SOURCE_DESC}.",
    allowedFields: ["colorPalette"],
  },
  "font": {
    textAction:
      "Find a Google Fonts pairing (titleFont + bodyFont) whose mood and character {SOURCE_DESC}.",
    allowedFields: ["font.titleFont", "font.bodyFont"],
  },
  "logo": {
    textAction: null,
    allowedFields: null,
  },
  "art-style": {
    textAction: null,
    allowedFields: null,
  },
};

// ── Layer 3: Per-pair prompt overrides ────────────────────────────────────────
//
// Add an entry here to fine-tune any specific source→target combination.
// Only the fields you set are overridden; everything else is composed from
// the defaults above. Set textModel to use a non-default model.
//
// Key format: "source→target"

const PROMPT_OVERRIDES: Record<string, Partial<MergeSpec>> = {
  // ── color-palette → text targets ───────────────────────────────────────────
  "color-palette→font": {
    instruction:
      "Recommend a Google Fonts pairing (titleFont + bodyFont) whose typographic mood matches the emotional tone of the given color palette. Change only titleFont and bodyFont.",
  },

  // ── logo → text targets ──────────────────────────────────────────────────────
  "logo→color-palette": {
    instruction:
      "Derive a color palette of 3 to 5 hex colors that reflects the color scheme of the image. Include a primary brand color, key accent colors, and any neutral tones.",
    extractPaletteInstructionWithExistingTarget:
      "Derive a color palette of 3 to 5 hex colors that reflects the color scheme of the image, and form a palette that fits this color scheme: {sourceData}. Include a primary brand color, key accent colors, and any neutral tones.",
    requiresSourceImage: true,
  },
  "logo→font": {
    instruction:
      "Find a Google Fonts pairing (titleFont + bodyFont) that matches the typeface in the image. Otherwise, recommend a Google Fonts pairing whose aesthetic matches the mood and atmosphere observed in the image. Change only titleFont and bodyFont.",
  },

  // ── art-style → text targets ────────────────────────────────────────────────
  "art-style→color-palette": {
    instruction:
      "Derive a color palette of 3 to 5 hex colors that reflects the color scheme of the image. Include a primary brand color, key accent colors, and any neutral tones.",
    extractPaletteInstructionWithExistingTarget:
      "Derive a color palette of 3 to 5 hex colors that reflects the color scheme of the image, and form a palette that fits this color scheme: {sourceData}. Include a primary brand color, key accent colors, and any neutral tones.",
    requiresSourceImage: true,
  },
  "art-style→font": {
    instruction:
      "Find a Google Fonts pairing (titleFont + bodyFont) that matches the typeface in the image. Otherwise, recommend a Google Fonts pairing whose aesthetic matches the mood and atmosphere observed in the image. Change only titleFont and bodyFont.",
  },

  // ── image targets (newHint / cardHint overrides) ────────────────────────────
  // Optional newHintNote (slot-drop UI) and cardHintNote (card-drop toast); same placeholders as hints.
  "color-palette→logo": {
    newHint: "Design a logo inspired by the color scheme: {sourceData}.",
    cardHint: "Recolor this image with this color scheme: {sourceData}",
    cardHintNote: "Recolor the logo with this color palette",
  },
  "color-palette→art-style": {
    newHint: "Generate a modular brand graphic device system emphasizing chromatic diffusion and organic color gradients. Include a primary key visual (KV) and secondary supporting assets. No photography. No actual logo.",
    newHintNote: "Art style inspired by the color palette",
    cardHintNote: "Recolor the art stylewith this color palette",
  },
  "font→logo": {
    newHint: "Design a wordmark from typeface (black wordmark on white background)",
    newHintNote: "Design a wordmark from typeface",
    cardHint: "Replace the text in the image with these fonts: {sourceData}; if no text is visible, add a wordmark in the first typeface. Brand name: {brandName}",
    cardHintNote: "Replace the typeface in the logo",
  },
  // Slot merge: /merge-generate uses buildMergeGeneratePrompt (strict 3 segments; no brief text).
  "font→art-style": {
    newHint: "Generate a modular brand graphic device system extracting and deconstructing the specific letterforms, terminals, and glyph geometry of the chosen fonts. Include a primary key visual (KV) and secondary supporting patterns/shapes. No photography. No actual logo.",
    newHintNote: "Art style inspired by the fonts",
    cardHint: "Replace the typeface in the image with these fonts: {sourceData}",
    cardHintNote: "Replace the typeface",
  },
  "logo→art-style": {
    newHint: "Generate a modular brand graphic device system reflecting the logo's stylistic signature. Include a primary key visual (KV) and secondary supporting patterns/shapes. No photography. Do not include actual logo.",
    newHintNote: "Art style inspired by the logo",
    cardHintNote: "Replace the typeface in the art style",
  },
  "art-style→logo": {
    newHint: "Design a logo referring to this style: {sourceData}",
    newHintNote: "Logo inspired by the art style",
    cardHintNote: "Replace the typeface in the logo",
  },
};

/** Empty / whitespace-only overrides should not replace composed defaults. */
function coalesceMergeHint(override: string | undefined, fallback: string): string {
  if (typeof override === "string" && override.trim().length > 0) return override;
  return fallback;
}

// ── Composition engine ────────────────────────────────────────────────────────

function buildMergeSpec(source: string, target: string): MergeSpec | null {
  // Layer 1：源元素如何被描述；Layer 2：目标元素允许 AI 做什么。缺任一侧则该组合不支持。
  const srcDesc = SOURCE_DESCRIPTORS[source];
  const tgtAction = TARGET_ACTIONS[target];
  if (!srcDesc || !tgtAction) return null;

  // Layer 3：针对具体 source→target 的覆盖项（instruction / newHint / cardHint 等）
  const key = `${source}→${target}`;
  const overrides = PROMPT_OVERRIDES[key] ?? {};

  // 文本类目标（如调色板、字体）：走 strategist / vision-merge，需要完整 instruction 与可改字段列表
  if (tgtAction.textAction !== null && tgtAction.allowedFields !== null) {
    // 优先用 PROMPT_OVERRIDES 里的 instruction，否则把模板中的 {SOURCE_DESC} 换成 Layer 1 的 textDesc
    const instruction = overrides.instruction
      ?? tgtAction.textAction.replace("{SOURCE_DESC}", srcDesc.textDesc);

    // 无覆盖时的简短 newHint：取 textAction 第一句（按句号切）填入源描述后截断，供 UI/日志等使用
    const defaultHint = `${tgtAction.textAction.split(".")[0].replace("{SOURCE_DESC}", srcDesc.textDesc).slice(0, 60)}`;

    return {
      newHint: coalesceMergeHint(overrides.newHint, defaultHint),
      cardHint: overrides.cardHint,
      newHintNote: overrides.newHintNote,
      cardHintNote: overrides.cardHintNote,
      allowedFields: tgtAction.allowedFields,
      instruction,
      extractPaletteInstructionWithExistingTarget: overrides.extractPaletteInstructionWithExistingTarget,
      requiresSourceImage: overrides.requiresSourceImage ?? false,
      textModel: overrides.textModel,
    };
  }

  // 图像类目标（如 logo、art-style）：仅需要生成提示 newHint；由 visual-designer 等消费
  if (tgtAction.textAction === null) {
    // 默认 hint：用源的 imageDesc（图像侧说法）+ 目标 slot 名，可被 PROMPT_OVERRIDES.newHint 覆盖
    const defaultHint = `${srcDesc.imageDesc} → ${target}`;
    return {
      newHint: coalesceMergeHint(overrides.newHint, defaultHint),
      cardHint: overrides.cardHint,
      newHintNote: overrides.newHintNote,
      cardHintNote: overrides.cardHintNote,
    };
  }

  return null;
}

// ── Supported source→target pairs ─────────────────────────────────────────────
//
// List every combination you want to support. Both sides must have entries in
// SOURCE_DESCRIPTORS and TARGET_ACTIONS respectively.
//
// Never add visual-snapshot (or other composition-only UI targets): they are not
// board element slots and have no TARGET_ACTIONS entry.

const SUPPORTED_PAIRS: Array<[source: string, target: string]> = [
  // color-palette →
  ["color-palette", "logo"],
  ["color-palette", "art-style"],
  ["color-palette", "font"],
  // font →
  ["font", "logo"],
  ["font", "art-style"],
  ["font", "color-palette"],
  // logo →
  ["logo", "art-style"],
  ["logo", "color-palette"],
  ["logo", "font"],
  // art-style →
  ["art-style", "logo"],
  ["art-style", "color-palette"],
  ["art-style", "font"],
];

function buildAllMergeSpecs(): Record<string, Record<string, MergeSpec>> {
  const table: Record<string, Record<string, MergeSpec>> = {};
  for (const [source, target] of SUPPORTED_PAIRS) {
    const spec = buildMergeSpec(source, target);
    if (!spec) {
      throw new Error(
        `[merge-specs] Invalid SUPPORTED_PAIRS entry: ${source}→${target}. ` +
          "Both ends must exist in SOURCE_DESCRIPTORS and TARGET_ACTIONS. " +
          'Targets like "visual-snapshot" belong to onSnapshotMerge, not this table.',
      );
    }
    if (!table[source]) table[source] = {};
    table[source][target] = spec;
  }
  return table;
}

export const MERGE_SPECS: Record<string, Record<string, MergeSpec>> = buildAllMergeSpecs();

// ── Card-ID ↔ brandData field mapping ────────────────────────────────────────

export function mergeCardIdToField(cardId: string): string | null {
  const map: Record<string, string> = {
    "color-palette": "colorPalette",
    "font": "font",
    "logo": "logoInspiration",
    "art-style": "artStyle",
  };
  return map[cardId] ?? null;
}

// ── Merge board prompt context (visual concept + four visual slots) ───────────
// Single formatter for /merge, /vision-merge, and /merge-generate.

const MAX_URL_SNIPPET = 96;

function truncateUrlForPrompt(url: string): string {
  const t = url.trim();
  if (t.length <= MAX_URL_SNIPPET) return t;
  return `${t.slice(0, MAX_URL_SNIPPET)}…`;
}

function parseVisualConceptFromUnknown(v: unknown): VisualConceptData | undefined {
  if (!isRecord(v)) return undefined;
  const concept = typeof v.concept === "string" ? v.concept.trim() : "";
  if (!concept) return undefined;
  const description = typeof v.description === "string" ? v.description : "";
  return { concept, description };
}

function parseImageSlotVal(v: unknown): { imageUrl?: string } | undefined {
  if (v === undefined || v === null) return undefined;
  if (!isRecord(v)) return undefined;
  const imageUrl = typeof v.imageUrl === "string" ? v.imageUrl : undefined;
  return imageUrl?.trim() ? { imageUrl: imageUrl.trim() } : undefined;
}

function parseFontVal(v: unknown): { titleFont: string; bodyFont: string } | undefined {
  if (v === undefined || v === null) return undefined;
  if (!isRecord(v)) return undefined;
  const titleFont = typeof v.titleFont === "string" ? v.titleFont : "";
  const bodyFont = typeof v.bodyFont === "string" ? v.bodyFont : "";
  if (!titleFont && !bodyFont) return undefined;
  return { titleFont, bodyFont };
}

/** Build board context from merge `brandData`, excluding target/source card slots. */
export function mergeBoardContextFromBrandData(
  brandData: Record<string, unknown>,
  opts: { targetId: string; sourceId?: string },
): MergeBoardPromptContext {
  let visualConcept = parseVisualConceptFromUnknown(brandData.visualConcept);
  const boardElements: MergeBoardElements = {
    artStyle: parseImageSlotVal(brandData.artStyle),
    colorPalette: Array.isArray(brandData.colorPalette)
      ? (brandData.colorPalette as unknown[]).filter((x): x is string => typeof x === "string")
      : undefined,
    font: parseFontVal(brandData.font),
    logoInspiration: parseImageSlotVal(brandData.logoInspiration),
  };

  const ids = [opts.targetId, opts.sourceId].filter(
    (x): x is string => typeof x === "string" && x.length > 0,
  );
  for (const cardId of ids) {
    if (cardId === "visual-concept") {
      visualConcept = undefined;
      continue;
    }
    const field = mergeCardIdToField(cardId);
    if (field === "colorPalette") boardElements.colorPalette = undefined;
    else if (field === "font") boardElements.font = undefined;
    else if (field === "artStyle") boardElements.artStyle = undefined;
    else if (field === "logoInspiration") boardElements.logoInspiration = undefined;
  }

  return { visualConcept, boardElements };
}

export type FormatMergeBoardOptions = {
  /** Default true. Set false to omit the visual concept line (e.g. merge-generate active-elements segment). */
  includeVisualConcept?: boolean;
  /** Default true. Set false to omit palette / typography / image URL lines. */
  includeBoardElements?: boolean;
  /** When the art-style image is passed as inlineData, omit its URL from the prompt. */
  omitArtStyleUrl?: boolean;
  /** When the logo image is passed as inlineData, omit its URL from the prompt. */
  omitLogoUrl?: boolean;
  /** Join board element lines (URLs, palette, fonts). Default ". " */
  boardElementJoiner?: string;
};

/** Single visual-concept line for prompts (same wording as full board formatter). */
export function formatVisualConceptPromptLine(ctx: MergeBoardPromptContext): string {
  const vc = ctx.visualConcept;
  if (!vc?.concept?.trim()) return "";
  const line = buildVisualConceptContextText({
    concept: vc.concept.trim(),
    description: vc.description?.trim() || undefined,
  });
  return line ?? "";
}

/** Serialize board context for LLM prompts (one compact section). */
export function formatMergeBoardPromptContext(
  ctx: MergeBoardPromptContext,
  options?: FormatMergeBoardOptions,
): string {
  const includeVc = options?.includeVisualConcept !== false;
  const includeBe = options?.includeBoardElements !== false;
  const parts: string[] = [];

  if (includeVc) {
    const vcLine = formatVisualConceptPromptLine(ctx);
    if (vcLine) parts.push(vcLine);
  }

  if (includeBe) {
    const be = ctx.boardElements;
    // Image-related lines first (URLs align with omitted inline slots in merge-generate).
    if (be.artStyle?.imageUrl?.trim() && !options?.omitArtStyleUrl) {
      parts.push(`Style reference: ${truncateUrlForPrompt(be.artStyle.imageUrl)}`);
    }
    if (be.logoInspiration?.imageUrl?.trim() && !options?.omitLogoUrl) {
      parts.push(`Logo reference: ${truncateUrlForPrompt(be.logoInspiration.imageUrl)}`);
    }
    if (be.colorPalette?.length) {
      parts.push(`Use color scheme: ${be.colorPalette.slice(0, 8).join(", ")}`);
    }
    if (be.font && (be.font.titleFont || be.font.bodyFont)) {
      parts.push(`Use fonts: ${be.font.titleFont || "N/A"} / ${be.font.bodyFont || "N/A"}`);
    }
  }

  if (parts.length === 0) return "";
  const joiner = options?.boardElementJoiner ?? ". ";
  return parts.join(joiner);
}

/** Fallback when `mergeBoardContext` is absent on merge-generate (legacy clients). */
export function mergeBoardFromShortContextPatch(
  shortContext: BrandContextShort,
): MergeBoardPromptContext {
  const boardElements: MergeBoardElements = {};
  if (shortContext.colorPalette?.length) {
    boardElements.colorPalette = shortContext.colorPalette;
  }
  if (shortContext.titleFont || shortContext.bodyFont) {
    boardElements.font = {
      titleFont: shortContext.titleFont ?? "",
      bodyFont: shortContext.bodyFont ?? "",
    };
  }
  return {
    visualConcept: parseVisualConceptFromUnknown(shortContext.visualConcept),
    boardElements,
  };
}

/** Resolve merge board from request body; prefers explicit `mergeBoardContext`. */
export function normalizeMergeBoardFromBody(
  body: Record<string, unknown>,
  shortContext: BrandContextShort,
): MergeBoardPromptContext {
  if (!("mergeBoardContext" in body)) {
    return mergeBoardFromShortContextPatch(shortContext);
  }
  const raw = body.mergeBoardContext;
  if (!isRecord(raw)) {
    return mergeBoardFromShortContextPatch(shortContext);
  }
  const beIn = isRecord(raw.boardElements)
    ? raw.boardElements
    : isRecord((raw as Record<string, unknown>).activeElements)
      ? (raw as Record<string, unknown>).activeElements as Record<string, unknown>
      : {};
  const visualConcept =
    parseVisualConceptFromUnknown(raw.visualConcept)
    ?? parseVisualConceptFromUnknown(shortContext.visualConcept);
  return {
    visualConcept,
    boardElements: {
      artStyle: parseImageSlotVal(beIn.artStyle),
      colorPalette: Array.isArray(beIn.colorPalette)
        ? beIn.colorPalette.filter((x): x is string => typeof x === "string")
        : undefined,
      font: parseFontVal(beIn.font),
      logoInspiration: parseImageSlotVal(beIn.logoInspiration),
    },
  };
}

// ── Field guard — enforce allowedFields after AI response ────────────────────

export function applyFieldGuard(
  original: unknown,
  updated: unknown,
  allowedFields: string[],
  fieldPrefix = "",
): unknown {
  if (Array.isArray(original)) {
    const directAllow = fieldPrefix ? allowedFields.includes(fieldPrefix) : false;
    if (!directAllow) return original;
    if (!Array.isArray(updated)) return original;
    if (fieldPrefix === "colorPalette") {
      return sanitizeColorPalette(updated, original);
    }
    return updated;
  }
  if (typeof original !== "object" || original === null) {
    return updated;
  }
  if (typeof updated !== "object" || updated === null) return original;

  const orig = original as Record<string, unknown>;
  const upd = updated as Record<string, unknown>;
  const result: Record<string, unknown> = { ...orig };

  // Merge keys from both original and updated so that empty originals still
  // pick up allowed fields from the AI response.
  const allKeys = new Set([...Object.keys(orig), ...Object.keys(upd)]);

  for (const key of allKeys) {
    const fullPath = fieldPrefix ? `${fieldPrefix}.${key}` : key;
    const directAllow = allowedFields.includes(fullPath);
    const hasChildAllow = allowedFields.some((f) => f.startsWith(`${fullPath}.`));

    if (directAllow) {
      result[key] = upd[key];
    } else if (hasChildAllow) {
      result[key] = applyFieldGuard(orig[key], upd[key], allowedFields, fullPath);
    } else if (key in orig) {
      result[key] = orig[key];
    }
  }

  return result;
}

function sanitizeColorPalette(updated: unknown[], original: unknown[]): string[] {
  const normalizedUpdated = normalizeHexPalette(updated);
  if (normalizedUpdated.length >= 3) {
    return normalizedUpdated.slice(0, 5);
  }
  const normalizedOriginal = normalizeHexPalette(original);
  if (normalizedOriginal.length >= 3) {
    return normalizedOriginal.slice(0, 5);
  }
  const merged = normalizeHexPalette([...normalizedUpdated, ...normalizedOriginal]).slice(0, 5);
  if (merged.length >= 3) return merged;

  // Hard fallback to keep downstream consumers on the 3-5 color contract.
  const fallback = ["#111111", "#777777", "#EEEEEE"];
  return [...merged, ...fallback].slice(0, 3);
}

function normalizeHexPalette(items: unknown[]): string[] {
  const HEX = /^#[0-9A-F]{6}$/;
  const seen = new Set<string>();
  const output: string[] = [];
  for (const item of items) {
    if (typeof item !== "string") continue;
    const value = item.trim().toUpperCase();
    if (!HEX.test(value) || seen.has(value)) continue;
    seen.add(value);
    output.push(value);
  }
  return output;
}

// ── Merge support predicate ───────────────────────────────────────────────────

export function isMergeSupported(sourceId: string, targetId: string): boolean {
  if (sourceId === targetId) return false;
  return !!MERGE_SPECS[sourceId]?.[targetId];
}

/** Template vars for newHint / cardHint / *HintNote UI strings. */
export type MergeHintTemplateVars = {
  sourceData?: string;
  brandName?: string;
  brandDescription?: string;
};

function applyMergeHintTemplateVars(template: string, vars?: MergeHintTemplateVars): string {
  if (!vars) return template;
  return template
    .replace(/\{sourceData\}/g, vars.sourceData ?? "")
    .replace(/\{brandName\}/g, vars.brandName ?? "")
    .replace(/\{brandDescription\}/g, vars.brandDescription ?? "");
}

// getMergeHint: slot-drop UI line (prefers newHintNote when set).
export function getMergeHint(sourceId: string, targetId: string, vars?: MergeHintTemplateVars): string {
  return resolveMergeUiHint("slot", sourceId, targetId, vars);
}

// ── Hint resolution ───────────────────────────────────────────────────────────
//
// resolveMergeHint: returns the appropriate hint string for the given mode.
//   mode "slot"  → newHint (for slot-drop / merge-generate prompt)
//   mode "card"  → cardHint when defined, otherwise falls back to newHint
//
// Supports template variables in cardHint / newHint:
//   {sourceData}        — serialized source element data
//   {brandName}         — brand name from the brief
//   {brandDescription}  — brand description from the brief

export function resolveMergeHint(
  mode: "slot" | "card",
  sourceId: string,
  targetId: string,
  vars?: MergeHintTemplateVars,
): string {
  const spec = MERGE_SPECS[sourceId]?.[targetId];
  if (!spec) return "Combine cards";
  const useCardHint = mode === "card" && typeof spec.cardHint === "string" && spec.cardHint.trim().length > 0;
  const template = useCardHint ? spec.cardHint! : spec.newHint;
  const resolved = applyMergeHintTemplateVars(template, vars);
  return coalesceMergeHint(resolved, "Combine cards");
}

/**
 * User-visible merge hint for a drop scenario. Uses newHintNote / cardHintNote when set; otherwise
 * the same resolution as resolveMergeHint (model-facing newHint / cardHint).
 */
export function resolveMergeUiHint(
  mode: "slot" | "card",
  sourceId: string,
  targetId: string,
  vars?: MergeHintTemplateVars,
): string {
  const spec = MERGE_SPECS[sourceId]?.[targetId];
  if (!spec) return "Combine cards";
  if (mode === "slot") {
    const note = spec.newHintNote;
    if (typeof note === "string" && note.trim().length > 0) {
      return coalesceMergeHint(applyMergeHintTemplateVars(note, vars), "Combine cards");
    }
    return resolveMergeHint("slot", sourceId, targetId, vars);
  }
  const note = spec.cardHintNote;
  if (typeof note === "string" && note.trim().length > 0) {
    return coalesceMergeHint(applyMergeHintTemplateVars(note, vars), "Combine cards");
  }
  return resolveMergeHint("card", sourceId, targetId, vars);
}

// ── Source data formatter ─────────────────────────────────────────────────────
//
// Serializes a source variation's data into the {sourceData} template variable
// used by resolveMergeHint in card-to-card mode.

export function formatSourceForHint(sourceId: string, data: unknown): string {
  switch (sourceId) {
    case "color-palette":
      return Array.isArray(data) ? (data as string[]).join(", ") : "";
    case "font": {
      const f = data as { titleFont?: string; bodyFont?: string } | null;
      return [f?.titleFont, f?.bodyFont].filter(Boolean).join(", ");
    }
    default:
      return "";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Visual Designer prompt builders (moved from visual-designer-prompts.ts)
// ─────────────────────────────────────────────────────────────────────────────

export type DesignerRouteKey =
  | "extract-palette"
  | "vision-merge"
  | "comment-modify"
  | "merge";

export const MERGE_TEMPERATURES: Record<DesignerRouteKey, number> = {
  "extract-palette": 0.7,
  "vision-merge": 0.7,
  "comment-modify": 0.4,
  "merge": 0.4,
};

export const COMMENT_MODIFY_FIELDS: Record<string, string[]> = {
  "color-palette": ["colorPalette"],
  "font": ["font.titleFont", "font.bodyFont"],
};

const RETURN_FORMATS: Record<string, string> = {
  font:
    '{"font": {"titleFont": "Google Font Name", "bodyFont": "Google Font Name"}}',
  colorPalette:
    '{"colorPalette": ["#RRGGBB", "#RRGGBB", "#RRGGBB"]}',
};

export function getReturnFormatForField(
  targetField: string,
  fallbackValue: unknown,
): string {
  return RETURN_FORMATS[targetField] ?? JSON.stringify({ [targetField]: fallbackValue });
}

export function getDesignerRules(_route: DesignerRouteKey): string[] {
  return [RULE_OUTPUT_JSON];
}

// ── Context pruner ───────────────────────────────────────────────────────────
// White-list serializer: keeps only the fields the LLM actually needs and
// caps total length to avoid token bloat from raw JSON.stringify.

const MAX_FALLBACK_LENGTH = 500;

export function pruneContextForPrompt(fieldName: string, data: unknown): string {
  if (data === null || data === undefined) return "null";

  switch (fieldName) {
    case "font": {
      if (isRecord(data)) {
        const { titleFont, bodyFont } = data as { titleFont?: string; bodyFont?: string };
        return JSON.stringify({ titleFont: titleFont ?? "", bodyFont: bodyFont ?? "" });
      }
      break;
    }
    case "colorPalette": {
      if (Array.isArray(data)) {
        return JSON.stringify(data.slice(0, 5));
      }
      break;
    }
  }

  const raw = JSON.stringify(data);
  if (raw.length <= MAX_FALLBACK_LENGTH) return raw;
  return raw.slice(0, MAX_FALLBACK_LENGTH) + "…";
}

export type BuildMergeJsonPromptOptions = {
  /** Omit "Current {targetField}: …" from context (palette↔font cross-influence uses source only). */
  omitCurrentTargetInContext?: boolean;
};

export function buildMergeJsonPrompt(
  instruction: string,
  sourceData: unknown,
  targetField: string,
  targetData: unknown,
  mergeBoardAppendix?: string,
  options?: BuildMergeJsonPromptOptions,
): string {
  const format = getReturnFormatForField(targetField, targetData);
  const sourceLine = `Source data: ${pruneContextForPrompt(targetField, sourceData)}`;
  let contextBody = options?.omitCurrentTargetInContext
    ? sourceLine
    : `${sourceLine}\nCurrent ${targetField}: ${pruneContextForPrompt(targetField, targetData)}`;
  if (mergeBoardAppendix?.trim()) {
    contextBody += `\n${mergeBoardAppendix.trim()}`;
  }
  return buildPrompt({
    taskDescription: `${instruction}\nReturn JSON with this exact structure:\n${format}`,
    contextBody,
    rules: getDesignerRules("merge"),
  });
}

export function buildCommentModifyPrompt(
  targetField: string,
  targetData: unknown,
  comment: string,
): string {
  const format = getReturnFormatForField(targetField, targetData);
  return buildPrompt({
    taskDescription: `Apply the user instruction to ${targetField}. Preserve intent while keeping output brand-coherent.\nReturn JSON with this exact structure:\n${format}`,
    contextBody: `User instruction: "${comment}"\nCurrent ${targetField}: ${pruneContextForPrompt(targetField, targetData)}`,
    rules: getDesignerRules("comment-modify"),
  });
}

export function buildVisionMergePrompt(
  instruction: string,
  targetField: string,
  targetData: unknown,
  mergeBoardAppendix?: string,
): string {
  const format = getReturnFormatForField(targetField, targetData);
  let contextBody = `Current ${targetField}: ${pruneContextForPrompt(targetField, targetData)}`;
  if (mergeBoardAppendix?.trim()) {
    contextBody += `\n${mergeBoardAppendix.trim()}`;
  }
  return buildPrompt({
    taskDescription: `${instruction}\nAnalyze the provided source image and update the target field.\nReturn JSON with this exact structure:\n${format}`,
    contextBody,
    rules: getDesignerRules("vision-merge"),
  });
}

// ── Edit image prompt builder ─────────────────────────────────────────────────
// Consolidates the branching logic previously inline in the /edit route.

export interface EditPromptOpts {
  newHint?: string;
  hasPaletteImage: boolean;
  hasReferenceImage: boolean;
  colorPaletteHex?: string[];
  cardType?: string;
  brandName?: string;
  tagline?: string;
}

export function buildEditImagePrompt(opts: EditPromptOpts): string {
  const hint = opts.newHint ?? "Edit this image";
  let prompt: string;

  if (opts.hasPaletteImage) {
    prompt = `Recolor the second image using the color scheme of the first image.`;
  } else if (opts.hasReferenceImage) {
    prompt = `${hint}. Use the first image as reference, edit the second image accordingly.`;
  } else if (opts.colorPaletteHex?.length) {
    prompt = `${hint}. Use colors: ${opts.colorPaletteHex.join(", ")}`;
  } else {
    prompt = `Edit the image: ${hint}.`;
  }

  if (opts.cardType === "application" && opts.hasReferenceImage && (opts.brandName || opts.tagline)) {
    const textGuard: string[] = [];
    if (opts.brandName) {
      textGuard.push(`Keep any visible brand name/wordmark text exactly as "${opts.brandName}".`);
    }
    if (opts.tagline) {
      textGuard.push(`If visible, keep tagline text exactly as "${opts.tagline}".`);
    }
    textGuard.push("Do not alter letterforms, spelling, wording, or text layout.");
    prompt = `${prompt}. ${textGuard.join(" ")}`;
  }

  return prompt;
}

export function buildExtractPalettePrompt(
  instruction: string,
  currentPalette?: string[],
  options?: { omitPaletteConstraint?: boolean },
): string {
  if (options?.omitPaletteConstraint) {
    return buildPrompt({
      taskDescription: `${instruction.trim()}\nReturn JSON with this exact structure:\n${RETURN_FORMATS.colorPalette}`,
      rules: getDesignerRules("extract-palette"),
    });
  }
  const paletteConstraint = Array.isArray(currentPalette) && currentPalette.length > 0
    ? `Current color scheme (${currentPalette.length} colors): ${currentPalette.join(", ")}. Extract exactly ${currentPalette.length} colors and preserve a similar contrast hierarchy.`
    : "Extract a cohesive palette of 3 to 5 hex colors.";
  return buildPrompt({
    taskDescription: `${instruction}\n${paletteConstraint}\nReturn JSON with this exact structure:\n${RETURN_FORMATS.colorPalette}`,
    rules: getDesignerRules("extract-palette"),
  });
}

// ── Source text data formatter ────────────────────────────────────────────────
// Serializes a source element's data into an inline prompt snippet (with
// leading separator) for use by buildMergeGeneratePrompt in the /merge-generate route.
// Distinct from formatSourceForHint which targets the {sourceData} template var.

export function formatSourceTextData(sourceId: string | undefined, data: unknown): string {
  if (data === undefined || data === null) return "";
  switch (sourceId) {
    case "color-palette":
      return Array.isArray(data) ? `, palette: [${data.join(", ")}]` : "";
    case "font": {
      const f = data as Record<string, unknown>;
      const parts = [f.titleFont, f.bodyFont].filter(Boolean).join(" / ");
      return parts ? `, typography: ${parts}` : "";
    }
    default:
      return "";
  }
}

// ── Concise prompt builder ────────────────────────────────────────────────────
// Builds a short, structured prompt from a merge hint + optional source data
// + optional brand context snippet. Legacy helper; /merge-generate uses buildMergeGeneratePrompt.

export function buildMergeHintAndSourceSnippet(
  newHint: string,
  sourceId?: string,
  sourceTextData?: unknown,
): string {
  const snippet = formatSourceTextData(sourceId, sourceTextData);
  return snippet ? `${newHint}${snippet}` : newHint;
}

/** Blank line between merge-generate prompt segments (hint / active board / visual concept). */
const MERGE_GENERATE_SEGMENT_JOINER = "\n\n";

/**
 * Unified prompt for POST /merge-generate (queue-slot image merge).
 * Three segments joined with blank lines: hint → active board slots → visual concept.
 * When `refImageGuide` is set, it is prefixed to the hint segment (still counts as one segment).
 */
export function buildMergeGeneratePrompt(args: {
  newHint: string;
  sourceId?: string;
  sourceTextData?: unknown;
  board: MergeBoardPromptContext;
  /** Passed through to board formatting (e.g. omit URLs when images are inline). */
  boardFormat?: FormatMergeBoardOptions;
  /** Optional; merged into the hint segment. Should describe ref image order (API sends images before this text). */
  refImageGuide?: string;
}): string {
  const hintCore = buildMergeHintAndSourceSnippet(args.newHint, args.sourceId, args.sourceTextData);
  const head = args.refImageGuide?.trim()
    ? `${args.refImageGuide.trim()} ${hintCore}`
    : hintCore;
  const parts: string[] = [head];

  const activeElementsText = formatMergeBoardPromptContext(args.board, {
    includeVisualConcept: false,
    includeBoardElements: true,
    boardElementJoiner: "\n",
    ...args.boardFormat,
  });
  if (activeElementsText) parts.push(activeElementsText);

  const visualConceptText = formatVisualConceptPromptLine(args.board);
  if (visualConceptText) parts.push(visualConceptText);

  return parts.filter((p) => p.length > 0).join(MERGE_GENERATE_SEGMENT_JOINER);
}

/** Queue-slot merge-generate: color-palette → logo | art-style (structured brief + 【Visual Concept】 + active slots). */
/** Queue-slot merge when dragging the palette onto logo or art-style (structured brief + VC + active slots). */
export function isMergeGenerateColorPaletteStructuredSlot(
  sourceId: string | undefined,
  cardType: string,
): boolean {
  return sourceId === "color-palette" && (cardType === "logo" || cardType === "art-style");
}

/** @deprecated Use isMergeGenerateColorPaletteStructuredSlot (same behavior for logo). */
export function isMergeGenerateColorPaletteToLogo(
  sourceId: string | undefined,
  cardType: string,
): boolean {
  return isMergeGenerateColorPaletteStructuredSlot(sourceId, cardType) && cardType === "logo";
}

/** Structured sections for palette → logo or palette → art-style (matches explicit VC block like palette → logo). */
export function buildMergeGeneratePromptColorPaletteStructured(args: {
  taskLine: string;
  board: MergeBoardPromptContext;
  brandCoreText: string;
  boardFormat?: FormatMergeBoardOptions;
}): string {
  const activeElements = formatMergeBoardPromptContext(args.board, {
    includeVisualConcept: false,
    includeBoardElements: true,
    boardElementJoiner: "\n",
    ...args.boardFormat,
  });
  const vcLine = formatVisualConceptPromptLine(args.board);
  return [
    args.taskLine.trim(),
    "",
    "【BrandBriefCore】",
    args.brandCoreText.trim(),
    "",
    "【Visual Concept】",
    vcLine.trim(),
    "",
    "【Active Element】",
    activeElements.trim(),
    "",
    "---",
  ].join("\n");
}

/** @deprecated Use buildMergeGeneratePromptColorPaletteStructured. */
export const buildMergeGeneratePromptColorPaletteToLogo = buildMergeGeneratePromptColorPaletteStructured;

export function buildConcisePrompt(
  newHint: string,
  sourceId?: string,
  sourceTextData?: unknown,
  brandContext?: string,
): string {
  const head = buildMergeHintAndSourceSnippet(newHint, sourceId, sourceTextData);
  if (!brandContext) return head;
  return `${head}. ${brandContext}`;
}
