/**
 * Adapter functions for migrating between legacy project data shape and the
 * new ProjectData model. Used during the transition period and for loading
 * old persisted projects.
 */
import type {
  ProjectData,
  ElementId,
  ElementsState,
  Variation,
  BrandSummaryData,
  VisualConceptData,
  ArtStyleData, // legacy
  FontData,
  ImageElementData,
  ColorPaletteData,
  CardMeta,
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
  guidelineApplications?: string[];
}

interface LegacyGeneratedCard {
  id: string;
  type: string;
  label: string;
  data: any;
  createdAt: Date | string;
  componentId?: string;
  meta?: CardMeta;
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
  | "guideline-all";

// ── Phase mapping ───────────────────────────────────────────────────────────

function mapLegacyPhase(
  phase: string,
): { phase: ProjectData["phase"]; route: "board" | "guideline" | "guideline-all" } {
  switch (phase) {
    case "empty":
      return { phase: "empty", route: "board" };
    case "strategic":
    case "visual-loading":
    case "checkpoint":
      return { phase: "generating", route: "board" };
    case "guideline":
      return { phase: "curating", route: "guideline" };
    case "guideline-all":
      return { phase: "curating", route: "guideline-all" };
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
    case "layout":
      return originalCardData.layout ?? brandData.layout ?? null;
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
  return data;
}

// ── Legacy → ProjectData ────────────────────────────────────────────────────

export function projectDataFromLegacy(raw: Record<string, unknown>): {
  project: ProjectData;
  route: "board" | "guideline" | "guideline-all";
} {
  const d = raw as any;
  const brandData: LegacyBrandData = d.brandData ?? {};
  const originalCardData: Record<string, unknown> = d.originalCardData ?? {};
  const originalCardMeta: Record<string, CardMeta> = d.originalCardMeta ?? {};
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
  };

  const elements: ElementsState = {
    "visual-concept": createEmptySlot<VisualConceptData>(),
    "art-style": createEmptySlot<ImageElementData>(),
    "color-palette": createEmptySlot<ColorPaletteData>(),
    "font": createEmptySlot<FontData>(),
    "logo": createEmptySlot<ImageElementData>(),
    "layout": createEmptySlot<ImageElementData>(),
  };

  for (const elementId of ALL_ELEMENT_IDS) {
    const slot = elements[elementId];
    const origData = extractOriginalData(elementId, originalCardData, brandData);

    if (origData != null) {
      const ts = cardTimestamps[elementId];
      const variation: Variation<any> = {
        id: elementId,
        data: normalizeVariationData(elementId, origData),
        source: "initial",
        createdAt: ts ? new Date(ts as string) : new Date(0),
        meta: originalCardMeta[elementId],
      };
      slot.variations.push(variation);
      slot.activeVariationId = elementId;

      if (checkedSet.has(elementId)) {
        slot.checkedVariationId = elementId;
      }
    }

    const relatedCards = generatedCards.filter(
      (c) => c.componentId === elementId,
    );
    for (const card of relatedCards) {
      const genVarId = `gen-${card.id}`;
      const variation: Variation<any> = {
        id: genVarId,
        data: normalizeVariationData(elementId, card.data),
        source: card.id.startsWith("merge-") ? "merge" : card.id.startsWith("edit-") ? "edit" : "regenerate",
        createdAt: new Date(card.createdAt),
        meta: card.meta,
      };
      slot.variations.push(variation);

      if (checkedSet.has(genVarId)) {
        slot.checkedVariationId = genVarId;
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
    guideline: { versions: [], activeVersionId: null },
    guidelineApplications: brandData.guidelineApplications ?? [],
  };

  return { project, route };
}

// ── ProjectData → Legacy (for components not yet migrated) ──────────────────

export function projectDataToLegacy(project: ProjectData): {
  brandData: LegacyBrandData;
  phase: LegacyPhase;
  originalCardData: Record<string, unknown>;
  originalCardMeta: Record<string, CardMeta>;
  cardTimestamps: Record<string, Date>;
  activeVariationByCard: Record<string, string>;
  checkedVariationIds: Set<string>;
} {
  const bs = project.brandSummary.current;

  const latestSnapshotUrl = project.snapshots[0]?.imageUrl;

  const brandData: LegacyBrandData = {
    brandBrief: { name: bs.name, tagline: bs.tagline, description: bs.description },
    targetAudience: bs.targetAudience,
    keywords: bs.keywords,
    guidelineApplications: project.guidelineApplications,
    generatedCards: [],
    styleReferences: latestSnapshotUrl
      ? [{ id: "sr1", imageUrl: latestSnapshotUrl, label: "Visual Snapshot" }]
      : undefined,
  };

  const originalCardData: Record<string, unknown> = {};
  const originalCardMeta: Record<string, CardMeta> = {};
  const cardTimestamps: Record<string, Date> = {};
  const activeVariationByCard: Record<string, string> = {};
  const checkedVariationIds = new Set<string>();

  for (const elementId of ALL_ELEMENT_IDS) {
    const slot = project.elements[elementId];
    if (!slot.variations.length) continue;

    const initial = slot.variations.find((v) => v.source === "initial");
    const active = slot.variations.find((v) => v.id === slot.activeVariationId);

    if (initial) {
      const fieldKey = elementIdToLegacyField(elementId);
      if (fieldKey) {
        const legacyData = elementDataToLegacyField(elementId, initial.data);
        originalCardData[fieldKey] = legacyData;
        if (initial.meta) originalCardMeta[elementId] = initial.meta;
        cardTimestamps[elementId] = initial.createdAt;
      }
    }

    if (active) {
      const legacyFieldData = elementDataToLegacyBrandData(elementId, active.data);
      Object.assign(brandData, legacyFieldData);
      if (slot.activeVariationId) {
        activeVariationByCard[elementId] = slot.activeVariationId;
      }
    }

    if (slot.checkedVariationId) {
      checkedVariationIds.add(slot.checkedVariationId);
    }

    for (const v of slot.variations) {
      if (v.source === "initial") continue;
      const cardId = v.id.startsWith("gen-") ? v.id.slice(4) : v.id;
      brandData.generatedCards!.push({
        id: cardId,
        type: elementIdToLegacyCardType(elementId),
        label: v.id,
        data: elementId === "color-palette"
          ? { colors: v.data }
          : v.data,
        createdAt: v.createdAt,
        componentId: elementId,
        meta: v.meta,
      });
    }
  }

  let legacyPhase: LegacyPhase;
  switch (project.phase) {
    case "empty":
      legacyPhase = "empty";
      break;
    case "generating":
      legacyPhase = "strategic";
      break;
    case "curating":
      legacyPhase = "visual-complete";
      break;
    default:
      legacyPhase = "empty";
  }

  return {
    brandData,
    phase: legacyPhase,
    originalCardData,
    originalCardMeta,
    cardTimestamps,
    activeVariationByCard,
    checkedVariationIds,
  };
}

function elementIdToLegacyField(id: ElementId): string | null {
  const map: Record<ElementId, string> = {
    "visual-concept": "visualConcept",
    "art-style": "artStyle",
    "color-palette": "colorPalette",
    "font": "font",
    "logo": "logoInspiration",
    "layout": "layout",
  };
  return map[id] ?? null;
}

function elementDataToLegacyField(elementId: ElementId, data: unknown): unknown {
  if (elementId === "color-palette") return data;
  return data;
}

function elementDataToLegacyBrandData(
  elementId: ElementId,
  data: unknown,
): Partial<LegacyBrandData> {
  switch (elementId) {
    case "visual-concept":
      return { visualConcept: data as LegacyBrandData["visualConcept"] };
    case "art-style":
      return { artStyle: data as { imageUrl: string } };
    case "color-palette":
      return { colorPalette: data as string[] };
    case "font":
      return { font: data as LegacyBrandData["font"] };
    case "logo":
      return { logoInspiration: data as LegacyBrandData["logoInspiration"] };
    case "layout":
      return { layout: data as LegacyBrandData["layout"] };
    default:
      return {};
  }
}

function elementIdToLegacyCardType(id: ElementId): string {
  const map: Record<ElementId, string> = {
    "visual-concept": "visual-concept",
    "art-style": "art-style",
    "color-palette": "color",
    "font": "font",
    "logo": "logo",
    "layout": "layout",
  };
  return map[id] ?? id;
}

// ── Serialization helpers for the new ProjectData ───────────────────────────

function toISO(date: Date | string): string {
  return date instanceof Date ? date.toISOString() : date;
}

export function serializeProjectData(project: ProjectData): Record<string, unknown> {
  const elements: Record<string, unknown> = {};
  for (const id of ALL_ELEMENT_IDS) {
    const slot = project.elements[id];
    elements[id] = {
      variations: slot.variations.map((v) => ({
        ...v,
        createdAt: toISO(v.createdAt),
      })),
      activeVariationId: slot.activeVariationId,
      checkedVariationId: slot.checkedVariationId,
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
    guideline: {
      versions: project.guideline.versions.map((v) => ({
        ...v,
        createdAt: toISO(v.createdAt),
      })),
      activeVersionId: project.guideline.activeVersionId,
    },
    guidelineApplications: project.guidelineApplications,
  };
}

export function deserializeProjectData(raw: Record<string, unknown>): ProjectData {
  const d = raw as any;

  if (!d._version || d._version < 2) {
    return projectDataFromLegacy(raw).project;
  }

  const elements: any = {};
  for (const id of ALL_ELEMENT_IDS) {
    const slotRaw = d.elements?.[id];
    if (!slotRaw) {
      elements[id] = createEmptySlot();
      continue;
    }
    elements[id] = {
      variations: (slotRaw.variations ?? []).map((v: any) => ({
        ...v,
        createdAt: new Date(v.createdAt),
      })),
      activeVariationId: slotRaw.activeVariationId ?? null,
      checkedVariationId: slotRaw.checkedVariationId ?? null,
    };
  }

  return {
    projectName: d.projectName ?? "Brand Brew Project",
    phase: d.phase ?? "empty",
    brandSummary: {
      current: d.brandSummary?.current ?? {
        name: "",
        tagline: "",
        description: "",
        targetAudience: "",
        keywords: [],
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
    guideline: {
      versions: (d.guideline?.versions ?? []).map((v: any) => ({
        ...v,
        createdAt: new Date(v.createdAt),
      })),
      activeVersionId: d.guideline?.activeVersionId ?? null,
    },
    guidelineApplications: d.guidelineApplications ?? [],
  };
}
