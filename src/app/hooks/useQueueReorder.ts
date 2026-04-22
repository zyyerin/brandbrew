import React, { useEffect, useState } from "react";
import { DEFAULT_QUEUE_ORDER, ELEMENT_TYPE_LABELS } from "../utils/design-tokens";

const DEFAULT_ORDER = [...DEFAULT_QUEUE_ORDER];

export interface QueueReorderState {
  elementQueueOrder: string[];
  isQueueReorderEnabled: boolean;
  reorderDragElementType: string | null;
  reorderOverElementType: string | null;
  handleQueueReorderDragStart: (e: React.DragEvent<HTMLDivElement>, elementType: string) => void;
  handleQueueReorderDragOver: (e: React.DragEvent<HTMLDivElement>, elementType: string) => void;
  handleQueueReorderDragLeave: (e: React.DragEvent<HTMLDivElement>, elementType: string) => void;
  handleQueueReorderDrop: (e: React.DragEvent<HTMLDivElement>, targetElementType: string) => void;
  handleQueueReorderDragEnd: () => void;
}

export function useQueueReorder(isQueueReorderEnabled = true): QueueReorderState {
  const [elementQueueOrder, setElementQueueOrder] = useState<string[]>(DEFAULT_ORDER);
  const [reorderDragElementType, setReorderDragElementType] = useState<string | null>(null);
  const [reorderOverElementType, setReorderOverElementType] = useState<string | null>(null);

  useEffect(() => {
    if (!isQueueReorderEnabled) {
      setReorderDragElementType(null);
      setReorderOverElementType(null);
    }
  }, [isQueueReorderEnabled]);

  const handleQueueReorderDragStart = (e: React.DragEvent<HTMLDivElement>, elementType: string) => {
    if (!isQueueReorderEnabled) return;
    e.stopPropagation();
    setReorderDragElementType(elementType);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("application/x-queue-reorder", elementType);
    const label = ELEMENT_TYPE_LABELS[elementType] ?? elementType;
    const ghost = document.createElement("div");
    ghost.style.cssText =
      "position:fixed;top:-200px;left:-200px;" +
      "display:inline-flex;align-items:center;gap:6px;" +
      "padding:5px 10px;border-radius:8px;" +
      "background:var(--bb-user-active-bg);" +
      "border:1px solid var(--bb-user-active-border);" +
      "font-size:12px;font-weight:600;white-space:nowrap;" +
      "box-shadow:0 4px 12px rgba(0,0,0,0.15);" +
      "color:var(--bb-user-active-accent);";
    ghost.textContent = label;
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, ghost.offsetHeight / 2);
    setTimeout(() => document.body.removeChild(ghost), 0);
  };

  const handleQueueReorderDragOver = (e: React.DragEvent<HTMLDivElement>, elementType: string) => {
    if (!isQueueReorderEnabled) return;
    if (!reorderDragElementType || reorderDragElementType === elementType) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setReorderOverElementType(elementType);
  };

  const handleQueueReorderDragLeave = (e: React.DragEvent<HTMLDivElement>, elementType: string) => {
    if (!isQueueReorderEnabled) return;
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    if (reorderOverElementType === elementType) setReorderOverElementType(null);
  };

  const handleQueueReorderDrop = (e: React.DragEvent<HTMLDivElement>, targetElementType: string) => {
    if (!isQueueReorderEnabled) return;
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
    isQueueReorderEnabled,
    reorderDragElementType,
    reorderOverElementType,
    handleQueueReorderDragStart,
    handleQueueReorderDragOver,
    handleQueueReorderDragLeave,
    handleQueueReorderDrop,
    handleQueueReorderDragEnd,
  };
}
