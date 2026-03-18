import React, { useState, useRef } from "react";
import { isMergeSupported } from "../utils/merge-logic";

export interface DragMergeState {
  draggedId: string | null;
  mergeTarget: { cardId: string; varId: string } | null;
  queueMergeTarget: string | null;
  handleDragStart: (e: React.DragEvent<HTMLDivElement>, cardId: string, varId: string) => void;
  handleDragOver: (e: React.DragEvent<HTMLDivElement>, targetCardId: string, targetVarId: string) => void;
  handleDragLeave: (e: React.DragEvent<HTMLDivElement>, targetCardId: string, targetVarId: string) => void;
  handleDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  handleDragEnd: () => void;
  isQueueSlotDropValid: (dragSourceId: string, targetQueueCardId: string) => boolean;
  handleQueueSlotDragOver: (e: React.DragEvent<HTMLDivElement>, targetQueueCardId: string) => void;
  handleQueueSlotDragLeave: (e: React.DragEvent<HTMLDivElement>, targetQueueCardId: string) => void;
  handleQueueSlotDrop: (e: React.DragEvent<HTMLDivElement>, targetQueueCardId: string) => void;
}

export function useDragMerge(
  onMerge?: (sourceId: string, targetId: string, sourceVarId?: string, targetVarId?: string) => void,
  onRefresh?: (componentId: string) => void,
): DragMergeState {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [mergeTarget, setMergeTarget] = useState<{ cardId: string; varId: string } | null>(null);
  const [queueMergeTarget, setQueueMergeTarget] = useState<string | null>(null);

  const draggedIdRef = useRef<string | null>(null);
  const draggedVarIdRef = useRef<string | null>(null);
  const mergeTargetRef = useRef<{ cardId: string; varId: string } | null>(null);
  const queueMergeTargetRef = useRef<string | null>(null);

  const resetAll = () => {
    draggedIdRef.current = null;
    draggedVarIdRef.current = null;
    mergeTargetRef.current = null;
    queueMergeTargetRef.current = null;
    setDraggedId(null);
    setMergeTarget(null);
    setQueueMergeTarget(null);
  };

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, cardId: string, varId: string) => {
    draggedIdRef.current = cardId;
    draggedVarIdRef.current = varId;
    mergeTargetRef.current = null;
    queueMergeTargetRef.current = null;
    setDraggedId(cardId);
    setMergeTarget(null);
    setQueueMergeTarget(null);
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData("text/plain", cardId);

    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const ghost = el.cloneNode(true) as HTMLElement;
    ghost.style.cssText = [
      "position:fixed",
      "top:-9999px",
      "left:-9999px",
      `width:${rect.width}px`,
      `height:${rect.height}px`,
      "transform:none",
      "margin:0",
      "pointer-events:none",
      "border-radius:12px",
      "overflow:hidden",
      "box-shadow:0 8px 24px rgba(0,0,0,0.18)",
    ].join(";");
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, rect.width / 2, rect.height / 2);
    requestAnimationFrame(() => {
      if (document.body.contains(ghost)) document.body.removeChild(ghost);
    });
  };

  const handleDragOver = (
    e: React.DragEvent<HTMLDivElement>,
    targetCardId: string,
    targetVarId: string,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const dragging = draggedIdRef.current;
    if (!dragging || dragging === targetCardId) return;
    if (!isMergeSupported(dragging, targetCardId)) return;

    e.dataTransfer.dropEffect = "copy";
    const current = mergeTargetRef.current;
    if (current?.cardId !== targetCardId || current?.varId !== targetVarId) {
      mergeTargetRef.current = { cardId: targetCardId, varId: targetVarId };
      setMergeTarget({ cardId: targetCardId, varId: targetVarId });
    }
  };

  const handleDragLeave = (
    e: React.DragEvent<HTMLDivElement>,
    targetCardId: string,
    targetVarId: string,
  ) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    const current = mergeTargetRef.current;
    if (current?.cardId === targetCardId && current?.varId === targetVarId) {
      mergeTargetRef.current = null;
      setMergeTarget(null);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const dragging = draggedIdRef.current;
    const draggingVar = draggedVarIdRef.current;
    const merging = mergeTargetRef.current;
    if (dragging && merging && merging.cardId !== dragging) {
      onMerge?.(dragging, merging.cardId, draggingVar ?? undefined, merging.varId);
    }
    resetAll();
  };

  const handleDragEnd = () => {
    resetAll();
  };

  const isQueueSlotDropValid = (dragSourceId: string, targetQueueCardId: string): boolean => {
    if (dragSourceId === targetQueueCardId) return true;
    return isMergeSupported(dragSourceId, targetQueueCardId);
  };

  const handleQueueSlotDragOver = (e: React.DragEvent<HTMLDivElement>, targetQueueCardId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const dragging = draggedIdRef.current;
    if (!dragging) return;
    if (!isQueueSlotDropValid(dragging, targetQueueCardId)) return;

    e.dataTransfer.dropEffect = "copy";
    if (queueMergeTargetRef.current !== targetQueueCardId) {
      queueMergeTargetRef.current = targetQueueCardId;
      setQueueMergeTarget(targetQueueCardId);
    }
  };

  const handleQueueSlotDragLeave = (e: React.DragEvent<HTMLDivElement>, targetQueueCardId: string) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    if (queueMergeTargetRef.current === targetQueueCardId) {
      queueMergeTargetRef.current = null;
      setQueueMergeTarget(null);
    }
  };

  const handleQueueSlotDrop = (e: React.DragEvent<HTMLDivElement>, targetQueueCardId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const dragging = draggedIdRef.current;
    const draggingVar = draggedVarIdRef.current;
    if (dragging) {
      if (dragging === targetQueueCardId) {
        onRefresh?.(targetQueueCardId);
      } else if (isMergeSupported(dragging, targetQueueCardId)) {
        onMerge?.(dragging, targetQueueCardId, draggingVar ?? undefined);
      }
    }
    resetAll();
  };

  return {
    draggedId,
    mergeTarget,
    queueMergeTarget,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleDragEnd,
    isQueueSlotDropValid,
    handleQueueSlotDragOver,
    handleQueueSlotDragLeave,
    handleQueueSlotDrop,
  };
}
