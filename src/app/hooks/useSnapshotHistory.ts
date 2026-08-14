import { useCallback, useRef } from "react";
import type { ProjectData, ElementId, SnapshotItem } from "../types/project";
import {
  ALL_ELEMENT_IDS,
  ELEMENT_LABELS,
} from "../types/project";
import { generateVisualSnapshotFromElements } from "../utils/generate-image";
import type { VisualSnapshotFromElementsParams } from "../utils/generate-image";
import type { DebugInterceptor } from "./usePipelineDebugger";
import { toast } from "sonner";

const REFERENCE_IMAGE_RETRY_DELAY_MS = 1_000;

function isReferenceImageLoadError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /failed to load reference images/i.test(message);
}

function visualSnapshotErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (isReferenceImageLoadError(err)) {
    return "Visual Snapshot could not load its reference images. Please try again.";
  }
  if (/timed out/i.test(message)) {
    return "Visual Snapshot generation timed out. Please try again.";
  }
  if (/network error|failed to fetch|networkerror/i.test(message)) {
    return "Network connection failed. Check your connection and try again.";
  }
  return "Visual Snapshot generation failed. Please try again.";
}

function selectedImageUrl(
  project: ProjectData,
  selections: Partial<Record<ElementId, string>>,
  elementId: ElementId,
): string | undefined {
  const varId = selections[elementId];
  if (!varId) return undefined;
  const slot = project.elements[elementId];
  const variation = slot.variations.find((v) => v.id === varId);
  if (!variation) return undefined;
  const url = (variation.data as { imageUrl?: string })?.imageUrl;
  return typeof url === "string" && url.length > 0 ? url : undefined;
}

export interface UseSnapshotHistoryParams {
  project: ProjectData;
  setProject: React.Dispatch<React.SetStateAction<ProjectData>>;
  projectRef: React.MutableRefObject<ProjectData>;
  setLoadingElements: React.Dispatch<React.SetStateAction<Set<string>>>;
  debugInterceptor?: DebugInterceptor;
}

// ── Payload builder ─────────────────────────────────────────────────────────
// Shared by generateVisualSnapshot (from checked slots) and
// regenerateWithOverride (from explicit selections).

interface SnapshotPayload {
  params: VisualSnapshotFromElementsParams;
  sourceSelections: Partial<Record<ElementId, string>>;
  selectedElementLabels: string[];
}

