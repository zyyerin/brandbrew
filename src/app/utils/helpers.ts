import { PALETTE } from "./design-tokens";

/**
 * Format a Date as a short locale string like "Mar 15, 2026".
 */
export function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Format a Date with both date and time, e.g. "Mar 17, 2026, 2:30 PM".
 */
export function formatDateTime(d: Date): string {
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Format a Date as a precise timestamp: "HH:mm:ss YYYY/MM/DD".
 */
export function formatTimestamp(date: Date): string {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  const yyyy = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${hh}:${mm}:${ss} ${yyyy}/${mo}/${dd}`;
}

/**
 * Normalize a color palette value that may arrive as `string[]`,
 * `{ colorPalette: string[] }`, or `{ colors: string[] }`.
 * Truncates to PALETTE.MAX_COLORS to guard against AI over-generation.
 */
export function normalizeColorPalette(raw: unknown): string[] {
  const arr: unknown[] = Array.isArray(raw)
    ? raw
    : (raw as any)?.colorPalette ?? (raw as any)?.colors ?? [];
  return (arr as string[]).slice(0, PALETTE.MAX_COLORS);
}

// ── Palette harmony sort ──────────────────────────────────────────────────────
// Reorders colors so they flow naturally from light/neutral → saturated →
// dark, minimising perceptual "jumps" between adjacent swatches.

interface _RgbColor { r: number; g: number; b: number }
interface _PaletteEntry { color: string; index: number }
interface _ColorMetrics { entry: _PaletteEntry; hue: number; saturation: number; lightness: number }

function _parseHex(hex: string): _RgbColor | null {
  const n = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(n)) return null;
  const full = n.length === 3 ? n.split("").map((c) => c + c).join("") : n;
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return null;
  return { r, g, b };
}

function _toHsl(rgb: _RgbColor): { h: number; s: number; l: number } {
  const r = rgb.r / 255, g = rgb.g / 255, b = rgb.b / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
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

function _hueDist(h1: number, h2: number): number {
  const d = Math.abs(h1 - h2);
  return Math.min(d, 360 - d) / 180;
}

function _transitionCost(a: _ColorMetrics, b: _ColorMetrics): number {
  const avgSat = (a.saturation + b.saturation) / 2;
  return (
    _hueDist(a.hue, b.hue) * avgSat * 0.55 +
    Math.abs(a.saturation - b.saturation) * 0.2 +
    Math.abs(a.lightness - b.lightness) * 0.25 +
    Math.max(0, b.lightness - a.lightness) * 0.85
  );
}

function _buildMetrics(entry: _PaletteEntry): _ColorMetrics | null {
  const rgb = _parseHex(entry.color);
  if (!rgb) return null;
  const { h, s, l } = _toHsl(rgb);
  return { entry, hue: h, saturation: s, lightness: l };
}

/**
 * Reorder a color palette for visual harmony using a greedy/exact TSP approach.
 * Returns a new array of hex color strings in the sorted order.
 * Called at AI write-time (not at render-time) so user-edited order is never overridden.
 */
export function sortColorPaletteForHarmony(colors: string[]): string[] {
  const entries = colors.map((color, i) => ({ color, index: i }));
  const metrics = entries.map(_buildMetrics).filter((m): m is _ColorMetrics => m !== null);
  const invalidColors = entries
    .filter((e) => !metrics.some((m) => m.entry.index === e.index))
    .map((e) => e.color);

  if (metrics.length <= 1) return [...metrics.map((m) => m.entry.color), ...invalidColors];

  const anchor = metrics.reduce((best, cur) => {
    if (cur.lightness > best.lightness) return cur;
    if (cur.lightness < best.lightness) return best;
    if (cur.saturation > best.saturation) return cur;
    if (cur.saturation < best.saturation) return best;
    return cur.entry.index < best.entry.index ? cur : best;
  });

  let bestOrder: _ColorMetrics[] = [];
  let bestCost = Number.POSITIVE_INFINITY;

  const solve = (order: _ColorMetrics[], remaining: _ColorMetrics[], cost: number) => {
    if (cost >= bestCost) return;
    if (remaining.length === 0) {
      const final = cost + order[order.length - 1].lightness * 0.15;
      if (final < bestCost) { bestCost = final; bestOrder = order; }
      return;
    }
    const prev = order[order.length - 1];
    for (let i = 0; i < remaining.length; i++) {
      solve(
        [...order, remaining[i]],
        [...remaining.slice(0, i), ...remaining.slice(i + 1)],
        cost + _transitionCost(prev, remaining[i]),
      );
    }
  };

  if (metrics.length <= 8) {
    solve([anchor], metrics.filter((m) => m !== anchor), 0);
  } else {
    const order: _ColorMetrics[] = [anchor];
    let rem = metrics.filter((m) => m !== anchor);
    while (rem.length > 0) {
      const prev = order[order.length - 1];
      let best = rem[0], bestC = Number.POSITIVE_INFINITY;
      for (const c of rem) {
        const cost = _transitionCost(prev, c) + c.lightness * 0.1;
        if (cost < bestC) { bestC = cost; best = c; }
      }
      order.push(best);
      rem = rem.filter((c) => c !== best);
    }
    bestOrder = order;
  }

  return [...bestOrder.map((m) => m.entry.color), ...invalidColors];
}

/**
 * Normalize an AI-returned palette value and immediately sort it for visual harmony.
 * Use this at write-time (when creating a new variation from AI output).
 * Do NOT use this on user-edited palettes — their order must be preserved.
 */
export function normalizeAndSortColorPalette(raw: unknown): string[] {
  return sortColorPaletteForHarmony(normalizeColorPalette(raw));
}

/**
 * Renders color swatches onto an off-screen canvas and returns base64 PNG data (no data URL prefix).
 * Used for img2img color merges and Visual Snapshot generation.
 */
export function paletteToBase64(colors: string[]): string | undefined {
  if (!colors.length) return undefined;
  try {
    const canvas = document.createElement("canvas");
    const size = 256;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    const swatchW = size / colors.length;
    colors.forEach((hex, i) => {
      ctx.fillStyle = hex;
      ctx.fillRect(Math.round(i * swatchW), 0, Math.ceil(swatchW), size);
    });
    return canvas.toDataURL("image/png").split(",")[1];
  } catch {
    return undefined;
  }
}
