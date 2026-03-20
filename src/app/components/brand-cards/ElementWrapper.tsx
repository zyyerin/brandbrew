import React, { useState, useRef, useCallback } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  Pencil, DiamondPlus, Trash2, Check, Upload, Info, X,
  Palette, Type as TypeIcon,
} from "lucide-react";

import { GenerationDetailsPanel } from "../GenerationDetailsPanel";
import type { VariationState, EditVariant, VariationMeta } from "./types";
import { VariationStateOverlay } from "./VariationStateOverlay";
import { TYPOGRAPHY, CANVAS, adaptiveSize } from "../../utils/design-tokens";
import { usePopupPosition } from "./usePopupPosition";
import { useCanvasZoom } from "../../contexts/CanvasZoomContext";
import { useVSPanel } from "../../contexts/VSPanelContext";

const EDIT_ICONS: Record<EditVariant, React.ComponentType<{ size?: number }>> = {
  text: Pencil,
  image: Upload,
  color: Palette,
  font: TypeIcon,
};

const POPUP_WIDTH = 254;
const VIEWPORT_PADDING = 16;
const POPUP_HEADER_HEIGHT = 48; // GenerationDetailsPanel header height

interface ElementWrapperProps {
  label: string;
  children: ReactNode;
  state?: VariationState;
  onToggleActive?: () => void;
  onAddVariation?: () => void;
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

export function ElementWrapper({
  label,
  children,
  state = "inactive",
  onToggleActive,
  onAddVariation,
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

  const isActive = state === "active";
  const hasOverlay = state === "waiting" || state === "merging" || state === "available" || state === "uploading";
  const zoom = useCanvasZoom();
  const vsPanelOpen = useVSPanel();
  const actionBarScale = adaptiveSize(1, zoom, CANVAS.ACTION_BAR_SCALE_MIN, CANVAS.ACTION_BAR_SCALE_MAX);

  const handleCloseMeta = useCallback(() => setShowMeta(false), []);

  const { pos: popupPos, containerRef: metaRef } = usePopupPosition(
    infoBtnRef,
    showMeta,
    handleCloseMeta,
    { width: POPUP_WIDTH, maxHeight: 9999, padding: VIEWPORT_PADDING },
  );

  const borderWidth = adaptiveSize(1, zoom, 0.5, 3);
  const ringWidth = adaptiveSize(2, zoom, 1, 6);

  const borderClass =
    state === "available"
      ? "border-transparent"
      : isActive || isEditing
        ? "border-blue-400"
        : "border-border/60 hover:border-border/90";

  const wrapperStyle: React.CSSProperties = {
    borderWidth,
    ...(isActive || isEditing
      ? {
          boxShadow: [
            `0 0 0 ${ringWidth}px rgba(147, 197, 253, 0.4)`,
            `0 4px 6px -1px rgba(219, 234, 254, 0.6)`,
            `0 2px 4px -2px rgba(219, 234, 254, 0.6)`,
          ].join(", "),
        }
      : {}),
  };

  const handleCardClick = useCallback((e: React.MouseEvent) => {
    if (!onToggleActive || hasOverlay || isEditing) return;
    if ((e.target as HTMLElement).closest('[data-no-card-toggle]')) return;
    onToggleActive();
  }, [onToggleActive, hasOverlay, isEditing]);

  return (
    <div
      className={`bg-white rounded-xl border overflow-hidden flex flex-col absolute inset-0 transition-all duration-150 group/variation
        ${borderClass}
        ${onToggleActive && !hasOverlay && !isEditing ? "cursor-pointer" : ""}
        ${className}`}
      style={wrapperStyle}
      onClick={handleCardClick}
    >
      <div className="flex-1 p-5 relative flex flex-col [&_*]:not-italic overflow-hidden min-h-0">
        {onToggleActive && !hasOverlay && !vsPanelOpen && (
          <button
            data-variation-toggle
            onClick={(e) => { e.stopPropagation(); onToggleActive(); }}
            className={`absolute top-2.5 right-2.5 w-5 h-5 rounded-full flex items-center justify-center z-10 transition-all duration-150 cursor-pointer group/toggle
              ${isActive
                ? "bg-blue-500 shadow-sm hover:bg-red-400"
                : "bg-white border border-border/50 shadow-sm opacity-30 hover:opacity-100 hover:border-blue-300 hover:bg-blue-50"
              }`}
            title={isActive ? "Deactivate card" : "Set as active"}
          >
            {isActive
              ? <>
                  <Check size={TYPOGRAPHY.toggleIconSize} className="text-white group-hover/toggle:hidden" strokeWidth={3} />
                  <X size={TYPOGRAPHY.toggleIconSize} className="text-white hidden group-hover/toggle:block" strokeWidth={3} />
                </>
              : <Check size={TYPOGRAPHY.toggleIconSize} className="text-muted-foreground/40 group-hover/toggle:text-blue-400" strokeWidth={3} />
            }
          </button>
        )}
        {children}
      </div>

      {!hasOverlay && zoom >= CANVAS.ACTION_BAR_ZOOM_THRESHOLD && (
        <div
          data-no-card-toggle
          className="absolute bottom-0 left-0 right-0 flex items-center justify-end px-3 py-2 bg-gradient-to-t from-white/95 via-white/90 to-white/0 opacity-0 group-hover/variation:opacity-100 pointer-events-none group-hover/variation:pointer-events-auto transition-opacity duration-150 z-10"
          style={{ transform: `scale(${actionBarScale})`, transformOrigin: "right bottom" }}
        >
          <div className="flex items-center gap-1">
            <button
              ref={infoBtnRef}
              onClick={(e) => { e.stopPropagation(); setShowMeta((v) => !v); }}
              className={`p-1 rounded-md transition-colors ${showMeta ? "text-blue-500 bg-blue-50" : "text-muted-foreground/60 hover:text-foreground hover:bg-black/5"}`}
              title="Generation info"
            >
              <Info size={TYPOGRAPHY.actionIconSize} />
            </button>

            {extraActions}

            {editVariant && EDIT_ICONS[editVariant] && (
              isEditing ? (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); onEditSave?.(); }}
                    className="p-1 rounded-md text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                    title="Save changes"
                  >
                    <Check size={TYPOGRAPHY.actionIconSize} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onEditCancel?.(); }}
                    className="p-1 rounded-md text-muted-foreground/60 hover:text-destructive hover:bg-red-50 transition-colors"
                    title="Cancel editing"
                  >
                    <X size={TYPOGRAPHY.actionIconSize} />
                  </button>
                </>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); onEditEnter?.(); }}
                  className="p-1 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-black/5 transition-colors"
                  title="Edit"
                >
                  {React.createElement(EDIT_ICONS[editVariant], { size: TYPOGRAPHY.actionIconSize })}
                </button>
              )
            )}

            {onAddVariation && (
              <button
                onClick={(e) => { e.stopPropagation(); onAddVariation(); }}
                className="p-1 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-black/5 transition-colors"
                title="Add variation"
              >
                <DiamondPlus size={TYPOGRAPHY.actionIconSize} />
              </button>
            )}

            {onDelete && (
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="p-1 rounded-md text-muted-foreground/60 hover:text-destructive hover:bg-red-50 transition-colors"
                title="Delete"
              >
                <Trash2 size={TYPOGRAPHY.actionIconSize} />
              </button>
            )}
          </div>
        </div>
      )}

      <VariationStateOverlay state={state} />

      {showMeta && popupPos && createPortal(
        <div
          ref={metaRef}
          data-no-card-toggle
          className="fixed z-[9999] bg-white rounded-xl border border-border/60 shadow-xl overflow-hidden flex flex-col backdrop-blur-md"
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
