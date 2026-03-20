import { useCallback } from "react";
import type { ElementId, ElementsState } from "../types/project";

export interface VariationReorderResult {
  /**
   * Returns variations sorted by the custom `variationOrder` stored on the
   * element slot. Falls back to `createdAt` DESC when no custom order exists.
   * New variations not yet in the order array are appended at the end (sorted
   * by `createdAt` DESC). Stale IDs that no longer have a matching variation
   * are silently dropped.
   */
  getOrderedVariations: <T extends { id: string; createdAt: Date }>(
    elementType: string,
    variations: T[],
  ) => T[];

  /**
   * Swaps the given variation one position left or right in its display order.
   * Initialises `variationOrder` from the default sort if it doesn't exist yet.
   * No-ops at the boundary (first/last position).
   */
  moveVariation: (
    elementType: string,
    variationId: string,
    direction: "left" | "right",
  ) => void;
}

export function useVariationReorder(
  elements: ElementsState,
  onUpdateVariationOrder: (elementType: ElementId, newOrder: string[]) => void,
): VariationReorderResult {
  const getOrderedVariations = useCallback(
    <T extends { id: string; createdAt: Date }>(
      elementType: string,
      variations: T[],
    ): T[] => {
      const customOrder = elements[elementType as ElementId]?.variationOrder;

      if (!customOrder || customOrder.length === 0) {
        return [...variations].sort(
          (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
        );
      }

      const idToItem = new Map(variations.map((v) => [v.id, v]));
      const inOrderSet = new Set(customOrder);

      const ordered: T[] = [];
      for (const id of customOrder) {
        const item = idToItem.get(id);
        if (item) ordered.push(item);
      }

      // Append new variations not yet in customOrder
      const newItems = variations
        .filter((v) => !inOrderSet.has(v.id))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      return [...ordered, ...newItems];
    },
    [elements],
  );

  const moveVariation = useCallback(
    (elementType: string, variationId: string, direction: "left" | "right") => {
      const slot = elements[elementType as ElementId];
      if (!slot) return;

      const currentOrder: string[] =
        slot.variationOrder && slot.variationOrder.length > 0
          ? [...slot.variationOrder]
          : [...slot.variations]
              .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
              .map((v) => v.id);

      const idx = currentOrder.indexOf(variationId);
      if (idx === -1) return;

      const targetIdx = direction === "left" ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= currentOrder.length) return;

      const next = [...currentOrder];
      [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];

      onUpdateVariationOrder(elementType as ElementId, next);
    },
    [elements, onUpdateVariationOrder],
  );

  return { getOrderedVariations, moveVariation };
}
