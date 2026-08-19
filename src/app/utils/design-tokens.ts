// ─── Brand Brew Design Tokens ─────────────────────────────────────────────────
// Centralized constants for layout dimensions, canvas config, colors, and
// typography. Import from here instead of hard-coding values in components.

// ── Layout ────────────────────────────────────────────────────────────────────
export const LAYOUT = {
  /** Global app chrome */
  app: {
    /** App navbar height (screen px) */
    navbarHeight: 56,
  },

  /** Floating / slide-out side panels */
  panel: {
    /** Fixed width of the floating side panel (Brand Brief / Visual Snapshot / Brand Direction) */
    sideWidth: 400,
    /** Width of the slide-out Variations panel */
    variationsWidth: 340,
    /** Top offset for floating side panels from the top of the board viewport (screen px) */
    boardTop: 12,
    /** Top margin for the left context column, aligns with top toolbar gap (screen px) */
    leftTop: 12,
    /** Bottom margin for the left context column, aligns with Canvas HUD bottom-4 spacing (screen px) */
    leftBottom: 16,
  },

  /** Canvas-edge overlay panels (left = VC, right = VS) */
  overlay: {
    /** Left overlay width fraction — computed as containerSize.w * this value */
    leftWidthFraction: 0.2,
    /** Wider left overlay fraction used when only the Brand Brief is expanded (no VC panel). */
    briefExpandedWidthFraction: 0.4,
    /** Left overlay left margin (screen px) — flush against left edge */
    leftMarginLeft: 0,
    /** Left overlay top margin (screen px) */
    leftMarginTop: 60,
    /** Left overlay bottom margin (screen px) */
    leftMarginBottom: 80,
    /** Right overlay width fraction — computed as containerSize.w * this value */
    rightWidthFraction: 0.25,
    /**
     * Screen px reserved for filmstrip occlusion when VS panel is open (panel + filmstrip gap).
     * Fixed (not % of container) so on-screen reserve stays constant when zoom changes; ElementQueue divides by zoom for canvas coords.
     * Tune to stay roughly aligned with VisualSnapshotPanel outer width + gap.
     */
    rightFilmstripOcclusionScreenPx: 160,
    /** Right overlay right margin (screen px) — flush against right edge */
    rightMarginRight: 0,
    /** Right overlay top margin (screen px) — clears the top-right toolbar buttons */
    rightMarginTop: 56,
    /** Right overlay bottom margin (screen px) */
    rightMarginBottom: 16,
    /** Overlay panel header row height (screen px) */
    headerHeight: 36,
  },

  /** Queue row system */
  queue: {
    /** Width reserved for the pinned queue label (screen px) */
    labelWidth: 140,
    /** Total height of one queue row in canvas px (filmstrip.paddingTop + slot.size + filmstrip.paddingBottom) */
    rowHeight: 292,
    /** Vertical gap between queue rows — Tailwind mb-4 (canvas px) */
    gap: 16,
    /** Extra canvas-px overhang on each side of the queue stripe beyond the viewport */
    stripeOverhang: 200,
  },

  /** Filmstrip (card row within a queue) */
  filmstrip: {
    /** Gap between filmstrip cards — Tailwind gap-4 (canvas px) */
    gap: 16,
    /** Left padding — space before the first card (canvas px) */
    paddingLeft: 156,
    /** Top padding — space above cards (canvas px) */
    paddingTop: 24,
    /** Bottom padding (canvas px) */
    paddingBottom: 8,
    /** Hover scroll-chevron diameter (canvas px; inverse-zoom scaled in UI) */
    scrollButtonSize: 32,
    /** Inset of scroll chevrons from the filmstrip fade/content edge (canvas px) */
    scrollButtonInset: 8,
  },

  /** Variation card slots */
  slot: {
    /** Slot dimensions (width & height) in canvas coordinates */
    size: 260,
    /** Slot content padding X (matches ElementWrapper p-5: 20px × 2). Used for image slot width calculation. */
    paddingX: 40,
    /** Left offset of the add-variation / affordance slot relative to queue row origin (canvas px) */
    addOffset: 16,
    /** Width of the add-variation / affordance slot (canvas px) */
    addWidth: 124,
    /** Inner padding applied to the add-variation slot active state container */
    addPadding: 2,
  },

  /** Card size constraints */
  card: {
    /** Height used for context inline cards (e.g. Brand Brief) */
    contextHeight: 260,
    /** Default minimum height for image element cards (screen px) */
    imageMinHeight: 160,
    /** Minimum height for snapshot card variant (screen px) */
    snapshotMinHeight: 200,
    /** Snapshot thumbnail aspect ratio (width / height).
     *  Must stay in sync with IMAGE_CARD_CONFIGS["visual-snapshot"].displayRatio
     *  in supabase/functions/server/shared/image-config.tsx */
    snapshotAspectRatio: 16 / 9,
  },

  /** Floating popups and tooltips */
  popup: {
    /** Minimum height for popup/tooltip panels (screen px) */
    minHeight: 240,
    /** Vertical offset between trigger element and popup (screen px) */
    offset: 8,
    /** Width of the generation details floating popup (screen px) */
    detailsWidth: 320,
    /** Gap between the overlay panel and the generation details popup (screen px) */
    detailsGap: 12,
  },

  /** Noodle connections and ports */
  connection: {
    /** Connection port dot radius (screen px) */
    portRadius: 5,
    /** Noodle dot inset from card edge (canvas px). Centered in the card's p-5 margin. */
    toggleInset: 15,
  },
} as const;

