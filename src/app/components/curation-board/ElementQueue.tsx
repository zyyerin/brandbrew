import React, { useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo } from "react";
import { GripVertical, Upload } from "lucide-react";
import { LAYOUT, CANVAS, TYPE, ELEMENT_TYPE_LABELS as LABELS, adaptiveSize } from "../../utils/design-tokens";
import type { SlotPosition } from "../curation-board";
import { isMergeSupported, resolveMergeUiHint } from "@server-shared/merge-specs.tsx";
import { IMAGE_ELEMENT_IDS } from "../../types/project";
import { useVSPanel } from "../../contexts/VSPanelContext";
import { useVCPanel } from "../../contexts/VCPanelContext";
import type { ElementId } from "../../types/project";
import type { DropTarget, MergeUiHintContext } from "../../hooks/useDirectMerge";
import type { MergeHintTemplateVars } from "@server-shared/merge-specs.tsx";
import { ElementWrapper } from "../brand-cards";
import type { VariationState } from "../brand-cards";
import type { VariationItem } from "../variations-panel";
import { QueueAffordanceSlot } from "./QueueAffordanceSlot";
import type { QueueColors } from "./QueueAffordanceSlot";
import { QueueBodyDropBlock } from "./QueueBodyDropBlock";
import { AddVariationSlot } from "./AddVariationSlot";
import { VariationSlot } from "./VariationSlot";

interface ElementQueueProps {
  elementType: string;
  queueIndex: number;
  zoom: number;
  pan: { x: number; y: number };
  containerWidth: number;
  variations: VariationItem[];
  activeVariationId: string;
  isQueueActive: boolean;
  mergingVariationIds?: Set<string>;
  isDragSource: boolean;
  isQueueReorderDragging: boolean;
  isQueueReorderDropTarget: boolean;
  isQueueReorderEnabled: boolean;
  draggedId: string | null;
  draggedVariationId: string | null;
  getMergeHintVars?: (ctx: MergeUiHintContext) => MergeHintTemplateVars | undefined;
  dropTarget: DropTarget | null;
  checkedVariationIds: Set<string>;
  brandBrief?: { name?: string; tagline?: string; description?: string };
  variationElMapRef: React.RefObject<Map<string, HTMLDivElement>>;
  slotPositionMapRef: React.RefObject<Map<string, SlotPosition>>;
  filmstripScrollMapRef: React.RefObject<Map<string, number>>;
  onFilmstripScroll: React.Dispatch<React.SetStateAction<number>>;
  // Drag merge handlers
  onDragStart: (e: React.DragEvent<HTMLDivElement>, elementType: string, variationId: string) => void;
  onDragEnd: () => void;
  onCardDragOver: (e: React.DragEvent<HTMLDivElement>, targetElementType: string, targetVariationId: string) => void;
  onCardDragLeave: (e: React.DragEvent<HTMLDivElement>, targetElementType: string, targetVariationId: string) => void;
  onCardDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  isSlotDropValid: (dragSourceElementType: string, targetElementType: string) => boolean;
  onSlotDragOver: (e: React.DragEvent<HTMLDivElement>, targetElementType: string) => void;
  onSlotDragLeave: (e: React.DragEvent<HTMLDivElement>, targetElementType: string) => void;
  onSlotDrop: (e: React.DragEvent<HTMLDivElement>, targetElementType: string) => void;
  isBodyDropValid: (source: string, target: string) => boolean;
  onBodyDragOver: (e: React.DragEvent<HTMLDivElement>, targetElementType: string) => void;
  onBodyDragLeave: (e: React.DragEvent<HTMLDivElement>, targetElementType: string) => void;
  onBodyDrop: (e: React.DragEvent<HTMLDivElement>, targetElementType: string) => void;
  // Queue reorder handlers
  onQueueReorderDragStart: (e: React.DragEvent<HTMLDivElement>, elementType: string) => void;
  onQueueReorderDragEnd: () => void;
  onQueueReorderDragOver: (e: React.DragEvent<HTMLDivElement>, elementType: string) => void;
  onQueueReorderDragLeave: (e: React.DragEvent<HTMLDivElement>, elementType: string) => void;
  onQueueReorderDrop: (e: React.DragEvent<HTMLDivElement>, targetElementType: string) => void;
  // Variation action handlers
  onEditSave?: (elementId: string, data: unknown) => void;
  onAddVariation?: (elementType: string, sourceVariationId?: string | null) => void;
  onToggleVariationChecked?: (variationId: string, peerVariationIds: string[]) => void;
  onDeleteVariation?: (elementType: string, variationId: string) => void;
  isAddingVariation?: boolean;
  /** True when this element's variation is pending in the current pipeline run. */
  isGeneratingPhase?: boolean;
  /** True when this element is actively being generated right now (vs queued). */
  isBrewing?: boolean;
  /** True when a queue-slot merge is in flight for this element type. */
  isQueueMerging?: boolean;
  // Upload variation (image element types only)
  onUploadVariation?: (file: File) => void;
  uploadingVariationIds?: Set<string>;
  // Upload image to extract color palette (color-palette element type only)
  onUploadImageForPalette?: (file: File) => void;
  // Comment mode
  commentMode?: boolean;
  commentTarget?: { elementType: string; variationId: string } | null;
  onCommentClick?: (elementType: string, variationId: string) => void;
  // Keyboard variation reorder
  onMoveVariation?: (elementType: string, variationId: string, direction: "left" | "right") => void;
  /** Selected visual concept id for cross-queue relation highlight. */
  activeConceptId?: string | null;
  /** After slot widths change (e.g. image intrinsic aspect), bump parent layout so VS noodles recompute. */
  onNoodleLayoutChange?: () => void;
}

