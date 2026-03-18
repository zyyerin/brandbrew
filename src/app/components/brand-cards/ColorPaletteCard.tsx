import React, { useMemo } from "react";
import type { CardMeta, CardState } from "./types";
import { CardWrapper } from "./CardWrapper";
import { useCardEditing } from "./useCardEditing";

interface ColorPaletteProps {
  colors: string[];
  state?: CardState;
  onToggleActive?: () => void;
  onChange?: (colors: string[]) => void;
  onRefresh?: () => void;
  onDelete?: () => void;
  meta?: CardMeta;
}

interface RgbColor {
  r: number;
  g: number;
  b: number;
}

interface PaletteEntry {
  color: string;
  originalIndex: number;
}

interface ColorMetrics {
  entry: PaletteEntry;
  hue: number;
  saturation: number;
  lightness: number;
}

function parseHexColor(hex: string): RgbColor | null {
  const normalized = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(normalized)) return null;

  const full = normalized.length === 3
    ? normalized.split("").map((ch) => ch + ch).join("")
    : normalized;

  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);

  if ([r, g, b].some((value) => Number.isNaN(value))) return null;
  return { r, g, b };
}

function rgbToHsl(rgb: RgbColor): { h: number; s: number; l: number } {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return { h, s, l };
}

function hueDistance(h1: number, h2: number): number {
  const diff = Math.abs(h1 - h2);
  return Math.min(diff, 360 - diff) / 180;
}

function transitionCost(from: ColorMetrics, to: ColorMetrics): number {
  const avgSat = (from.saturation + to.saturation) / 2;
  const hueCost = hueDistance(from.hue, to.hue) * avgSat;
  const satCost = Math.abs(from.saturation - to.saturation);
  const lightnessCost = Math.abs(from.lightness - to.lightness);
  const lightRisePenalty = Math.max(0, to.lightness - from.lightness);

  return (
    hueCost * 0.55 +
    satCost * 0.2 +
    lightnessCost * 0.25 +
    lightRisePenalty * 0.85
  );
}

function buildMetrics(entry: PaletteEntry): ColorMetrics | null {
  const rgb = parseHexColor(entry.color);
  if (!rgb) return null;
  const hsl = rgbToHsl(rgb);
  return {
    entry,
    hue: hsl.h,
    saturation: hsl.s,
    lightness: hsl.l,
  };
}

function sortPaletteForHarmony(colors: string[]): PaletteEntry[] {
  const entries = colors.map((color, originalIndex) => ({ color, originalIndex }));
  const validMetrics = entries
    .map((entry) => buildMetrics(entry))
    .filter((value): value is ColorMetrics => value !== null);

  const validIndexSet = new Set(validMetrics.map((m) => m.entry.originalIndex));
  const invalidEntries = entries.filter((entry) => !validIndexSet.has(entry.originalIndex));
  if (validMetrics.length <= 1) return [...validMetrics.map((m) => m.entry), ...invalidEntries];

  const anchor = validMetrics.reduce((best, current) => {
    if (current.lightness > best.lightness) return current;
    if (current.lightness < best.lightness) return best;
    if (current.saturation > best.saturation) return current;
    if (current.saturation < best.saturation) return best;
    return current.entry.originalIndex < best.entry.originalIndex ? current : best;
  });

  let bestOrder: ColorMetrics[] = [];
  let bestCost = Number.POSITIVE_INFINITY;

  const buildOrder = (order: ColorMetrics[], remaining: ColorMetrics[], runningCost: number) => {
    if (runningCost >= bestCost) return;
    if (remaining.length === 0) {
      const endPenalty = order[order.length - 1].lightness * 0.15;
      const finalCost = runningCost + endPenalty;
      if (finalCost < bestCost) {
        bestCost = finalCost;
        bestOrder = order;
      }
      return;
    }

    const previous = order[order.length - 1];
    for (let i = 0; i < remaining.length; i += 1) {
      const next = remaining[i];
      buildOrder(
        [...order, next],
        [...remaining.slice(0, i), ...remaining.slice(i + 1)],
        runningCost + transitionCost(previous, next),
      );
    }
  };

  if (validMetrics.length <= 8) {
    buildOrder([anchor], validMetrics.filter((m) => m !== anchor), 0);
  } else {
    const order: ColorMetrics[] = [anchor];
    let remaining = validMetrics.filter((m) => m !== anchor);
    while (remaining.length > 0) {
      const previous = order[order.length - 1];
      let bestNext = remaining[0];
      let nextCost = Number.POSITIVE_INFINITY;
      for (const candidate of remaining) {
        const cost = transitionCost(previous, candidate) + candidate.lightness * 0.1;
        if (cost < nextCost) {
          nextCost = cost;
          bestNext = candidate;
        }
      }
      order.push(bestNext);
      remaining = remaining.filter((candidate) => candidate !== bestNext);
    }
    bestOrder = order;
  }

  return [...bestOrder.map((m) => m.entry), ...invalidEntries];
}

export function ColorPaletteCard({ colors, state, onToggleActive, onChange, onRefresh, onDelete, meta }: ColorPaletteProps) {
  const { isEditing, local, setLocal, editingProps } = useCardEditing(
    { colors },
    { onChange: onChange ? (d) => onChange(d.colors) : undefined },
  );

  const safeColors = Array.isArray(local.colors) ? local.colors : [];
  const orderedColors = useMemo(() => sortPaletteForHarmony(safeColors), [safeColors]);

  return (
    <CardWrapper
      label="Color Palette"
      state={state}
      editVariant="color"
      {...editingProps}
      onRegenerate={onRefresh}
      onDelete={onDelete}
      onToggleActive={isEditing ? undefined : onToggleActive}
      meta={meta}
    >
      <div className="flex flex-1 gap-0 rounded-lg overflow-hidden h-full">
        {orderedColors.map(({ color, originalIndex }) => (
          <div key={`${color}-${originalIndex}`} className="flex-1 h-full relative" style={{ backgroundColor: color }}>
            {isEditing && (
              <label className="absolute inset-0 cursor-pointer flex items-end justify-center pb-3">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => {
                    const next = [...local.colors];
                    next[originalIndex] = e.target.value;
                    setLocal({ colors: next });
                  }}
                  className="w-7 h-7 rounded-full border-2 border-white/80 shadow-md cursor-pointer"
                  style={{ padding: 0 }}
                />
              </label>
            )}
          </div>
        ))}
      </div>
    </CardWrapper>
  );
}
