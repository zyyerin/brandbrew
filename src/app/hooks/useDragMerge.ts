import React, { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { getMergeHint, isMergeSupported } from "../utils/merge-logic";
import { IMAGE_ELEMENT_IDS } from "../types/project";
import type { ElementId } from "../types/project";
import { ELEMENT_TYPE_LABELS as LABELS } from "../utils/design-tokens";

const DRAG_HINT_TOAST_ID = "drag-merge-hint";

const AI_TOAST_STYLE: React.CSSProperties = {
  background: "var(--bb-ai-active-bg)",
  border: "1px solid var(--bb-ai-affordance-border)",
  color: "var(--bb-ai-active-ring)",
  backdropFilter: "blur(8px)",
};

const USER_TOAST_STYLE: React.CSSProperties = {
  background: "var(--bb-user-active-bg-hover)",
  border: "1px solid var(--bb-user-active-accent)",
  color: "var(--bb-user-active-accent)",
  backdropFilter: "blur(8px)",
};

export interface DragMergeState {
  draggedId: string | null;
  mergeTarget: { elementType: string; variationId: string } | null;
  queueMergeTarget: string | null;
  queueBodyDropTarget: string | null;
  handleDragStart: (e: React.DragEvent<HTMLDivElement>, elementType: string, variationId: string) => void;
  handleDragOver: (e: React.DragEvent<HTMLDivElement>, targetElementType: string, targetVariationId: string) => void;
  handleDragLeave: (e: React.DragEvent<HTMLDivElement>, targetElementType: string, targetVariationId: string) => void;
  handleDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  handleDragEnd: () => void;
  isQueueSlotDropValid: (dragSourceElementType: string, targetElementType: string) => boolean;
  handleQueueSlotDragOver: (e: React.DragEvent<HTMLDivElement>, targetElementType: string) => void;
  handleQueueSlotDragLeave: (e: React.DragEvent<HTMLDivElement>, targetElementType: string) => void;
  handleQueueSlotDrop: (e: React.DragEvent<HTMLDivElement>, targetElementType: string) => void;
  isQueueBodyDropValid: (sourceElementType: string, targetElementType: string) => boolean;
  handleQueueBodyDragOver: (e: React.DragEvent<HTMLDivElement>, targetElementType: string) => void;
  handleQueueBodyDragLeave: (e: React.DragEvent<HTMLDivElement>, targetElementType: string) => void;
  handleQueueBodyDrop: (e: React.DragEvent<HTMLDivElement>, targetElementType: string) => void;
}

export function useDragMerge(
  onMerge?: (sourceElementType: string, targetElementType: string, sourceVariationId?: string, targetVariationId?: string) => void,
  onAddVariation?: (elementType: string, sourceVariationId?: string) => void,
  onMoveVariationToQueue?: (sourceElementType: string, targetElementType: string, variationId: string) => void,
  isVariationDisabled?: (variationId: string) => boolean,
  zoom: number = 1,
): DragMergeState {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [mergeTarget, setMergeTarget] = useState<{ elementType: string; variationId: string } | null>(null);
  const [queueMergeTarget, setQueueMergeTarget] = useState<string | null>(null);
  const [queueBodyDropTarget, setQueueBodyDropTarget] = useState<string | null>(null);

  const draggedIdRef = useRef<string | null>(null);
  const draggedVarIdRef = useRef<string | null>(null);
  const mergeTargetRef = useRef<{ elementType: string; variationId: string } | null>(null);
  const queueMergeTargetRef = useRef<string | null>(null);
  const queueBodyDropTargetRef = useRef<string | null>(null);

  const resetAll = () => {
    draggedIdRef.current = null;
    draggedVarIdRef.current = null;
    mergeTargetRef.current = null;
    queueMergeTargetRef.current = null;
    queueBodyDropTargetRef.current = null;
    setDraggedId(null);
    setMergeTarget(null);
    setQueueMergeTarget(null);
    setQueueBodyDropTarget(null);
    toast.dismiss(DRAG_HINT_TOAST_ID);
  };

  // Declarative toast: derived from active target state rather than imperative event calls.
  useEffect(() => {
    if (!draggedId) return;
    if (mergeTarget) {
      // AI merge: dragging onto a specific variation of another element type
      toast(getMergeHint(draggedId, mergeTarget.elementType), {
        id: DRAG_HINT_TOAST_ID,
        duration: Infinity,
        icon: "✦",
        style: AI_TOAST_STYLE,
      });
    } else if (queueMergeTarget) {
      const isSameType = draggedId === queueMergeTarget;
      const hint = isSameType ? "Add variation" : getMergeHint(draggedId, queueMergeTarget);
      toast(hint, {
        id: DRAG_HINT_TOAST_ID,
        duration: Infinity,
        icon: isSameType ? "+" : "✦",
        style: isSameType ? USER_TOAST_STYLE : AI_TOAST_STYLE,
      });
    } else if (queueBodyDropTarget) {
      const label = LABELS[queueBodyDropTarget] ?? queueBodyDropTarget;
      toast(`Move to ${label}`, {
        id: DRAG_HINT_TOAST_ID,
        duration: Infinity,
        icon: "⇄",
        style: USER_TOAST_STYLE,
      });
    } else {
      toast.dismiss(DRAG_HINT_TOAST_ID);
    }
  }, [draggedId, mergeTarget, queueMergeTarget, queueBodyDropTarget]);

  const isQueueBodyDropValid = (source: string, target: string): boolean => {
    if (source === target) return false;
    return IMAGE_ELEMENT_IDS.has(source as ElementId) && IMAGE_ELEMENT_IDS.has(target as ElementId);
  };

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, elementType: string, variationId: string) => {
    draggedIdRef.current = elementType;
    draggedVarIdRef.current = variationId;
    mergeTargetRef.current = null;
    queueMergeTargetRef.current = null;
    queueBodyDropTargetRef.current = null;
    setDraggedId(elementType);
    setMergeTarget(null);
    setQueueMergeTarget(null);
    setQueueBodyDropTarget(null);
    e.dataTransfer.effectAllowed = "all";
    e.dataTransfer.setData("text/plain", elementType);

    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const naturalW = rect.width / zoom;
    const naturalH = rect.height / zoom;
    const ghostScale = 0.55;
    const ghostW = Math.round(rect.width * ghostScale);
    const ghostH = Math.round(rect.height * ghostScale);

    const wrapper = document.createElement("div");
    wrapper.style.cssText = [
      "position:fixed",
      "top:-9999px",
      "left:-9999px",
      `width:${ghostW}px`,
      `height:${ghostH}px`,
      "overflow:hidden",
      "border-radius:10px",
      `box-shadow:var(--bb-drag-ghost-shadow)`,
      "pointer-events:none",
      "opacity:0.85",
    ].join(";");

    const ghost = el.cloneNode(true) as HTMLElement;
    ghost.style.cssText = [
      "position:absolute",
      "top:0",
      "left:0",
      `width:${naturalW}px`,
      `height:${naturalH}px`,
      `transform:scale(${zoom * ghostScale})`,
      "transform-origin:top left",
      "margin:0",
      "pointer-events:none",
    ].join(";");

    wrapper.appendChild(ghost);
    document.body.appendChild(wrapper);
    e.dataTransfer.setDragImage(wrapper, ghostW / 2, 8);
    requestAnimationFrame(() => {
      if (document.body.contains(wrapper)) document.body.removeChild(wrapper);
    });
  };

  const handleDragOver = (
    e: React.DragEvent<HTMLDivElement>,
    targetElementType: string,
    targetVariationId: string,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const dragging = draggedIdRef.current;
    const draggingVar = draggedVarIdRef.current;
    if (!dragging || dragging === targetElementType) return;
    if (!isMergeSupported(dragging, targetElementType)) return;
    if (isVariationDisabled?.(targetVariationId) || (draggingVar && isVariationDisabled?.(draggingVar))) return;

    e.dataTransfer.dropEffect = "copy";
    const current = mergeTargetRef.current;
    if (current?.elementType !== targetElementType || current?.variationId !== targetVariationId) {
      mergeTargetRef.current = { elementType: targetElementType, variationId: targetVariationId };
      setMergeTarget({ elementType: targetElementType, variationId: targetVariationId });
    }
  };

  const handleDragLeave = (
    e: React.DragEvent<HTMLDivElement>,
    targetElementType: string,
    targetVariationId: string,
  ) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    const current = mergeTargetRef.current;
    if (current?.elementType === targetElementType && current?.variationId === targetVariationId) {
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
    if (dragging && merging && merging.elementType !== dragging) {
      if (!isVariationDisabled?.(merging.variationId) && (!draggingVar || !isVariationDisabled?.(draggingVar))) {
        onMerge?.(dragging, merging.elementType, draggingVar ?? undefined, merging.variationId);
      }
    }
    resetAll();
  };

  const handleDragEnd = () => {
    resetAll();
  };

  const isQueueSlotDropValid = (dragSourceElementType: string, targetElementType: string): boolean => {
    if (dragSourceElementType === targetElementType) return true;
    return isMergeSupported(dragSourceElementType, targetElementType);
  };

  const handleQueueSlotDragOver = (e: React.DragEvent<HTMLDivElement>, targetElementType: string) => {
    e.preventDefault();
    e.stopPropagation();
    const dragging = draggedIdRef.current;
    if (!dragging) return;
    if (!isQueueSlotDropValid(dragging, targetElementType)) return;

    e.dataTransfer.dropEffect = "copy";
    if (queueMergeTargetRef.current !== targetElementType) {
      queueMergeTargetRef.current = targetElementType;
      setQueueMergeTarget(targetElementType);
    }
  };

  const handleQueueSlotDragLeave = (e: React.DragEvent<HTMLDivElement>, targetElementType: string) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    if (queueMergeTargetRef.current === targetElementType) {
      queueMergeTargetRef.current = null;
      setQueueMergeTarget(null);
    }
  };

  const handleQueueSlotDrop = (e: React.DragEvent<HTMLDivElement>, targetElementType: string) => {
    e.preventDefault();
    e.stopPropagation();
    const dragging = draggedIdRef.current;
    const draggingVar = draggedVarIdRef.current;
    if (draggingVar && isVariationDisabled?.(draggingVar)) {
      resetAll();
      return;
    }
    if (dragging) {
      if (dragging === targetElementType) {
        onAddVariation?.(targetElementType, draggingVar ?? undefined);
      } else if (isMergeSupported(dragging, targetElementType)) {
        onMerge?.(dragging, targetElementType, draggingVar ?? undefined);
      }
    }
    resetAll();
  };

  const handleQueueBodyDragOver = (e: React.DragEvent<HTMLDivElement>, targetElementType: string) => {
    e.preventDefault();
    e.stopPropagation();
    const dragging = draggedIdRef.current;
    const draggingVar = draggedVarIdRef.current;
    if (!dragging || !draggingVar) {
      return;
    }
    if (!isQueueBodyDropValid(dragging, targetElementType)) {
      return;
    }
    if (isVariationDisabled?.(draggingVar)) {
      return;
    }

    e.dataTransfer.dropEffect = "move";
    if (queueBodyDropTargetRef.current !== targetElementType) {
      queueBodyDropTargetRef.current = targetElementType;
      setQueueBodyDropTarget(targetElementType);
    }
  };

  const handleQueueBodyDragLeave = (e: React.DragEvent<HTMLDivElement>, targetElementType: string) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    if (queueBodyDropTargetRef.current === targetElementType) {
      queueBodyDropTargetRef.current = null;
      setQueueBodyDropTarget(null);
    }
  };

  const handleQueueBodyDrop = (e: React.DragEvent<HTMLDivElement>, targetElementType: string) => {
    e.preventDefault();
    e.stopPropagation();
    const dragging = draggedIdRef.current;
    const draggingVar = draggedVarIdRef.current;
    if (!dragging || !draggingVar) {
      resetAll();
      return;
    }
    if (isQueueBodyDropValid(dragging, targetElementType)) {
      onMoveVariationToQueue?.(dragging, targetElementType, draggingVar);
    }
    resetAll();
  };

  return {
    draggedId,
    mergeTarget,
    queueMergeTarget,
    queueBodyDropTarget,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleDragEnd,
    isQueueSlotDropValid,
    handleQueueSlotDragOver,
    handleQueueSlotDragLeave,
    handleQueueSlotDrop,
    isQueueBodyDropValid,
    handleQueueBodyDragOver,
    handleQueueBodyDragLeave,
    handleQueueBodyDrop,
  };
}
