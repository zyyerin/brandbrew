/**
 * HCT seed → 5-role brand palette via MCU TonalPalette.
 *
 * Intentionally does not use Material Scheme / UI tokens
 * (primaryContainer, onPrimary, surface, …). Those are app-theme roles,
 * not a 5-swatch brand palette.
 *
 * @material/material-color-utilities@0.4.0's package root re-export pulls in
 * extensionless imports that Node ESM cannot resolve, so this module loads
 * the HCT / TonalPalette files directly.
 */

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const mcuRoot = path.dirname(fileURLToPath(import.meta.resolve("@material/material-color-utilities")));
const loadMcu = (rel) => import(pathToFileURL(path.join(mcuRoot, rel)).href);

const [
  { Hct },
  { TonalPalette },
  { DislikeAnalyzer },
  { hexFromArgb, argbFromHex },
] = await Promise.all([
  loadMcu("hct/hct.js"),
  loadMcu("palettes/tonal_palette.js"),
  loadMcu("dislike/dislike_analyzer.js"),
  loadMcu("utils/string_utils.js"),
]);

export const CHROMA_VALUES = Object.freeze({
  muted: 16,
  standard: 36,
  vivid: 72,
});

export const CHROMA_KEYS = Object.freeze(["muted", "standard", "vivid"]);
export const VARIANTS = Object.freeze(["content", "tonalSpot", "vibrant", "neutral"]);
export const ROLE_ORDER = Object.freeze(["paper", "primary", "muted", "accent", "ink"]);

export const ROLE_TONES = Object.freeze({
  paper: 97,
  primary: 55,
  muted: 70,
  accent: 50,
  ink: 12,
});

export const A1_RAMP_TONES = Object.freeze([10, 20, 30, 40, 50, 60, 70, 80, 90]);

function toHex(argb) {
  return hexFromArgb(argb).toUpperCase();
}

export function normalizeHex(hex) {
  const raw = String(hex ?? "").trim();
  const n = raw.startsWith("#") ? raw.slice(1) : raw;
  if (!/^[0-9a-fA-F]{3}$/.test(n) && !/^[0-9a-fA-F]{6}$/.test(n)) {
    throw new Error(`invalid hex: ${hex}`);
  }
  const full = n.length === 3 ? n.split("").map((c) => c + c).join("") : n;
  return `#${full.toUpperCase()}`;
}

export function snapHue(hue) {
  const n = Number(hue);
  if (!Number.isFinite(n)) {
    throw new Error(`hue must be a finite number, got ${String(hue)}`);
  }
  const wrapped = ((n % 360) + 360) % 360;
  const snapped = Math.round(wrapped / 5) * 5;
  return snapped === 360 ? 0 : snapped;
}

function variantParams(variant, hue, chroma) {
  switch (variant) {
    case "content":
      return {
        primaryChroma: chroma,
        secondaryChroma: Math.max(8, chroma / 3),
        tertiaryHue: (hue + 60) % 360,
        tertiaryChroma: chroma * 0.8,
        neutralChroma: 8,
      };
    case "tonalSpot":
      return {
        primaryChroma: chroma,
        secondaryChroma: Math.max(8, chroma / 3),
        tertiaryHue: (hue + 60) % 360,
        tertiaryChroma: Math.max(16, chroma * 0.7),
        neutralChroma: 6,
      };
    case "vibrant":
      return {
        primaryChroma: Math.min(80, chroma * 1.25),
        secondaryChroma: Math.max(12, chroma / 2.5),
        tertiaryHue: (hue + 60) % 360,
        tertiaryChroma: Math.min(72, chroma),
        neutralChroma: 8,
      };
    case "neutral":
      return {
        primaryChroma: Math.min(chroma, 12),
        secondaryChroma: 6,
        tertiaryHue: (hue + 15) % 360,
        tertiaryChroma: Math.min(chroma, 10),
        neutralChroma: 4,
      };
    default:
      throw new Error(`unknown variant: ${variant}`);
  }
}

/**
 * Expand LLM seed knobs into a 5-role palette.
 *
 * @param {{ hue: number, chroma: "muted"|"standard"|"vivid", variant: "content"|"tonalSpot"|"vibrant"|"neutral" }} seed
 */
export function chromaKeyFromChroma(chroma) {
  const n = Number(chroma);
  if (!Number.isFinite(n) || n < 26) return "muted";
  if (n < 46) return "standard";
  return "vivid";
}

