// ─── Brand Brew Design Tokens ─────────────────────────────────────────────────
// Centralized constants for layout dimensions, canvas config, colors, and
// typography. Import from here instead of hard-coding values in components.

// ── Layout ────────────────────────────────────────────────────────────────────
export const LAYOUT = {
  /** Fixed width of the floating side panel (Brand Context / Visual Snapshot / Brand Direction) */
  SIDE_PANEL_WIDTH: 400,
  /** Width of the slide-out Variations panel */
  VARIATIONS_PANEL_WIDTH: 340,
  /** Variation slot dimensions (width & height) in canvas coordinates */
  VARIATION_SLOT_SIZE: 260,
  /** Width reserved for the pinned queue label (screen px) */
  QUEUE_LABEL_WIDTH: 140,
  /** Gap between filmstrip cards */
  FILMSTRIP_GAP: 16, // Tailwind gap-4
  /** Variation slot content padding X (matches ElementWrapper p-5: 20px × 2). Used for image slot width so the image container matches image aspect ratio. */
  VARIATION_SLOT_PADDING_X: 40,
  /** Height used for Brand Context inline cards */
  CONTEXT_CARD_HEIGHT: 260,
  /** VS node width fraction — computed as containerSize.w * this value */
  VS_NODE_WIDTH_FRACTION: 0.25,
  /** VS node right margin (screen px) */
  VS_NODE_RIGHT_MARGIN: 24,
  /** VS node top margin (screen px) */
  VS_NODE_TOP_MARGIN: 48,
  /** VS node bottom margin */
  VS_NODE_BOTTOM_MARGIN: 80,
  /** Snapshot thumbnail aspect ratio (width / height).
   *  Must stay in sync with IMAGE_CARD_CONFIGS["visual-snapshot"].displayRatio
   *  in supabase/functions/server/shared/image-config.tsx */
  VS_SNAPSHOT_ASPECT_RATIO: 16 / 9,
  /** Connection port dot radius (screen px) */
  PORT_RADIUS: 5,
  /** Filmstrip left padding — space before the first card (canvas px) */
  FILMSTRIP_PADDING_LEFT: 156,
  /** Filmstrip top padding — space above cards (canvas px) */
  FILMSTRIP_PADDING_TOP: 24,
  /** Filmstrip bottom padding (canvas px) */
  FILMSTRIP_PADDING_BOTTOM: 8,
  /** Total height of one queue row in canvas px (FILMSTRIP_PADDING_TOP + VARIATION_SLOT_SIZE + FILMSTRIP_PADDING_BOTTOM) */
  QUEUE_ROW_HEIGHT: 292,
  /** Vertical gap between queue rows — Tailwind mb-4 (canvas px) */
  QUEUE_GAP: 16,
  /** Noodle dot inset from card edge (canvas px). Centered in the card's p-5 margin. */
  TOGGLE_INSET: 15,
  /** Left offset of the add-variation / affordance slot relative to queue row origin (canvas px) */
  ADD_SLOT_LEFT_OFFSET: 16,
  /** Width of the add-variation / affordance slot (canvas px) */
  ADD_SLOT_WIDTH: 124,
  /** Inner padding applied to the add-variation slot active state container */
  ADD_SLOT_PADDING: 2,
  /** App navbar height (screen px) */
  NAVBAR_HEIGHT: 56,
  /** Top offset for the floating Brand Summary / side panel from the top of the board viewport (screen px) */
  BOARD_PANEL_TOP: 60,
  /** Default minimum height for image element cards (screen px) */
  IMAGE_CARD_MIN_HEIGHT: 160,
  /** Minimum height for the Visual Snapshot card variant (screen px) */
  SNAPSHOT_CARD_MIN_HEIGHT: 200,
  /** Width of the VS generation details floating popup (screen px) */
  VS_DETAILS_POPUP_WIDTH: 254,
  /** Gap between the VS panel and the generation details popup (screen px) */
  VS_DETAILS_POPUP_GAP: 12,
  /** Height of the VS panel header row (screen px) */
  VS_HEADER_HEIGHT: 36,
  /** Extra canvas-px overhang on each side of the queue stripe beyond the viewport */
  QUEUE_STRIPE_OVERHANG: 200,
  /** Minimum height for popup/tooltip panels (screen px) */
  POPUP_MIN_HEIGHT: 120,
  /** Vertical offset between trigger element and popup (screen px) */
  POPUP_OFFSET: 8,
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
  PAN_INITIAL: { x: 0, y: 16 },
  /** Maximum pan.y — top padding above the first queue when scrolled to top */
  MAX_PAN_TOP: 16,
  /** Bottom margin kept visible below the last queue (screen px) */
  BOTTOM_MARGIN: 80,
  /** Size of the dot-grid pattern tile (px) */
  DOT_SIZE: 24,
  /** Zoom step factor for button controls */
  ZOOM_STEP: 1.25,
  /** Fit-to-content padding (px) */
  FIT_PADDING: 48,
  /** Minimum zoom level at which the action bar is shown on card hover */
  ACTION_BAR_ZOOM_THRESHOLD: 0.45,
  /** Minimum scale factor for the action bar inverse-zoom compensation */
  ACTION_BAR_SCALE_MIN: 0.5,
  /** Maximum scale factor for the action bar inverse-zoom compensation */
  ACTION_BAR_SCALE_MAX: 3.5,
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
  /** Toggle indicator icon size (smaller check/x inside the active pill) */
  toggleIconSize: 11,
  /** HUD percentage display */
  hudText: { fontSize: 11 },
  /** Chat message body */
  chatBody: { fontSize: 13, lineHeight: 1.6 },
  /** Chat agent name */
  chatAgent: { fontSize: 13, fontWeight: 600 },
  /** Tagline / label text below headings (e.g. BrandBriefCard tagline, variation panel labels) */
  cardTagline: { fontSize: 14 },
  /** Floating panel / side-panel heading (e.g. "Brand Summary" panel title) */
  panelHeading: { fontSize: 15, fontWeight: 600 },
  /** Font preview heading — same size as cardHeadingLg but intentionally tighter line-height for font rendering */
  fontPreviewHeading: { fontSize: 28, fontWeight: 400, lineHeight: 1.15 },
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
  /** Fake generation spinner duration for add variation (ms) */
  REGENERATE_DELAY: 2000,
  /** Chat reply delay for generic messages (ms) */
  CHAT_REPLY_DELAY: 800,
  /** Interview follow-up delay (ms) */
  INTERVIEW_DELAY: 600,
  /** Delay before navigating to brand direction page when generation is skipped (ms) */
  DIRECTION_GENERATION_DELAY: 3000,
  /** Debounce delay for font preview hover load (ms) */
  FONT_HOVER_DELAY: 150,
  /** Duration to show save-success feedback badge (ms) */
  SAVE_FEEDBACK_DURATION: 2000,
  /** Delay before scrolling selected font into view when dropdown opens (ms) */
  SCROLL_INTO_VIEW_DELAY: 40,
} as const;

