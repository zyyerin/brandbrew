import type { MutableRefObject } from "react";
import type { ProjectData, ElementId, Variation, VariationMeta, VariationSource, ImageElementData, FontData, ColorPaletteData, VisualConceptData } from "../types/project";
import { getActiveElementData, getCheckedElementData } from "../types/project";
import type { BrandContextShort, MergeBoardPromptContext } from "@server-shared/types.tsx";
import type { DebugInterceptor } from "../hooks/usePipelineDebugger";

// ── Merge API context type ───────────────────────────────────────────────────

export interface MergeBrandContext {
  brandBrief?: { name: string; tagline: string; description: string };
  targetAudience?: string;
  keywords?: string[];
  visualConcept?: VisualConceptData | null;
  artStyle?: ImageElementData | null;
  colorPalette?: ColorPaletteData | null;
  font?: FontData | null;
  logoInspiration?: ImageElementData | null;
}

export interface MergeResult {
  patch: Partial<MergeBrandContext> | null;
  _meta?: VariationMeta;
}

// ── Shared base params type for generation sub-hooks ────────────────────────
// Standalone definition to avoid circular imports with useBrandGeneration.ts

export interface UseGenerationBaseParams {
  projectRef: MutableRefObject<ProjectData>;
  setProject: React.Dispatch<React.SetStateAction<ProjectData>>;
  generationCounterRef: MutableRefObject<number>;
  debugInterceptor?: DebugInterceptor;
}

// ── Project mutation helpers ─────────────────────────────────────────────────

export function addVariationToProject(
  prev: ProjectData,
  elementId: ElementId,
  variation: Variation,
  setActive = true,
): ProjectData {
  const slot = prev.elements[elementId];
  return {
    ...prev,
    elements: {
      ...prev.elements,
      [elementId]: {
        ...slot,
        variations: [variation, ...slot.variations],
        activeVariationId: setActive ? variation.id : slot.activeVariationId,
      },
    },
  };
}

/** Avoid duplicate queue cards when merge API returns the same payload as an existing variation. */
export function projectHasEquivalentVariation(
  elements: ProjectData["elements"],
  elementId: ElementId,
  data: unknown,
): boolean {
  const slot = elements[elementId];
  if (!slot?.variations?.length) return false;
  const key = JSON.stringify(data);
  return slot.variations.some((v) => JSON.stringify(v.data) === key);
}

// ── Variation factory ────────────────────────────────────────────────────────

export function createVariation(opts: {
  prefix: string;
  data: unknown;
  source: VariationSource;
  meta?: VariationMeta;
  counterRef: MutableRefObject<number>;
}): Variation {
  const count = opts.counterRef.current++;
  return {
    id: `${opts.prefix}-${Date.now()}-${count}`,
    data: opts.data,
    source: opts.source,
    createdAt: new Date(),
    meta: opts.meta,
  };
}

/** Creates a variation and adds it to the project, skipping if an identical one already exists. */
export function addVariationIfNew(
  setProject: React.Dispatch<React.SetStateAction<ProjectData>>,
  elementId: ElementId,
  variation: Variation,
): void {
  setProject((prev) =>
    projectHasEquivalentVariation(prev.elements, elementId, variation.data)
      ? prev
      : addVariationToProject(prev, elementId, variation),
  );
}

// ── Merge context helpers ────────────────────────────────────────────────────

/** Constructs the brand context payload required by merge/comment API endpoints. */
export function buildFullBrandContext(p: ProjectData): MergeBrandContext {
  const brief = p.brandBrief.current;
  return {
    brandBrief: { name: brief.name, tagline: brief.tagline, description: brief.description },
    targetAudience: brief.targetAudience,
    keywords: brief.keywords,
    visualConcept: getActiveElementData(p.elements, "visual-concept"),
    artStyle: getActiveElementData(p.elements, "art-style"),
    colorPalette: getActiveElementData(p.elements, "color-palette"),
    font: getActiveElementData(p.elements, "font"),
    logoInspiration: getActiveElementData(p.elements, "logo"),
  };
}

/**
 * Merge/comment API context: only checked (snapshot-selected) cards are included.
 * Unchecked slots omit their payload so active-but-unchecked cards do not leak into prompts.
 */
