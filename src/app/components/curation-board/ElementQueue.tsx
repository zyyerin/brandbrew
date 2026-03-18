import React, { useState, useCallback } from "react";
import { Sparkles, GripVertical, Upload } from "lucide-react";
import { LAYOUT, CARD_LABELS as LABELS } from "../../utils/design-tokens";
import { getMergeHint, isMergeSupported } from "../../utils/merge-logic";
import { IMAGE_ELEMENT_IDS } from "../../types/project";
import type { ElementId } from "../../types/project";
import { CardWrapper } from "../brand-cards";
import type { CardState } from "../brand-cards";
import type { VariationItem } from "../variations-panel";
import type { BrandData } from "../../types/brand";
import { QueueAffordanceSlot } from "./QueueAffordanceSlot";
import type { QueueColors } from "./QueueAffordanceSlot";
import { AddVariationSlot } from "./AddVariationSlot";
import { VariationSlot } from "./VariationSlot";

interface ElementQueueProps {
  cardId: string;
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
  mergeTarget: { cardId: string; varId: string } | null;
  queueMergeTarget: string | null;
  checkedVariationIds: Set<string>;
  brandBrief?: BrandData["brandBrief"];
  cardElMapRef: React.RefObject<Map<string, HTMLDivElement>>;
  // Drag merge handlers
  onDragStart: (e: React.DragEvent<HTMLDivElement>, cardId: string, varId: string) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>, targetCardId: string, targetVarId: string) => void;
  onDragLeave: (e: React.DragEvent<HTMLDivElement>, targetCardId: string, targetVarId: string) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  isQueueSlotDropValid: (dragSourceId: string, targetQueueCardId: string) => boolean;
  onQueueSlotDragOver: (e: React.DragEvent<HTMLDivElement>, targetQueueCardId: string) => void;
  onQueueSlotDragLeave: (e: React.DragEvent<HTMLDivElement>, targetQueueCardId: string) => void;
  onQueueSlotDrop: (e: React.DragEvent<HTMLDivElement>, targetQueueCardId: string) => void;
  // Queue reorder handlers
  onQueueReorderDragStart: (e: React.DragEvent<HTMLDivElement>, cardId: string) => void;
  onQueueReorderDragEnd: () => void;
  onQueueReorderDragOver: (e: React.DragEvent<HTMLDivElement>, cardId: string) => void;
  onQueueReorderDragLeave: (e: React.DragEvent<HTMLDivElement>, cardId: string) => void;
  onQueueReorderDrop: (e: React.DragEvent<HTMLDivElement>, targetCardId: string) => void;
  // Card action handlers
  onEditSave?: (componentId: string, patch: Partial<BrandData>) => void;
  onRefresh?: (componentId: string) => void;
  onToggleVariationChecked?: (variationId: string, peerVariationIds: string[]) => void;
  onDeleteVariation?: (componentId: string, variationId: string) => void;
  // Add variation
  onAddVariation?: () => void;
  isAddingVariation?: boolean;
  // Upload variation (image cards only)
  onUploadVariation?: (file: File) => void;
  // Comment mode
  commentMode?: boolean;
  commentTarget?: { cardId: string; varId: string } | null;
  onCommentClick?: (cardId: string, varId: string) => void;
}

const EQ_ACTIVE_COLOR: QueueColors = {
  bg: "var(--bb-user-active-bg)",
  border: "var(--bb-user-active-border)",
  accent: "var(--bb-user-active-accent)",
};
const EQ_INACTIVE_COLOR: QueueColors = {
  bg: "var(--bb-user-inactive-bg)",
  border: "var(--bb-user-inactive-border)",
  accent: "var(--bb-user-inactive-accent)",
};

