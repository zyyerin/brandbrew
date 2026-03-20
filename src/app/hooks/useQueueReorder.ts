import React, { useState } from "react";
import { DEFAULT_QUEUE_ORDER } from "../utils/design-tokens";

const DEFAULT_ORDER = [...DEFAULT_QUEUE_ORDER];

export interface QueueReorderState {
  elementQueueOrder: string[];
  reorderDragElementType: string | null;
  reorderOverElementType: string | null;
  handleQueueReorderDragStart: (e: React.DragEvent<HTMLDivElement>, elementType: string) => void;
  handleQueueReorderDragOver: (e: React.DragEvent<HTMLDivElement>, elementType: string) => void;
  handleQueueReorderDragLeave: (e: React.DragEvent<HTMLDivElement>, elementType: string) => void;
  handleQueueReorderDrop: (e: React.DragEvent<HTMLDivElement>, targetElementType: string) => void;
  handleQueueReorderDragEnd: () => void;
}

export function useQueueReorder(): QueueReorderState {
  const [elementQueueOrder, setElementQueueOrder] = useState<string[]>(DEFAULT_ORDER);
  const [reorderDragElementType, setReorderDragElementType] = useState<string | null>(null);
  const [reorderOverElementType, setReorderOverElementType] = useState<string | null>(null);

  const handleQueueReorderDragStart = (e: React.DragEvent<HTMLDivElement>, elementType: string) => {
    e.stopPropagation();
    setReorderDragElementType(elementType);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("application/x-queue-reorder", elementType);
    const el = e.currentTarget.closest("[data-elementqueue]") as HTMLElement | null;
    if (el) {
      e.dataTransfer.setDragImage(el, 20, 20);
    }
  };

  const handleQueueReorderDragOver = (e: React.DragEvent<HTMLDivElement>, elementType: string) => {
    if (!reorderDragElementType || reorderDragElementType === elementType) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setReorderOverElementType(elementType);
  };

  const handleQueueReorderDragLeave = (e: React.DragEvent<HTMLDivElement>, elementType: string) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    if (reorderOverElementType === elementType) setReorderOverElementType(null);
  };

  const handleQueueReorderDrop = (e: React.DragEvent<HTMLDivElement>, targetElementType: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!reorderDragElementType || reorderDragElementType === targetElementType) {
      setReorderDragElementType(null);
      setReorderOverElementType(null);
      return;
    }
    setElementQueueOrder((prev) => {
      const fromIdx = prev.indexOf(reorderDragElementType);
      const toIdx = prev.indexOf(targetElementType);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const next = [...prev];
      next.splice(fromIdx, 1);
      next.splice(toIdx, 0, reorderDragElementType);
      return next;
    });
    setReorderDragElementType(null);
    setReorderOverElementType(null);
  };

  const handleQueueReorderDragEnd = () => {
    setReorderDragElementType(null);
    setReorderOverElementType(null);
  };

  return {
    elementQueueOrder,
    reorderDragElementType,
    reorderOverElementType,
    handleQueueReorderDragStart,
    handleQueueReorderDragOver,
    handleQueueReorderDragLeave,
    handleQueueReorderDrop,
    handleQueueReorderDragEnd,
  };
}
