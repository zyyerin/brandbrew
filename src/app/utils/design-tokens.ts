// ─── Brand Brew Design Tokens ─────────────────────────────────────────────────
// Centralized constants for layout dimensions, canvas config, colors, and
// typography. Import from here instead of hard-coding values in components.

// ── Layout ────────────────────────────────────────────────────────────────────
export const LAYOUT = {
  /** Fixed width of the floating side panel (Brand Context / Visual Snapshot / Brand Guideline) */
  SIDE_PANEL_WIDTH: 400,
  /** Width of the slide-out Variations panel */
  VARIATIONS_PANEL_WIDTH: 340,
  /** Card slot dimensions (width & height) in canvas coordinates */
  CARD_SIZE: 260,
  /** Width reserved for the pinned queue label (screen px) */
  QUEUE_LABEL_WIDTH: 140,
  /** Gap between filmstrip cards */
  FILMSTRIP_GAP: 16, // Tailwind gap-4
  /** Height used for Brand Context inline cards */
  CONTEXT_CARD_HEIGHT: 260,
  /** VS node width fraction — computed as containerSize.w * this value */
  VS_NODE_WIDTH_FRACTION: 0.25,
  /** VS node right margin (screen px) */
  VS_NODE_RIGHT_MARGIN: 24,
  /** VS node top margin (screen px) */
  VS_NODE_TOP_MARGIN: 80,
  /** VS node bottom margin — keeps panel above canvas HUD (zoom / fit buttons) */
  VS_NODE_BOTTOM_MARGIN: 80,
  /** Snapshot thumbnail aspect ratio (width / height).
   *  Must stay in sync with IMAGE_CARD_CONFIGS["visual-snapshot"].displayRatio
   *  in supabase/functions/server/shared/image-config.tsx */
  VS_SNAPSHOT_ASPECT_RATIO: 16 / 9,
  /** Connection port dot radius (screen px) */
  PORT_RADIUS: 5,
} as const;

// ── Canvas / Zoom ─────────────────────────────────────────────────────────────
export const CANVAS = {
  /** Minimum zoom level */
  ZOOM_MIN: 0.15,
  /** Maximum zoom level */
  ZOOM_MAX: 2.5,
  /** Default zoom when the board opens */
  ZOOM_INITIAL: 1.0,
  /** Default pan offset (x, y) — small y pushes the canvas just below the top */
  PAN_INITIAL: { x: 0, y: 4 },
  /** Maximum pan.y — prevents pulling canvas below the navbar */
  MAX_PAN_TOP: 4,
  /** Bottom margin kept visible below the last queue (screen px) */
  BOTTOM_MARGIN: 80,
  /** Size of the dot-grid pattern tile (px) */
  DOT_SIZE: 24,
  /** Zoom step factor for button controls */
  ZOOM_STEP: 1.25,
  /** Fit-to-content padding (px) */
  FIT_PADDING: 48,
} as const;

// ── Typography ────────────────────────────────────────────────────────────────
// Shared font-size and weight tokens used across card components
export const TYPOGRAPHY = {
  /** Large heading inside cards (Brand Summary name, Keywords) */
  cardHeadingLg: { fontSize: 28, fontWeight: 400, lineHeight: 1.2 },
  /** Medium heading inside cards (Art Style, Visual Concept) */
  cardHeadingMd: { fontSize: 22, fontWeight: 400, lineHeight: 1.2 },
  /** Font card heading */
  cardHeadingSm: { fontSize: 18, fontWeight: 400 },
  /** Body copy inside cards */
  cardBody: { fontSize: 13, lineHeight: 1.7 },
  /** Small body / point text */
  cardBodySm: { fontSize: 12, lineHeight: 1.6 },
  /** Keyword bold style */
  keywordBold: { fontSize: 28, fontWeight: 700, lineHeight: 1.2 },
  /** Micro label (section headers, tracking labels) */
  microLabel: { fontSize: 10, letterSpacing: "0.14em" },
  /** Queue label */
  queueLabel: { fontSize: 11, fontWeight: 600 },
  /** Chip / badge text */
  badge: { fontSize: 9, fontWeight: 600 },
  /** Action bar icon size */
  actionIconSize: 13,
  /** HUD percentage display */
  hudText: { fontSize: 11 },
  /** Chat message body */
  chatBody: { fontSize: 13, lineHeight: 1.6 },
  /** Chat agent name */
  chatAgent: { fontSize: 13, fontWeight: 600 },
} as const;

// ── Animation / Timing ────────────────────────────────────────────────────────
export const TIMING = {
  /** Delay between visual generation stages (ms) */
  STAGE_1_DELAY: 800,
  STAGE_2_DELAY: 1700,
  STAGE_3_DELAY: 2800,
  STAGE_4_DELAY: 3800,
  /** Image refresh animation duration (ms) */
  IMAGE_REFRESH_DELAY: 400,
  /** Fake generation spinner duration for regenerate (ms) */
  REGENERATE_DELAY: 2000,
  /** Chat reply delay for generic messages (ms) */
  CHAT_REPLY_DELAY: 800,
  /** Interview follow-up delay (ms) */
  INTERVIEW_DELAY: 600,
} as const;

// ── Card type IDs ─────────────────────────────────────────────────────────────
// Static arrays / sets referenced across components
export const BOARD_CARD_IDS = [
  "brand-brief",
  "visual-concept",
  "art-style",
  "color-palette",
  "font",
  "logo",
  "layout",
  "visual-snapshot",
] as const;

export const IMAGE_CARD_IDS = new Set<string>([
  "logo",
  "layout",
  "visual-snapshot",
]);

export const DEFAULT_QUEUE_ORDER = [
  "visual-concept",
  "art-style",
  "logo",
  "color-palette",
  "font",
  "layout",
] as const;

export const STRATEGIC_CARD_IDS = [
  "brand-brief",
  "visual-concept",
  "art-style",
  "color-palette",
  "font",
] as const;

export const CARD_LABELS: Record<string, string> = {
  "brand-brief":      "Brand Summary",
  "visual-concept":   "Visual Concept",
  "art-style":        "Art Style",
  "color-palette":    "Color Palette",
  "font":             "Typography",
  "logo":             "Logo",
  "layout":           "Layout",
  "visual-snapshot":  "Visual Snapshot",
};

/**
 * Maps board card IDs to the GeneratedCardItem["type"] value used for variations.
 * For image cards the type equals the card ID; for text/color cards there are aliases.
 */
export const CARD_TYPE_MAP: Record<string, string> = {
  "brand-brief":      "brand-brief",
  "color-palette":    "color",
  "visual-concept":   "visual-concept",
  "font":             "font",
  "art-style":        "art-style",
  "logo":             "logo",
  "layout":           "layout",
  "visual-snapshot":  "visual-snapshot",
};