function buildSnapshotPayload(
  project: ProjectData,
  selections: Partial<Record<ElementId, string>>,
): SnapshotPayload | null {
  const brief = project.brandBrief.current;
  let font1: string | undefined;
  let font2: string | undefined;
  let visualConcept: { concept: string; description: string } | undefined;
  let colorPalette: string[] | undefined;
  const selectedElementLabels: string[] = [];

  for (const elementId of ALL_ELEMENT_IDS) {
    const varId = selections[elementId];
    if (!varId) continue;

    const slot = project.elements[elementId];
    const variation = slot.variations.find((v) => v.id === varId);
    if (!variation) continue;

    selectedElementLabels.push(ELEMENT_LABELS[elementId]);

    if (elementId === "color-palette") {
      const colors = variation.data as string[];
      if (colors?.length) colorPalette = colors;
    }

    if (elementId === "visual-concept") {
      const vc = variation.data as { concept?: string; description?: string };
      if (vc?.concept && vc?.description) {
        visualConcept = { concept: vc.concept, description: vc.description };
      }
    }

    if (elementId === "font") {
      const fontData = variation.data as { titleFont?: string; bodyFont?: string };
      if (!font1 && fontData?.titleFont) font1 = fontData.titleFont;
      if (!font2 && fontData?.bodyFont && fontData.bodyFont !== font1) {
        font2 = fontData.bodyFont;
      }
    }
  }

  // Visual snapshot multimodal inputs: Logo (image 1) then Art style (image 2). No palette bitmap.
  const logoUrl = selectedImageUrl(project, selections, "logo");
  const artUrl = selectedImageUrl(project, selections, "art-style");
  const referenceImageUrls: string[] = [];
  const referenceImageRoles: string[] = [];
  if (logoUrl) {
    referenceImageUrls.push(logoUrl);
    referenceImageRoles.push("logo");
  }
  if (artUrl && artUrl !== logoUrl) {
    referenceImageUrls.push(artUrl);
    referenceImageRoles.push("art-style");
  }

  if (referenceImageUrls.length === 0) return null;

  const brandName = brief.name || project.projectName;

  return {
    params: {
      brandName,
      prompt: "",
      referenceImageUrls,
      referenceImageRoles,
      font1,
      font2,
      brandDescription: brief.description || undefined,
      keywords: brief.keywords?.length ? brief.keywords : undefined,
      visualConcept,
      colorPalette,
    },
    sourceSelections: selections,
    selectedElementLabels,
  };
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useSnapshotHistory({
  project,
  setProject,
  projectRef,
  setLoadingElements,
  debugInterceptor,
}: UseSnapshotHistoryParams) {

  const snapshotInFlightRef = useRef(false);

  // ── Shared generation helper ────────────────────────────────────────────
  const executeSnapshotGeneration = useCallback(
    async (payload: SnapshotPayload): Promise<void> => {
      setLoadingElements((prev) => new Set([...prev, "visual-snapshot"]));

      try {
        const requestSnapshot = () => debugInterceptor
          ? debugInterceptor.logCall(
              {
                label: "Visual Snapshot",
                agent: "visual-designer-visual-snapshot",
                endpoint: "visual-designer/visual-snapshot",
                request: payload.params as unknown as Record<string, unknown>,
              },
              () => generateVisualSnapshotFromElements(payload.params),
            )
          : generateVisualSnapshotFromElements(payload.params);

        let snapshotResult: Awaited<ReturnType<typeof generateVisualSnapshotFromElements>>;
        try {
          snapshotResult = await requestSnapshot();
        } catch (err) {
          if (!isReferenceImageLoadError(err)) throw err;
          await new Promise((resolve) => setTimeout(resolve, REFERENCE_IMAGE_RETRY_DELAY_MS));
          snapshotResult = await requestSnapshot();
        }
        const snapshotMeta = snapshotResult._meta;

        const p = projectRef.current;
        const latestBriefVer =
          p.brandBrief.versions.length > 0
            ? p.brandBrief.versions[p.brandBrief.versions.length - 1]
            : null;

        const newSnapshot: SnapshotItem = {
          id: `snap-${Date.now()}`,
          imageUrl: snapshotResult.imageUrl,
          createdAt: new Date(),
          sourceSelections: payload.sourceSelections,
          sourceBriefVerId: latestBriefVer?.id ?? null,
          generationMeta: {
            prompt: snapshotMeta?.prompt || undefined,
            model: snapshotMeta?.model,
            referenceImageUrls: payload.params.referenceImageUrls.length
              ? payload.params.referenceImageUrls
              : undefined,
            hasPalette: !!payload.params.paletteImageBase64,
            paletteImageDataUrl: payload.params.paletteImageBase64
              ? `data:image/png;base64,${payload.params.paletteImageBase64}`
              : undefined,
            selectedElementLabels: payload.selectedElementLabels,
          },
        };

        setProject((prev) => ({
          ...prev,
          phase: "curating",
          snapshots: [newSnapshot, ...prev.snapshots],
          selectedSnapshotId: newSnapshot.id,
        }));
      } catch (err) {
        console.error("Visual snapshot generation failed:", err);
        toast.error(visualSnapshotErrorMessage(err), { duration: 6_000 });
      } finally {
        setLoadingElements((prev) => {
          const n = new Set(prev);
          n.delete("visual-snapshot");
          return n;
        });
      }
    },
    [projectRef, setProject, setLoadingElements, debugInterceptor],
  );

  // ── Generate from currently checked slots ───────────────────────────────
  const generateVisualSnapshot = useCallback(async () => {
    if (snapshotInFlightRef.current) return;
    snapshotInFlightRef.current = true;

    try {
      const p = projectRef.current;
      const selections: Partial<Record<ElementId, string>> = {};
      for (const elementId of ALL_ELEMENT_IDS) {
        const slot = p.elements[elementId];
        if (slot.checkedVariationId) {
          selections[elementId] = slot.checkedVariationId;
        }
      }

      const payload = buildSnapshotPayload(p, selections);
      if (!payload) {
        console.warn("generateVisualSnapshot: no visual inputs; aborting.");
        toast.error("Select a Logo and Art Style before creating a Visual Snapshot.");
        return;
      }

      await executeSnapshotGeneration(payload);
    } finally {
      snapshotInFlightRef.current = false;
    }
  }, [projectRef, executeSnapshotGeneration]);

  // ── Regenerate with one element overridden ──────────────────────────────
  const regenerateWithOverride = useCallback(
    async (snapshotId: string, overrideElementId: ElementId, overrideVariationId: string) => {
      if (snapshotInFlightRef.current) return;
      snapshotInFlightRef.current = true;

      try {
        const p = projectRef.current;
        const snapshot = p.snapshots.find((s) => s.id === snapshotId);
        if (!snapshot) return;

        const updatedSelections: Partial<Record<ElementId, string>> = {
          ...snapshot.sourceSelections,
          [overrideElementId]: overrideVariationId,
        };

        const payload = buildSnapshotPayload(p, updatedSelections);
        if (!payload) {
          console.warn("regenerateWithOverride: no visual inputs; aborting.");
          toast.error("Select a Logo and Art Style before creating a Visual Snapshot.");
          return;
        }

        await executeSnapshotGeneration(payload);
      } finally {
        snapshotInFlightRef.current = false;
      }
    },
    [projectRef, executeSnapshotGeneration],
  );

  const handleSelectSnapshot = useCallback(
    (snapshotId: string | null) => {
      setProject((prev) => {
        if (!snapshotId) {
          return { ...prev, selectedSnapshotId: null };
        }
        const snapshot = prev.snapshots.find((s) => s.id === snapshotId);
        if (!snapshot) return { ...prev, selectedSnapshotId: snapshotId };

        const nextElements = { ...prev.elements };
        for (const [elemId, varId] of Object.entries(snapshot.sourceSelections)) {
          const eid = elemId as ElementId;
          if (!nextElements[eid]) continue;
          const variationStillExists = nextElements[eid].variations.some((v) => v.id === varId);
          if (variationStillExists) {
            (nextElements as Record<string, unknown>)[eid] = {
              ...nextElements[eid],
              checkedVariationId: varId,
              activeVariationId: varId,
            };
          } else {
            (nextElements as Record<string, unknown>)[eid] = {
              ...nextElements[eid],
              checkedVariationId: null,
            };
          }
        }

        return {
          ...prev,
          selectedSnapshotId: snapshotId,
          elements: nextElements,
        };
      });
    },
    [setProject],
  );

  const handleDeleteSnapshot = useCallback(
    (snapshotId: string) => {
      setProject((prev) => ({
        ...prev,
        snapshots: prev.snapshots.filter((s) => s.id !== snapshotId),
        selectedSnapshotId:
          prev.selectedSnapshotId === snapshotId ? null : prev.selectedSnapshotId,
      }));
    },
    [setProject],
  );

  return {
    generateVisualSnapshot,
    regenerateWithOverride,
    handleSelectSnapshot,
    handleDeleteSnapshot,
  };
}
