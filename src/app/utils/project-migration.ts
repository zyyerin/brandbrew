/**
 * Adapter functions for migrating between legacy project data shape and the
 * new ProjectData model. Used for loading old persisted projects.
 */
import type {
  ProjectData,
  ElementId,
  ElementsState,
  Variation,
  BrandBriefData,
  VisualConceptData,
  FontData,
  ImageElementData,
  ColorPaletteData,
  VariationMeta,
  SnapshotItem,
  SnapshotGenerationMeta,
} from "../types/project";
import {
  ALL_ELEMENT_IDS,
  createEmptyProject,
  createEmptySlot,
} from "../types/project";

// ── Legacy types (minimal declarations for deserialization) ──────────────────

interface LegacyBrandData {
  brandBrief?: { name: string; tagline: string; description: string };
  targetAudience?: string;
  colorPalette?: string[];
  keywords?: string[];
  visualConcept?: { conceptName: string; points: string[] };
  artStyle?: { imageUrl: string } | {
    styleName: string;
    medium: string;
    moodWords: string[];
    artDirection: string;
  };
  font?: { titleFont: string; bodyFont: string };
  logoInspiration?: { imageUrl: string };
  layout?: { imageUrl: string };
  styleReferences?: { id: string; imageUrl: string; label: string }[];
  generatedCards?: LegacyGeneratedCard[];
  /** @deprecated Use brandBrief.current.applications. Kept for reading old persisted data. */
  guidelineApplications?: string[];
  /** @deprecated Use brandBrief.current.applications. Kept for reading old persisted data. */
  directionApplications?: string[];
}

interface LegacyGeneratedCard {
  id: string;
  type: string;
  label: string;
  data: any;
  createdAt: Date | string;
  componentId?: string;
  meta?: VariationMeta;
}

interface LegacySnapshotHistoryItem {
  id: string;
  imageUrl: string;
  createdAt: Date | string;
  sourceVariationIds: string[];
  generationMeta?: SnapshotGenerationMeta;
  bvi?: Record<string, unknown>;
}

type LegacyPhase =
  | "empty"
  | "strategic"
  | "visual-loading"
  | "checkpoint"
  | "visual-complete"
  | "guideline"
  | "guideline-all"
  | "direction"
  | "direction-all"
  | "generating";

// ── Phase mapping ───────────────────────────────────────────────────────────

type RouteType = "board" | "direction";

