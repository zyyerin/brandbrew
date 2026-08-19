import React, { useState, useRef, useCallback, useEffect } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  Pencil, Trash2, Check, Info, X,
} from "lucide-react";

import { GenerationDetailsPanel } from "../GenerationDetailsPanel";
import type { VariationState, EditVariant, VariationMeta } from "./types";
import { VariationStateOverlay } from "./VariationStateOverlay";
import { LAYOUT, TYPE, CANVAS, adaptiveSize } from "../../utils/design-tokens";
import { usePopupPosition } from "./usePopupPosition";
import { useCanvasZoom } from "../../contexts/CanvasZoomContext";
import { cancelAllCardEdits } from "./useCardEditing";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

const VIEWPORT_PADDING = 16;
const POPUP_HEADER_HEIGHT = 48; // GenerationDetailsPanel header height

interface ElementWrapperProps {
  label: string;
  children: ReactNode;
  state?: VariationState;
  onToggleActive?: () => void;
  onDelete?: () => void;
  meta?: VariationMeta;
  editVariant?: EditVariant;
  onEditEnter?: () => void;
  onEditSave?: () => void;
  onEditCancel?: () => void;
  isEditing?: boolean;
  className?: string;
  extraActions?: ReactNode;
}

interface ActionIconButtonProps {
  tooltip: string;
  className: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  children: ReactNode;
  buttonRef?: React.Ref<HTMLButtonElement>;
}

function ActionIconButton({
  tooltip,
  className,
  onClick,
  children,
  buttonRef,
}: ActionIconButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          ref={buttonRef}
          onClick={onClick}
          className={className}
          data-no-card-toggle
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6}>
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

