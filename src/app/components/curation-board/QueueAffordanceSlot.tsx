import React from "react";
import { Plus } from "lucide-react";
import { LAYOUT } from "../../utils/design-tokens";

export interface QueueColors {
  bg: string;
  border: string;
  accent: string;
}

interface QueueAffordanceSlotProps {
  isHovered: boolean;
  hintText: string;
  colors: QueueColors;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
}

export function QueueAffordanceSlot({
  isHovered,
  hintText,
  colors,
  onDragOver,
  onDragLeave,
  onDrop,
}: QueueAffordanceSlotProps) {
  return (
    <div
      data-card-slot
      style={{
        position: "absolute",
        left: 16,
        top: 24,
        width: 124,
        height: LAYOUT.CARD_SIZE,
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
            border: `2px dashed ${colors.accent}50`,
            background: `${colors.accent}06`,
          }}
        >
          <Plus size={28} style={{ color: `${colors.accent}90` }} />
        </div>
      ) : (
        <div
          className="absolute inset-0 z-30 rounded-xl flex flex-col items-center justify-center gap-2 transition-all duration-150"
          style={{
            background: "var(--bb-ai-active-bg)",
            boxShadow:
              "0 0 0 2px var(--bb-ai-active-ring), 0 0 0 5px var(--bb-ai-active-ring-outer)",
            borderRadius: 12,
            backdropFilter: "blur(1px)",
          }}
        >
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center shadow-lg"
            style={{ background: colors.accent }}
          >
            <Plus size={20} className="text-white" />
          </div>
          <span
            className="text-[11px] px-2 py-0.5 rounded-full bg-white/80 shadow-sm text-center"
            style={{
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
