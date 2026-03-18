import React, { useState } from "react";
import { DEFAULT_QUEUE_ORDER } from "../utils/design-tokens";

const DEFAULT_ORDER = [...DEFAULT_QUEUE_ORDER];

export interface QueueReorderState {
  cardOrder: string[];
  reorderDragId: string | null;
  reorderOverId: string | null;
  handleQueueReorderDragStart: (e: React.DragEvent<HTMLDivElement>, cardId: string) => void;
  handleQueueReorderDragOver: (e: React.DragEvent<HTMLDivElement>, cardId: string) => void;
  handleQueueReorderDragLeave: (e: React.DragEvent<HTMLDivElement>, cardId: string) => void;
  handleQueueReorderDrop: (e: React.DragEvent<HTMLDivElement>, targetCardId: string) => void;
  handleQueueReorderDragEnd: () => void;
}

export function useQueueReorder(): QueueReorderState {
  const [cardOrder, setCardOrder] = useState<string[]>(DEFAULT_ORDER);
  const [reorderDragId, setReorderDragId] = useState<string | null>(null);
  const [reorderOverId, setReorderOverId] = useState<string | null>(null);

  const handleQueueReorderDragStart = (e: React.DragEvent<HTMLDivElement>, cardId: string) => {
    e.stopPropagation();
    setReorderDragId(cardId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("application/x-queue-reorder", cardId);
    const el = e.currentTarget.closest("[data-elementqueue]") as HTMLElement | null;
    if (el) {
      e.dataTransfer.setDragImage(el, 20, 20);
    }
  };

  const handleQueueReorderDragOver = (e: React.DragEvent<HTMLDivElement>, cardId: string) => {
    if (!reorderDragId || reorderDragId === cardId) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setReorderOverId(cardId);
  };

  const handleQueueReorderDragLeave = (e: React.DragEvent<HTMLDivElement>, cardId: string) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    if (reorderOverId === cardId) setReorderOverId(null);
  };

  const handleQueueReorderDrop = (e: React.DragEvent<HTMLDivElement>, targetCardId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!reorderDragId || reorderDragId === targetCardId) {
      setReorderDragId(null);
      setReorderOverId(null);
      return;
    }
    setCardOrder((prev) => {
      const fromIdx = prev.indexOf(reorderDragId);
      const toIdx = prev.indexOf(targetCardId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const next = [...prev];
      next.splice(fromIdx, 1);
      next.splice(toIdx, 0, reorderDragId);
      return next;
    });
    setReorderDragId(null);
    setReorderOverId(null);
  };

  const handleQueueReorderDragEnd = () => {
    setReorderDragId(null);
    setReorderOverId(null);
  };

  return {
    cardOrder,
    reorderDragId,
    reorderOverId,
    handleQueueReorderDragStart,
    handleQueueReorderDragOver,
    handleQueueReorderDragLeave,
    handleQueueReorderDrop,
    handleQueueReorderDragEnd,
  };
}
