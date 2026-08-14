/**
 * Unified project data model.
 *
 * Replaces the old flat BrandData, parallel tracking maps (originalCardData,
 * originalCardMeta, cardTimestamps, activeVariationByCard, checkedVariationIds),
 * SnapshotBvi, and GeneratedCardItem with a layered architecture:
 *
 *   ProjectData
 *   ├── brandBrief     (strategic layer — versioned text)
 *   ├── elements        (visual layer — per-element variation slots)
 *   ├── snapshots       (composition layer — frozen element selections → image)
 *   └── direction       (output layer — bound to a snapshot)
 */

// ── Element identifiers ─────────────────────────────────────────────────────

export type ElementId =
  | "visual-concept"
  | "art-style"
  | "color-palette"
  | "font"
  | "logo";

export const ALL_ELEMENT_IDS: readonly ElementId[] = [
  "visual-concept",
  "art-style",
  "color-palette",
  "font",
  "logo",
] as const;

export const IMAGE_ELEMENT_IDS: ReadonlySet<ElementId> = new Set([
  "logo",
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
};

// ── Brand Brief ─────────────────────────────────────────────────────────────

export interface BrandBriefData {
  name: string;
  tagline: string;
  description: string;
  targetAudience: string;
  keywords: string[];
  /** Brand touchpoint mockup ideas (e.g. "Coffee Sleeve", "Loyalty Card"). */
  applications: string[];
}

export interface BrandBriefVersion {
  id: string;
  data: BrandBriefData;
  createdAt: Date;
}

export interface BrandBriefState {
  current: BrandBriefData;
  versions: BrandBriefVersion[];
}

export const EMPTY_BRAND_BRIEF: BrandBriefData = {
  name: "",
  tagline: "",
  description: "",
  targetAudience: "",
  keywords: [],
  applications: [],
};

// ── Per-element data shapes ─────────────────────────────────────────────────

export interface VisualConceptData {
  concept: string;
  description: string;
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
};

/** Slots covered by ActiveElementData (board visuals only; excludes visual-concept). */
export type ActiveElementDataElementId = Exclude<ElementId, "visual-concept">;

/**
 * Active variation payloads for those slots except `Self` (sparse).
 * `Self = never` → all four: art-style, color-palette, font, logo.
 */
export type ActiveElementData<Self extends ActiveElementDataElementId | never = never> = {
  [K in Exclude<ActiveElementDataElementId, Self>]?: ElementDataMap[K];
};

// ── Variation ID (semantic alias) ───────────────────────────────────────────

export type VariationId = string;

// ── Generation metadata (per variation) ─────────────────────────────────────

export interface VariationMeta {
  prompt?: string;
  ingredients?: string[];
  generationTime?: number;
  model?: string;
  /** Which AI agent role handled the generation (e.g. "art-director", "brand-strategist"). */
  agent?: string;
  /** Direct user input that triggered this generation (brand description or comment). */
  userInput?: string;
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
  /** Add variation 来源类型 */
  addVariationSource?: "from-variation" | "original-brand";
  /** 当 addVariationSource 为 from-variation 时，来源 variation 的 id */
  sourceVariationId?: string;
  /** The visual-concept variation that drove this element's generation (for noodle connections). */
  sourceConceptVariationId?: string;
  /** Art Director's structured choice for the generated logo lockup. */
  logoComposition?: import("@server-shared/logo-prompts.ts").LogoComposition;
  /** Cached structured inputs from pipeline stages for reuse in no-target merges. */
  pipelineSeed?: {
    visualConcept?: VisualConceptData;
    colorPalette?: ColorPaletteData;
    font?: FontData;
    logoComposition?: import("@server-shared/logo-prompts.ts").LogoComposition;
    application?: string;
  };
}

// ── Variation ───────────────────────────────────────────────────────────────

export type VariationSource = "initial" | "add-variation" | "edit" | "merge" | "comment" | "user-upload";

export interface Variation<T = unknown> {
  id: string;
  data: T;
  source: VariationSource;
  createdAt: Date;
  meta?: VariationMeta;
}

// ── Element slot ────────────────────────────────────────────────────────────

export interface ElementSlot<T = unknown> {
  variations: Variation<T>[];
  activeVariationId: string | null;
  checkedVariationId: string | null;
  /** Custom display order (array of variation IDs). If absent, falls back to createdAt DESC. */
  variationOrder?: string[];
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
  sourceBriefVerId: string | null;
  generationMeta?: SnapshotGenerationMeta;
}

// ── Direction ───────────────────────────────────────────────────────────────

export interface DirectionCache {
  rationales: {
    logo: string;
    color: string;
    typography: string;
    artStyle: string;
  };
  colorNames: { hex: string; name: string }[];
  logoImageUrl?: string;
  brandInContextDescription: string;
  contextImageUrls?: Array<string | null>;
  /** AI-generated paragraph expanding on the visual concept. Always present after direction generation. */
  visualConceptContent?: string;
  /** Frozen concept name used by direction page to avoid live variation drift. */
  visualConceptName?: string;
  /** Synthesized concept name when direction is generated without an active visual concept. */
  synthesizedVisualConcept?: string;
}

export interface DirectionVersion {
  id: string;
  label: string;
  createdAt: Date;
  boundSnapshotId: string | null;
  snapshotImageUrl?: string;
  cache?: DirectionCache;
}

export interface DirectionState {
  versions: DirectionVersion[];
  activeVersionId: string | null;
}

// ── Phase & Route ───────────────────────────────────────────────────────────

export type ProjectPhase = "empty" | "curating";

export type AppRoute = "board" | "direction";

export type PipelineStage =
  | "conceptualizing"
  | "styling"
  | "drawing"
  | "synthesizing"
  | null;

// ── ProjectData (top-level) ─────────────────────────────────────────────────

export interface ProjectData {
  projectName: string;
  phase: ProjectPhase;
  brandBrief: BrandBriefState;
  elements: ElementsState;
  snapshots: SnapshotItem[];
  selectedSnapshotId: string | null;
  direction: DirectionState;
}

export function createEmptyProject(name = "Brand Brew Project"): ProjectData {
  return {
    projectName: name,
    phase: "empty",
    brandBrief: {
      current: { ...EMPTY_BRAND_BRIEF },
      versions: [],
    },
    elements: createEmptyElements(),
    snapshots: [],
    selectedSnapshotId: null,
    direction: { versions: [], activeVersionId: null },
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

/** Parse visual-concept slot data from a snapshot or legacy string shape. */
function parseVisualConceptRaw(raw: unknown): VisualConceptData | undefined {
  if (raw && typeof raw === "object" && "concept" in (raw as Record<string, unknown>)) {
    const o = raw as { concept?: unknown; description?: unknown };
    const c = typeof o.concept === "string" ? o.concept.trim() : "";
    if (!c) return undefined;
    const d = typeof o.description === "string" ? o.description : "";
    return { concept: c, description: d };
  }
  if (typeof raw === "string") {
    const c = raw.trim();
    if (!c) return undefined;
    return { concept: c, description: "" };
  }
  return undefined;
}

/**
 * For brand-direction generation: prefer the live active visual concept on the board;
 * if none (or empty concept), use the snapshot-frozen variation; otherwise undefined so the API can synthesize from imagery.
 */
export function resolveVisualConceptForDirection(
  elements: ElementsState,
  snapshotConceptRaw: unknown | undefined,
): VisualConceptData | undefined {
  const active = getActiveElementData(elements, "visual-concept");
  const activeConcept =
    active && typeof active.concept === "string" ? active.concept.trim() : "";
  if (activeConcept) {
    return {
      concept: activeConcept,
      description: active && typeof active.description === "string" ? active.description : "",
    };
  }
  return parseVisualConceptRaw(snapshotConceptRaw);
}

export function getVariationDataById<K extends ElementId>(
  elements: ElementsState,
  elementId: K,
  variationId: string,
): ElementDataMap[K] | null {
  const slot = elements[elementId] as ElementSlot<ElementDataMap[K]>;
  const v = slot.variations.find((x) => x.id === variationId);
  return v?.data ?? null;
}

export function getCheckedVariation<K extends ElementId>(
  elements: ElementsState,
  elementId: K,
): Variation<ElementDataMap[K]> | null {
  const slot = elements[elementId] as ElementSlot<ElementDataMap[K]>;
  if (!slot.checkedVariationId) return null;
  return slot.variations.find((v) => v.id === slot.checkedVariationId) ?? null;
}

/** Checked card payload for snapshot selection; null if the slot has no checked variation. */
export function getCheckedElementData<K extends ElementId>(
  elements: ElementsState,
  elementId: K,
): ElementDataMap[K] | null {
  return getCheckedVariation(elements, elementId)?.data ?? null;
}

export function resolveSnapshotData(
  project: ProjectData,
  snapshotId: string,
): {
  snapshot: SnapshotItem;
  brandBrief: BrandBriefData;
  elementData: Partial<Record<ElementId, unknown>>;
} | null {
  const snapshot = project.snapshots.find((s) => s.id === snapshotId);
  if (!snapshot) return null;

  const briefVer = snapshot.sourceBriefVerId
    ? project.brandBrief.versions.find(
        (v) => v.id === snapshot.sourceBriefVerId,
      )
    : null;
  const brandBrief = briefVer?.data ?? project.brandBrief.current;

  const elementData: Partial<Record<ElementId, unknown>> = {};
  for (const [elemId, varId] of Object.entries(snapshot.sourceSelections)) {
    const slot = project.elements[elemId as ElementId];
    if (!slot) continue;
    const variation = slot.variations.find((v) => v.id === varId);
    if (variation) elementData[elemId as ElementId] = variation.data;
  }

  return { snapshot, brandBrief, elementData };
}
