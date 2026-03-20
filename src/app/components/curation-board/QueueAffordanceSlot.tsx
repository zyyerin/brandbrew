import React from "react";
import { Plus } from "lucide-react";
import { LAYOUT, TYPOGRAPHY, adaptiveSize } from "../../utils/design-tokens";

export interface QueueColors {
  bg: string;
  border: string;
  accent: string;
}

interface QueueAffordanceSlotProps {
  isHovered: boolean;
  isMerge: boolean;
  hintText: string;
  colors: QueueColors;
  zoom: number;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
}

export function QueueAffordanceSlot({
  isHovered,
  isMerge,
  hintText,
  colors,
  zoom,
  onDragOver,
  onDragLeave,
  onDrop,
}: QueueAffordanceSlotProps) {
  const borderWidth = adaptiveSize(1.5, zoom, 1.5, 4);
  const iconSize = adaptiveSize(20, zoom, 16, 32);
  return (
    <div
      data-variation-slot
      style={{
        position: "absolute",
        left: LAYOUT.ADD_SLOT_LEFT_OFFSET,
        top: LAYOUT.FILMSTRIP_PADDING_TOP,
        width: LAYOUT.ADD_SLOT_WIDTH,
        height: LAYOUT.VARIATION_SLOT_SIZE,
        zIndex: 15,
      }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {!isHovered ? (
        <div
          className="absolute inset-0 rounded-xl flex items-center justify-center transition-all duration-150"
          style={{
            background: "var(--bb-ai-affordance-bg)",
            border: `${borderWidth}px dashed var(--bb-ai-affordance-border)`,
          }}
        >
          <Plus size={iconSize} style={{ color: "var(--bb-ai-affordance-border)", opacity: 0.7 }} />
        </div>
      ) : isMerge ? (
        <div
          className="absolute inset-0 z-30 rounded-xl transition-all duration-150 pointer-events-none"
          style={{
            background: "var(--bb-ai-active-bg)",
            boxShadow: "var(--bb-ai-ring-shadow)",
            borderRadius: 12,
            backdropFilter: "blur(1px)",
          }}
        />
      ) : (
        <div
          className="absolute inset-0 z-30 rounded-xl flex flex-col items-center justify-center gap-2 transition-all duration-150"
          style={{
            background: "var(--bb-user-active-bg)",
            boxShadow: "var(--bb-user-ring-shadow)",
            borderRadius: 12,
            backdropFilter: "blur(1px)",
          }}
        >
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center shadow-lg"
            style={{ background: colors.accent }}
          >
            <Plus size={iconSize} className="text-white" />
          </div>
          <span
            className="px-2 py-0.5 rounded-full bg-white/80 shadow-sm text-center"
            style={{
              fontSize: TYPOGRAPHY.queueLabel.fontSize,
              fontWeight: 700,
              letterSpacing: "0.04em",
              color: colors.accent,
            }}
          >
            {hintText}
          </span>
        </div>
      )}
    </div>
  );
}
