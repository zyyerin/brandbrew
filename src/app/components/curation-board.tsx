import React, { useCallback, useRef, useMemo, useState, useEffect, useLayoutEffect } from "react";
import { BotMessageSquare, X } from "lucide-react";
import type { VariationItem } from "./variations-panel";
import { CANVAS, LAYOUT, TYPE, ELEMENT_TYPE_LABELS as LABELS } from "../utils/design-tokens";
import { useCanvasTransform } from "../hooks/useCanvasTransform";
import { useDirectMerge, type MergeUiHintContext } from "../hooks/useDirectMerge";
import { formatSourceForHint } from "@server-shared/merge-specs.tsx";
import { useQueueReorder } from "../hooks/useQueueReorder";
import { useVariationReorder } from "../hooks/useVariationReorder";
import { useCommentMerge } from "../hooks/useCommentMerge";
import { EDIT_EXIT_EVENT } from "./brand-cards/useCardEditing";
import { CanvasZoomContext } from "../contexts/CanvasZoomContext";
import { VSPanelContext } from "../contexts/VSPanelContext";
import { VCPanelContext } from "../contexts/VCPanelContext";
import { EmptyState } from "./curation-board/EmptyState";
import { ElementQueue } from "./curation-board/ElementQueue";
import { VisualSnapshotPanel } from "./curation-board/VisualSnapshotPanel";
import { VisualConceptPanel } from "./curation-board/VisualConceptPanel";
import { CanvasHUD } from "./curation-board/CanvasHUD";
import { CommentInput } from "./curation-board/CommentInput";
import type { BrandBriefData, ElementsState, ElementId, SnapshotItem, PipelineStage } from "../types/project";

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
  brandSummary: BrandBriefData;
  elements: ElementsState;
  projectPhase: "empty" | "curating";
  pipelineStage: PipelineStage;
  suggestions?: string[];
  onSuggestionClick?: (s: string) => void;
  variationCounts?: Record<string, number>;
  onEditSave?: (elementId: string, data: unknown) => void;
  onMerge?: (sourceId: string, targetId: string, sourceVarId?: string, targetVarId?: string) => void;
  onCommentModify?: (targetId: string, comment: string, targetVarId?: string) => void;
  mergingVariationIds?: Set<string>;
  mergingElementTypes?: Set<string>;
  allVariationsByElementType?: Record<string, VariationItem[]>;
  activeVariationByElementType?: Record<string, string>;
  onSelectVariation?: (componentId: string, variationId: string | null) => void;
  checkedVariationIds?: Set<string>;
  onToggleVariationChecked?: (variationId: string, peerVariationIds: string[]) => void;
  onDeleteVariation?: (componentId: string, variationId: string) => void;
  snapshotHistory?: SnapshotItem[];
  selectedSnapshotId?: string | null;
  onSelectSnapshot?: (id: string | null) => void;
  onDeleteSnapshot?: (id: string) => void;
  onGenerateSnapshot?: () => void;
  onGenerateBrandDirection?: (snapshotId: string) => void;
  onViewBrandDirection?: (snapshotId: string) => void;
  snapshotIdsWithDirection?: Set<string>;
  snapshotGenerating?: boolean;
  vsPanelExpanded?: boolean;
  vcPanelExpanded?: boolean;
  onAddVariation?: (elementType: string, sourceVariationId?: string | null) => void;
  onAddConcept?: () => void;
  onMoveVariationToQueue?: (sourceElementType: string, targetElementType: string, variationId: string) => void;
  onUploadVariation?: (elementType: string, file: File) => void;
  onUploadImageForPalette?: (elementType: string, file: File) => void;
  loadingElementIds?: Set<string>;
  uploadingVariationIds?: Set<string>;
  onUpdateVariationOrder?: (elementType: string, newOrder: string[]) => void;
  onSnapshotMerge?: (sourceElementType: string, sourceVariationId: string, targetSnapshotId: string) => void;
  /** Left context column content (BriefContextCard). Always rendered above the VC panel. */
  briefContent?: React.ReactNode;
  /** When true, offset the top toolbar to clear the left panel (Brief expanded or VC panel open). */
  leftPanelActive?: boolean;
  /** Whether the brand brief form is fully expanded (drives wider left panel fraction). */
  briefExpanded?: boolean;
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
  mergingVariationIds = EMPTY_SET,
  mergingElementTypes = EMPTY_SET,
  allVariationsByElementType = EMPTY_RECORD_VARIATIONS,
  activeVariationByElementType = EMPTY_RECORD_ACTIVE,
  checkedVariationIds = EMPTY_SET,
  onSelectVariation,
  onToggleVariationChecked,
  onDeleteVariation,
  snapshotHistory = [],
  selectedSnapshotId = null,
  onSelectSnapshot,
  onDeleteSnapshot,
  onGenerateSnapshot,
  onGenerateBrandDirection,
  onViewBrandDirection,
  snapshotIdsWithDirection,
  snapshotGenerating = false,
  vsPanelExpanded = true,
  vcPanelExpanded = true,
  onAddVariation,
  onAddConcept,
  onMoveVariationToQueue,
  onUploadVariation,
  onUploadImageForPalette,
  loadingElementIds,
  uploadingVariationIds,
  onUpdateVariationOrder,
  onSnapshotMerge,
  briefContent,
  leftPanelActive,
  briefExpanded = false,
}: CurationBoardProps) {
  const isCanvasPhase = projectPhase !== "empty";

  // brief expanded → wide panel (40%); otherwise → standard panel (20%, compact brief or VC panel)
  const effectiveLeftWidthFraction = briefExpanded
    ? LAYOUT.overlay.briefExpandedWidthFraction
    : LAYOUT.overlay.leftWidthFraction;

  const [isAnyCardEditing, setIsAnyCardEditing] = useState(false);
  useEffect(() => {
    const onEnter = () => setIsAnyCardEditing(true);
    const onExit = () => setIsAnyCardEditing(false);
    window.addEventListener("bb:card-edit-enter", onEnter);
    window.addEventListener(EDIT_EXIT_EVENT, onExit);
    return () => {
      window.removeEventListener("bb:card-edit-enter", onEnter);
      window.removeEventListener(EDIT_EXIT_EVENT, onExit);
    };
  }, []);

  const canvas = useCanvasTransform(isCanvasPhase);

  const getMergeHintVars = useCallback(
    (ctx: MergeUiHintContext) => {
      const variations = allVariationsByElementType[ctx.sourceId] ?? [];
      const v = ctx.variationId ? variations.find((x) => x.id === ctx.variationId) : undefined;
      return {
        sourceData: formatSourceForHint(ctx.sourceId, v?.data),
        brandName: brandSummary.name,
        brandDescription: brandSummary.description,
      };
    },
    [allVariationsByElementType, brandSummary],
  );

  const drag = useDirectMerge(
    onMerge,
    onMoveVariationToQueue,
    (varId) => uploadingVariationIds?.has(varId) ?? false,
    canvas.zoom,
    onSnapshotMerge,
    getMergeHintVars,
  );
  const queueReorder = useQueueReorder(checkedVariationIds.size > 0 && !isAnyCardEditing);
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

  const bumpNoodleLayout = useCallback(() => {
    setLayoutTick((t) => t + 1);
  }, []);

  // Increment layout tick when add variation completes → triggers noodle re-measure
  useLayoutEffect(() => {
    const prev = prevLoadingRef.current;
    const curr = loadingElementIds ?? new Set();
    const hadShrink = prev.size > 0 && [...prev].some((id) => !curr.has(id));
    prevLoadingRef.current = curr;
    if (hadShrink) bumpNoodleLayout();
  }, [loadingElementIds, bumpNoodleLayout]);

  // Stable key tracking all variation IDs across every queue.
  // When variations are added/deleted, this key changes → bump layoutTick
  // and purge stale entries from slotPositionMapRef.
  const allVariationIdsKey = useMemo(() => {
    const ids: string[] = [];
    for (const et of Object.keys(allVariationsByElementType)) {
      for (const v of allVariationsByElementType[et]) ids.push(v.id);
    }
    return ids.sort().join("|");
  }, [allVariationsByElementType]);

  const prevVarIdsKeyRef = useRef(allVariationIdsKey);
  useLayoutEffect(() => {
    if (prevVarIdsKeyRef.current !== allVariationIdsKey) {
      prevVarIdsKeyRef.current = allVariationIdsKey;

      // Purge stale entries from slotPositionMapRef
      const liveIds = new Set(allVariationIdsKey.split("|"));
      for (const key of slotPositionMapRef.current.keys()) {
        if (!liveIds.has(key)) slotPositionMapRef.current.delete(key);
      }

      bumpNoodleLayout();
    }
  }, [allVariationIdsKey, bumpNoodleLayout]);

  const prevPipelineStageRef = useRef(pipelineStage);
  useLayoutEffect(() => {
    const prev = prevPipelineStageRef.current;
    prevPipelineStageRef.current = pipelineStage;
    if (prev !== null && pipelineStage === null) {
      bumpNoodleLayout();
    }
  }, [pipelineStage, bumpNoodleLayout]);

  // Presence check
  const isGenerating = pipelineStage !== null;
  const isLoadingOrBeyond = projectPhase === "curating";

  // Per-element pending set: elements that have NOT yet received their new variation in this pipeline run.
  const pendingGenerationElements = useMemo((): Set<string> => {
    if (!pipelineStage) return new Set();
    switch (pipelineStage) {
      case "conceptualizing":
        return new Set(["visual-concept", "color-palette", "font", "logo", "art-style"]);
      case "styling":
        return new Set(["color-palette", "font", "logo", "art-style"]);
      case "drawing":
        return new Set(["logo", "art-style"]);
      case "synthesizing":
      default:
        return new Set();
    }
  }, [pipelineStage]);

  // Elements actively being generated right now (show brewing spinner).
  const brewingElements = useMemo((): Set<string> => {
    if (!pipelineStage) return new Set();
    switch (pipelineStage) {
      case "conceptualizing":
        return new Set(["visual-concept"]);
      case "styling":
        return new Set(["color-palette", "font"]);
      case "drawing":
        return new Set(["logo", "art-style"]);
      case "synthesizing":
      default:
        return new Set();
    }
  }, [pipelineStage]);

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
    return (
      <div
        ref={canvas.containerRef}
        className="h-full overflow-hidden relative"
        style={{ background: "var(--bb-canvas-bg)" }}
      >
        <div
          className="h-full transition-[padding-left] duration-200"
          style={{
            paddingLeft: canvas.containerSize.w > 0
              ? Math.floor(canvas.containerSize.w * effectiveLeftWidthFraction)
              : 0,
          }}
        >
          <EmptyState suggestions={suggestions} onSuggestionClick={onSuggestionClick} />
        </div>
        {canvas.containerSize.w > 0 && (
          <div
            className="absolute left-0 pointer-events-auto flex flex-col rounded-r-xl overflow-hidden transition-[width] duration-200 cursor-auto"
            style={{
              zIndex: 16,
              top: LAYOUT.panel.leftTop,
              bottom: LAYOUT.panel.leftBottom,
              width: Math.floor(canvas.containerSize.w * effectiveLeftWidthFraction),
              background: "rgba(255,255,255,0.96)",
              backdropFilter: "blur(8px)",
              boxShadow: "var(--bb-vs-panel-shadow)",
            }}
          >
            {briefContent}
          </div>
        )}
      </div>
    );
  }

  const dotSize = CANVAS.DOT_SIZE;
  const dotOffset = { x: 0, y: canvas.pan.y % dotSize };

  return (
    <div
      ref={canvas.containerRef}
      className="h-full overflow-hidden relative"
      style={{
        backgroundColor: "var(--bb-canvas-bg)",
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
      onClickCapture={(e) => {
        if (!comment.commentMode) return;
        const target = e.target as HTMLElement;
        const isCommentUi =
          Boolean(target.closest("[data-comment-input]")) ||
          Boolean(target.closest("[data-comment-mode-controls]"));
        if (isCommentUi) return;

        const clickedInteractiveControl = Boolean(
          target.closest(
            [
              "button",
              "a",
              "input",
              "textarea",
              "select",
              "[role='button']",
              "[data-no-card-toggle]",
              "[contenteditable='true']",
            ].join(","),
          ),
        );

        // In comment mode, clicking any non-comment control should immediately exit.
        if (clickedInteractiveControl) {
          // Swallow this click to avoid accidental action trigger.
          e.preventDefault();
          e.stopPropagation();
          comment.exitCommentMode();
          return;
        }

        if (
          target.closest("[data-variation-slot]")
        ) {
          return;
        }
        if (comment.commentTarget) {
          comment.clearCommentTarget();
          return;
        }
        comment.exitCommentMode();
      }}
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
          <VCPanelContext.Provider value={effectiveLeftWidthFraction}>
          <VSPanelContext.Provider value={vsPanelExpanded}>
          <div className="pb-24" style={{ minWidth: 320, paddingTop: CANVAS.CONTENT_TOP_PAD }}>
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
                mergingVariationIds={mergingVariationIds}
                isQueueMerging={mergingElementTypes.has(elementType)}
                isDragSource={drag.draggedId === elementType}
                isQueueReorderDragging={queueReorder.reorderDragElementType === elementType}
                isQueueReorderDropTarget={queueReorder.reorderOverElementType === elementType}
                isQueueReorderEnabled={queueReorder.isQueueReorderEnabled}
                draggedId={drag.draggedId}
                draggedVariationId={drag.draggedVariationId}
                getMergeHintVars={getMergeHintVars}
                dropTarget={drag.dropTarget}
                checkedVariationIds={checkedVariationIds}
                brandBrief={brandSummary}
                variationElMapRef={variationElMapRef}
                slotPositionMapRef={slotPositionMapRef}
                filmstripScrollMapRef={filmstripScrollMapRef}
                onFilmstripScroll={setFilmstripScrollTick}
                onNoodleLayoutChange={bumpNoodleLayout}
                onDragStart={drag.handleDragStart}
                onDragEnd={drag.handleDragEnd}
                onCardDragOver={drag.handleCardDragOver}
                onCardDragLeave={drag.handleCardDragLeave}
                onCardDrop={drag.handleCardDrop}
                isSlotDropValid={drag.isSlotDropValid}
                onSlotDragOver={drag.handleSlotDragOver}
                onSlotDragLeave={drag.handleSlotDragLeave}
                onSlotDrop={drag.handleSlotDrop}
                isBodyDropValid={drag.isBodyDropValid}
                onBodyDragOver={drag.handleBodyDragOver}
                onBodyDragLeave={drag.handleBodyDragLeave}
                onBodyDrop={drag.handleBodyDrop}
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
                isGeneratingPhase={pendingGenerationElements.has(elementType)}
                isBrewing={brewingElements.has(elementType)}
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
                onUploadImageForPalette={
                  onUploadImageForPalette && elementType === "color-palette"
                    ? (file: File) => onUploadImageForPalette(elementType, file)
                    : undefined
                }
                activeConceptId={activeVariationByElementType["visual-concept"] ?? null}
              />
            );
          })}
        </div>
        </VSPanelContext.Provider>
        </VCPanelContext.Provider>
        </CanvasZoomContext.Provider>
      </div>

      {/* Left context column: Brief (always) + Visual Concept panel (curating phase) */}
      {canvas.containerSize.w > 0 && (
        <div
          className="absolute left-0 pointer-events-auto flex flex-col rounded-r-xl overflow-hidden transition-[width] duration-200 cursor-auto"
          style={{
            zIndex: 16,
            top: LAYOUT.panel.leftTop,
            bottom: LAYOUT.panel.leftBottom,
            width: Math.floor(canvas.containerSize.w * effectiveLeftWidthFraction),
            background: "rgba(255,255,255,0.96)",
            backdropFilter: "blur(8px)",
            boxShadow: "var(--bb-vs-panel-shadow)",
          }}
        >
          {briefContent}
          {vcPanelExpanded && isCanvasPhase && (
            <VisualConceptPanel
              containerSize={canvas.containerSize}
              containerRef={canvas.containerRef}
              conceptVariations={allVariationsByElementType["visual-concept"] ?? []}
              activeConceptId={activeVariationByElementType["visual-concept"] ?? null}
              onSelectConcept={(variationId) => onSelectVariation?.("visual-concept", variationId)}
              onAddConcept={() => {
                if (onAddConcept) {
                  onAddConcept();
                  return;
                }
                onAddVariation?.("visual-concept");
              }}
              onEditConcept={(data) => onEditSave?.("visual-concept", data)}
              onDeleteConcept={(variationId) => onDeleteVariation?.("visual-concept", variationId)}
              isGenerating={pendingGenerationElements.has("visual-concept")}
              isBrewing={brewingElements.has("visual-concept")}
              isAddingVariation={loadingElementIds?.has("visual-concept") ?? false}
              zoom={canvas.zoom}
              pan={canvas.pan}
              slotPositionMapRef={slotPositionMapRef}
              filmstripScrollMapRef={filmstripScrollMapRef}
              visibleQueueTypes={visibleQueueTypes}
              elements={elements}
              scrollTick={canvas.scrollTick}
              filmstripScrollTick={filmstripScrollTick}
              layoutTick={layoutTick}
            />
          )}
        </div>
      )}

      {/* Visual Snapshot panel */}
      {vsPanelExpanded && canvas.containerSize.w > 0 && (
        <VisualSnapshotPanel
          containerSize={canvas.containerSize}
          containerRef={canvas.containerRef}
          zoom={canvas.zoom}
          pan={canvas.pan}
          variationElMapRef={variationElMapRef}
          slotPositionMapRef={slotPositionMapRef}
          filmstripScrollMapRef={filmstripScrollMapRef}
          visibleQueueTypes={visibleQueueTypes}
          checkedVariationIds={checkedVariationIds}
          connectionsDisabled={pipelineStage !== null}
          allVariationIdsKey={allVariationIdsKey}
          vcPanelFraction={leftPanelActive ? effectiveLeftWidthFraction : 0}
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
          snapshotIdsWithDirection={snapshotIdsWithDirection}
          onSnapshotDragOver={drag.handleSnapshotDragOver}
          onSnapshotDragLeave={drag.handleSnapshotDragLeave}
          onSnapshotDrop={drag.handleSnapshotDrop}
          snapshotDropTargetId={
            drag.dropTarget?.type === "snapshot" ? drag.dropTarget.snapshotId : null
          }
        />
      )}

      {/* Top-left controls — aligned with element queue start */}
      <div
        className="absolute top-3 z-20 flex items-center gap-2 transition-[left] duration-200"
        style={{
          left: canvas.containerSize.w > 0
            ? `calc(${effectiveLeftWidthFraction * 100}% + ${LAYOUT.overlay.leftMarginLeft + 8 + 12}px)`
            : 12,
        }}
        data-comment-mode-controls
      >
        <div
          className={`h-8 rounded-full border backdrop-blur-sm transition-all flex items-center ${
            comment.commentMode
              ? "bg-white/95 border-violet-300 text-violet-700 pl-3 pr-1 gap-2"
              : "bg-white/92 border-border/40 text-muted-foreground hover:text-foreground hover:bg-white px-3"
          }`}
          style={{
            boxShadow: comment.commentMode
              ? "0 0 0 1px rgba(139,92,246,0.15), var(--bb-hud-shadow)"
              : "var(--bb-hud-shadow)",
          }}
        >
          {comment.commentMode ? (
            <>
              <div className="flex items-center gap-2 text-violet-700 select-none">
                <BotMessageSquare size={14} />
                <span className="font-medium" style={{ fontSize: TYPE.size.sm }}>
                  Comment to modify
                </span>
              </div>
              <button
                onClick={comment.exitCommentMode}
                className="w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
                title="Exit comment mode"
              >
                <X size={12} />
              </button>
            </>
          ) : (
            <button
              onClick={() => comment.toggleCommentMode()}
              className="h-7 rounded-full flex items-center gap-2 transition-colors cursor-pointer text-inherit"
              title="Enter comment mode"
            >
              <BotMessageSquare size={14} />
              <span className="font-medium" style={{ fontSize: TYPE.size.sm }}>
                Comment
              </span>
            </button>
          )}
        </div>

        <CanvasHUD
          zoom={canvas.zoom}
          onZoomIn={canvas.handleZoomIn}
          onZoomOut={canvas.handleZoomOut}
          onResetView={canvas.handleResetView}
          onFit={canvas.handleFit}
        />
      </div>

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
