import { useCallback, useRef, useEffect } from "react";
import type { ProjectData, ElementId, SnapshotItem, CardMeta } from "../types/project";
import {
  ALL_ELEMENT_IDS,
  ELEMENT_LABELS,
  getActiveElementData,
} from "../types/project";
import { generateVisualSnapshotFromElements } from "../utils/generate-image";
import type { VisualSnapshotFromElementsParams } from "../utils/generate-image";
import { paletteToBase64 } from "../utils/helpers";

export interface UseSnapshotHistoryParams {
  project: ProjectData;
  setProject: React.Dispatch<React.SetStateAction<ProjectData>>;
  projectRef: React.MutableRefObject<ProjectData>;
  setLoadingElements: React.Dispatch<React.SetStateAction<Set<string>>>;
}

export function useSnapshotHistory({
  project,
  setProject,
  projectRef,
  setLoadingElements,
}: UseSnapshotHistoryParams) {

  const generateVisualSnapshot = useCallback(async () => {
    const p = projectRef.current;
    const bs = p.brandSummary.current;

    const sourceSelections: Partial<Record<ElementId, string>> = {};
    const referenceImageUrls: string[] = [];
    let paletteImageBase64: string | undefined;
    let font1: string | undefined;
    let font2: string | undefined;
    const selectedElementLabels: string[] = [];

    for (const elementId of ALL_ELEMENT_IDS) {
      const slot = p.elements[elementId];
      if (!slot.checkedVariationId) continue;

      const variation = slot.variations.find(
        (v) => v.id === slot.checkedVariationId,
      );
      if (!variation) continue;

      sourceSelections[elementId] = variation.id;
      selectedElementLabels.push(ELEMENT_LABELS[elementId]);

      if (elementId === "color-palette") {
        const colors = variation.data as string[];
        if (colors?.length) {
          const b64 = paletteToBase64(colors);
          if (b64) paletteImageBase64 = b64;
        }
      }

      const imageUrl = (variation.data as any)?.imageUrl;
      if (imageUrl && !referenceImageUrls.includes(imageUrl)) {
        referenceImageUrls.push(imageUrl);
      }

      if (elementId === "font") {
        const fontData = variation.data as { titleFont?: string; bodyFont?: string };
        if (!font1 && fontData?.titleFont) font1 = fontData.titleFont;
        if (!font2 && fontData?.bodyFont && fontData.bodyFont !== font1) {
          font2 = fontData.bodyFont;
        }
      }
    }

    if (!paletteImageBase64 && referenceImageUrls.length === 0) {
      console.warn("generateVisualSnapshot: no visual inputs; aborting.");
      return;
    }

    const brandName = bs.name || p.projectName;
    const fontFragment =
      font1 || font2
        ? ` Font choice: ${[font1, font2].filter(Boolean).join(", ")}.`
        : "";
    const prompt =
      `Create a visual moodboard for a brand called ${brandName} inspired by given images.` +
      `${fontFragment} No text label.`;

    setLoadingElements((prev) => new Set([...prev, "visual-snapshot"]));

    try {
      const payload: VisualSnapshotFromElementsParams = {
        brandName,
        prompt,
        referenceImageUrls,
        paletteImageBase64,
        font1,
        font2,
      };
      const snapshotResult = await generateVisualSnapshotFromElements(payload);
      const snapshotMeta = snapshotResult._meta;

      const latestBsVer =
        p.brandSummary.versions.length > 0
          ? p.brandSummary.versions[p.brandSummary.versions.length - 1]
          : null;

      const newSnapshot: SnapshotItem = {
        id: `snap-${Date.now()}`,
        imageUrl: snapshotResult.imageUrl,
        createdAt: new Date(),
        sourceSelections,
        sourceBrandSummaryVerId: latestBsVer?.id ?? null,
        generationMeta: {
          prompt,
          model: snapshotMeta?.model,
          referenceImageUrls: referenceImageUrls.length ? referenceImageUrls : undefined,
          hasPalette: !!paletteImageBase64,
          paletteImageDataUrl: paletteImageBase64
            ? `data:image/png;base64,${paletteImageBase64}`
            : undefined,
          selectedElementLabels,
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
    } finally {
      setLoadingElements((prev) => {
        const n = new Set(prev);
        n.delete("visual-snapshot");
        return n;
      });
    }
  }, [projectRef, setProject, setLoadingElements]);

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
          if (nextElements[eid]) {
            nextElements[eid] = {
              ...nextElements[eid],
              checkedVariationId: varId,
              // Also activate the variation so the guideline page reflects the selection.
              activeVariationId: varId,
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
    handleSelectSnapshot,
    handleDeleteSnapshot,
  };
}
