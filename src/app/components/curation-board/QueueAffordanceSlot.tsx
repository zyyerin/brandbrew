import React from "react";
import { Plus } from "lucide-react";
import { LAYOUT, TYPE, adaptiveSize } from "../../utils/design-tokens";

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
  const iconSize = adaptiveSize(20, zoom, 16, 32);
  return (
    <div
      data-variation-slot
      style={{
        position: "absolute",
        left: LAYOUT.slot.addOffset,
        top: LAYOUT.filmstrip.paddingTop,
        width: LAYOUT.slot.addWidth,
        height: LAYOUT.slot.size,
        zIndex: 15,
      }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {isMerge ? (
        <div
          className="absolute inset-0 z-30 rounded-xl flex items-center justify-center px-2 transition-all duration-150 pointer-events-none"
          style={{
            background: "var(--bb-ai-active-bg)",
            boxShadow: isHovered ? "var(--bb-ai-ring-shadow)" : undefined,
            borderRadius: 12,
            backdropFilter: "blur(1px)",
          }}
        >
          <span
            className="text-center"
            style={{
              fontSize: TYPE.size.baseLg,
              fontWeight: TYPE.weight.bold,
              lineHeight: TYPE.leading.snug,
              color: "var(--bb-ai-active-ring)",
            }}
          >
            {hintText}
          </span>
        </div>
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
              fontSize: TYPE.size.sm,
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
