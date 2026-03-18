import React, { useCallback, useRef, useMemo } from "react";
import type { SnapshotHistoryItem } from "../types/app";
import type { VariationItem } from "./variations-panel";
import { CANVAS, CARD_LABELS as LABELS } from "../utils/design-tokens";
import { useCanvasTransform } from "../hooks/useCanvasTransform";
import { useDragMerge } from "../hooks/useDragMerge";
import { useQueueReorder } from "../hooks/useQueueReorder";
import { useCommentMerge } from "../hooks/useCommentMerge";
import { EmptyState } from "./curation-board/EmptyState";
import { ElementQueue } from "./curation-board/ElementQueue";
import { VisualSnapshotPanel } from "./curation-board/VisualSnapshotPanel";
import { CanvasHUD } from "./curation-board/CanvasHUD";
import { CommentInput } from "./curation-board/CommentInput";
import type { BrandData } from "../types/brand";

export type { GeneratedCardItem, GeneratedCardType } from "./brand-cards";
export type { BrandData } from "../types/brand";

const COMMENT_CURSOR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%236d28d9' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M7.9 20A9 9 0 1 0 4 16.1L2 22Z'/%3E%3C/svg%3E") 12 12, crosshair`;

const EMPTY_SET = new Set<string>();
const EMPTY_RECORD_VARIATIONS: Record<string, VariationItem[]> = {};
const EMPTY_RECORD_ACTIVE: Record<string, string> = {};

interface CurationBoardProps {
  brandData: BrandData;
  phase: "empty" | "generating-concept" | "generating-palette-fonts" | "generating-logo-style" | "generating-layout" | "visual-complete" | "guideline" | "guideline-all";
  suggestions?: string[];
  onSuggestionClick?: (s: string) => void;
  variationCounts?: Record<string, number>;
  onEditSave?: (componentId: string, patch: Partial<BrandData>) => void;
  onRefresh?: (componentId: string) => void;
  onMerge?: (sourceId: string, targetId: string, sourceVarId?: string, targetVarId?: string) => void;
  onCommentModify?: (targetId: string, comment: string, targetVarId?: string) => void;
  mergingCardIds?: Set<string>;
  allVariationsByCard?: Record<string, VariationItem[]>;
  activeVariationByCard?: Record<string, string>;
  onSelectVariation?: (componentId: string, variationId: string) => void;
  checkedVariationIds?: Set<string>;
  onToggleVariationChecked?: (variationId: string, peerVariationIds: string[]) => void;
  onDeleteVariation?: (componentId: string, variationId: string) => void;
  snapshotHistory?: SnapshotHistoryItem[];
  selectedSnapshotId?: string | null;
  onSelectSnapshot?: (id: string | null) => void;
  onDeleteSnapshot?: (id: string) => void;
  onGenerateSnapshot?: () => void;
  onGenerateBrandGuideline?: () => void;
  snapshotGenerating?: boolean;
  vsPanelExpanded?: boolean;
  onAddVariation?: (cardId: string) => void;
  onUploadVariation?: (cardId: string, file: File) => void;
  loadingElementIds?: Set<string>;
}

