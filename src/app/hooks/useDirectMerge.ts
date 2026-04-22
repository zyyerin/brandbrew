import React, { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { isMergeSupported, resolveMergeUiHint, type MergeHintTemplateVars } from "@server-shared/merge-specs.tsx";
import { IMAGE_ELEMENT_IDS } from "../types/project";
import type { ElementId } from "../types/project";
import { ELEMENT_TYPE_LABELS as LABELS } from "../utils/design-tokens";

const DRAG_HINT_TOAST_ID = "direct-merge-hint";

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

// ── Discriminated union for all drop targets ─────────────────────────────────

export type DropTarget =
  | { type: "card"; elementType: string; variationId: string }
  | { type: "slot"; elementType: string }
  | { type: "body"; elementType: string }
  | { type: "snapshot"; snapshotId: string };

/** Element types that can be dropped onto a snapshot to trigger re-synthesis. */
const SNAPSHOT_DROPPABLE: ReadonlySet<string> = new Set([
  "color-palette", "font", "logo", "art-style",
]);

/** Passed to getMergeHintVars so parents can resolve {sourceData} without a circular hook dependency. */
export type MergeUiHintContext = { sourceId: string; variationId: string | null };

export interface DirectMergeState {
  draggedId: string | null;
  draggedVariationId: string | null;
  dropTarget: DropTarget | null;
  handleDragStart: (e: React.DragEvent<HTMLDivElement>, elementType: string, variationId: string) => void;
  handleDragEnd: () => void;
  handleCardDragOver: (e: React.DragEvent<HTMLDivElement>, targetElementType: string, targetVariationId: string) => void;
  handleCardDragLeave: (e: React.DragEvent<HTMLDivElement>, targetElementType: string, targetVariationId: string) => void;
  handleCardDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  handleSlotDragOver: (e: React.DragEvent<HTMLDivElement>, targetElementType: string) => void;
  handleSlotDragLeave: (e: React.DragEvent<HTMLDivElement>, targetElementType: string) => void;
  handleSlotDrop: (e: React.DragEvent<HTMLDivElement>, targetElementType: string) => void;
  handleBodyDragOver: (e: React.DragEvent<HTMLDivElement>, targetElementType: string) => void;
  handleBodyDragLeave: (e: React.DragEvent<HTMLDivElement>, targetElementType: string) => void;
  handleBodyDrop: (e: React.DragEvent<HTMLDivElement>, targetElementType: string) => void;
  handleSnapshotDragOver: (e: React.DragEvent, snapshotId: string) => void;
  handleSnapshotDragLeave: (e: React.DragEvent, snapshotId: string) => void;
  handleSnapshotDrop: (e: React.DragEvent, snapshotId: string) => void;
  isSlotDropValid: (dragSourceElementType: string, targetElementType: string) => boolean;
  isBodyDropValid: (sourceElementType: string, targetElementType: string) => boolean;
}

export function useDirectMerge(
  onMerge?: (sourceElementType: string, targetElementType: string, sourceVariationId?: string, targetVariationId?: string) => void,
  onMoveVariationToQueue?: (sourceElementType: string, targetElementType: string, variationId: string) => void,
  isVariationDisabled?: (variationId: string) => boolean,
  zoom: number = 1,
  onSnapshotMerge?: (sourceElementType: string, sourceVariationId: string, targetSnapshotId: string) => void,
  getMergeHintVars?: (ctx: MergeUiHintContext) => MergeHintTemplateVars | undefined,
): DirectMergeState {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [draggedVariationId, setDraggedVariationId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  const draggedIdRef = useRef<string | null>(null);
  const draggedVarIdRef = useRef<string | null>(null);
  const dropTargetRef = useRef<DropTarget | null>(null);

  const resetAll = () => {
    draggedIdRef.current = null;
    draggedVarIdRef.current = null;
    dropTargetRef.current = null;
    setDraggedId(null);
    setDraggedVariationId(null);
    setDropTarget(null);
    toast.dismiss(DRAG_HINT_TOAST_ID);
  };

  useEffect(() => {
    if (!draggedId || !dropTarget) {
      if (draggedId && !dropTarget) toast.dismiss(DRAG_HINT_TOAST_ID);
      return;
    }
    const hintVars = getMergeHintVars?.({ sourceId: draggedId, variationId: draggedVariationId });
    switch (dropTarget.type) {
      case "card": {
        toast(resolveMergeUiHint("card", draggedId, dropTarget.elementType, hintVars), {
          id: DRAG_HINT_TOAST_ID,
          duration: Infinity,
          icon: "✦",
          style: AI_TOAST_STYLE,
        });
        break;
      }
      case "slot": {
        toast(resolveMergeUiHint("slot", draggedId, dropTarget.elementType, hintVars), {
          id: DRAG_HINT_TOAST_ID,
          duration: Infinity,
          icon: "✦",
          style: AI_TOAST_STYLE,
        });
        break;
      }
      case "body": {
        const label = LABELS[dropTarget.elementType] ?? dropTarget.elementType;
        toast(`Move to ${label}`, {
          id: DRAG_HINT_TOAST_ID,
          duration: Infinity,
          icon: "⇄",
          style: USER_TOAST_STYLE,
        });
        break;
      }
      case "snapshot": {
        const srcLabel = LABELS[draggedId] ?? draggedId;
        toast(`Update snapshot: replace ${srcLabel}`, {
          id: DRAG_HINT_TOAST_ID,
          duration: Infinity,
          icon: "✦",
          style: AI_TOAST_STYLE,
        });
        break;
      }
    }
  }, [draggedId, draggedVariationId, dropTarget, getMergeHintVars]);

  // ── Utility predicates ───────────────────────────────────────────────────

  const isBodyDropValid = (source: string, target: string): boolean => {
    if (source === target) return false;
    return IMAGE_ELEMENT_IDS.has(source as ElementId) && IMAGE_ELEMENT_IDS.has(target as ElementId);
  };

  const isSlotDropValid = (dragSource: string, target: string): boolean => {
    if (dragSource === target) return false;
    return isMergeSupported(dragSource, target);
  };

  // ── Helpers to update the unified target ─────────────────────────────────

  const setTarget = (next: DropTarget | null) => {
    dropTargetRef.current = next;
    setDropTarget(next);
  };

  const clearTargetIf = (predicate: (t: DropTarget) => boolean) => {
    if (dropTargetRef.current && predicate(dropTargetRef.current)) {
      setTarget(null);
    }
  };

  // ── Drag start / end ─────────────────────────────────────────────────────

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, elementType: string, variationId: string) => {
    draggedIdRef.current = elementType;
    draggedVarIdRef.current = variationId;
    dropTargetRef.current = null;
    setDraggedId(elementType);
    setDraggedVariationId(variationId);
    setDropTarget(null);
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

  const handleDragEnd = () => {
    resetAll();
  };

  // ── Card-level handlers (variation → variation) ──────────────────────────

  const handleCardDragOver = (
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
    const current = dropTargetRef.current;
    if (current?.type !== "card" || current.elementType !== targetElementType || current.variationId !== targetVariationId) {
      setTarget({ type: "card", elementType: targetElementType, variationId: targetVariationId });
    }
  };

  const handleCardDragLeave = (
    e: React.DragEvent<HTMLDivElement>,
    targetElementType: string,
    targetVariationId: string,
  ) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    clearTargetIf((t) => t.type === "card" && t.elementType === targetElementType && t.variationId === targetVariationId);
  };

  const handleCardDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const dragging = draggedIdRef.current;
    const draggingVar = draggedVarIdRef.current;
    const target = dropTargetRef.current;
    if (dragging && target?.type === "card" && target.elementType !== dragging) {
      if (!isVariationDisabled?.(target.variationId) && (!draggingVar || !isVariationDisabled?.(draggingVar))) {
        onMerge?.(dragging, target.elementType, draggingVar ?? undefined, target.variationId);
      }
    }
    resetAll();
  };

  // ── Slot-level handlers (variation → queue affordance slot) ──────────────

  const handleSlotDragOver = (e: React.DragEvent<HTMLDivElement>, targetElementType: string) => {
    e.preventDefault();
    e.stopPropagation();
    const dragging = draggedIdRef.current;
    if (!dragging) return;
    if (!isSlotDropValid(dragging, targetElementType)) return;

    e.dataTransfer.dropEffect = "copy";
    const current = dropTargetRef.current;
    if (current?.type !== "slot" || current.elementType !== targetElementType) {
      setTarget({ type: "slot", elementType: targetElementType });
    }
  };

  const handleSlotDragLeave = (e: React.DragEvent<HTMLDivElement>, targetElementType: string) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    clearTargetIf((t) => t.type === "slot" && t.elementType === targetElementType);
  };

  const handleSlotDrop = (e: React.DragEvent<HTMLDivElement>, targetElementType: string) => {
    e.preventDefault();
    e.stopPropagation();
    const dragging = draggedIdRef.current;
    const draggingVar = draggedVarIdRef.current;
    if (draggingVar && isVariationDisabled?.(draggingVar)) {
      resetAll();
      return;
    }
    if (dragging && isMergeSupported(dragging, targetElementType)) {
      onMerge?.(dragging, targetElementType, draggingVar ?? undefined);
    }
    resetAll();
  };

  // ── Body-level handlers (variation → queue body for image move) ──────────

  const handleBodyDragOver = (e: React.DragEvent<HTMLDivElement>, targetElementType: string) => {
    e.preventDefault();
    e.stopPropagation();
    const dragging = draggedIdRef.current;
    const draggingVar = draggedVarIdRef.current;
    if (!dragging || !draggingVar) return;
    if (!isBodyDropValid(dragging, targetElementType)) return;
    if (isVariationDisabled?.(draggingVar)) return;

    e.dataTransfer.dropEffect = "move";
    const current = dropTargetRef.current;
    if (current?.type !== "body" || current.elementType !== targetElementType) {
      setTarget({ type: "body", elementType: targetElementType });
    }
  };

  const handleBodyDragLeave = (e: React.DragEvent<HTMLDivElement>, targetElementType: string) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    clearTargetIf((t) => t.type === "body" && t.elementType === targetElementType);
  };

  const handleBodyDrop = (e: React.DragEvent<HTMLDivElement>, targetElementType: string) => {
    e.preventDefault();
    e.stopPropagation();
    const dragging = draggedIdRef.current;
    const draggingVar = draggedVarIdRef.current;
    if (!dragging || !draggingVar) {
      resetAll();
      return;
    }
    if (isBodyDropValid(dragging, targetElementType)) {
      onMoveVariationToQueue?.(dragging, targetElementType, draggingVar);
    }
    resetAll();
  };

  // ── Snapshot-level handlers (variation → snapshot for re-synthesis) ──────

  const handleSnapshotDragOver = (e: React.DragEvent, snapshotId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const dragging = draggedIdRef.current;
    if (!dragging || !SNAPSHOT_DROPPABLE.has(dragging)) return;

    e.dataTransfer.dropEffect = "copy";
    const current = dropTargetRef.current;
    if (current?.type !== "snapshot" || current.snapshotId !== snapshotId) {
      setTarget({ type: "snapshot", snapshotId });
    }
  };

  const handleSnapshotDragLeave = (e: React.DragEvent, snapshotId: string) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    clearTargetIf((t) => t.type === "snapshot" && t.snapshotId === snapshotId);
  };

  const handleSnapshotDrop = (e: React.DragEvent, snapshotId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const dragging = draggedIdRef.current;
    const draggingVar = draggedVarIdRef.current;
    if (dragging && draggingVar && SNAPSHOT_DROPPABLE.has(dragging)) {
      onSnapshotMerge?.(dragging, draggingVar, snapshotId);
    }
    resetAll();
  };

  return {
    draggedId,
    draggedVariationId,
    dropTarget,
    handleDragStart,
    handleDragEnd,
    handleCardDragOver,
    handleCardDragLeave,
    handleCardDrop,
    handleSlotDragOver,
    handleSlotDragLeave,
    handleSlotDrop,
    handleBodyDragOver,
    handleBodyDragLeave,
    handleBodyDrop,
    handleSnapshotDragOver,
    handleSnapshotDragLeave,
    handleSnapshotDrop,
    isSlotDropValid,
    isBodyDropValid,
  };
}
