/**
 * Unified project data model.
 *
 * Replaces the old flat BrandData, parallel tracking maps (originalCardData,
 * originalCardMeta, cardTimestamps, activeVariationByCard, checkedVariationIds),
 * SnapshotBvi, and GeneratedCardItem with a layered architecture:
 *
 *   ProjectData
 *   ├── brandSummary   (strategic layer — versioned text)
 *   ├── elements        (visual layer — per-element variation slots)
 *   ├── snapshots       (composition layer — frozen element selections → image)
 *   └── guideline       (output layer — bound to a snapshot)
 */

// ── Element identifiers ─────────────────────────────────────────────────────

export type ElementId =
  | "visual-concept"
  | "art-style"
  | "color-palette"
  | "font"
  | "logo"
  | "layout";

export const ALL_ELEMENT_IDS: readonly ElementId[] = [
  "visual-concept",
  "art-style",
  "color-palette",
  "font",
  "logo",
  "layout",
] as const;

export const IMAGE_ELEMENT_IDS: ReadonlySet<ElementId> = new Set([
  "logo",
  "layout",
  "art-style",
]);

export const STRATEGIC_ELEMENT_IDS: readonly ElementId[] = [
  "visual-concept",
  "color-palette",
  "font",
] as const;

export const ELEMENT_LABELS: Record<ElementId, string> = {
  "visual-concept": "Visual Concept",
  "art-style": "Art Style",
  "color-palette": "Color Palette",
  "font": "Typography",
  "logo": "Logo",
  "layout": "Layout",
};

// ── Brand Summary ───────────────────────────────────────────────────────────

export interface BrandSummaryData {
  name: string;
  tagline: string;
  description: string;
  targetAudience: string;
  keywords: string[];
}

export interface BrandSummaryVersion {
  id: string;
  data: BrandSummaryData;
  createdAt: Date;
}

export interface BrandSummaryState {
  current: BrandSummaryData;
  versions: BrandSummaryVersion[];
}

export const EMPTY_BRAND_SUMMARY: BrandSummaryData = {
  name: "",
  tagline: "",
  description: "",
  targetAudience: "",
  keywords: [],
};

// ── Per-element data shapes ─────────────────────────────────────────────────

export interface VisualConceptData {
  conceptName: string;
  points: string[];
}

/** @deprecated Art style is now image-based (ImageElementData). Kept for legacy migration. */
export interface ArtStyleData {
  styleName: string;
  medium: string;
  moodWords: string[];
  artDirection: string;
}

export interface FontData {
  titleFont: string;
  bodyFont: string;
}

export interface ImageElementData {
  imageUrl: string;
}

export type ColorPaletteData = string[];

export type ElementDataMap = {
  "visual-concept": VisualConceptData;
  "art-style": ImageElementData;
  "color-palette": ColorPaletteData;
  "font": FontData;
  "logo": ImageElementData;
  "layout": ImageElementData;
};

// ── Generation metadata (kept from old CardMeta) ────────────────────────────

export interface CardMeta {
  prompt?: string;
  ingredients?: string[];
  generationTime?: number;
  model?: string;
  /** Set when this variation was created by the user editing another variation. */
  editedFromLabel?: string;
  /** Distinguishes user-uploaded variations from AI-generated ones. */
  source?: "user-upload";
  /** Input images used for generation (e.g. reference images, source image for edit). */
  referenceImageUrls?: string[];
  /** Base64 data URL of palette swatch image used as input. */
  paletteImageDataUrl?: string;
  /** Human-readable labels for selected element inputs (e.g. "Color Palette", "Art Style"). */
  selectedElementLabels?: string[];
}

// ── Variation ───────────────────────────────────────────────────────────────

export type VariationSource = "initial" | "regenerate" | "edit" | "merge" | "comment" | "user-upload";

export interface Variation<T = unknown> {
  id: string;
  data: T;
  source: VariationSource;
  createdAt: Date;
  meta?: CardMeta;
}

// ── Element slot ────────────────────────────────────────────────────────────

export interface ElementSlot<T = unknown> {
  variations: Variation<T>[];
  activeVariationId: string | null;
  checkedVariationId: string | null;
}

export type ElementsState = {
  [K in ElementId]: ElementSlot<ElementDataMap[K]>;
};

export function createEmptySlot<T>(): ElementSlot<T> {
  return { variations: [], activeVariationId: null, checkedVariationId: null };
}

