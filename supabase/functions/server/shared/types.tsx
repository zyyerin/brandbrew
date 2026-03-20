// ─────────────────────────────────────────────────────────────────────────────
// shared/types.tsx — Shared type definitions for the agent system
// ─────────────────────────────────────────────────────────────────────────────

export type MergeSpec = {
  mergeContext: string;
  allowedFields?: string[];
  instruction?: string;
  requiresSourceImage?: boolean;
};

export type ImagePromptContext = {
  brandName?: string;
  brandDescription?: string;
  conceptPhrases?: string[];
  keywords?: string[];
  colorPalette?: string[];
  mergeContext?: string;
  titleFont?: string;
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
