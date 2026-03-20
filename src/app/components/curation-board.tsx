import React, { useCallback, useRef, useMemo, useState, useEffect } from "react";
import type { VariationItem } from "./variations-panel";
import { CANVAS, LAYOUT, ELEMENT_TYPE_LABELS as LABELS } from "../utils/design-tokens";
import { useCanvasTransform } from "../hooks/useCanvasTransform";
import { useDragMerge } from "../hooks/useDragMerge";
import { useQueueReorder } from "../hooks/useQueueReorder";
import { useVariationReorder } from "../hooks/useVariationReorder";
import { useCommentMerge } from "../hooks/useCommentMerge";
import { CanvasZoomContext } from "../contexts/CanvasZoomContext";
import { VSPanelContext } from "../contexts/VSPanelContext";
import { EmptyState } from "./curation-board/EmptyState";
import { ElementQueue } from "./curation-board/ElementQueue";
import { VisualSnapshotPanel } from "./curation-board/VisualSnapshotPanel";
import { CanvasHUD } from "./curation-board/CanvasHUD";
import { CommentInput } from "./curation-board/CommentInput";
import type { BrandSummaryData, ElementsState, ElementId, SnapshotItem, PipelineStage } from "../types/project";

export type { GeneratedCardItem, GeneratedCardType } from "./brand-cards";

/** Canvas-space layout info for a single variation slot, used for noodle math. */
export type SlotPosition = {
  queueIndex: number;
  offsetInFilmstrip: number;
  slotWidth: number;
};

const COMMENT_CURSOR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%236d28d9' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M7.9 20A9 9 0 1 0 4 16.1L2 22Z'/%3E%3C/svg%3E") 12 12, crosshair`;

const EMPTY_SET = new Set<string>();
const EMPTY_RECORD_VARIATIONS: Record<string, VariationItem[]> = {};
const EMPTY_RECORD_ACTIVE: Record<string, string> = {};

interface CurationBoardProps {
  brandSummary: BrandSummaryData;
  elements: ElementsState;
  projectPhase: "empty" | "curating";
  pipelineStage: PipelineStage;
  suggestions?: string[];
  onSuggestionClick?: (s: string) => void;
  variationCounts?: Record<string, number>;
  onEditSave?: (elementId: string, data: unknown) => void;
  onMerge?: (sourceId: string, targetId: string, sourceVarId?: string, targetVarId?: string) => void;
  onCommentModify?: (targetId: string, comment: string, targetVarId?: string) => void;
  mergingElementTypes?: Set<string>;
  allVariationsByElementType?: Record<string, VariationItem[]>;
  activeVariationByElementType?: Record<string, string>;
  onSelectVariation?: (componentId: string, variationId: string) => void;
  checkedVariationIds?: Set<string>;
  onToggleVariationChecked?: (variationId: string, peerVariationIds: string[]) => void;
  onDeleteVariation?: (componentId: string, variationId: string) => void;
  snapshotHistory?: SnapshotItem[];
  selectedSnapshotId?: string | null;
  onSelectSnapshot?: (id: string | null) => void;
  onDeleteSnapshot?: (id: string) => void;
  onGenerateSnapshot?: () => void;
  onGenerateBrandDirection?: () => void;
  onViewBrandDirection?: () => void;
  selectedSnapshotHasDirection?: boolean;
  snapshotGenerating?: boolean;
  vsPanelExpanded?: boolean;
  onAddVariation?: (elementType: string, sourceVariationId?: string | null) => void;
  onMoveVariationToQueue?: (sourceElementType: string, targetElementType: string, variationId: string) => void;
  onUploadVariation?: (elementType: string, file: File) => void;
  loadingElementIds?: Set<string>;
  uploadingVariationIds?: Set<string>;
  onUpdateVariationOrder?: (elementType: string, newOrder: string[]) => void;
}

