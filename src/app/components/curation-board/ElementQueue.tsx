import React, { useState, useCallback, useRef, useEffect } from "react";
import { GripVertical, Upload } from "lucide-react";
import { LAYOUT, CANVAS, TYPOGRAPHY, ELEMENT_TYPE_LABELS as LABELS, adaptiveSize } from "../../utils/design-tokens";
import type { SlotPosition } from "../curation-board";
import { getMergeHint, isMergeSupported } from "../../utils/merge-logic";
import { IMAGE_ELEMENT_IDS } from "../../types/project";
import type { ElementId } from "../../types/project";
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
  isMerging: boolean;
  isDragSource: boolean;
  isQueueReorderDragging: boolean;
  isQueueReorderDropTarget: boolean;
  draggedId: string | null;
  mergeTarget: { elementType: string; variationId: string } | null;
  queueMergeTarget: string | null;
  checkedVariationIds: Set<string>;
  brandBrief?: { name?: string; tagline?: string; description?: string };
  variationElMapRef: React.RefObject<Map<string, HTMLDivElement>>;
  slotPositionMapRef: React.RefObject<Map<string, SlotPosition>>;
  filmstripScrollMapRef: React.RefObject<Map<string, number>>;
  onFilmstripScroll: React.Dispatch<React.SetStateAction<number>>;
  // Drag merge handlers
  onDragStart: (e: React.DragEvent<HTMLDivElement>, elementType: string, variationId: string) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>, targetElementType: string, targetVariationId: string) => void;
  onDragLeave: (e: React.DragEvent<HTMLDivElement>, targetElementType: string, targetVariationId: string) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  isQueueSlotDropValid: (dragSourceElementType: string, targetElementType: string) => boolean;
  onQueueSlotDragOver: (e: React.DragEvent<HTMLDivElement>, targetElementType: string) => void;
  onQueueSlotDragLeave: (e: React.DragEvent<HTMLDivElement>, targetElementType: string) => void;
  onQueueSlotDrop: (e: React.DragEvent<HTMLDivElement>, targetElementType: string) => void;
  queueBodyDropTarget?: string | null;
  isQueueBodyDropValid?: (source: string, target: string) => boolean;
  onQueueBodyDragOver?: (e: React.DragEvent<HTMLDivElement>, targetElementType: string) => void;
  onQueueBodyDragLeave?: (e: React.DragEvent<HTMLDivElement>, targetElementType: string) => void;
  onQueueBodyDrop?: (e: React.DragEvent<HTMLDivElement>, targetElementType: string) => void;
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
  /** True when initial brand generation is in progress (empty queues show "Brewing…") */
  isGeneratingPhase?: boolean;
  // Upload variation (image element types only)
  onUploadVariation?: (file: File) => void;
  uploadingVariationIds?: Set<string>;
  // Comment mode
  commentMode?: boolean;
  commentTarget?: { elementType: string; variationId: string } | null;
  onCommentClick?: (elementType: string, variationId: string) => void;
  // Keyboard variation reorder
  onMoveVariation?: (elementType: string, variationId: string, direction: "left" | "right") => void;
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
  isMerging,
  isDragSource,
  isQueueReorderDragging,
  isQueueReorderDropTarget,
  draggedId,
  mergeTarget,
  queueMergeTarget,
  checkedVariationIds,
  brandBrief,
  variationElMapRef,
  slotPositionMapRef,
  filmstripScrollMapRef,
  onFilmstripScroll,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  isQueueSlotDropValid,
  onQueueSlotDragOver,
  onQueueSlotDragLeave,
  onQueueSlotDrop,
  queueBodyDropTarget,
  isQueueBodyDropValid,
  onQueueBodyDragOver,
  onQueueBodyDragLeave,
  onQueueBodyDrop,
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
  onUploadVariation,
  uploadingVariationIds,
  commentMode,
  commentTarget,
  onCommentClick,
  onMoveVariation,
}: ElementQueueProps) {
  const [isLeftAreaHovered, setIsLeftAreaHovered] = useState(false);
  const [isFileDragOver, setIsFileDragOver] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [imageAspectRatios, setImageAspectRatios] = useState<Record<string, number>>({});
  const addSlotFileInputRef = useRef<HTMLInputElement>(null);
  const filmstripRef = useRef<HTMLDivElement>(null);

  const isImageElementType = IMAGE_ELEMENT_IDS.has(elementType as ElementId);

  const handleAddSlotFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onUploadVariation?.(file);
      e.target.value = "";
    },
    [onUploadVariation],
  );

  // variations are pre-sorted by the parent via useVariationReorder
  const sortedVersions = variations;
  const label = LABELS[elementType] ?? elementType;
  const slotW = (elementType === "application" || elementType === "art-style") ? Math.round(LAYOUT.VARIATION_SLOT_SIZE * (16 / 9)) : LAYOUT.VARIATION_SLOT_SIZE;
  const slotH = LAYOUT.VARIATION_SLOT_SIZE;
  const count = sortedVersions.length;
  const colors = isQueueActive ? EQ_ACTIVE_COLOR : EQ_INACTIVE_COLOR;
  const labelScale = adaptiveSize(1, zoom, CANVAS.ACTION_BAR_SCALE_MIN, CANVAS.ACTION_BAR_SCALE_MAX);

  const vpLeftCanvas = -pan.x / zoom;
  const vpWidthCanvas = containerWidth > 0 ? containerWidth / zoom : 4000;
  const queueStripeLeft = vpLeftCanvas - LAYOUT.QUEUE_STRIPE_OVERHANG;
  const queueStripeWidth = vpWidthCanvas + 2 * LAYOUT.QUEUE_STRIPE_OVERHANG;
  const labelPinX = (8 - pan.x) / zoom;
  // Filmstrip starts at the accent-bar x so overflow-x:auto clips cards there,
  // preventing them from visually passing through the left queue boundary.
  const filmstripMarginLeft = labelPinX - queueStripeLeft; // = 8/zoom + QUEUE_STRIPE_OVERHANG
  const filmstripWidth = vpWidthCanvas - (filmstripMarginLeft - LAYOUT.QUEUE_STRIPE_OVERHANG); // = vpWidthCanvas - 8/zoom

  const handleImageAspectRatioChange = useCallback((variationId: string, aspectRatio: number) => {
    if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) return;
    setImageAspectRatios((prev) => {
      if (prev[variationId] === aspectRatio) return prev;
      return { ...prev, [variationId]: aspectRatio };
    });
  }, []);

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
    const gap = LAYOUT.FILMSTRIP_GAP;
    let acc = 0;
    for (const variation of sortedVersions) {
      const hasImage = Boolean((variation.data as { imageUrl?: string } | null)?.imageUrl);
      const ar = imageAspectRatios[variation.id] ?? 1;
      const dynW = Math.max(
        Math.round(slotH * 0.5),
        Math.round((slotH - LAYOUT.VARIATION_SLOT_PADDING_X) * ar + LAYOUT.VARIATION_SLOT_PADDING_X),
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

  // ── Keyboard variation reorder ──
  useEffect(() => {
    if (!isHovered || !activeVariationId || !onMoveVariation || draggedId !== null || commentMode) return;

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
  }, [isHovered, activeVariationId, onMoveVariation, elementType, draggedId, commentMode]);

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
        } else if (draggedId && draggedId !== elementType && isImageElementType && isQueueBodyDropValid?.(draggedId, elementType)) {
          onQueueBodyDragOver?.(e, elementType);
        } else {
          onQueueReorderDragOver(e, elementType);
        }
      }}
      onDragLeave={(e) => {
        if (isFileDragOver) {
          handleFileDragLeave(e);
        } else if (queueBodyDropTarget === elementType) {
          onQueueBodyDragLeave?.(e, elementType);
        } else {
          onQueueReorderDragLeave(e, elementType);
        }
      }}
      onDrop={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          handleFileDrop(e);
        } else if (queueBodyDropTarget === elementType) {
          onQueueBodyDrop?.(e, elementType);
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
      {queueBodyDropTarget === elementType && (
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
            className="flex items-center gap-1.5 pointer-events-auto"
            style={{ transform: `scale(${labelScale})`, transformOrigin: "left center" }}
          >
            <div
              draggable
              onDragStart={(e) => onQueueReorderDragStart(e, elementType)}
              onDragEnd={onQueueReorderDragEnd}
              className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded cursor-grab active:cursor-grabbing hover:bg-black/[0.06] transition-colors group"
              title="Drag to reorder"
              data-variation-slot
            >
              <GripVertical size={11} className="text-muted-foreground/40 group-hover:text-muted-foreground/70 transition-colors" />
            </div>

            <span
              className="select-none whitespace-nowrap"
              style={{ fontSize: TYPOGRAPHY.cardTagline.fontSize, fontWeight: 600, color: colors.accent }}
            >
              {label}
            </span>

            {count > 1 && (
              <span
                className="px-1.5 py-0.5 rounded-full select-none whitespace-nowrap"
                style={{
                  fontSize: TYPOGRAPHY.badge.fontSize,
                  fontWeight: 600,
                  color: colors.accent,
                  background: `${colors.accent}14`,
                  border: `1px solid ${colors.accent}22`,
                }}
              >
                {count}v
              </span>
            )}
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
            paddingLeft: LAYOUT.FILMSTRIP_PADDING_LEFT,
            paddingRight: LAYOUT.VARIATION_SLOT_PADDING_X,
            paddingTop: LAYOUT.FILMSTRIP_PADDING_TOP,
            paddingBottom: LAYOUT.FILMSTRIP_PADDING_BOTTOM,
          }}
        >
          {/* Add variation hover zone — sized exactly to the card footprint to prevent premature trigger */}
          {draggedId === null && onAddVariation && (
            <div
              style={{
                position: "absolute",
                left: LAYOUT.ADD_SLOT_LEFT_OFFSET,
                top: LAYOUT.FILMSTRIP_PADDING_TOP,
                width: LAYOUT.ADD_SLOT_WIDTH,
                height: LAYOUT.VARIATION_SLOT_SIZE,
                zIndex: 14,
              }}
              onMouseEnter={() => setIsLeftAreaHovered(true)}
              onMouseLeave={() => setIsLeftAreaHovered(false)}
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
              {(isLeftAreaHovered || isAddingVariation) && (
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
                />
              )}
            </div>
          )}

          {/* Queue-level affordance slot */}
          {draggedId !== null && isQueueSlotDropValid(draggedId, elementType) && !(isImageElementType && draggedId === elementType) && (
            <QueueAffordanceSlot
              isHovered={queueMergeTarget === elementType}
              isMerge={draggedId !== elementType}
              hintText={
                draggedId === elementType
                  ? "Add variation"
                  : getMergeHint(draggedId, elementType)
              }
              colors={colors}
              zoom={zoom}
              onDragOver={(e) => onQueueSlotDragOver(e, elementType)}
              onDragLeave={(e) => onQueueSlotDragLeave(e, elementType)}
              onDrop={(e) => onQueueSlotDrop(e, elementType)}
            />
          )}

          {sortedVersions.length === 0 && (isAddingVariation || isGeneratingPhase) && (
            <div className="flex-shrink-0 relative" style={{ width: slotW, height: slotH }} data-variation-slot>
              <ElementWrapper label={label} state="waiting"><div /></ElementWrapper>
            </div>
          )}

          {sortedVersions.map((variation) => {
            const isActive = variation.id === activeVariationId;
            const isThisMergeTarget =
              mergeTarget?.elementType === elementType && mergeTarget?.variationId === variation.id;
            const isThisCommentTarget =
              commentTarget?.elementType === elementType && commentTarget?.variationId === variation.id;
            const showSlotAffordance =
              draggedId !== null &&
              draggedId !== elementType &&
              isMergeSupported(draggedId, elementType) &&
              !isThisMergeTarget;

            const variationState: VariationState =
              uploadingVariationIds?.has(variation.id) ? "uploading" :
              (isActive && isMerging) ? "merging" :
              showSlotAffordance ? "available" :
              checkedVariationIds.has(variation.id) ? "active" :
              "inactive";
            const hasImageData = Boolean((variation.data as { imageUrl?: string } | null)?.imageUrl);
            const imageAspectRatio = imageAspectRatios[variation.id] ?? 1;
            const dynamicCardW = Math.max(
              Math.round(slotH * 0.5),
              Math.round((slotH - LAYOUT.VARIATION_SLOT_PADDING_X) * imageAspectRatio + LAYOUT.VARIATION_SLOT_PADDING_X)
            );
            const slotWidth = hasImageData ? dynamicCardW : slotW;

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
                  ...(isThisCommentTarget ? {
                    boxShadow: `0 0 0 2.5px var(--bb-user-active-accent), 0 0 0 5px var(--bb-user-active-border)`,
                    borderRadius: 12,
                  } : {}),
                }}
                draggable={!commentMode && !uploadingVariationIds?.has(variation.id)}
                onClick={commentMode ? (e) => {
                  e.stopPropagation();
                  onCommentClick?.(elementType, variation.id);
                } : undefined}
                onDragStart={commentMode ? undefined : (e) => onDragStart(e, elementType, variation.id)}
                onDragEnd={commentMode ? undefined : onDragEnd}
                onDragOver={(e) => onDragOver(e, elementType, variation.id)}
                onDragLeave={(e) => onDragLeave(e, elementType, variation.id)}
                onDrop={onDrop}
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
                  onAddVariation={onAddVariation}
                  onToggleVariationChecked={onToggleVariationChecked}
                  onDeleteVariation={onDeleteVariation}
                  onImageAspectRatioChange={handleImageAspectRatioChange}
                />

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