export function knobsFromHex(hex, variant = "content") {
  if (!VARIANTS.includes(variant)) {
    throw new Error(`variant must be one of ${VARIANTS.join(", ")}, got ${variant}`);
  }
  const hct = Hct.fromInt(argbFromHex(String(hex)));
  return {
    hue: hct.hue,
    chroma: chromaKeyFromChroma(hct.chroma),
    variant,
    sourceHct: { hue: hct.hue, chroma: hct.chroma, tone: hct.tone },
  };
}

export function pickCoreHex(colors) {
  const list = Array.isArray(colors) ? colors.filter((hex) => typeof hex === "string" && hex.trim()) : [];
  if (list.length === 0) {
    throw new Error("pickCoreHex requires at least one hex");
  }
  let best = list[0];
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const hex of list) {
    try {
      const hct = Hct.fromInt(argbFromHex(hex));
      // Prefer the most chromatic mid-tone; paper/ink are almost never the brand core.
      const paperOrInk = hct.tone > 90 || hct.tone < 18;
      const score = paperOrInk ? hct.chroma * 0.12 : hct.chroma;
      if (score > bestScore) {
        bestScore = score;
        best = hex;
      }
    } catch {
      // skip unparsable
    }
  }
  return best;
}

export function expandMcuPalette(seed) {
  if (!seed || typeof seed !== "object") {
    throw new Error("seed is required");
  }
  const lockedHex = seed.primaryHex ? normalizeHex(seed.primaryHex) : null;
  const variant = seed.variant ?? "content";
  if (!VARIANTS.includes(variant)) {
    throw new Error(`variant must be one of ${VARIANTS.join(", ")}, got ${variant}`);
  }

  let chromaKey = seed.chroma;
  let hue;
  let requestedChroma;
  let seedHct;

  if (lockedHex) {
    seedHct = Hct.fromInt(argbFromHex(lockedHex));
    hue = seedHct.hue;
    requestedChroma = seedHct.chroma;
    chromaKey = chromaKey && CHROMA_KEYS.includes(chromaKey)
      ? chromaKey
      : chromaKeyFromChroma(seedHct.chroma);
  } else {
    if (!CHROMA_KEYS.includes(chromaKey)) {
      throw new Error(`chroma must be one of ${CHROMA_KEYS.join(", ")}, got ${chromaKey}`);
    }
    hue = snapHue(seed.hue);
    requestedChroma = CHROMA_VALUES[chromaKey];
    seedHct = DislikeAnalyzer.fixIfDisliked(Hct.from(hue, requestedChroma, 50));
  }

  const params = variantParams(variant, seedHct.hue, seedHct.chroma);

  const a1 = TonalPalette.fromHueAndChroma(seedHct.hue, params.primaryChroma);
  const a2 = TonalPalette.fromHueAndChroma(seedHct.hue, params.secondaryChroma);
  const a3 = TonalPalette.fromHueAndChroma(params.tertiaryHue, params.tertiaryChroma);
  const n1 = TonalPalette.fromHueAndChroma(seedHct.hue, params.neutralChroma);

  const palettes = { a1, a2, a3, n1 };
  const sources = {
    paper: "n1",
    primary: "a1",
    muted: "a2",
    accent: "a3",
    ink: "n1",
  };

  const roles = {};
  for (const role of ROLE_ORDER) {
    if (role === "primary" && lockedHex) {
      const lockedHct = Hct.fromInt(argbFromHex(lockedHex));
      roles.primary = {
        hex: lockedHex,
        tone: Math.round(lockedHct.tone),
        source: "locked",
      };
      continue;
    }
    const tone = ROLE_TONES[role];
    const palette = palettes[sources[role]];
    let hct = palette.getHct(tone);
    if (role === "primary") {
      hct = DislikeAnalyzer.fixIfDisliked(hct);
    }
    roles[role] = {
      hex: toHex(hct.toInt()),
      tone: Math.round(hct.tone),
      source: sources[role],
    };
  }

  return {
    roles,
    hexes: ROLE_ORDER.map((role) => roles[role].hex),
    ramp: A1_RAMP_TONES.map((tone) => ({
      tone,
      hex: toHex(a1.tone(tone)),
    })),
    hct: {
      hue: seedHct.hue,
      chroma: seedHct.chroma,
      tone: seedHct.tone,
      chromaKey,
      variant,
      requestedHue: lockedHex ? seedHct.hue : hue,
      requestedChroma,
      primaryLocked: Boolean(lockedHex),
    },
    seed: { hue: lockedHex ? seedHct.hue : hue, chroma: chromaKey, variant, primaryHex: lockedHex ?? undefined },
  };
}

export { Hct, DislikeAnalyzer, argbFromHex, hexFromArgb };