export function CurationBoard({
  brandSummary,
  elements,
  projectPhase,
  pipelineStage,
  suggestions,
  onSuggestionClick,
  onEditSave,
  onMerge,
  onCommentModify,
  mergingElementTypes = EMPTY_SET,
  allVariationsByElementType = EMPTY_RECORD_VARIATIONS,
  activeVariationByElementType = EMPTY_RECORD_ACTIVE,
  checkedVariationIds = EMPTY_SET,
  onToggleVariationChecked,
  onDeleteVariation,
  snapshotHistory = [],
  selectedSnapshotId = null,
  onSelectSnapshot,
  onDeleteSnapshot,
  onGenerateSnapshot,
  onGenerateBrandDirection,
  onViewBrandDirection,
  selectedSnapshotHasDirection = false,
  snapshotGenerating = false,
  vsPanelExpanded = true,
  onAddVariation,
  onMoveVariationToQueue,
  onUploadVariation,
  loadingElementIds,
  uploadingVariationIds,
  onUpdateVariationOrder,
}: CurationBoardProps) {
  const isCanvasPhase = projectPhase !== "empty";

  const canvas = useCanvasTransform(isCanvasPhase);
  const drag = useDragMerge(
    onMerge,
    onAddVariation,
    onMoveVariationToQueue,
    (varId) => uploadingVariationIds?.has(varId) ?? false,
    canvas.zoom,
  );
  const queueReorder = useQueueReorder();
  const varReorder = useVariationReorder(
    elements,
    (elementType, newOrder) => onUpdateVariationOrder?.(elementType, newOrder),
  );
  const comment = useCommentMerge(onCommentModify);

  const variationElMapRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const slotPositionMapRef = useRef<Map<string, SlotPosition>>(new Map());
  const filmstripScrollMapRef = useRef<Map<string, number>>(new Map());
  const prevLoadingRef = useRef<Set<string>>(new Set());
  const [layoutTick, setLayoutTick] = useState(0);
  const [filmstripScrollTick, setFilmstripScrollTick] = useState(0);

  // Increment layout tick when add variation completes → triggers noodle re-measure
  useEffect(() => {
    const prev = prevLoadingRef.current;
    const curr = loadingElementIds ?? new Set();
    const hadShrink = prev.size > 0 && [...prev].some((id) => !curr.has(id));
    prevLoadingRef.current = curr;
    if (hadShrink) {
      const id = requestAnimationFrame(() => setLayoutTick((t) => t + 1));
      return () => cancelAnimationFrame(id);
    }
  }, [loadingElementIds]);

  // Presence check
  const isGenerating = pipelineStage !== null;
  const isLoadingOrBeyond = projectPhase === "curating";

  const isElementQueuePresent = useCallback(
    (elementType: string): boolean => {
      const slot = elements[elementType as ElementId];
      if (!slot) return false;
      return slot.variations.length > 0 || isLoadingOrBeyond;
    },
    [elements, isLoadingOrBeyond],
  );

  // Ordered list of visible queue element types (for noodle Y calculation)
  const visibleQueueTypes = useMemo(
    () => queueReorder.elementQueueOrder.filter(isElementQueuePresent),
    [queueReorder.elementQueueOrder, isElementQueuePresent],
  );

  // Active element queue detection
  const activeQueueIds = useMemo(() => {
    const ids = new Set<string>();
    for (const elementType of queueReorder.elementQueueOrder) {
      const variations = allVariationsByElementType[elementType] ?? [];
      if (variations.some(v => checkedVariationIds.has(v.id))) {
        ids.add(elementType);
      }
    }
    return ids;
  }, [queueReorder.elementQueueOrder, allVariationsByElementType, checkedVariationIds]);

  if (projectPhase === "empty") {
    return <EmptyState suggestions={suggestions} onSuggestionClick={onSuggestionClick} />;
  }

  const dotSize = CANVAS.DOT_SIZE;
  const dotOffset = { x: 0, y: canvas.pan.y % dotSize };

  return (
    <div
      ref={canvas.containerRef}
      className="h-full overflow-hidden relative"
      style={{
        background: "var(--bb-canvas-bg)",
        backgroundImage: "radial-gradient(circle, var(--bb-canvas-dot) 1px, transparent 1px)",
        backgroundSize: `${dotSize}px ${dotSize}px`,
        backgroundPosition: `${dotOffset.x}px ${dotOffset.y}px`,
        cursor: canvas.isPanning ? "grabbing" : comment.commentMode ? COMMENT_CURSOR : "grab",
        userSelect: canvas.isPanning ? "none" : "auto",
        touchAction: "none",
      }}
      onPointerDown={canvas.pointerHandlers.onPointerDown}
      onPointerMove={canvas.pointerHandlers.onPointerMove}
      onPointerUp={canvas.pointerHandlers.onPointerUp}
      onPointerLeave={canvas.pointerHandlers.onPointerUp}
      onTouchStart={canvas.touchHandlers.onTouchStart}
      onTouchMove={canvas.touchHandlers.onTouchMove}
      onTouchEnd={canvas.touchHandlers.onTouchEnd}
    >
      {/* Transformed canvas */}
      <div
        ref={canvas.canvasRef}
        style={{
          transform: `translate(${canvas.pan.x}px, ${canvas.pan.y}px) scale(${canvas.zoom})`,
          transformOrigin: "0 0",
          position: "absolute",
          top: 0,
          left: 0,
          willChange: "transform",
        }}
      >
        <CanvasZoomContext.Provider value={canvas.zoom}>
          <VSPanelContext.Provider value={vsPanelExpanded}>
          <div className="pb-24" style={{ minWidth: 320, paddingTop: 0 }}>
            {queueReorder.elementQueueOrder.map((elementType) => {
            if (!isElementQueuePresent(elementType)) return null;

            const versions = allVariationsByElementType[elementType] ?? [];
            const activeId = activeVariationByElementType[elementType] ?? null;
            const queueIndex = visibleQueueTypes.indexOf(elementType);

            return (
              <ElementQueue
                key={elementType}
                elementType={elementType}
                queueIndex={queueIndex}
                zoom={canvas.zoom}
                pan={canvas.pan}
                containerWidth={canvas.containerSize.w}
                variations={varReorder.getOrderedVariations(elementType, versions)}
                activeVariationId={activeId}
                isQueueActive={activeQueueIds.has(elementType)}
                isMerging={mergingElementTypes.has(elementType)}
                isDragSource={drag.draggedId === elementType}
                isQueueReorderDragging={queueReorder.reorderDragElementType === elementType}
                isQueueReorderDropTarget={queueReorder.reorderOverElementType === elementType}
                draggedId={drag.draggedId}
                mergeTarget={drag.mergeTarget}
                queueMergeTarget={drag.queueMergeTarget}
                checkedVariationIds={checkedVariationIds}
                brandBrief={brandSummary}
                variationElMapRef={variationElMapRef}
                slotPositionMapRef={slotPositionMapRef}
                filmstripScrollMapRef={filmstripScrollMapRef}
                onFilmstripScroll={setFilmstripScrollTick}
                onDragStart={drag.handleDragStart}
                onDragEnd={drag.handleDragEnd}
                onDragOver={drag.handleDragOver}
                onDragLeave={drag.handleDragLeave}
                onDrop={drag.handleDrop}
                isQueueSlotDropValid={drag.isQueueSlotDropValid}
                onQueueSlotDragOver={drag.handleQueueSlotDragOver}
                onQueueSlotDragLeave={drag.handleQueueSlotDragLeave}
                onQueueSlotDrop={drag.handleQueueSlotDrop}
                queueBodyDropTarget={drag.queueBodyDropTarget}
                isQueueBodyDropValid={drag.isQueueBodyDropValid}
                onQueueBodyDragOver={drag.handleQueueBodyDragOver}
                onQueueBodyDragLeave={drag.handleQueueBodyDragLeave}
                onQueueBodyDrop={drag.handleQueueBodyDrop}
                onQueueReorderDragStart={queueReorder.handleQueueReorderDragStart}
                onQueueReorderDragEnd={queueReorder.handleQueueReorderDragEnd}
                onQueueReorderDragOver={queueReorder.handleQueueReorderDragOver}
                onQueueReorderDragLeave={queueReorder.handleQueueReorderDragLeave}
                onQueueReorderDrop={queueReorder.handleQueueReorderDrop}
                onEditSave={onEditSave}
                onAddVariation={onAddVariation}
                onToggleVariationChecked={onToggleVariationChecked}
                onDeleteVariation={onDeleteVariation}
                isAddingVariation={loadingElementIds?.has(elementType)}
                isGeneratingPhase={isGenerating}
                onUploadVariation={
                  onUploadVariation && !(uploadingVariationIds && versions.some((v) => uploadingVariationIds.has(v.id)))
                    ? (file: File) => onUploadVariation(elementType, file)
                    : undefined
                }
                uploadingVariationIds={uploadingVariationIds}
                commentMode={comment.commentMode}
                commentTarget={comment.commentTarget}
                onCommentClick={comment.handleVariationClick}
                onMoveVariation={varReorder.moveVariation}
              />
            );
          })}
        </div>
        </VSPanelContext.Provider>
        </CanvasZoomContext.Provider>
      </div>

      {/* Visual Snapshot panel */}
      {vsPanelExpanded && canvas.containerSize.w > 0 && (
        <VisualSnapshotPanel
          containerSize={canvas.containerSize}
          containerRef={canvas.containerRef}
          zoom={canvas.zoom}
          pan={canvas.pan}
          slotPositionMapRef={slotPositionMapRef}
          filmstripScrollMapRef={filmstripScrollMapRef}
          visibleQueueTypes={visibleQueueTypes}
          checkedVariationIds={checkedVariationIds}
          snapshotHistory={snapshotHistory}
          selectedSnapshotId={selectedSnapshotId}
          snapshotGenerating={snapshotGenerating}
          scrollTick={canvas.scrollTick}
          filmstripScrollTick={filmstripScrollTick}
          layoutTick={layoutTick}
          onSelectSnapshot={onSelectSnapshot}
          onDeleteSnapshot={onDeleteSnapshot}
          onGenerateSnapshot={onGenerateSnapshot}
          onGenerateBrandDirection={onGenerateBrandDirection}
          onViewBrandDirection={onViewBrandDirection}
          selectedSnapshotHasDirection={selectedSnapshotHasDirection}
        />
      )}

      {/* Canvas HUD */}
      <CanvasHUD
        zoom={canvas.zoom}
        onZoomIn={canvas.handleZoomIn}
        onZoomOut={canvas.handleZoomOut}
        onResetView={canvas.handleResetView}
        onFit={canvas.handleFit}
      />

      {/* Comment-to-Modify input */}
      {comment.commentTarget && (
        <CommentInput
          anchorEl={variationElMapRef.current.get(comment.commentTarget.variationId) ?? null}
          onSubmit={comment.handleCommentSubmit}
          onCancel={comment.handleCommentCancel}
        />
      )}
    </div>
  );
}
