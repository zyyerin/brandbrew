/**
 * Adapter functions for migrating between legacy project data shape and the
 * new ProjectData model. Used for loading old persisted projects.
 */
import type {
  ProjectData,
  ElementId,
  ElementsState,
  Variation,
  BrandSummaryData,
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
  /** @deprecated Use brandSummary.current.applications. Kept for reading old persisted data. */
  guidelineApplications?: string[];
  /** @deprecated Use brandSummary.current.applications. Kept for reading old persisted data. */
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
    case "application":
      // Read from legacy "layout" field for backward compat
      return (originalCardData as any).layout ?? brandData.layout ?? null;
    default:
      return null;
  }
}

function normalizeVariationData(elementId: ElementId, data: any): unknown {
  if (elementId === "color-palette") {
    if (Array.isArray(data)) return data;
    if (data?.colors && Array.isArray(data.colors)) return data.colors;
    return [];
  }
  if (elementId === "visual-concept") {
    // Current format: single string
    if (typeof data === "string") return data;
    // Previous format: string[] — take first phrase
    if (Array.isArray(data)) return (data[0] ?? "") as string;
    // Legacy format: { conceptName: string; points: string[] } — use conceptName
    if (data && typeof data === "object" && "conceptName" in data) {
      return (data.conceptName?.trim() ?? "") as string;
    }
    return "";
  }
  return data;
}

/**
 * For visual-concept: expand a variation whose data was string[] (previous format)
 * into multiple string variations, one per phrase. Returns the expanded variations list
 * and an updated activeVariationId. For all other element types returns the input unchanged.
 */
function expandVisualConceptVariations(
  variations: any[],
  activeVariationId: string | null,
): { variations: any[]; activeVariationId: string | null } {
  const expanded: any[] = [];
  let newActiveId = activeVariationId;

  for (const v of variations) {
    if (Array.isArray(v.data)) {
      // Split string[] into individual string variations
      const phrases: string[] = (v.data as string[]).filter((p) => typeof p === "string" && p.trim());
      if (phrases.length === 0) continue;

      phrases.forEach((phrase, i) => {
        const newId = i === 0 ? v.id : `${v.id}--kw-${i}`;
        expanded.push({ ...v, id: newId, data: phrase });
        // Remap active pointer: if original was active, keep it pointing at first phrase
        if (v.id === activeVariationId && i === 0) {
          newActiveId = newId;
        }
      });
    } else {
      // Already string or other normalised value
      expanded.push({ ...v, data: normalizeVariationData("visual-concept", v.data) });
    }
  }

  return { variations: expanded, activeVariationId: newActiveId };
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

  const brandSummary: BrandSummaryData = {
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
    "application": createEmptySlot<ImageElementData>(),
  };

  for (const elementId of ALL_ELEMENT_IDS) {
    const slot = elements[elementId];
    const origData = extractOriginalData(elementId, originalCardData, brandData);

    if (origData != null) {
      const ts = cardTimestamps[elementId];

      if (elementId === "visual-concept") {
        // Expand array/object into individual string variations
        let phrases: string[] = [];
        if (typeof origData === "string" && origData.trim()) {
          phrases = [origData.trim()];
        } else if (Array.isArray(origData)) {
          phrases = (origData as string[]).filter((p) => typeof p === "string" && p.trim()).map((p) => p.trim());
        } else if (origData && typeof origData === "object" && "conceptName" in (origData as any)) {
          const d2 = origData as any;
          if (d2.conceptName?.trim()) phrases.push(d2.conceptName.trim());
          if (Array.isArray(d2.points)) {
            for (const p of d2.points) {
              if (p?.trim()) phrases.push(p.trim());
            }
          }
        }
        if (phrases.length === 0) continue;
        phrases.forEach((phrase, i) => {
          const varId = i === 0 ? elementId : `${elementId}--kw-${i}`;
          const variation: Variation<any> = {
            id: varId,
            data: phrase,
            source: "initial",
            createdAt: ts ? new Date(ts as string) : new Date(0),
            meta: i === 0 ? originalVariationMeta[elementId] : undefined,
          };
          slot.variations.push(variation);
          if (i === 0) {
            slot.activeVariationId = varId;
            if (checkedSet.has(elementId)) slot.checkedVariationId = varId;
          }
        });
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
        // Expand multi-phrase cards into individual string variations
        let phrases: string[] = [];
        if (typeof card.data === "string" && card.data.trim()) {
          phrases = [card.data.trim()];
        } else if (Array.isArray(card.data)) {
          phrases = (card.data as string[]).filter((p) => typeof p === "string" && p.trim()).map((p) => p.trim());
        } else if (card.data && typeof card.data === "object" && "conceptName" in card.data) {
          const d2 = card.data as any;
          if (d2.conceptName?.trim()) phrases.push(d2.conceptName.trim());
          if (Array.isArray(d2.points)) {
            for (const p of d2.points) if (p?.trim()) phrases.push(p.trim());
          }
        }
        phrases.forEach((phrase, i) => {
          const varId = i === 0 ? genVarId : `${genVarId}--kw-${i}`;
          const variation: Variation<any> = {
            id: varId,
            data: phrase,
            source: card.id.startsWith("merge-") ? "merge" : card.id.startsWith("edit-") ? "edit" : "add-variation",
            createdAt: new Date(card.createdAt),
            meta: i === 0 ? card.meta : undefined,
          };
          slot.variations.push(variation);
          if (i === 0 && checkedSet.has(genVarId)) slot.checkedVariationId = varId;
        });
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
      sourceBrandSummaryVerId: null,
      generationMeta: s.generationMeta,
    };
  });

  const project: ProjectData = {
    projectName: d.projectName ?? "Brand Brew Project",
    phase,
    brandSummary: {
      current: brandSummary,
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
    brandSummary: {
      current: project.brandSummary.current,
      versions: project.brandSummary.versions.map((v) => ({
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
    // Migrate v2 data that was saved with "layout" key before renaming to "application"
    const slotRaw = d.elements?.[id] ?? (id === "application" ? d.elements?.["layout"] : undefined);
    if (!slotRaw) {
      elements[id] = createEmptySlot();
      continue;
    }

    if (id === "visual-concept") {
      const rawVariations = (slotRaw.variations ?? []).map((v: any) => ({
        ...v,
        createdAt: new Date(v.createdAt),
      }));
      const { variations: expandedVariations, activeVariationId } = expandVisualConceptVariations(
        rawVariations,
        slotRaw.activeVariationId ?? null,
      );
      elements[id] = {
        variations: expandedVariations,
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
    brandSummary: {
      current: {
        name: d.brandSummary?.current?.name ?? "",
        tagline: d.brandSummary?.current?.tagline ?? "",
        description: d.brandSummary?.current?.description ?? "",
        targetAudience: d.brandSummary?.current?.targetAudience ?? "",
        keywords: d.brandSummary?.current?.keywords ?? [],
        // Backward-compat: old data stored applications at top-level as directionApplications.
        applications: d.brandSummary?.current?.applications ?? d.directionApplications ?? d.guidelineApplications ?? [],
      },
      versions: (d.brandSummary?.versions ?? []).map((v: any) => ({
        ...v,
        createdAt: new Date(v.createdAt),
      })),
    },
    elements,
    snapshots: (d.snapshots ?? []).map((s: any) => ({
      ...s,
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
