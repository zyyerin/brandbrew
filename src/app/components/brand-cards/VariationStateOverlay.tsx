import React from "react";
import { Loader2 } from "lucide-react";
import type { VariationState } from "./types";
import { TYPOGRAPHY, adaptiveSize } from "../../utils/design-tokens";
import { useCanvasZoom } from "../../contexts/CanvasZoomContext";

const BLUR_OVERLAY_STYLE = {
  background: "var(--bb-ai-overlay-bg)",
  borderRadius: 12,
} as const;

interface VariationStateOverlayProps {
  state: VariationState;
}

export function VariationStateOverlay({ state }: VariationStateOverlayProps) {
  const zoom = useCanvasZoom();
  const borderWidth = adaptiveSize(1.5, zoom, 1.5, 4);
  if (state === "waiting") {
    return (
      <div
        className="absolute inset-0 z-40 rounded-xl flex flex-col items-center justify-center gap-2 backdrop-blur-sm"
        style={BLUR_OVERLAY_STYLE}
      >
        <div className="w-5 h-5 border-2 border-muted-foreground/30 border-t-muted-foreground/70 rounded-full animate-spin" />
        <span className="text-muted-foreground/50" style={{ fontSize: TYPOGRAPHY.hudText.fontSize }}>Brewing…</span>
      </div>
    );
  }

  if (state === "uploading") {
    return (
      <div
        className="absolute inset-0 z-40 rounded-xl flex flex-col items-center justify-center gap-2 backdrop-blur-sm"
        style={BLUR_OVERLAY_STYLE}
      >
        <Loader2 size={20} className="text-blue-500 animate-spin" />
        <span className="text-muted-foreground/50" style={{ fontSize: TYPOGRAPHY.hudText.fontSize }}>Uploading…</span>
      </div>
    );
  }

  if (state === "merging") {
    return (
      <div
        className="absolute inset-0 z-40 rounded-xl flex flex-col items-center justify-center gap-2 backdrop-blur-sm"
        style={BLUR_OVERLAY_STYLE}
      >
        <Loader2 size={22} className="text-violet-500 animate-spin" />
        <span className="text-violet-600" style={{ fontSize: TYPOGRAPHY.cardBodySm.fontSize, fontWeight: TYPOGRAPHY.queueLabel.fontWeight }}>Merging…</span>
      </div>
    );
  }

  if (state === "available") {
    return (
      <div
        className="absolute inset-0 z-20 pointer-events-none rounded-xl"
        style={{
          background: "var(--bb-ai-affordance-bg)",
          border: `${borderWidth}px dashed var(--bb-ai-affordance-border)`,
        }}
      />
    );
  }

  return null;
}