export function buildMergeFullBrandContext(p: ProjectData): MergeBrandContext {
  const brief = p.brandBrief.current;
  return {
    brandBrief: { name: brief.name, tagline: brief.tagline, description: brief.description },
    targetAudience: brief.targetAudience,
    keywords: brief.keywords,
    visualConcept: getCheckedElementData(p.elements, "visual-concept"),
    artStyle: getCheckedElementData(p.elements, "art-style"),
    colorPalette: getCheckedElementData(p.elements, "color-palette"),
    font: getCheckedElementData(p.elements, "font"),
    logoInspiration: getCheckedElementData(p.elements, "logo"),
  };
}

/**
 * Board snapshot for merge-generate prompts: checked visual concept + four visual slots.
 * Excludes merge target/source slots so the model is not double-fed the same card.
 */
export function buildMergeBoardPromptContext(
  p: ProjectData,
  opts: { excludeTarget: ElementId; excludeSource?: ElementId },
): MergeBoardPromptContext {
  const boardElements: MergeBoardPromptContext["boardElements"] = {
    artStyle: getCheckedElementData(p.elements, "art-style") ?? undefined,
    colorPalette: getCheckedElementData(p.elements, "color-palette") ?? undefined,
    font: getCheckedElementData(p.elements, "font") ?? undefined,
    logoInspiration: getCheckedElementData(p.elements, "logo") ?? undefined,
  };

  const excluded = [opts.excludeTarget, opts.excludeSource].filter(
    (x): x is ElementId => x !== undefined,
  );
  for (const cardId of excluded) {
    if (cardId === "art-style") boardElements.artStyle = undefined;
    else if (cardId === "color-palette") boardElements.colorPalette = undefined;
    else if (cardId === "font") boardElements.font = undefined;
    else if (cardId === "logo") boardElements.logoInspiration = undefined;
  }

  const vc = getCheckedElementData(p.elements, "visual-concept") as VisualConceptData | null;
  return {
    visualConcept: vc
      ? { concept: vc.concept, description: vc.description ?? "" }
      : undefined,
    boardElements,
  };
}

/** Builds the compact context payload used by visual-designer image routes. */
export function buildShortBrandContext(
  p: ProjectData,
  overrides?: Partial<BrandContextShort>,
): BrandContextShort {
  const brief = p.brandBrief.current;
  const visualConcept = getActiveElementData(p.elements, "visual-concept");
  const colorPalette = getActiveElementData(p.elements, "color-palette");
  const font = getActiveElementData(p.elements, "font");
  return {
    name: brief.name || undefined,
    tagline: brief.tagline || undefined,
    keywords: brief.keywords,
    visualConcept: visualConcept ?? undefined,
    colorPalette: colorPalette ?? undefined,
    titleFont: font?.titleFont,
    bodyFont: font?.bodyFont,
    application: brief.applications?.[0],
    ...overrides,
  };
}

/** Short image-route context for merge comment-edit: checked slots only (plus brief fields). */
export function buildMergeShortBrandContext(
  p: ProjectData,
  overrides?: Partial<BrandContextShort>,
): BrandContextShort {
  const brief = p.brandBrief.current;
  const visualConcept = getCheckedElementData(p.elements, "visual-concept");
  const colorPalette = getCheckedElementData(p.elements, "color-palette");
  const font = getCheckedElementData(p.elements, "font");
  return {
    name: brief.name || undefined,
    tagline: brief.tagline || undefined,
    keywords: brief.keywords,
    visualConcept: visualConcept ?? undefined,
    colorPalette: colorPalette ?? undefined,
    titleFont: font?.titleFont,
    bodyFont: font?.bodyFont,
    application: brief.applications?.[0],
    ...overrides,
  };
}

/**
 * Brief-only context: brand identity without active element data.
 * Prevents active visual-concept / palette / font from leaking into
 * prompts where they would over-constrain the output (add-variation,
 * merge slot-drop, etc.).
 */
export function buildBriefOnlyContext(p: ProjectData): BrandContextShort {
  const brief = p.brandBrief.current;
  return {
    name: brief.name || undefined,
    tagline: brief.tagline || undefined,
    keywords: brief.keywords,
    application: brief.applications?.[0],
  };
}

/** @deprecated Use buildFullBrandContext instead. */
export function buildMergeContext(p: ProjectData): MergeBrandContext {
  return buildFullBrandContext(p);
}

export function extractMergeData(elementId: ElementId, patch: Partial<MergeBrandContext>): unknown {
  const map: Record<ElementId, keyof MergeBrandContext> = {
    "visual-concept": "visualConcept",
    "art-style": "artStyle",
    "color-palette": "colorPalette",
    "font": "font",
    "logo": "logoInspiration",
  };
  return patch[map[elementId]] ?? null;
}