function mapLegacyPhase(phase: string): { phase: ProjectData["phase"]; route: RouteType } {
  switch (phase) {
    case "empty":
      return { phase: "empty", route: "board" };
    case "strategic":
    case "visual-loading":
    case "checkpoint":
    case "generating":
      return { phase: "curating", route: "board" };
    case "guideline":
    case "direction":
      return { phase: "curating", route: "direction" };
    case "guideline-all":
    case "direction-all":
      return { phase: "curating", route: "direction" };
    default:
      return { phase: "curating", route: "board" };
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function extractOriginalData(
  elementId: ElementId,
  originalCardData: Record<string, unknown>,
  brandData: LegacyBrandData,
): unknown | null {
  switch (elementId) {
    case "visual-concept":
      return originalCardData.visualConcept ?? brandData.visualConcept ?? null;
    case "art-style": {
      const raw = originalCardData.artStyle ?? brandData.artStyle ?? null;
      if (raw && typeof raw === "object" && "imageUrl" in (raw as Record<string, unknown>)) return raw;
      return null;
    }
    case "color-palette":
      return originalCardData.colorPalette ?? brandData.colorPalette ?? null;
    case "font":
      return originalCardData.font ?? brandData.font ?? null;
    case "logo":
      return originalCardData.logoInspiration ?? brandData.logoInspiration ?? null;
    default:
      return null;
  }
}

function normalizeVisualConceptToObject(data: any): VisualConceptData {
  if (data && typeof data === "object" && "concept" in data) {
    return { concept: data.concept ?? "", description: data.description ?? "" };
  }
  if (typeof data === "string") {
    return { concept: data, description: "" };
  }
  if (Array.isArray(data)) {
    const [first, ...rest] = data.filter((p: unknown) => typeof p === "string" && (p as string).trim());
    return { concept: (first ?? "") as string, description: rest.join(". ") };
  }
  if (data && typeof data === "object" && "conceptName" in data) {
    const points = Array.isArray(data.points) ? data.points.filter((p: unknown) => typeof p === "string" && (p as string).trim()) : [];
    return { concept: (data.conceptName?.trim() ?? "") as string, description: points.join(". ") };
  }
  return { concept: "", description: "" };
}

function normalizeVariationData(elementId: ElementId, data: any): unknown {
  if (elementId === "color-palette") {
    if (Array.isArray(data)) return data;
    if (data?.colors && Array.isArray(data.colors)) return data.colors;
    return [];
  }
  if (elementId === "visual-concept") {
    return normalizeVisualConceptToObject(data);
  }
  return data;
}

/**
 * Normalize visual-concept variations: convert legacy formats (string, string[],
 * {conceptName, points}) into the current {concept, description} structure.
 */
function normalizeVisualConceptVariations(
  variations: any[],
  activeVariationId: string | null,
): { variations: any[]; activeVariationId: string | null } {
  const normalized: any[] = [];

  for (const v of variations) {
    normalized.push({ ...v, data: normalizeVisualConceptToObject(v.data) });
  }

  return { variations: normalized, activeVariationId };
}

// ── Legacy → ProjectData ────────────────────────────────────────────────────

export function projectDataFromLegacy(raw: Record<string, unknown>): {
  project: ProjectData;
  route: RouteType;
} {
  const d = raw as any;
  const brandData: LegacyBrandData = d.brandData ?? {};
  const originalCardData: Record<string, unknown> = d.originalCardData ?? {};
  const originalVariationMeta: Record<string, VariationMeta> = d.originalVariationMeta ?? {};
  const cardTimestamps: Record<string, string | Date> = d.cardTimestamps ?? {};
  const activeVariationByCard: Record<string, string> =
    d.activeVariationByCard ?? {};
  const checkedVariationIds: string[] = d.checkedVariationIds ?? [];
  const checkedSet = new Set(checkedVariationIds);
  const snapshotHistory: LegacySnapshotHistoryItem[] =
    d.snapshotHistory ?? [];
  const generatedCards: LegacyGeneratedCard[] =
    brandData.generatedCards ?? [];

  const { phase, route } = mapLegacyPhase(d.phase ?? "empty");

  const brandBrief: BrandBriefData = {
    name: brandData.brandBrief?.name ?? "",
    tagline: brandData.brandBrief?.tagline ?? "",
    description: brandData.brandBrief?.description ?? "",
    targetAudience: brandData.targetAudience ?? "",
    keywords: brandData.keywords ?? [],
    applications: brandData.directionApplications ?? brandData.guidelineApplications ?? [],
  };

  const elements: ElementsState = {
    "visual-concept": createEmptySlot<VisualConceptData>(),
    "art-style": createEmptySlot<ImageElementData>(),
    "color-palette": createEmptySlot<ColorPaletteData>(),
    "font": createEmptySlot<FontData>(),
    "logo": createEmptySlot<ImageElementData>(),
  };

  for (const elementId of ALL_ELEMENT_IDS) {
    const slot = elements[elementId];
    const origData = extractOriginalData(elementId, originalCardData, brandData);

    if (origData != null) {
      const ts = cardTimestamps[elementId];

      if (elementId === "visual-concept") {
        const vcData = normalizeVisualConceptToObject(origData);
        if (!vcData.concept && !vcData.description) continue;
        const variation: Variation<any> = {
          id: elementId,
          data: vcData,
          source: "initial",
          createdAt: ts ? new Date(ts as string) : new Date(0),
          meta: originalVariationMeta[elementId],
        };
        slot.variations.push(variation);
        slot.activeVariationId = elementId;
        if (checkedSet.has(elementId)) slot.checkedVariationId = elementId;
      } else {
        const variation: Variation<any> = {
          id: elementId,
          data: normalizeVariationData(elementId, origData),
          source: "initial",
          createdAt: ts ? new Date(ts as string) : new Date(0),
          meta: originalVariationMeta[elementId],
        };
        slot.variations.push(variation);
        slot.activeVariationId = elementId;
        if (checkedSet.has(elementId)) {
          slot.checkedVariationId = elementId;
        }
      }
    }

    const relatedCards = generatedCards.filter(
      (c) => c.componentId === elementId,
    );
    for (const card of relatedCards) {
      const genVarId = `gen-${card.id}`;
      if (elementId === "visual-concept") {
        const vcData = normalizeVisualConceptToObject(card.data);
        if (!vcData.concept && !vcData.description) continue;
        const variation: Variation<any> = {
          id: genVarId,
          data: vcData,
          source: card.id.startsWith("merge-") ? "merge" : card.id.startsWith("edit-") ? "edit" : "add-variation",
          createdAt: new Date(card.createdAt),
          meta: card.meta,
        };
        slot.variations.push(variation);
        if (checkedSet.has(genVarId)) slot.checkedVariationId = genVarId;
      } else {
        const variation: Variation<any> = {
          id: genVarId,
          data: normalizeVariationData(elementId, card.data),
          source: card.id.startsWith("merge-") ? "merge" : card.id.startsWith("edit-") ? "edit" : "add-variation",
          createdAt: new Date(card.createdAt),
          meta: card.meta,
        };
        slot.variations.push(variation);
        if (checkedSet.has(genVarId)) {
          slot.checkedVariationId = genVarId;
        }
      }
    }

    const activeVarId = activeVariationByCard[elementId];
    if (activeVarId && slot.variations.some((v) => v.id === activeVarId)) {
      slot.activeVariationId = activeVarId;
    }
  }

  const snapshots: SnapshotItem[] = snapshotHistory.map((s) => {
    const sourceSelections: Partial<Record<ElementId, string>> = {};
    for (const varId of s.sourceVariationIds) {
      if ((ALL_ELEMENT_IDS as readonly string[]).includes(varId)) {
        sourceSelections[varId as ElementId] = varId;
      } else if (varId.startsWith("gen-")) {
        const cardId = varId.replace(/^gen-/, "");
        const card = generatedCards.find((c) => c.id === cardId);
        if (card?.componentId && (ALL_ELEMENT_IDS as readonly string[]).includes(card.componentId)) {
          sourceSelections[card.componentId as ElementId] = varId;
        }
      }
    }

    return {
      id: s.id,
      imageUrl: s.imageUrl,
      createdAt: new Date(s.createdAt),
      sourceSelections,
      sourceBriefVerId: null,
      generationMeta: s.generationMeta,
    };
  });

  const project: ProjectData = {
    projectName: d.projectName ?? "Brand Brew Project",
    phase,
    brandBrief: {
      current: brandBrief,
      versions: [],
    },
    elements,
    snapshots,
    selectedSnapshotId: d.selectedSnapshotId ?? null,
    direction: { versions: [], activeVersionId: null },
  };

  return { project, route };
}

// ── Serialization helpers for the new ProjectData ───────────────────────────

function toISO(date: Date | string): string {
  return date instanceof Date ? date.toISOString() : date;
}

function hasBlobImageUrl(data: unknown): boolean {
  const img = (data as { imageUrl?: string } | null)?.imageUrl;
  return typeof img === "string" && img.startsWith("blob:");
}

export function serializeProjectData(project: ProjectData): Record<string, unknown> {
  const elements: Record<string, unknown> = {};
  for (const id of ALL_ELEMENT_IDS) {
    const slot = project.elements[id];
    const filteredVariations = slot.variations.filter((v) => !hasBlobImageUrl(v.data));
    const validIds = new Set(filteredVariations.map((v) => v.id));
    const activeVariationId =
      slot.activeVariationId && validIds.has(slot.activeVariationId)
        ? slot.activeVariationId
        : filteredVariations[0]?.id ?? null;
    const checkedVariationId =
      slot.checkedVariationId && validIds.has(slot.checkedVariationId)
        ? slot.checkedVariationId
        : null;
    elements[id] = {
      variations: filteredVariations.map((v) => ({
        ...v,
        createdAt: toISO(v.createdAt),
      })),
      activeVariationId,
      checkedVariationId,
    };
  }

  return {
    _version: 2,
    projectName: project.projectName,
    phase: project.phase,
    brandBrief: {
      current: project.brandBrief.current,
      versions: project.brandBrief.versions.map((v) => ({
        ...v,
        createdAt: toISO(v.createdAt),
      })),
    },
    elements,
    snapshots: project.snapshots.map((s) => ({
      ...s,
      createdAt: toISO(s.createdAt),
    })),
    selectedSnapshotId: project.selectedSnapshotId,
    direction: {
      versions: project.direction.versions.map((v) => ({
        ...v,
        createdAt: toISO(v.createdAt),
      })),
      activeVersionId: project.direction.activeVersionId,
    },
  };
}

export function deserializeProjectData(raw: Record<string, unknown>): ProjectData {
  const d = raw as any;

  if (!d._version || d._version < 2) {
    return projectDataFromLegacy(raw).project;
  }

  const elements: any = {};
  for (const id of ALL_ELEMENT_IDS) {
    // Migrate v2 data that was saved with "layout" key before renaming to "application" (legacy, now ignored)
    const slotRaw = d.elements?.[id];
    if (!slotRaw) {
      elements[id] = createEmptySlot();
      continue;
    }

    if (id === "visual-concept") {
      const rawVariations = (slotRaw.variations ?? []).map((v: any) => ({
        ...v,
        createdAt: new Date(v.createdAt),
      }));
      const { variations: normalizedVariations, activeVariationId } = normalizeVisualConceptVariations(
        rawVariations,
        slotRaw.activeVariationId ?? null,
      );
      elements[id] = {
        variations: normalizedVariations,
        activeVariationId,
        checkedVariationId: slotRaw.checkedVariationId ?? null,
      };
    } else {
      elements[id] = {
        variations: (slotRaw.variations ?? []).map((v: any) => ({
          ...v,
          createdAt: new Date(v.createdAt),
        })),
        activeVariationId: slotRaw.activeVariationId ?? null,
        checkedVariationId: slotRaw.checkedVariationId ?? null,
      };
    }
  }

  return {
    projectName: d.projectName ?? "Brand Brew Project",
    phase: d.phase === "generating" ? "curating" : (d.phase ?? "empty"),
    brandBrief: {
      current: {
        name: d.brandBrief?.current?.name ?? d.brandSummary?.current?.name ?? "",
        tagline: d.brandBrief?.current?.tagline ?? d.brandSummary?.current?.tagline ?? "",
        description: d.brandBrief?.current?.description ?? d.brandSummary?.current?.description ?? "",
        targetAudience: d.brandBrief?.current?.targetAudience ?? d.brandSummary?.current?.targetAudience ?? "",
        keywords: d.brandBrief?.current?.keywords ?? d.brandSummary?.current?.keywords ?? [],
        // Backward-compat: old data stored applications at top-level as directionApplications.
        applications: d.brandBrief?.current?.applications ?? d.brandSummary?.current?.applications ?? d.directionApplications ?? d.guidelineApplications ?? [],
      },
      versions: (d.brandBrief?.versions ?? d.brandSummary?.versions ?? []).map((v: any) => ({
        ...v,
        createdAt: new Date(v.createdAt),
      })),
    },
    elements,
    snapshots: (d.snapshots ?? []).map((s: any) => ({
      ...s,
      sourceBriefVerId: s.sourceBriefVerId ?? s.sourceBrandSummaryVerId ?? null,
      createdAt: new Date(s.createdAt),
    })),
    selectedSnapshotId: d.selectedSnapshotId ?? null,
    direction: {
      versions: (d.direction?.versions ?? d.guideline?.versions ?? []).map((v: any) => ({
        ...v,
        createdAt: new Date(v.createdAt),
      })),
      activeVersionId: d.direction?.activeVersionId ?? d.guideline?.activeVersionId ?? null,
    },
  };
}
