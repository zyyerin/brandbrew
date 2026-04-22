import React, { useCallback, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import type { VariationMeta, VariationState } from "./types";
import { ElementWrapper } from "./ElementWrapper";
import { useCardEditing } from "./useCardEditing";
import { ColorPickerPopover } from "./ColorPickerPopover";
import { PALETTE } from "../../utils/design-tokens";

function luminance(hex: string): number {
  const c = (hex.replace("#", "") + "000000").slice(0, 6);
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function fgFor(hex: string) {
  return luminance(hex) > 0.35 ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.85)";
}

function overlayFor(hex: string) {
  return luminance(hex) > 0.35 ? "rgba(0,0,0,0.07)" : "rgba(255,255,255,0.13)";
}

interface ColorPaletteProps {
  colors: string[];
  state?: VariationState;
  onToggleActive?: () => void;
  onChange?: (colors: string[]) => void;
  onDelete?: () => void;
  meta?: VariationMeta;
}

export function ColorPaletteCard({ colors, state, onToggleActive, onChange, onDelete, meta }: ColorPaletteProps) {
  const { isEditing, local, setLocal, editingProps } = useCardEditing(
    { colors },
    { onChange: onChange ? (d) => onChange(d.colors) : undefined },
  );

  const safeColors: string[] = Array.isArray(local.colors) ? local.colors : [];

  const updateColor = useCallback(
    (index: number, value: string) => {
      const next = [...safeColors];
      next[index] = value;
      setLocal({ colors: next } as typeof local);
    },
    [safeColors, setLocal],
  );

  const removeColor = useCallback(
    (index: number) => {
      const next = [...safeColors];
      next.splice(index, 1);
      setLocal({ colors: next } as typeof local);
    },
    [safeColors, setLocal],
  );

  const addColor = useCallback(() => {
    setLocal({ colors: [...safeColors, PALETTE.DEFAULT_NEW_COLOR] } as typeof local);
  }, [safeColors, setLocal]);

  // ── Horizontal drag-to-reorder ───────────────────────────────
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const dragEnterCount = useRef<Record<number, number>>({});

  const handleDragStart = useCallback((e: React.DragEvent, idx: number) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = "move";
    const ghost = document.createElement("div");
    ghost.style.cssText = "position:fixed;top:-999px;width:1px;height:1px;";
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    requestAnimationFrame(() => document.body.removeChild(ghost));
  }, []);

  const handleDragEnd = useCallback(() => {
    if (dragIdx !== null && overIdx !== null && dragIdx !== overIdx) {
      const next = [...safeColors];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(overIdx, 0, moved);
      setLocal({ colors: next } as typeof local);
    }
    setDragIdx(null);
    setOverIdx(null);
    dragEnterCount.current = {};
  }, [dragIdx, overIdx, safeColors, setLocal]);

  const handleDragEnter = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    dragEnterCount.current[idx] = (dragEnterCount.current[idx] ?? 0) + 1;
    setOverIdx(idx);
  }, []);

  const handleDragLeave = useCallback((_e: React.DragEvent, idx: number) => {
    dragEnterCount.current[idx] = (dragEnterCount.current[idx] ?? 1) - 1;
    if ((dragEnterCount.current[idx] ?? 0) <= 0) {
      dragEnterCount.current[idx] = 0;
      setOverIdx((prev) => (prev === idx ? null : prev));
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  return (
    <ElementWrapper
      label="Color Palette"
      state={state}
      editVariant="color"
      {...editingProps}
      onDelete={onDelete}
      onToggleActive={isEditing ? undefined : onToggleActive}
      meta={meta}
    >
      <div className="flex flex-1 gap-0 rounded-lg overflow-hidden h-full">
        {safeColors.map((color, i) => {
          const isDragging = isEditing && dragIdx === i;
          const isDropTarget = isEditing && overIdx === i && dragIdx !== null && dragIdx !== i;
          const fg = fgFor(color);
          const labelBg = overlayFor(color);

          // The strip div is the same in both modes — only the wrapper differs
          const stripContent = (
            <div
              draggable={isEditing}
              onDragStart={isEditing ? (e) => handleDragStart(e, i) : undefined}
              onDragEnd={isEditing ? handleDragEnd : undefined}
              onDragEnter={isEditing ? (e) => handleDragEnter(e, i) : undefined}
              onDragLeave={isEditing ? (e) => handleDragLeave(e, i) : undefined}
              onDragOver={isEditing ? handleDragOver : undefined}
              onClick={isEditing ? (e) => e.stopPropagation() : undefined}
              className={[
                "flex-1 h-full relative group/swatch transition-all duration-150",
                isEditing ? "cursor-pointer" : "",
                isDragging ? "opacity-30 scale-x-95" : "",
                isDropTarget ? "ring-inset ring-2 ring-white/70 brightness-110" : "",
              ].join(" ")}
              style={{ backgroundColor: color }}
            >
              {/* ── Delete button (edit mode, hover reveal) ── */}
              {isEditing && safeColors.length > PALETTE.MIN_COLORS && (
                <button
                  draggable={false}
                  onClick={(e) => { e.stopPropagation(); removeColor(i); }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="absolute top-2 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full flex items-center justify-center z-10 opacity-0 group-hover/swatch:opacity-100 transition-opacity backdrop-blur-sm"
                  style={{ backgroundColor: labelBg, color: fg }}
                  title="Remove color"
                >
                  <X size={10} strokeWidth={2.5} />
                </button>
              )}

            </div>
          );

          // In display mode: plain strip, clicks pass through to card toggle
          // In edit mode: wrap with ColorPickerPopover — the strip div IS the trigger
          if (!isEditing) {
            return <React.Fragment key={i}>{stripContent}</React.Fragment>;
          }

          return (
            <ColorPickerPopover
              key={i}
              color={color}
              onChange={(c) => updateColor(i, c)}
              side="top"
              align="center"
            >
              {stripContent}
            </ColorPickerPopover>
          );
        })}

        {/* ── Add color strip ── */}
        {isEditing && safeColors.length < PALETTE.MAX_COLORS && (
          <button
            onClick={(e) => { e.stopPropagation(); addColor(); }}
            className="w-8 h-full flex-shrink-0 flex items-center justify-center bg-black/5 hover:bg-black/10 transition-colors"
            title="Add color"
          >
            <Plus size={13} className="text-black/30" strokeWidth={2} />
          </button>
        )}
      </div>
    </ElementWrapper>
  );
}
