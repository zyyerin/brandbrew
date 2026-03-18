import { useCallback, useMemo } from "react";
import type {
  ProjectData,
  ElementId,
  ElementsState,
  Variation,
  VariationSource,
} from "../types/project";
import { ALL_ELEMENT_IDS, ELEMENT_LABELS } from "../types/project";

export interface UseVariationsParams {
  project: ProjectData;
  setProject: React.Dispatch<React.SetStateAction<ProjectData>>;
  generationCounterRef: React.MutableRefObject<number>;
}

export interface UseVariationsReturn {
  boardVariationCounts: Record<string, number>;
  handleSelectVariationForCard: (elementId: string, variationId: string) => void;
  handleToggleVariationChecked: (elementId: string, variationId: string) => void;
  handleDeleteVariation: (elementId: string, variationId: string) => void;
  handleEditSave: (elementId: string, newData: unknown) => void;
}

export function useVariations({
  project,
  setProject,
  generationCounterRef,
}: UseVariationsParams): UseVariationsReturn {

  const boardVariationCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const id of ALL_ELEMENT_IDS) {
      const total = project.elements[id].variations.length;
      if (total > 1) counts[id] = total;
    }
    return counts;
  }, [project.elements]);

  const handleSelectVariationForCard = useCallback(
    (elementId: string, variationId: string) => {
      if (!(ALL_ELEMENT_IDS as readonly string[]).includes(elementId)) return;
      setProject((prev) => ({
        ...prev,
        elements: {
          ...prev.elements,
          [elementId]: {
            ...prev.elements[elementId as ElementId],
            activeVariationId: variationId,
          },
        },
      }));
    },
    [setProject],
  );

  const handleToggleVariationChecked = useCallback(
    (elementId: string, variationId: string) => {
      if (!(ALL_ELEMENT_IDS as readonly string[]).includes(elementId)) return;
      setProject((prev) => {
        const slot = prev.elements[elementId as ElementId];
        const wasChecked = slot.checkedVariationId === variationId;
        return {
          ...prev,
          selectedSnapshotId: null,
          elements: {
            ...prev.elements,
            [elementId]: {
              ...slot,
              checkedVariationId: wasChecked ? null : variationId,
              // Sync active card with the checked variation so the guideline
              // and other activeVariationId consumers always reflect the selection.
              activeVariationId: wasChecked ? slot.activeVariationId : variationId,
            },
          },
        };
      });
    },
    [setProject],
  );

  const handleDeleteVariation = useCallback(
    (elementId: string, variationId: string) => {
      if (!(ALL_ELEMENT_IDS as readonly string[]).includes(elementId)) return;
      setProject((prev) => {
        const slot = prev.elements[elementId as ElementId];
        if (slot.variations.length <= 1) return prev;

        const remaining = slot.variations.filter((v) => v.id !== variationId);
        const wasActive = slot.activeVariationId === variationId;
        const wasChecked = slot.checkedVariationId === variationId;

        return {
          ...prev,
          elements: {
            ...prev.elements,
            [elementId]: {
              variations: remaining,
              activeVariationId: wasActive
                ? remaining[0]?.id ?? null
                : slot.activeVariationId,
              checkedVariationId: wasChecked ? null : slot.checkedVariationId,
            },
          },
        };
      });
    },
    [setProject],
  );

  const handleEditSave = useCallback(
    (elementId: string, newData: unknown) => {
      if (!(ALL_ELEMENT_IDS as readonly string[]).includes(elementId)) return;
      const counter = generationCounterRef.current++;
      const newId = `edit-${Date.now()}-${counter}`;

      // Compute which version the user was editing, for display in Generation Details.
      const slot = project.elements[elementId as ElementId];
      let editedFromLabel: string | undefined;
      if (slot.activeVariationId) {
        const varIndex = slot.variations.findIndex(
          (v) => v.id === slot.activeVariationId,
        );
        if (varIndex >= 0) {
          const elementLabel = ELEMENT_LABELS[elementId as ElementId];
          editedFromLabel = `${elementLabel} version ${varIndex + 1}`;
        }
      }

      const variation: Variation = {
        id: newId,
        data: newData,
        source: "edit" as VariationSource,
        createdAt: new Date(),
        meta: editedFromLabel ? { editedFromLabel } : undefined,
      };
      setProject((prev) => ({
        ...prev,
        elements: {
          ...prev.elements,
          [elementId]: {
            ...prev.elements[elementId as ElementId],
            variations: [
              ...prev.elements[elementId as ElementId].variations,
              variation,
            ],
            activeVariationId: newId,
          },
        },
      }));
    },
    [setProject, generationCounterRef, project.elements],
  );

  return {
    boardVariationCounts,
    handleSelectVariationForCard,
    handleToggleVariationChecked,
    handleDeleteVariation,
    handleEditSave,
  };
}
