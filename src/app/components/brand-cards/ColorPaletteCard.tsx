import React from "react";
import { Plus, X } from "lucide-react";
import type { VariationMeta, VariationState } from "./types";
import { ElementWrapper } from "./ElementWrapper";
import { useCardEditing } from "./useCardEditing";
import { PALETTE } from "../../utils/design-tokens";

interface ColorPaletteProps {
  colors: string[];
  state?: VariationState;
  onToggleActive?: () => void;
  onChange?: (colors: string[]) => void;
  onAddVariation?: () => void;
  onDelete?: () => void;
  meta?: VariationMeta;
}

export function ColorPaletteCard({ colors, state, onToggleActive, onChange, onAddVariation, onDelete, meta }: ColorPaletteProps) {
  const { isEditing, local, setLocal, editingProps } = useCardEditing(
    { colors },
    { onChange: onChange ? (d) => onChange(d.colors) : undefined },
  );

  const safeColors = Array.isArray(local.colors) ? local.colors : [];

  return (
    <ElementWrapper
      label="Color Palette"
      state={state}
      editVariant="color"
      {...editingProps}
      onAddVariation={onAddVariation}
      onDelete={onDelete}
      onToggleActive={isEditing ? undefined : onToggleActive}
      meta={meta}
    >
      <div className="flex flex-1 gap-0 rounded-lg overflow-hidden h-full">
        {safeColors.map((color, i) => (
          <div key={`${color}-${i}`} className="flex-1 h-full relative" style={{ backgroundColor: color }}>
            {isEditing && (
              <>
                {safeColors.length > PALETTE.MIN_COLORS && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const next = [...local.colors];
                      next.splice(i, 1);
                      setLocal({ colors: next });
                    }}
                    className="absolute top-1.5 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-black/40 hover:bg-black/70 flex items-center justify-center transition-colors z-10"
                    title="Remove color"
                  >
                    <X size={10} className="text-white" strokeWidth={2.5} />
                  </button>
                )}
                <label className="absolute inset-0 cursor-pointer flex items-end justify-center pb-3">
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => {
                      const next = [...local.colors];
                      next[i] = e.target.value;
                      setLocal({ colors: next });
                    }}
                    className="w-7 h-7 rounded-full border-2 border-white/80 shadow-md cursor-pointer"
                    style={{ padding: 0 }}
                  />
                </label>
              </>
            )}
          </div>
        ))}
        {isEditing && safeColors.length < PALETTE.MAX_COLORS && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setLocal({ colors: [...local.colors, PALETTE.DEFAULT_NEW_COLOR] });
            }}
            className="w-8 h-full flex-shrink-0 flex items-center justify-center bg-black/10 hover:bg-black/20 transition-colors"
            title="Add color"
          >
            <Plus size={14} className="text-white/80" strokeWidth={2.5} />
          </button>
        )}
      </div>
    </ElementWrapper>
  );
}
