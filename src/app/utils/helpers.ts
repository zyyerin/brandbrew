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
 */
export function normalizeColorPalette(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw;
  return (raw as any)?.colorPalette ?? (raw as any)?.colors ?? [];
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