// ── Board element/slot type IDs ───────────────────────────────────────────────
// Single source of truth for element metadata. BOARD_ELEMENT_TYPES,
// IMAGE_ELEMENT_TYPES, STRATEGIC_ELEMENT_TYPES and ELEMENT_TYPE_LABELS are all
// derived from here. DEFAULT_QUEUE_ORDER is kept explicit because it uses a
// different sort order than the board display order.

const ELEMENT_META: Record<string, {
  label: string;
  image: boolean;
  strategic: boolean;
  variationType?: string;
}> = {
  "brand-brief":     { label: "Brand Summary",   image: false, strategic: true  },
  "visual-concept":  { label: "Visual Concept",  image: false, strategic: true  },
  "art-style":       { label: "Art Style",        image: false, strategic: true  },
  "color-palette":   { label: "Color Palette",    image: false, strategic: true, variationType: "color" },
  "font":            { label: "Typography",        image: false, strategic: true  },
  "logo":            { label: "Logo",              image: true,  strategic: false },
  "application":     { label: "Application",       image: true,  strategic: false },
  "visual-snapshot": { label: "Visual Snapshot",  image: true,  strategic: false },
};

export const BOARD_ELEMENT_TYPES = Object.keys(ELEMENT_META);

export const IMAGE_ELEMENT_TYPES = new Set<string>(
  Object.keys(ELEMENT_META).filter(k => ELEMENT_META[k].image)
);

/** Default order of queues on the curation board (different from board display order). */
export const DEFAULT_QUEUE_ORDER = [
  "visual-concept",
  "art-style",
  "logo",
  "color-palette",
  "font",
  "application",
] as const;

export const STRATEGIC_ELEMENT_TYPES = Object.keys(ELEMENT_META).filter(
  k => ELEMENT_META[k].strategic
);

export const ELEMENT_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  Object.keys(ELEMENT_META).map(k => [k, ELEMENT_META[k].label])
);

/**
 * Maps a board element type ID to the GeneratedCardItem["type"] value used for
 * variations. Defaults to the element ID itself; only overrides (e.g.
 * color-palette → "color") are stored in ELEMENT_META.
 */
export function toVariationType(elementType: string): string {
  return ELEMENT_META[elementType]?.variationType ?? elementType;
}

// ── Color Palette ─────────────────────────────────────────────────────────────
export const PALETTE = {
  /** Minimum number of colors a palette must have */
  MIN_COLORS: 2,
  /** Maximum number of colors a palette may have */
  MAX_COLORS: 5,
  /** Default hex color added when the user clicks "+" in palette edit mode */
  DEFAULT_NEW_COLOR: "#808080",
} as const;

/** Inverse-zoom compensation clamped to [min, max]. */
export function adaptiveSize(
  base: number,
  zoom: number,
  min: number = base * 0.5,
  max: number = base * 1.5,
): number {
  return Math.min(Math.max(base / zoom, min), max);
}