import React from "react";
import { Sparkles, Loader2 } from "lucide-react";
import type { CardState } from "./types";

const BLUR_OVERLAY_STYLE = {
  background: "var(--bb-ai-overlay-bg)",
  backdropFilter: "blur(4px)",
  borderRadius: 12,
} as const;

interface CardStateOverlayProps {
  state: CardState;
}

export function CardStateOverlay({ state }: CardStateOverlayProps) {
  if (state === "waiting") {
    return (
      <div
        className="absolute inset-0 z-40 rounded-xl flex flex-col items-center justify-center gap-2"
        style={BLUR_OVERLAY_STYLE}
      >
        <div className="w-5 h-5 border-2 border-muted-foreground/30 border-t-muted-foreground/70 rounded-full animate-spin" />
        <span className="text-[11px] text-muted-foreground/50">Brewing…</span>
      </div>
    );
  }

  if (state === "merging") {
    return (
      <div
        className="absolute inset-0 z-40 rounded-xl flex flex-col items-center justify-center gap-2"
        style={BLUR_OVERLAY_STYLE}
      >
        <Loader2 size={22} className="text-violet-500 animate-spin" />
        <span className="text-[12px] text-violet-600" style={{ fontWeight: 600 }}>Merging…</span>
      </div>
    );
  }

  if (state === "available") {
    return (
      <div
        className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none rounded-xl"
        style={{
          background: "var(--bb-ai-affordance-bg)",
          border: "1.5px dashed var(--bb-ai-affordance-border)",
        }}
      >
        <div
          className="w-9 h-9 rounded-full bg-white/90 flex items-center justify-center shadow-md"
          style={{ border: "1.5px dashed var(--bb-ai-affordance-border)" }}
        >
          <Sparkles size={14} className="text-violet-400" />
        </div>
      </div>
    );
  }

  return null;
}
