import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { CANVAS, LAYOUT, TYPE, adaptiveSize } from "../../utils/design-tokens";

interface FilmstripScrollButtonsProps {
  showLeft: boolean;
  showRight: boolean;
  zoom: number;
  accent: string;
  leftInset: number;
  rightInset: number;
  onScrollBy: (delta: number) => void;
}

export function FilmstripScrollButtons({
  showLeft,
  showRight,
  zoom,
  accent,
  leftInset,
  rightInset,
  onScrollBy,
}: FilmstripScrollButtonsProps) {
  if (!showLeft && !showRight) return null;

  const scale = adaptiveSize(1, zoom, CANVAS.ACTION_BAR_SCALE_MIN, CANVAS.ACTION_BAR_SCALE_MAX);
  const step = LAYOUT.slot.size + LAYOUT.filmstrip.gap;

  const size = LAYOUT.filmstrip.scrollButtonSize;
  const inset = LAYOUT.filmstrip.scrollButtonInset;

  const buttonStyle: React.CSSProperties = {
    width: size,
    height: size,
    background: "var(--bb-frosted-panel)",
    border: `1px solid ${accent}`,
    color: accent,
    boxShadow: "var(--bb-hud-shadow)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    padding: 0,
  };

  return (
    <div
      className="absolute z-[21] pointer-events-none"
      style={{
        top: LAYOUT.filmstrip.paddingTop,
        height: LAYOUT.slot.size,
        left: leftInset,
        right: rightInset,
      }}
    >
      {showLeft && (
        <button
          type="button"
          aria-label="Scroll cards left"
          title="Scroll cards left"
          className="absolute pointer-events-auto rounded-full"
          style={{
            ...buttonStyle,
            left: inset,
            top: "50%",
            transform: `translateY(-50%) scale(${scale})`,
            transformOrigin: "left center",
          }}
          onClick={(e) => {
            e.stopPropagation();
            onScrollBy(-step);
          }}
        >
          <ChevronLeft size={TYPE.icon.base} />
        </button>
      )}
      {showRight && (
        <button
          type="button"
          aria-label="Scroll cards right"
          title="Scroll cards right"
          className="absolute pointer-events-auto rounded-full"
          style={{
            ...buttonStyle,
            right: inset,
            top: "50%",
            transform: `translateY(-50%) scale(${scale})`,
            transformOrigin: "right center",
          }}
          onClick={(e) => {
            e.stopPropagation();
            onScrollBy(step);
          }}
        >
          <ChevronRight size={TYPE.icon.base} />
        </button>
      )}
    </div>
  );
}