// ── Canvas / Zoom ─────────────────────────────────────────────────────────────
export const CANVAS = {
  /** Minimum zoom level */
  ZOOM_MIN: 0.15,
  /** Maximum zoom level */
  ZOOM_MAX: 2.5,
  /** Base default zoom when the board opens */
  ZOOM_INITIAL: 1.0,
  /** Preferred number of queue rows visible in the initial viewport */
  TARGET_VISIBLE_QUEUE_ROWS: 4,
  /** Reserved vertical space for board chrome when estimating initial zoom (screen px) */
  INITIAL_VIEWPORT_VERTICAL_BUFFER: 32,
  /** Default pan offset (x, y) — matches FIT_PADDING for consistent top spacing */
  PAN_INITIAL: { x: 0, y: 48 },
  /** Maximum pan.y — matches FIT_PADDING so content can sit 48px below top edge */
  MAX_PAN_TOP: 48,
  /** Bottom margin kept visible below the last queue (screen px) */
  BOTTOM_MARGIN: 80,
  /** Top padding on the canvas content wrapper — pushes all queue rows down so they
   *  clear the top-edge overlay panels and toolbar buttons (canvas px) */
  CONTENT_TOP_PAD: 56,
  /** Bottom padding on the canvas content wrapper (must match pb-24 in curation-board.tsx) */
  CONTENT_BOTTOM_PAD: 96,
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

// ── Typography Scale ──────────────────────────────────────────────────────────
// Atomic design tokens for font size, weight, line-height, and icon sizing.
// Components compose from these primitives instead of referencing
// component-specific presets.
export const TYPE = {
  size: {
    micro: 9,
    xs: 10,
    sm: 11,
    baseSm: 12,
    base: 13,
    baseLg: 14,
    md: 15,
    lg: 18,
    xl: 22,
    xxl: 28,
  },
  weight: {
    normal: 400,
    semibold: 600,
    bold: 700,
  },
  leading: {
    tight: 1.15,
    snug: 1.2,
    relaxed: 1.6,
    loose: 1.7,
  },
  tracking: {
    wide: "0.14em",
  },
  icon: {
    sm: 12,
    /** 紧凑工具栏图标（如行内确认/取消） */
    compact: 12,
    base: 16,
  },
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
  "visual-concept":  { label: "Visual Concept",  image: false, strategic: true  },
  "art-style":       { label: "Art Style",        image: false, strategic: true  },
  "color-palette":   { label: "Color Palette",    image: false, strategic: true, variationType: "color" },
  "font":            { label: "Typography",        image: false, strategic: true  },
  "logo":            { label: "Logo",              image: true,  strategic: false },
  "visual-snapshot": { label: "Visual Snapshot",  image: true,  strategic: false },
};

export const BOARD_ELEMENT_TYPES = Object.keys(ELEMENT_META);

export const IMAGE_ELEMENT_TYPES = new Set<string>(
  Object.keys(ELEMENT_META).filter(k => ELEMENT_META[k].image)
);

/** Default order of queues on the curation board. visual-concept is in its own panel. */
export const DEFAULT_QUEUE_ORDER = [
  "color-palette",
  "font",
  "logo",
  "art-style",
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

// ── Card item style tokens ─────────────────────────────────────────────────────
// Governs outline / background rules for selectable card items (concept cards,
// variation filmstrip cards, etc.).
// Rule: all cards share a single light-purple background; selection is
// communicated exclusively via outline.
export const CARD = {
  /** Unified resting background — same light purple for all states */
  defaultBg: "rgba(139,92,246,0.06)",
  /** @deprecated use defaultBg */
  linkedBg: "rgba(139,92,246,0.06)",
  /** @deprecated use defaultBg */
  selectedBg: "rgba(139,92,246,0.06)",
  /** @deprecated use defaultBg */
  selectedLinkedBg: "rgba(139,92,246,0.06)",
  /** Outline for a selected card */
  selectedOutline: "1.5px solid rgba(139, 92, 246, 0.45)",
  /** @deprecated use selectedOutline */
  selectedLinkedOutline: "1.5px solid rgba(139, 92, 246, 0.45)",
  /** Shadow for selected card — none */
  selectedShadow: "none",
  /** @deprecated use selectedShadow */
  selectedLinkedShadow: "none",
} as const;

/**
 * Visual Concept 左侧叠层面板的头部、主按钮与占位状态。
 * 与 CARD.linkedBg 等 AI 紫色调保持一致。
 */
export const VISUAL_CONCEPT_PANEL = {
  header: {
    borderBottom: "1px solid var(--bb-user-inactive-border)",
    background: "var(--bb-user-inactive-bg)",
  },
  addConceptButton: {
    background: "var(--bb-ai-active-ring)",
    color: "#ffffff",
    border: "1px solid rgba(139, 92, 246, 0.3)",
    height: 32,
  },
  conceptualizingPlaceholder: {
    background: CARD.linkedBg,
    border: "1px dashed rgba(139, 92, 246, 0.2)",
  },
  /** 「概念生成中」区块内 spinner 尺寸（px） */
  spinner: {
    button: { size: 14, borderWidth: 2 },
    block: { size: 24, borderWidth: 2 },
    buttonTrack: "rgba(255, 255, 255, 0.4)",
    buttonCap: "#ffffff",
    blockTrack: "rgba(139, 92, 246, 0.15)",
    blockCap: "rgba(139, 92, 246, 0.45)",
  },
  emptyStateMaxWidth: 180,
  /** 编辑模式下描述输入框底边（略淡于 affordance border） */
  editDescriptionUnderline: "1px solid rgba(139, 92, 246, 0.35)",
  selectedIndicatorDot: {
    background: "var(--bb-ai-active-ring)",
  },
} as const;

/** 小型图标按钮的语义化 Tailwind 组合，避免在组件里散落颜色类名 */
export const ACTION_CHROME = {
  confirm: "text-emerald-600 hover:bg-emerald-50",
  dismissCancel: "text-muted-foreground hover:bg-red-50 hover:text-red-500",
  rowEdit: "text-muted-foreground/50 hover:text-foreground hover:bg-muted/60",
  rowDelete: "text-muted-foreground/50 hover:text-destructive hover:bg-red-50",
} as const;


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