import React from "react";
import { Loader2 } from "lucide-react";
import type { VariationState } from "./types";
import { TYPE, adaptiveSize } from "../../utils/design-tokens";
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
  const iconSize = adaptiveSize(22, zoom, 14, 36);
  const labelSize = adaptiveSize(TYPE.size.baseSm, zoom, 9, 18);

  if (state === "waiting") {
    return (
      <div
        className="absolute inset-0 z-40 rounded-xl flex flex-col items-center justify-center gap-2 backdrop-blur-sm"
        style={BLUR_OVERLAY_STYLE}
      >
        <Loader2 size={iconSize} className="text-violet-500 animate-spin" />
        <span className="text-violet-600" style={{ fontSize: labelSize, fontWeight: TYPE.weight.semibold }}>Brewing…</span>
      </div>
    );
  }

  if (state === "queued") {
    const spinnerSize = adaptiveSize(20, zoom, 12, 32);
    const borderPx = adaptiveSize(2, zoom, 1, 4);
    return (
      <div
        className="absolute inset-0 z-40 rounded-xl flex flex-col items-center justify-center gap-2 backdrop-blur-sm"
        style={BLUR_OVERLAY_STYLE}
      >
        <div
          className="rounded-full border-muted-foreground/30 border-t-muted-foreground/70 animate-spin"
          style={{ width: spinnerSize, height: spinnerSize, borderWidth: borderPx, borderStyle: "solid" }}
        />
        <span className="text-muted-foreground/50" style={{ fontSize: labelSize, fontWeight: TYPE.weight.semibold }}>Waiting in line…</span>
      </div>
    );
  }

  if (state === "uploading") {
    const uploadIconSize = adaptiveSize(20, zoom, 12, 32);
    return (
      <div
        className="absolute inset-0 z-40 rounded-xl flex flex-col items-center justify-center gap-2 backdrop-blur-sm"
        style={BLUR_OVERLAY_STYLE}
      >
        <Loader2 size={uploadIconSize} className="text-blue-500 animate-spin" />
        <span className="text-muted-foreground/50" style={{ fontSize: labelSize, fontWeight: TYPE.weight.semibold }}>Uploading…</span>
      </div>
    );
  }

  if (state === "merging") {
    return (
      <div
        className="absolute inset-0 z-40 rounded-xl flex flex-col items-center justify-center gap-2 backdrop-blur-sm"
        style={BLUR_OVERLAY_STYLE}
      >
        <Loader2 size={iconSize} className="text-violet-500 animate-spin" />
        <span className="text-violet-600" style={{ fontSize: labelSize, fontWeight: TYPE.weight.semibold }}>Merging…</span>
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
