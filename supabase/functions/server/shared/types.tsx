// ─────────────────────────────────────────────────────────────────────────────
// shared/types.tsx — Shared type definitions for the agent system
// ─────────────────────────────────────────────────────────────────────────────

import type { LogoComposition } from "./logo-prompts.ts";

export type { LogoComposition, LogoCompositionMode } from "./logo-prompts.ts";

export type MergeSpec = {
  /** Model-facing slot-merge / primary hint. */
  newHint: string;
  /**
   * Instruction for card-to-card (img2img edit) merges.
   * Supports template variables: {sourceData}, {brandName}, {brandDescription}.
   * Falls back to newHint when not set.
   */
  cardHint?: string;
  allowedFields?: string[];
  /** Full LLM instruction for text-target merges (brand-strategist /merge and visual-designer /vision-merge). */
  instruction?: string;
  /**
   * extract-palette only: when the target already has hex colors, use this instruction instead of `instruction`.
   * Replace `{sourceData}` with the comma-separated current palette (visual-designer).
   */
  extractPaletteInstructionWithExistingTarget?: string;
  requiresSourceImage?: boolean;
  /** Override the default text model (TEXT_MODEL) for this specific merge. */
  textModel?: string;
};

export type VisualConceptData = {
  concept: string;
  description: string;
};

/** Brand identity essentials: name, tagline, keywords. */
export type BrandBriefCore = {
  name?: string;
  tagline?: string;
  keywords?: string[];
};

/** Narrative and audience: kept separate from core for prompts and API clarity. */
export type BrandBriefDetail = {
  targetAudience?: string;
  description?: string;
};

/** Touchpoint / mockup ideas (e.g. "Coffee Sleeve", "Loyalty Card"). */
export type BrandBriefApplication = string[];

// ── Visual context modules ────────────────────────────────────────────────────

/** Visual direction: concept, palette, typography. */
export type VisualContext = {
  visualConcept?: VisualConceptData;
  colorPalette?: string[];
  font?: { titleFont?: string; bodyFont?: string };
};

/** Generated image asset URLs produced by art-director. */
export type ImageAssets = {
  logoImageUrl?: string;
  artStyleImageUrl?: string;
  applicationImageUrl?: string;
};

// ── Composed context types (intersection of modules) ─────────────────────────

/**
 * Full brand context for art-director and strategist agents.
 * All fields are flat — intersection of BrandBriefCore + BrandBriefDetail +
 * VisualContext + ImageAssets + application fields.
 */
export type BrandContextFull = BrandBriefCore
  & BrandBriefDetail
  & VisualContext
  & ImageAssets
  & {
    /** Touchpoint mockup ideas list. Distinct from singular `application`. */
    applications?: BrandBriefApplication;
    /** Single selected touchpoint name for application mockup generation. */
    application?: string;
  };

/**
 * Compact brand context for visual-designer / image routes.
 * Carries only BrandBriefCore (name, tagline, keywords) + visual context.
 * Typography stored flat (titleFont/bodyFont) rather than nested font object.
 * Legacy flat `brandName` / root `keywords` still accepted in normalizeShortContext.
 */
export type BrandContextShort = BrandBriefCore
  & {
    visualConcept?: { concept: string; description?: string };
    colorPalette?: string[];
    titleFont?: string;
    bodyFont?: string;
    application?: string;
  };

/** Image slot payload on the board (logo, art-style). */
export type MergeBoardImageSlot = {
  imageUrl?: string;
};

/** Four visual slots aligned with merge `brandData` field names (excludes visual-concept). */
export type MergeBoardElements = {
  artStyle?: MergeBoardImageSlot | null;
  colorPalette?: string[] | null;
  font?: { titleFont?: string; bodyFont?: string } | null;
  logoInspiration?: MergeBoardImageSlot | null;
};

/**
 * Unified board state for merge prompts: visual concept + four visual slots.
 * Used by `/merge`, `/vision-merge`, and `/merge-generate` via the same formatter.
 */
export type MergeBoardPromptContext = {
  visualConcept?: VisualConceptData | null;
  boardElements: MergeBoardElements;
};

export type ImagePromptContext = {
  brandName?: string;
  tagline?: string;
  description?: string;
  brandDescription?: string;
  targetAudience?: string;
  visualConcept?: VisualConceptData;
  keywords?: string[];
  colorPalette?: string[];
  newHint?: string;
  titleFont?: string;
  bodyFont?: string;
  logoComposition?: LogoComposition;
  aspectRatio?: string;
  /** Touchpoint name for application mockup generation (e.g. "Business Card", "Packaging") */
  application?: string;
};

export type GeminiTextConfig = {
  temperature?: number;
  maxOutputTokens?: number;
  responseMimeType?: string;
};

export type ImageResult = {
  b64: string;
  mimeType: string;
};

export type ImageError = {
  error: string;
};

export type ImageGenResult = ImageResult & {
  errors: string[];
};

export type UploadedImage = {
  imageUrl: string;
  prompt: string;
  model: string;
  generationTime: number;
  ingredients: string[];
};