const EQ_ACTIVE_COLOR: QueueColors & { bgHover: string } = {
  bg: "var(--bb-user-active-bg)",
  bgHover: "var(--bb-user-active-bg-hover)",
  border: "var(--bb-user-active-border)",
  accent: "var(--bb-user-active-accent)",
};
const EQ_INACTIVE_COLOR: QueueColors & { bgHover: string } = {
  bg: "var(--bb-user-inactive-bg)",
  bgHover: "var(--bb-user-inactive-bg-hover)",
  border: "var(--bb-user-inactive-border)",
  accent: "var(--bb-user-inactive-accent)",
};

const MERGE_TARGET_OVERLAY_STYLE = {
  background: "var(--bb-ai-active-bg)",
  boxShadow: "var(--bb-ai-ring-shadow)",
  borderRadius: 12,
  backdropFilter: "blur(1px)",
} as const;

export const ElementQueue = React.memo(function ElementQueue({
  elementType,
  queueIndex,
  zoom,
  pan,
  containerWidth,
  variations,
  activeVariationId,
  isQueueActive,
  mergingVariationIds,
  isDragSource,
  isQueueReorderDragging,
  isQueueReorderDropTarget,
  isQueueReorderEnabled,
  draggedId,
  draggedVariationId,
  getMergeHintVars,
  dropTarget,
  checkedVariationIds,
  brandBrief,
  variationElMapRef,
  slotPositionMapRef,
  filmstripScrollMapRef,
  onFilmstripScroll,
  onDragStart,
  onDragEnd,
  onCardDragOver,
  onCardDragLeave,
  onCardDrop,
  isSlotDropValid,
  onSlotDragOver,
  onSlotDragLeave,
  onSlotDrop,
  isBodyDropValid,
  onBodyDragOver,
  onBodyDragLeave,
  onBodyDrop,
  onQueueReorderDragStart,
  onQueueReorderDragEnd,
  onQueueReorderDragOver,
  onQueueReorderDragLeave,
  onQueueReorderDrop,
  onEditSave,
  onAddVariation,
  onToggleVariationChecked,
  onDeleteVariation,
  isAddingVariation,
  isGeneratingPhase,
  isBrewing,
  isQueueMerging,
  onUploadVariation,
  uploadingVariationIds,
  commentMode,
  commentTarget,
  onCommentClick,
  onMoveVariation,
  onUploadImageForPalette,
  activeConceptId,
  onNoodleLayoutChange,
}: ElementQueueProps) {
  const [isFileDragOver, setIsFileDragOver] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [imageAspectRatios, setImageAspectRatios] = useState<Record<string, number>>({});
  const addSlotFileInputRef = useRef<HTMLInputElement>(null);
  const addSlotExtractInputRef = useRef<HTMLInputElement>(null);
  const filmstripRef = useRef<HTMLDivElement>(null);
  const prevActiveVariationIdRef = useRef<string | null>(null);
  const prevVariationCountRef = useRef<number>(0);

  const isImageElementType = IMAGE_ELEMENT_IDS.has(elementType as ElementId);
  const vsPanelExpanded = useVSPanel();
  const leftPanelFraction = useVCPanel();

  const handleAddSlotFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onUploadVariation?.(file);
      e.target.value = "";
    },
    [onUploadVariation],
  );

  const handleAddSlotExtractChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onUploadImageForPalette?.(file);
      e.target.value = "";
    },
    [onUploadImageForPalette],
  );

  // variations are pre-sorted by the parent via useVariationReorder
  const sortedVersions = variations;
  const label = LABELS[elementType] ?? elementType;
  const slotW = elementType === "art-style" ? Math.round(LAYOUT.slot.size * (16 / 9)) : LAYOUT.slot.size;
  const slotH = LAYOUT.slot.size;
  const colors = isQueueActive ? EQ_ACTIVE_COLOR : EQ_INACTIVE_COLOR;
  const labelScale = adaptiveSize(1, zoom, CANVAS.ACTION_BAR_SCALE_MIN, CANVAS.ACTION_BAR_SCALE_MAX);

  const vpLeftCanvas = -pan.x / zoom;
  const vpWidthCanvas = containerWidth > 0 ? containerWidth / zoom : 4000;
  const queueStripeLeft = vpLeftCanvas - LAYOUT.queue.stripeOverhang;
  const queueStripeWidth = vpWidthCanvas + 2 * LAYOUT.queue.stripeOverhang;
  const vcPanelScreenW = leftPanelFraction > 0
    ? containerWidth * leftPanelFraction + LAYOUT.overlay.leftMarginLeft + 8
    : 0;
  const labelPinX = (vcPanelScreenW + 8 - pan.x) / zoom;
  const filmstripMarginLeft = labelPinX - queueStripeLeft;
  const vsOcclusionScreenPx = Math.min(
    Math.max(0, containerWidth),
    LAYOUT.overlay.rightFilmstripOcclusionScreenPx + LAYOUT.overlay.rightMarginRight,
  );
  const vsPanelCanvasW = vsPanelExpanded ? vsOcclusionScreenPx / zoom : 0;
  const filmstripWidth = vpWidthCanvas - vsPanelCanvasW - (filmstripMarginLeft - LAYOUT.queue.stripeOverhang);
  const softClipCanvasWidth = Math.max(1, Math.min(filmstripWidth * 0.18, 28 / zoom));
  const leftClipWidth = leftPanelFraction > 0 ? Math.max(1, Math.min(filmstripWidth * 0.08, 20 / zoom)) : 0;
  const filmstripMaskImage = leftPanelFraction > 0 && vsPanelExpanded
    ? `linear-gradient(to right, transparent 0, black ${leftClipWidth}px, black calc(100% - ${softClipCanvasWidth}px), transparent 100%)`
    : leftPanelFraction > 0
      ? `linear-gradient(to right, transparent 0, black ${leftClipWidth}px, black 100%)`
      : vsPanelExpanded
        ? `linear-gradient(to right, black 0, black calc(100% - ${softClipCanvasWidth}px), transparent 100%)`
        : "none";

  const handleImageAspectRatioChange = useCallback((variationId: string, aspectRatio: number) => {
    if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) return;
    setImageAspectRatios((prev) => {
      if (prev[variationId] === aspectRatio) return prev;
      return { ...prev, [variationId]: aspectRatio };
    });
  }, []);

  const aspectLayoutSignal = useMemo(
    () =>
      Object.entries(imageAspectRatios)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}:${v}`)
        .join("|"),
    [imageAspectRatios],
  );
  const prevAspectSignalRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (prevAspectSignalRef.current === null) {
      prevAspectSignalRef.current = aspectLayoutSignal;
      return;
    }
    if (prevAspectSignalRef.current === aspectLayoutSignal) return;
    prevAspectSignalRef.current = aspectLayoutSignal;
    onNoodleLayoutChange?.();
  }, [aspectLayoutSignal, onNoodleLayoutChange]);

  const handleFileDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (!isImageElementType || !onUploadVariation) return;
      if (!e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      e.stopPropagation();
      setIsFileDragOver(true);
    },
    [isImageElementType, onUploadVariation],
  );

  const handleFileDragLeave = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (!isFileDragOver) return;
      const related = e.relatedTarget as Node | null;
      if (related && (e.currentTarget as Node).contains(related)) return;
      setIsFileDragOver(false);
    },
    [isFileDragOver],
  );

  const handleFileDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (!isImageElementType || !onUploadVariation) return;
      if (!e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      e.stopPropagation();
      setIsFileDragOver(false);

      const file = e.dataTransfer.files[0];
      if (file?.type.startsWith("image/")) {
        onUploadVariation(file);
      }
    },
    [isImageElementType, onUploadVariation],
  );

  // ── Populate slot position registry (synchronous ref write) ──
  // Runs every render so the noodle math always has fresh layout data.
  {
    const gap = LAYOUT.filmstrip.gap;
    let acc = 0;
    for (const variation of sortedVersions) {
      const hasImage = Boolean((variation.data as { imageUrl?: string } | null)?.imageUrl);
      const ar = imageAspectRatios[variation.id] ?? 1;
      const dynW = Math.max(
        Math.round(slotH * 0.5),
        Math.round((slotH - LAYOUT.slot.paddingX) * ar + LAYOUT.slot.paddingX),
      );
      const w = hasImage ? dynW : slotW;
      slotPositionMapRef.current.set(variation.id, { queueIndex, offsetInFilmstrip: acc, slotWidth: w });
      acc += w + gap;
    }
  }

  // ── Filmstrip scroll listener ──
  useEffect(() => {
    const el = filmstripRef.current;
    if (!el) return;
    const handler = () => {
      filmstripScrollMapRef.current.set(elementType, el.scrollLeft);
      onFilmstripScroll((t) => t + 1);
    };
    el.addEventListener("scroll", handler, { passive: true });
    return () => el.removeEventListener("scroll", handler);
  }, [elementType, filmstripScrollMapRef, onFilmstripScroll]);

  // ── Auto-scroll filmstrip to newly active variation ──
  // Skip one auto-scroll when active card changes because of deletion.
  useEffect(() => {
    const prevActiveId = prevActiveVariationIdRef.current;
    const prevCount = prevVariationCountRef.current;
    const currentCount = sortedVersions.length;
    const activeChanged = activeVariationId !== prevActiveId;
    const removedVariation = currentCount < prevCount;

    if (!activeChanged) {
      prevVariationCountRef.current = currentCount;
      return;
    }

    if (removedVariation) {
      prevActiveVariationIdRef.current = activeVariationId ?? null;
      prevVariationCountRef.current = currentCount;
      return;
    }

    if (!activeVariationId) {
      prevActiveVariationIdRef.current = null;
      prevVariationCountRef.current = currentCount;
      return;
    }

    const el = variationElMapRef.current.get(activeVariationId);
    const strip = filmstripRef.current;
    if (el && strip) {
      const stripRect = strip.getBoundingClientRect();
      const cardRect = el.getBoundingClientRect();
      if (cardRect.right > stripRect.right || cardRect.left < stripRect.left) {
        el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
      }
    }

    prevActiveVariationIdRef.current = activeVariationId;
    prevVariationCountRef.current = currentCount;
  }, [activeVariationId, sortedVersions.length, variationElMapRef]);

  // ── Keyboard variation reorder ──
  useEffect(() => {
    if (
      !isHovered ||
      !activeVariationId ||
      !onMoveVariation ||
      draggedId !== null ||
      commentMode ||
      checkedVariationIds.size === 0 ||
      !checkedVariationIds.has(activeVariationId)
    ) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      onMoveVariation(
        elementType,
        activeVariationId,
        e.key === "ArrowLeft" ? "left" : "right",
      );
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isHovered, activeVariationId, onMoveVariation, elementType, draggedId, commentMode, checkedVariationIds]);

  return (
    <div
      data-elementqueue
      className="relative mb-4"
      style={{
        opacity: isQueueReorderDragging ? 0.35 : isDragSource ? 0.55 : 1,
        transition: "opacity 0.15s ease, box-shadow 0.2s ease",
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          handleFileDragOver(e);
        } else if (draggedId && draggedId !== elementType && isImageElementType && isBodyDropValid(draggedId, elementType)) {
          onBodyDragOver(e, elementType);
        } else {
          onQueueReorderDragOver(e, elementType);
        }
      }}
      onDragLeave={(e) => {
        if (isFileDragOver) {
          handleFileDragLeave(e);
        } else if (dropTarget?.type === "body" && dropTarget.elementType === elementType) {
          onBodyDragLeave(e, elementType);
        } else {
          onQueueReorderDragLeave(e, elementType);
        }
      }}
      onDrop={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          handleFileDrop(e);
        } else if (dropTarget?.type === "body" && dropTarget.elementType === elementType) {
          onBodyDrop(e, elementType);
        } else {
          onQueueReorderDrop(e, elementType);
        }
      }}
    >
      {/* File drop overlay */}
      {isFileDragOver && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none"
          style={{
            border: "2px dashed var(--bb-user-active-accent)",
            borderRadius: 8,
          }}
        />
      )}

      {/* Variation move overlay */}
      {dropTarget?.type === "body" && dropTarget.elementType === elementType && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none"
          style={{
            border: "2px dashed var(--bb-user-active-accent)",
            borderRadius: 8,
          }}
        />
      )}

      {isQueueReorderDropTarget && (
        <div
          className="absolute -top-0.5 h-[3px] z-30 pointer-events-none"
          style={{
            left: queueStripeLeft,
            width: queueStripeWidth,
            background: colors.accent,
            boxShadow: `0 0 8px ${colors.accent}40`,
            borderRadius: 2,
          }}
        />
      )}

      <div
        className="relative overflow-visible"
        style={{ marginLeft: queueStripeLeft, width: queueStripeWidth }}
      >
        {/* Queue background stripe */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: isHovered ? colors.bgHover : colors.bg,
            borderTop: `1px solid ${colors.border}`,
            borderBottom: `1px solid ${colors.border}`,
            transition: "background 0.15s ease",
          }}
        />

        {/* Left accent bar */}
        <div
          className="absolute top-0 bottom-0 w-[3px] z-20 pointer-events-none"
          style={{ left: labelPinX - queueStripeLeft, background: colors.accent }}
        />

        {/* Pinned queue label */}
        <div
          className="absolute top-0 z-20 flex items-start pt-2 pointer-events-none"
          style={{ left: labelPinX - queueStripeLeft + 6 }}
        >
          <div
            className={`flex items-center gap-1.5 pointer-events-auto ${
              isQueueReorderEnabled ? "cursor-grab active:cursor-grabbing" : "cursor-not-allowed"
            }`}
            style={{ transform: `scale(${labelScale})`, transformOrigin: "left center" }}
            draggable={isQueueReorderEnabled}
            onDragStart={isQueueReorderEnabled ? (e) => onQueueReorderDragStart(e, elementType) : undefined}
            onDragEnd={onQueueReorderDragEnd}
            title={isQueueReorderEnabled ? "Drag label to reorder" : "Select one variation to enable reorder"}
            data-variation-slot
          >
            <div
              className={`flex-shrink-0 flex items-center justify-center w-5 h-5 rounded transition-colors group ${
                isQueueReorderEnabled
                  ? "cursor-grab active:cursor-grabbing hover:bg-black/[0.06]"
                  : "cursor-not-allowed opacity-40"
              }`}
              data-variation-slot
            >
              <GripVertical size={11} className="text-muted-foreground/40 group-hover:text-muted-foreground/70 transition-colors" />
            </div>

            <span
              className="select-none whitespace-nowrap"
              style={{ fontSize: TYPE.size.baseLg, fontWeight: 600, color: colors.accent }}
            >
              {label}
            </span>
          </div>
        </div>

        {/* Filmstrip cards */}
        <div
          ref={filmstripRef}
          data-filmstrip
          className="relative flex gap-4 overflow-x-auto bb-scrollbar-hide-x"
          style={{
            marginLeft: filmstripMarginLeft,
            width: filmstripWidth,
            boxSizing: "border-box",
            paddingLeft: LAYOUT.filmstrip.paddingLeft,
            paddingRight: LAYOUT.slot.paddingX,
            paddingTop: LAYOUT.filmstrip.paddingTop,
            paddingBottom: LAYOUT.filmstrip.paddingBottom,
            ...(filmstripMaskImage !== "none" ? { WebkitMaskImage: filmstripMaskImage, maskImage: filmstripMaskImage } : {}),
          }}
        >
          {/* Add variation slot */}
          {draggedId === null && onAddVariation && (
            <div
              style={{
                position: "absolute",
                left: LAYOUT.slot.addOffset,
                top: LAYOUT.filmstrip.paddingTop,
                width: LAYOUT.slot.addWidth,
                height: LAYOUT.slot.size,
                zIndex: 14,
                cursor: "pointer",
              }}
            >
              {isImageElementType && onUploadVariation && (
                <input
                  ref={addSlotFileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAddSlotFileChange}
                  aria-hidden
                />
              )}
              {elementType === "color-palette" && onUploadImageForPalette && (
                <input
                  ref={addSlotExtractInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAddSlotExtractChange}
                  aria-hidden
                />
              )}
              <AddVariationSlot
                label={label}
                colors={colors}
                isLoading={isAddingVariation ?? false}
                onClick={() => onAddVariation?.(elementType)}
                isImageElementType={isImageElementType}
                onUploadImage={onUploadVariation}
                onTriggerUpload={
                  isImageElementType && onUploadVariation
                    ? () => addSlotFileInputRef.current?.click()
                    : undefined
                }
                onExtractFromImage={
                  elementType === "color-palette" && onUploadImageForPalette
                    ? () => addSlotExtractInputRef.current?.click()
                    : undefined
                }
              />
            </div>
          )}

          {/* Queue-level affordance slot (cross-type merge only; same-type add-variation drag removed) */}
          {draggedId !== null && isSlotDropValid(draggedId, elementType) && (
            <QueueAffordanceSlot
              isHovered={dropTarget?.type === "slot" && dropTarget.elementType === elementType}
              isMerge
              hintText={resolveMergeUiHint(
                "slot",
                draggedId,
                elementType,
                getMergeHintVars?.({ sourceId: draggedId, variationId: draggedVariationId }),
              )}
              colors={colors}
              zoom={zoom}
              onDragOver={(e) => onSlotDragOver(e, elementType)}
              onDragLeave={(e) => onSlotDragLeave(e, elementType)}
              onDrop={(e) => onSlotDrop(e, elementType)}
            />
          )}

          {(sortedVersions.length === 0 && isAddingVariation) || isGeneratingPhase ? (
            <div className="flex-shrink-0 relative" style={{ width: slotW, height: slotH }} data-variation-slot>
              <ElementWrapper label={label} state={isBrewing ? "waiting" : "queued"}><div /></ElementWrapper>
            </div>
          ) : null}

          {isQueueMerging && (
            <div className="flex-shrink-0 relative" style={{ width: slotW, height: slotH }} data-variation-slot>
              <ElementWrapper label={label} state="merging"><div /></ElementWrapper>
            </div>
          )}

          {sortedVersions.map((variation) => {
            const isActive = variation.id === activeVariationId;
            const isThisMergeTarget =
              dropTarget?.type === "card" && dropTarget.elementType === elementType && dropTarget.variationId === variation.id;
            const isThisCommentTarget =
              commentTarget?.elementType === elementType && commentTarget?.variationId === variation.id;
            const showSlotAffordance =
              draggedId !== null &&
              draggedId !== elementType &&
              isMergeSupported(draggedId, elementType) &&
              !isThisMergeTarget;

            const variationState: VariationState =
              uploadingVariationIds?.has(variation.id) ? "uploading" :
              mergingVariationIds?.has(variation.id) ? "merging" :
              showSlotAffordance ? "available" :
              checkedVariationIds.has(variation.id) ? "active" :
              "inactive";
            const hasImageData = Boolean((variation.data as { imageUrl?: string } | null)?.imageUrl);
            const imageAspectRatio = imageAspectRatios[variation.id] ?? 1;
            const dynamicCardW = Math.max(
              Math.round(slotH * 0.5),
              Math.round((slotH - LAYOUT.slot.paddingX) * imageAspectRatio + LAYOUT.slot.paddingX)
            );
            const slotWidth = hasImageData ? dynamicCardW : slotW;
            const isLinkedToActiveConcept =
              elementType !== "visual-concept" &&
              Boolean(activeConceptId) &&
              variation.meta?.sourceConceptVariationId === activeConceptId;
            const commentHighlightShadow = isThisCommentTarget
              ? `0 0 0 2.5px var(--bb-user-active-accent), 0 0 0 5px var(--bb-user-active-border)`
              : null;

            return (
              <div
                ref={(el) => {
                  if (el) variationElMapRef.current.set(variation.id, el);
                  else variationElMapRef.current.delete(variation.id);
                }}
                key={variation.id}
                data-variation-slot
                className={`flex-shrink-0 relative group/variation${commentMode && !isThisCommentTarget ? " comment-mode-variation" : ""}`}
                style={{
                  width: slotWidth,
                  height: slotH,
                  ...(commentHighlightShadow ? { boxShadow: commentHighlightShadow, borderRadius: 12 } : {}),
                }}
                draggable={!commentMode && !uploadingVariationIds?.has(variation.id)}
                onClick={commentMode ? (e) => {
                  e.stopPropagation();
                  onCommentClick?.(elementType, variation.id);
                } : undefined}
                onDragStart={commentMode ? undefined : (e) => onDragStart(e, elementType, variation.id)}
                onDragEnd={commentMode ? undefined : onDragEnd}
                onDragOver={(e) => onCardDragOver(e, elementType, variation.id)}
                onDragLeave={(e) => onCardDragLeave(e, elementType, variation.id)}
                onDrop={onCardDrop}
              >
                <VariationSlot
                  elementType={elementType}
                  variation={variation}
                  isActive={isActive}
                  canDelete={sortedVersions.length > 1}
                  variationState={variationState}
                  peerVariationIds={sortedVersions.map((v) => v.id).filter((id) => id !== variation.id)}
                  brandBrief={brandBrief}
                  onEditSave={onEditSave}
                  onToggleVariationChecked={onToggleVariationChecked}
                  onDeleteVariation={onDeleteVariation}
                  onImageAspectRatioChange={handleImageAspectRatioChange}
                />

                {isLinkedToActiveConcept && (
                  <div
                    className="absolute z-20 pointer-events-none rounded-full"
                    style={{
                      top: adaptiveSize(8, zoom, 6, 14),
                      left: adaptiveSize(8, zoom, 6, 14),
                      width: adaptiveSize(LAYOUT.connection.portRadius * 2, zoom),
                      height: adaptiveSize(LAYOUT.connection.portRadius * 2, zoom),
                      background: "var(--bb-ai-active-ring)",
                      opacity: 0.7,
                    }}
                  />
                )}

                {isThisMergeTarget && (
                  <div
                    className="absolute inset-0 z-30 rounded-xl pointer-events-none"
                    style={MERGE_TARGET_OVERLAY_STYLE}
                  />
                )}
              </div>
            );
          })}

          {/* Queue body drop block: file upload affordance */}
          {isImageElementType && onUploadVariation && (
            <QueueBodyDropBlock
              colors={colors}
              isImageElementType={true}
              onUploadFile={onUploadVariation}
            />
          )}
        </div>
      </div>
    </div>
  );
});