export function createEmptyElements(): ElementsState {
  return {
    "visual-concept": createEmptySlot<VisualConceptData>(),
    "art-style": createEmptySlot<ImageElementData>(),
    "color-palette": createEmptySlot<ColorPaletteData>(),
    "font": createEmptySlot<FontData>(),
    "logo": createEmptySlot<ImageElementData>(),
    "layout": createEmptySlot<ImageElementData>(),
  };
}

// ── Snapshot ────────────────────────────────────────────────────────────────

export interface SnapshotGenerationMeta {
  prompt?: string;
  model?: string;
  referenceImageUrls?: string[];
  hasPalette?: boolean;
  paletteImageDataUrl?: string;
  selectedElementLabels?: string[];
}

export interface SnapshotItem {
  id: string;
  imageUrl: string;
  createdAt: Date;
  sourceSelections: Partial<Record<ElementId, string>>;
  sourceBrandSummaryVerId: string | null;
  generationMeta?: SnapshotGenerationMeta;
}

// ── Guideline ───────────────────────────────────────────────────────────────

export interface GuidelineCache {
  rationales: {
    logo: string;
    color: string;
    typography: string;
    artStyle: string;
  };
  colorNames: { hex: string; name: string }[];
  brandInContextDescription: string;
  contextImageUrls?: string[];
  /** Synthesized from visual snapshot when guideline is generated without a visual concept. */
  synthesizedVisualConcept?: { conceptName: string; points: string[] };
}

export interface GuidelineVersion {
  id: string;
  label: string;
  createdAt: Date;
  boundSnapshotId: string | null;
  cache?: GuidelineCache;
}

export interface GuidelineState {
  versions: GuidelineVersion[];
  activeVersionId: string | null;
}

// ── Phase & Route ───────────────────────────────────────────────────────────

export type ProjectPhase = "empty" | "generating" | "curating";

export type AppRoute = "board" | "guideline" | "guideline-all";

// ── ProjectData (top-level) ─────────────────────────────────────────────────

export interface ProjectData {
  projectName: string;
  phase: ProjectPhase;
  brandSummary: BrandSummaryState;
  elements: ElementsState;
  snapshots: SnapshotItem[];
  selectedSnapshotId: string | null;
  guideline: GuidelineState;
  guidelineApplications: string[];
}

export function createEmptyProject(name = "Brand Brew Project"): ProjectData {
  return {
    projectName: name,
    phase: "empty",
    brandSummary: {
      current: { ...EMPTY_BRAND_SUMMARY },
      versions: [],
    },
    elements: createEmptyElements(),
    snapshots: [],
    selectedSnapshotId: null,
    guideline: { versions: [], activeVersionId: null },
    guidelineApplications: [],
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

export function getActiveVariation<K extends ElementId>(
  elements: ElementsState,
  elementId: K,
): Variation<ElementDataMap[K]> | null {
  const slot = elements[elementId] as ElementSlot<ElementDataMap[K]>;
  if (!slot.activeVariationId) return null;
  return slot.variations.find((v) => v.id === slot.activeVariationId) ?? null;
}

export function getActiveElementData<K extends ElementId>(
  elements: ElementsState,
  elementId: K,
): ElementDataMap[K] | null {
  return getActiveVariation(elements, elementId)?.data ?? null;
}

export function getCheckedVariation<K extends ElementId>(
  elements: ElementsState,
  elementId: K,
): Variation<ElementDataMap[K]> | null {
  const slot = elements[elementId] as ElementSlot<ElementDataMap[K]>;
  if (!slot.checkedVariationId) return null;
  return slot.variations.find((v) => v.id === slot.checkedVariationId) ?? null;
}

export function resolveSnapshotData(
  project: ProjectData,
  snapshotId: string,
): {
  snapshot: SnapshotItem;
  brandSummary: BrandSummaryData;
  elementData: Partial<Record<ElementId, unknown>>;
} | null {
  const snapshot = project.snapshots.find((s) => s.id === snapshotId);
  if (!snapshot) return null;

  const bsVer = snapshot.sourceBrandSummaryVerId
    ? project.brandSummary.versions.find(
        (v) => v.id === snapshot.sourceBrandSummaryVerId,
      )
    : null;
  const brandSummary = bsVer?.data ?? project.brandSummary.current;

  const elementData: Partial<Record<ElementId, unknown>> = {};
  for (const [elemId, varId] of Object.entries(snapshot.sourceSelections)) {
    const slot = project.elements[elemId as ElementId];
    if (!slot) continue;
    const variation = slot.variations.find((v) => v.id === varId);
    if (variation) elementData[elemId as ElementId] = variation.data;
  }

  return { snapshot, brandSummary, elementData };
}
