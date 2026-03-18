import React from "react";
import {
  Pencil, RefreshCw, Trash2, Check, Upload, Info, X,
  Palette, Type as TypeIcon,
} from "lucide-react";
import type { EditVariant } from "./types";

const EDIT_ICONS: Record<EditVariant, React.ComponentType<{ size?: number }>> = {
  text: Pencil,
  image: Upload,
  color: Palette,
  font: TypeIcon,
};

interface CardActionBarProps {
  infoBtnRef: React.RefObject<HTMLButtonElement | null>;
  showMeta: boolean;
  onToggleMeta: () => void;
  editVariant?: EditVariant;
  isEditing?: boolean;
  onEditEnter?: () => void;
  onEditSave?: () => void;
  onEditCancel?: () => void;
  onRegenerate?: () => void;
  onDelete?: () => void;
}

export function CardActionBar({
  infoBtnRef,
  showMeta,
  onToggleMeta,
  editVariant,
  isEditing,
  onEditEnter,
  onEditSave,
  onEditCancel,
  onRegenerate,
  onDelete,
}: CardActionBarProps) {
  const EditIcon = editVariant ? EDIT_ICONS[editVariant] : null;

  return (
    <div className="absolute bottom-0 left-0 right-0 flex items-center justify-end px-3 py-2 bg-gradient-to-t from-white/95 via-white/90 to-white/0 opacity-0 group-hover/card:opacity-100 pointer-events-none group-hover/card:pointer-events-auto transition-opacity duration-150 z-10">
      <div className="flex items-center gap-1">
        <button
          ref={infoBtnRef}
          onClick={(e) => { e.stopPropagation(); onToggleMeta(); }}
          className={`p-1 rounded-md transition-colors ${showMeta ? "text-blue-500 bg-blue-50" : "text-muted-foreground/60 hover:text-foreground hover:bg-black/5"}`}
          title="Generation info"
        >
          <Info size={13} />
        </button>

        {EditIcon && (
          isEditing ? (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); onEditSave?.(); }}
                className="p-1 rounded-md text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                title="Save changes"
              >
                <Check size={13} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onEditCancel?.(); }}
                className="p-1 rounded-md text-muted-foreground/60 hover:text-destructive hover:bg-red-50 transition-colors"
                title="Cancel editing"
              >
                <X size={13} />
              </button>
            </>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); onEditEnter?.(); }}
              className="p-1 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-black/5 transition-colors"
              title="Edit"
            >
              <EditIcon size={13} />
            </button>
          )
        )}

        {onRegenerate && (
          <button
            onClick={(e) => { e.stopPropagation(); onRegenerate(); }}
            className="p-1 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-black/5 transition-colors"
            title="Regenerate"
          >
            <RefreshCw size={13} />
          </button>
        )}

        {onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-1 rounded-md text-muted-foreground/60 hover:text-destructive hover:bg-red-50 transition-colors"
            title="Delete"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  );
}