export function ElementWrapper({
  label,
  children,
  state = "inactive",
  onToggleActive,
  onDelete,
  meta,
  editVariant,
  onEditEnter,
  onEditSave,
  onEditCancel,
  isEditing,
  className = "",
  extraActions,
}: ElementWrapperProps) {
  const [showMeta, setShowMeta] = useState(false);
  const infoBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isEditing) setShowMeta(false);
  }, [isEditing]);

  const isActive = state === "active";
  const hasOverlay = state === "waiting" || state === "merging" || state === "available" || state === "uploading";
  const zoom = useCanvasZoom();
  const actionBarScale = adaptiveSize(1, zoom, CANVAS.ACTION_BAR_SCALE_MIN, CANVAS.ACTION_BAR_SCALE_MAX);
  const actionBarTopPadding = adaptiveSize(24, zoom, 24, 40);
  const actionBarBottomPadding = adaptiveSize(8, zoom, 8, 14);

  const handleCloseMeta = useCallback(() => setShowMeta(false), []);

  const { pos: popupPos, containerRef: metaRef } = usePopupPosition(
    infoBtnRef,
    showMeta,
    handleCloseMeta,
    { width: LAYOUT.popup.detailsWidth, maxHeight: 9999, padding: VIEWPORT_PADDING },
  );

  const borderWidth = adaptiveSize(1, zoom, 0.5, 3);
  const ringWidth = adaptiveSize(2, zoom, 1, 6);

  const isMerging = state === "merging";
  const isContentChanging = isEditing || isMerging;

  const borderClass = isEditing
    ? "border-bb-user-active-accent"
    : isMerging
      ? "border-bb-ai-affordance-border"
      : "border-border/60 hover:border-border/90";

  const wrapperStyle: React.CSSProperties = {
    borderWidth,
    ...(isContentChanging
      ? {
          boxShadow: isEditing
            ? [
                `0 0 0 ${ringWidth}px rgba(96, 165, 250, 0.35)`,
                `0 4px 6px -1px rgba(219, 234, 254, 0.5)`,
              ].join(", ")
            : [
                `0 0 0 ${ringWidth}px rgba(139, 92, 246, 0.3)`,
                `0 4px 6px -1px rgba(196, 181, 253, 0.4)`,
              ].join(", "),
        }
      : {}),
  };

  const handleCardClick = useCallback((e: React.MouseEvent) => {
    if (!onToggleActive || hasOverlay || isEditing) return;
    if ((e.target as HTMLElement).closest('[data-no-card-toggle]')) return;
    cancelAllCardEdits();
    onToggleActive();
  }, [onToggleActive, hasOverlay, isEditing]);

  const showInteractiveHover =
    !isContentChanging && !hasOverlay;

  return (
    <div
      className={`bg-white rounded-xl border overflow-hidden flex flex-col absolute inset-0 transition-all duration-150 group/variation shadow-none
        ${borderClass}
        ${showInteractiveHover ? "hover:shadow-[var(--bb-hud-shadow)]" : ""}
        ${onToggleActive && !hasOverlay && !isEditing ? "cursor-pointer" : ""}
        ${className}`}
      style={wrapperStyle}
      onClick={handleCardClick}
    >
      <div className="flex-1 p-5 relative flex flex-col [&_*]:not-italic overflow-hidden min-h-0">
        {children}
      </div>

      {!hasOverlay && (
        <div
          data-no-card-toggle
          className={`absolute bottom-0 left-0 right-0 flex items-end justify-end px-3 bg-gradient-to-t from-white/95 via-white/90 to-white/0 transition-opacity duration-150 z-10 ${
            isEditing
              ? "opacity-100 pointer-events-auto"
              : "opacity-0 group-hover/variation:opacity-100 pointer-events-none group-hover/variation:pointer-events-auto"
          }`}
          style={{ paddingTop: actionBarTopPadding, paddingBottom: actionBarBottomPadding }}
        >
          <div
            className="flex items-center gap-1"
            style={{ transform: `scale(${actionBarScale})`, transformOrigin: "right bottom" }}
          >
            {!isEditing && (
              <ActionIconButton
                buttonRef={infoBtnRef}
                onClick={(e) => { e.stopPropagation(); setShowMeta((v) => !v); }}
                className={`p-1 rounded-md transition-colors ${showMeta ? "text-blue-500 bg-blue-50" : "text-muted-foreground/60 hover:text-foreground hover:bg-muted"}`}
                tooltip="Info"
              >
                <Info size={TYPE.icon.base} />
              </ActionIconButton>
            )}

            {!isEditing && extraActions}

            {editVariant && (
              isEditing ? (
                <>
                  <ActionIconButton
                    onClick={(e) => { e.stopPropagation(); onEditSave?.(); }}
                    className="p-1 rounded-md text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                    tooltip="Save"
                  >
                    <Check size={TYPE.icon.base} />
                  </ActionIconButton>
                  <ActionIconButton
                    onClick={(e) => { e.stopPropagation(); onEditCancel?.(); }}
                    className="p-1 rounded-md text-muted-foreground/60 hover:text-destructive hover:bg-red-50 transition-colors"
                    tooltip="Cancel"
                  >
                    <X size={TYPE.icon.base} />
                  </ActionIconButton>
                </>
              ) : (
                <ActionIconButton
                  onClick={(e) => { e.stopPropagation(); onEditEnter?.(); }}
                  className="p-1 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-muted transition-colors"
                  tooltip="Edit"
                >
                  <Pencil size={TYPE.icon.base} />
                </ActionIconButton>
              )
            )}

            {onDelete && !isEditing && (
              <ActionIconButton
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="p-1 rounded-md text-muted-foreground/60 hover:text-destructive hover:bg-red-50 transition-colors"
                tooltip="Delete"
              >
                <Trash2 size={TYPE.icon.base} />
              </ActionIconButton>
            )}
          </div>
        </div>
      )}

      <VariationStateOverlay state={state} />

      {showMeta && popupPos && createPortal(
        <div
          ref={metaRef}
          data-no-card-toggle
          className="fixed z-[9999] bg-white rounded-xl border border-border/60 shadow-xl flex flex-col overflow-y-auto backdrop-blur-md"
          style={{
            top: popupPos.top,
            left: popupPos.left,
            width: popupPos.width,
            transform: popupPos.transform,
            maxHeight: popupPos.maxHeight,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <GenerationDetailsPanel
            meta={meta}
            onClose={handleCloseMeta}
            emptyMessage="Generated by Brand Brew AI"
            maxBodyHeight={popupPos.maxHeight - POPUP_HEADER_HEIGHT}
          />
        </div>,
        document.body
      )}
    </div>
  );
}