export const ElementQueue = React.memo(function ElementQueue({
  cardId,
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
  cardElMapRef,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  isQueueSlotDropValid,
  onQueueSlotDragOver,
  onQueueSlotDragLeave,
  onQueueSlotDrop,
  onQueueReorderDragStart,
  onQueueReorderDragEnd,
  onQueueReorderDragOver,
  onQueueReorderDragLeave,
  onQueueReorderDrop,
  onEditSave,
  onRefresh,
  onToggleVariationChecked,
  onDeleteVariation,
  onAddVariation,
  isAddingVariation,
  onUploadVariation,
  commentMode,
  commentTarget,
  onCommentClick,
}: ElementQueueProps) {
  const [isLeftAreaHovered, setIsLeftAreaHovered] = useState(false);
  const [isFileDragOver, setIsFileDragOver] = useState(false);
  const [imageAspectRatios, setImageAspectRatios] = useState<Record<string, number>>({});

  const isImageCard = IMAGE_ELEMENT_IDS.has(cardId as ElementId);

  const sortedVersions = [...variations].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );
  const label = LABELS[cardId] ?? cardId;
  const cardW = (cardId === "layout" || cardId === "art-style") ? Math.round(LAYOUT.CARD_SIZE * (16 / 9)) : LAYOUT.CARD_SIZE;
  const cardH = LAYOUT.CARD_SIZE;
  const count = sortedVersions.length;
  const colors = isQueueActive ? EQ_ACTIVE_COLOR : EQ_INACTIVE_COLOR;
  const labelScale = Math.min(Math.max(1 / zoom, 0.5), 3.5);

  const vpLeftCanvas = -pan.x / zoom;
  const vpWidthCanvas = containerWidth > 0 ? containerWidth / zoom : 4000;
  const queueStripeLeft = vpLeftCanvas - 200;
  const queueStripeWidth = vpWidthCanvas + 400;
  const labelPinX = (8 - pan.x) / zoom;

  const handleImageAspectRatioChange = useCallback((variationId: string, aspectRatio: number) => {
    if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) return;
    setImageAspectRatios((prev) => {
      if (prev[variationId] === aspectRatio) return prev;
      return { ...prev, [variationId]: aspectRatio };
    });
  }, []);

  const handleFileDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (!isImageCard || !onUploadVariation) return;
      if (!e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      e.stopPropagation();
      setIsFileDragOver(true);
    },
    [isImageCard, onUploadVariation],
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
      if (!isImageCard || !onUploadVariation) return;
      if (!e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      e.stopPropagation();
      setIsFileDragOver(false);

      const file = e.dataTransfer.files[0];
      if (file?.type.startsWith("image/")) {
        onUploadVariation(file);
      }
    },
    [isImageCard, onUploadVariation],
  );

  return (
    <div
      data-elementqueue
      className="relative mb-4"
      style={{
        opacity: isQueueReorderDragging ? 0.35 : isDragSource ? 0.55 : 1,
        transition: "opacity 0.15s ease, box-shadow 0.2s ease",
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          handleFileDragOver(e);
        } else {
          onQueueReorderDragOver(e, cardId);
        }
      }}
      onDragLeave={(e) => {
        if (isFileDragOver) {
          handleFileDragLeave(e);
        } else {
          onQueueReorderDragLeave(e, cardId);
        }
      }}
      onDrop={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          handleFileDrop(e);
        } else {
          onQueueReorderDrop(e, cardId);
        }
      }}
    >
      {/* File drop overlay */}
      {isFileDragOver && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none"
          style={{
            background: "rgba(139, 92, 246, 0.08)",
            border: "2px dashed var(--bb-ai-active-ring)",
            borderRadius: 8,
          }}
        >
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/90 shadow-sm">
            <Upload size={16} style={{ color: "var(--bb-ai-active-ring)" }} />
            <span
              className="text-[12px]"
              style={{ fontWeight: 600, color: "var(--bb-ai-active-ring)" }}
            >
              Drop image to add as variation
            </span>
          </div>
        </div>
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
            background: colors.bg,
            borderTop: `1px solid ${colors.border}`,
            borderBottom: `1px solid ${colors.border}`,
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
              onDragStart={(e) => onQueueReorderDragStart(e, cardId)}
              onDragEnd={onQueueReorderDragEnd}
              className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded cursor-grab active:cursor-grabbing hover:bg-black/[0.06] transition-colors group"
              title="Drag to reorder"
              data-card-slot
            >
              <GripVertical size={11} className="text-muted-foreground/40 group-hover:text-muted-foreground/70 transition-colors" />
            </div>

            <span
              className="select-none whitespace-nowrap text-[14px]"
              style={{ fontWeight: 600, color: colors.accent }}
            >
              {label}
            </span>

            {count > 1 && (
              <span
                className="text-[9px] px-1.5 py-0.5 rounded-full select-none whitespace-nowrap"
                style={{
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
          data-filmstrip
          className="relative flex gap-4 overflow-x-auto"
          style={{
            marginLeft: 200,
            width: vpWidthCanvas,
            boxSizing: "border-box",
            paddingLeft: 156,
            paddingRight: 40,
            paddingTop: 24,
            paddingBottom: 8,
            scrollbarWidth: "thin",
            scrollbarColor: "var(--bb-scrollbar-thumb) var(--bb-scrollbar-track)",
          }}
        >
          {/* Add variation hover zone — sized exactly to the card footprint to prevent premature trigger */}
          {draggedId === null && onAddVariation && (
            <div
              style={{
                position: "absolute",
                left: 16,
                top: 24,
                width: 124,
                height: LAYOUT.CARD_SIZE,
                zIndex: 14,
              }}
              onMouseEnter={() => setIsLeftAreaHovered(true)}
              onMouseLeave={() => setIsLeftAreaHovered(false)}
            >
              {(isLeftAreaHovered || isAddingVariation) && (
                <AddVariationSlot
                  label={label}
                  colors={colors}
                  isLoading={isAddingVariation ?? false}
                  isAvailable={isQueueActive}
                  onClick={onAddVariation}
                  isImageCard={isImageCard}
                  onUploadImage={onUploadVariation}
                />
              )}
            </div>
          )}

          {/* Queue-level affordance slot */}
          {draggedId !== null && isQueueSlotDropValid(draggedId, cardId) && (
            <QueueAffordanceSlot
              isHovered={queueMergeTarget === cardId}
              hintText={
                draggedId === cardId
                  ? "Regenerate"
                  : getMergeHint(draggedId, cardId)
              }
              colors={colors}
              onDragOver={(e) => onQueueSlotDragOver(e, cardId)}
              onDragLeave={(e) => onQueueSlotDragLeave(e, cardId)}
              onDrop={(e) => onQueueSlotDrop(e, cardId)}
            />
          )}

          {sortedVersions.length === 0 && (
            <div className="flex-shrink-0 relative" style={{ width: cardW, height: cardH }} data-card-slot>
              <CardWrapper label={label} state="waiting"><div /></CardWrapper>
            </div>
          )}

          {sortedVersions.map((variation) => {
            const isActive = variation.id === activeVariationId;
            const isThisMergeTarget =
              mergeTarget?.cardId === cardId && mergeTarget?.varId === variation.id;
            const isThisCommentTarget =
              commentTarget?.cardId === cardId && commentTarget?.varId === variation.id;
            const showSlotAffordance =
              draggedId !== null &&
              draggedId !== cardId &&
              isMergeSupported(draggedId, cardId) &&
              !isThisMergeTarget;

            const cardState: CardState =
              (isActive && isMerging) ? "merging" :
              showSlotAffordance ? "available" :
              checkedVariationIds.has(variation.id) ? "active" :
              "inactive";
            const hasImageData = Boolean((variation.data as { imageUrl?: string } | null)?.imageUrl);
            const imageAspectRatio = imageAspectRatios[variation.id] ?? 1;
            const dynamicCardW = Math.max(Math.round(cardH * 0.5), Math.round(cardH * imageAspectRatio));
            const slotWidth = hasImageData ? dynamicCardW : cardW;

            return (
              <div
                ref={(el) => {
                  if (el) cardElMapRef.current.set(variation.id, el);
                  else cardElMapRef.current.delete(variation.id);
                }}
                key={variation.id}
                data-card-slot
                className={`flex-shrink-0 relative group/card${commentMode && !isThisCommentTarget ? " comment-mode-card" : ""}`}
                style={{
                  width: slotWidth,
                  height: cardH,
                  ...(isThisCommentTarget ? {
                    boxShadow: "0 0 0 2.5px #3b82f6, 0 0 0 5px rgba(59,130,246,0.18)",
                    borderRadius: 12,
                  } : {}),
                }}
                draggable={!commentMode}
                onClick={commentMode ? (e) => {
                  e.stopPropagation();
                  onCommentClick?.(cardId, variation.id);
                } : undefined}
                onDragStart={commentMode ? undefined : (e) => onDragStart(e, cardId, variation.id)}
                onDragEnd={commentMode ? undefined : onDragEnd}
                onDragOver={(e) => onDragOver(e, cardId, variation.id)}
                onDragLeave={(e) => onDragLeave(e, cardId, variation.id)}
                onDrop={onDrop}
              >
                <VariationSlot
                  cardId={cardId}
                  variation={variation}
                  isActive={isActive}
                  canDelete={sortedVersions.length > 1}
                  cardState={cardState}
                  peerVariationIds={sortedVersions.map((v) => v.id).filter((id) => id !== variation.id)}
                  brandBrief={brandBrief}
                  onEditSave={onEditSave}
                  onRefresh={onRefresh}
                  onToggleVariationChecked={onToggleVariationChecked}
                  onDeleteVariation={onDeleteVariation}
                  onImageAspectRatioChange={handleImageAspectRatioChange}
                />

                {isThisMergeTarget && (
                  <div
                    className="absolute inset-0 z-30 rounded-xl flex flex-col items-center justify-center gap-2 pointer-events-none"
                    style={{
                      background: "var(--bb-ai-active-bg)",
                      boxShadow:
                        "0 0 0 2px var(--bb-ai-active-ring), 0 0 0 5px var(--bb-ai-active-ring-outer)",
                      borderRadius: 12,
                      backdropFilter: "blur(1px)",
                    }}
                  >
                    <div className="w-10 h-10 rounded-full bg-violet-500 flex items-center justify-center shadow-lg">
                      <Sparkles size={18} className="text-white" />
                    </div>
                    <span
                      className="text-[11px] text-violet-700 px-2 py-0.5 rounded-full bg-white/80 shadow-sm"
                      style={{ fontWeight: 700, letterSpacing: "0.04em" }}
                    >
                      {getMergeHint(draggedId ?? "", cardId)}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});