export function CurationBoard({
  brandData,
  phase,
  suggestions,
  onSuggestionClick,
  onEditSave,
  onRefresh,
  onMerge,
  onCommentModify,
  mergingCardIds = EMPTY_SET,
  allVariationsByCard = EMPTY_RECORD_VARIATIONS,
  activeVariationByCard = EMPTY_RECORD_ACTIVE,
  checkedVariationIds = EMPTY_SET,
  onToggleVariationChecked,
  onDeleteVariation,
  snapshotHistory = [],
  selectedSnapshotId = null,
  onSelectSnapshot,
  onDeleteSnapshot,
  onGenerateSnapshot,
  onGenerateBrandGuideline,
  snapshotGenerating = false,
  vsPanelExpanded = true,
  onAddVariation,
  onUploadVariation,
  loadingElementIds,
}: CurationBoardProps) {
  const isCanvasPhase = phase !== "empty";

  const canvas = useCanvasTransform(isCanvasPhase);
  const drag = useDragMerge(onMerge, onRefresh);
  const queueReorder = useQueueReorder();
  const comment = useCommentMerge(onCommentModify);

  const cardElMapRef = useRef<Map<string, HTMLDivElement>>(new Map());

  // Presence check
  const isGenerating = phase.startsWith("generating-");
  const isLoadingOrBeyond = isGenerating || phase === "visual-complete";

  const isCardPresent = useCallback(
    (cardId: string): boolean => {
      switch (cardId) {
        case "brand-brief":      return !!brandData.brandBrief;
        case "visual-concept":   return !!brandData.visualConcept    || isLoadingOrBeyond;
        case "art-style":        return !!brandData.artStyle         || isLoadingOrBeyond;
        case "color-palette":    return !!brandData.colorPalette     || isLoadingOrBeyond;
        case "font":             return !!brandData.font             || isLoadingOrBeyond;
        case "logo":             return !!brandData.logoInspiration  || isLoadingOrBeyond;
        case "layout":           return !!brandData.layout           || isLoadingOrBeyond;
        case "visual-snapshot":  return !!(brandData.styleReferences?.length) || isGenerating;
        default: return false;
      }
    },
    [brandData, phase, isLoadingOrBeyond, isGenerating]
  );

  // Active element queue detection
  const activeQueueIds = useMemo(() => {
    const ids = new Set<string>();
    for (const cardId of queueReorder.cardOrder) {
      const variations = allVariationsByCard[cardId] ?? [];
      if (variations.some(v => checkedVariationIds.has(v.id))) {
        ids.add(cardId);
      }
    }
    return ids;
  }, [queueReorder.cardOrder, allVariationsByCard, checkedVariationIds]);

  if (phase === "empty") {
    return <EmptyState suggestions={suggestions} onSuggestionClick={onSuggestionClick} />;
  }

  const dotSize = CANVAS.DOT_SIZE;
  const dotOffset = { x: canvas.pan.x % dotSize, y: canvas.pan.y % dotSize };

  return (
    <div
      ref={canvas.containerRef}
      className="h-full overflow-hidden relative"
      style={{
        marginTop: "16px",
        marginBottom: "16px",
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
        <div className="pb-24" style={{ minWidth: 320, paddingTop: 0 }}>
          {queueReorder.cardOrder.map((cardId) => {
            if (!isCardPresent(cardId)) return null;

            const versions = allVariationsByCard[cardId] ?? [];
            const activeId = activeVariationByCard[cardId] ?? (versions[0]?.id ?? cardId);

            return (
              <ElementQueue
                key={cardId}
                cardId={cardId}
                zoom={canvas.zoom}
                pan={canvas.pan}
                containerWidth={canvas.containerSize.w}
                variations={versions}
                activeVariationId={activeId}
                isQueueActive={activeQueueIds.has(cardId)}
                isMerging={mergingCardIds.has(cardId)}
                isDragSource={drag.draggedId === cardId}
                isQueueReorderDragging={queueReorder.reorderDragId === cardId}
                isQueueReorderDropTarget={queueReorder.reorderOverId === cardId}
                draggedId={drag.draggedId}
                mergeTarget={drag.mergeTarget}
                queueMergeTarget={drag.queueMergeTarget}
                checkedVariationIds={checkedVariationIds}
                brandBrief={brandData.brandBrief}
                cardElMapRef={cardElMapRef}
                onDragStart={drag.handleDragStart}
                onDragEnd={drag.handleDragEnd}
                onDragOver={drag.handleDragOver}
                onDragLeave={drag.handleDragLeave}
                onDrop={drag.handleDrop}
                isQueueSlotDropValid={drag.isQueueSlotDropValid}
                onQueueSlotDragOver={drag.handleQueueSlotDragOver}
                onQueueSlotDragLeave={drag.handleQueueSlotDragLeave}
                onQueueSlotDrop={drag.handleQueueSlotDrop}
                onQueueReorderDragStart={queueReorder.handleQueueReorderDragStart}
                onQueueReorderDragEnd={queueReorder.handleQueueReorderDragEnd}
                onQueueReorderDragOver={queueReorder.handleQueueReorderDragOver}
                onQueueReorderDragLeave={queueReorder.handleQueueReorderDragLeave}
                onQueueReorderDrop={queueReorder.handleQueueReorderDrop}
                onEditSave={onEditSave}
                onRefresh={onRefresh}
                onToggleVariationChecked={onToggleVariationChecked}
                onDeleteVariation={onDeleteVariation}
                onAddVariation={onAddVariation ? () => onAddVariation(cardId) : undefined}
                isAddingVariation={loadingElementIds?.has(cardId)}
                onUploadVariation={onUploadVariation ? (file: File) => onUploadVariation(cardId, file) : undefined}
                commentMode={comment.commentMode}
                commentTarget={comment.commentTarget}
                onCommentClick={comment.handleCardClick}
              />
            );
          })}
        </div>
      </div>

      {/* Visual Snapshot panel */}
      {vsPanelExpanded && canvas.containerSize.w > 0 && (
        <VisualSnapshotPanel
          containerSize={canvas.containerSize}
          containerRef={canvas.containerRef}
          zoom={canvas.zoom}
          pan={canvas.pan}
          cardElMapRef={cardElMapRef}
          checkedVariationIds={checkedVariationIds}
          snapshotHistory={snapshotHistory}
          selectedSnapshotId={selectedSnapshotId}
          snapshotGenerating={snapshotGenerating}
          scrollTick={canvas.scrollTick}
          onSelectSnapshot={onSelectSnapshot}
          onDeleteSnapshot={onDeleteSnapshot}
          onGenerateSnapshot={onGenerateSnapshot}
          onGenerateBrandGuideline={onGenerateBrandGuideline}
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
          anchorEl={cardElMapRef.current.get(comment.commentTarget.varId) ?? null}
          onSubmit={comment.handleCommentSubmit}
          onCancel={comment.handleCommentCancel}
        />
      )}
    </div>
  );
}
