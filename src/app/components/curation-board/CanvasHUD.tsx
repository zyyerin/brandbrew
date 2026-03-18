import React from "react";
import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { CANVAS } from "../../utils/design-tokens";

interface CanvasHUDProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  onFit: () => void;
}

export function CanvasHUD({ zoom, onZoomIn, onZoomOut, onResetView, onFit }: CanvasHUDProps) {
  return (
    <div className="absolute bottom-4 right-4 z-50 flex items-center gap-1.5 mt-4 mb-4">
      <div
        className="flex items-center gap-0.5 bg-white/92 backdrop-blur-sm border border-border/40 rounded-full px-1.5 py-1 shadow-sm"
        style={{ boxShadow: "var(--bb-hud-shadow)" }}
      >
        <button
          onClick={onZoomOut}
          title="Zoom out (scroll down)"
          disabled={zoom <= CANVAS.ZOOM_MIN}
          className="w-6 h-6 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          <ZoomOut size={12} />
        </button>

        <button
          onClick={onResetView}
          title="Reset to 100%"
          className="px-2 h-6 flex items-center justify-center text-[11px] font-medium tabular-nums text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-full transition-all min-w-[42px]"
        >
          {Math.round(zoom * 100)}%
        </button>

        <button
          onClick={onZoomIn}
          title="Zoom in (scroll up)"
          disabled={zoom >= CANVAS.ZOOM_MAX}
          className="w-6 h-6 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          <ZoomIn size={12} />
        </button>
      </div>

      <button
        onClick={onFit}
        title="Fit all content"
        className="w-8 h-8 flex items-center justify-center bg-white/92 backdrop-blur-sm border border-border/40 rounded-full text-muted-foreground hover:text-foreground shadow-sm transition-all hover:bg-white"
        style={{ boxShadow: "var(--bb-hud-shadow)" }}
      >
        <Maximize2 size={13} />
      </button>
    </div>
  );
}
