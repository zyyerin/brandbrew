import { callApi } from "./apiClient";
import type { VariationMeta } from "../types/project";
import type { BrandContextFull } from "@server-shared/types.tsx";

const STRATEGIST_VISUAL_CONCEPT_TIMEOUT_MS = 90_000;
const STRATEGIST_DIRECTION_TIMEOUT_MS = 90_000;
const IMAGE_UPLOAD_TIMEOUT_MS = 180_000;

// ─── 类型定义 ─────────────────────────────────────────────────────────────────

export interface VisualConceptData {
  concept: string;
  description: string;
}

export interface AiBrandData {
  brandBrief: { name: string; tagline: string; description: string };
  keywords: string[];
  colorPalette: string[];
  visualConcept: VisualConceptData;
  artStyle: { imageUrl: string };
  font: { titleFont: string; bodyFont: string };
}

/** @deprecated Use VariationMeta from brand-cards.tsx instead */
export type BrandGenMeta = VariationMeta;

export interface AiBrandDataResult {
  brandData: AiBrandData;
  _meta?: VariationMeta;
}

export interface CardVariationContext {
  brandName?: string;
  tagline?: string;
  description?: string;
  targetAudience?: string;
  keywords?: string[];
  visualConcept?: { concept: string; description?: string };
  existingContent?: unknown;
  /** Font names already used across existing variations — the AI should not reuse them. */
  excludedFonts?: string[];
}

export interface CardVariationResult<T = unknown> {
  data: T;
  _meta?: VariationMeta;
}

// ─── 对外暴露的 API 函数 ───────────────────────────────────────────────────────

/**
 * 调用 Gemini（经由服务端），根据用户的自由描述一次性生成完整品牌 Identity。
 */
export async function generateBrandData(userPrompt: string): Promise<AiBrandDataResult> {
  const raw = await callApi<AiBrandData & { _meta?: VariationMeta }>("generate-brand-data", { body: { userPrompt } });
  const { _meta, ...brandData } = raw as any;
  return { brandData: brandData as AiBrandData, _meta };
}

// ─── Visual Concept (standalone) ──────────────────────────────────────────────

export interface VisualConceptInput {
  brandName?: string;
  tagline?: string;
  description?: string;
  targetAudience?: string;
  keywords?: string[];
  existingConcepts?: Array<{ concept: string; description: string }>;
}

export interface VisualConceptResult {
  visualConcept: VisualConceptData;
  _meta?: VariationMeta;
}

export async function generateVisualConcept(
  input: VisualConceptInput,
  opts?: { signal?: AbortSignal },
): Promise<VisualConceptResult> {
  const brandContext: BrandContextFull = {
    name: input.brandName,
    tagline: input.tagline,
    keywords: input.keywords,
    description: input.description,
    targetAudience: input.targetAudience,
  };
  const raw = await callApi<{ visualConcept: VisualConceptData; _meta?: VariationMeta }>(
    "strategist/generate-visual-concept",
    {
      body: { ...input, brandContext },
      timeoutMs: STRATEGIST_VISUAL_CONCEPT_TIMEOUT_MS,
      signal: opts?.signal,
    },
  );
  return { visualConcept: raw.visualConcept, _meta: raw._meta };
}

export interface AutoCompleteInput {
  partialBrief?: { name?: string; tagline?: string; description?: string };
  targetAudience?: string;
  keywords?: string;
  applications?: string[];
}

export interface AutoCompleteResult {
  brandBrief: { name: string; tagline: string; description: string };
  targetAudience: string;
  keywords: string[];
  applications?: string[];
}

/**
 * Batch-fill all empty Brand Brief fields; preserves user-filled values.
 */
export async function autoCompleteBrief(input: AutoCompleteInput): Promise<AutoCompleteResult> {
  const raw = await callApi<AutoCompleteResult & { _meta?: unknown }>("auto-complete", {
    body: {
      partialBrief: input.partialBrief ?? {},
      targetAudience: input.targetAudience ?? "",
      keywords: input.keywords ?? "",
      applications: input.applications,
    },
  });
  const { _meta, ...result } = raw as any;
  return result as AutoCompleteResult;
}

// ─── Auto Fill (single field) ────────────────────────────────────────────────

export type AutoFillFieldName =
  | "name"
  | "tagline"
  | "description"
  | "targetAudience"
  | "keywords"
  | "applications";

export interface AutoFillInput {
  targetField: AutoFillFieldName;
  existingValue?: string;
  mode?: "fill" | "enhance";
  brandBrief: {
    name?: string;
    tagline?: string;
    description?: string;
    targetAudience?: string;
    keywords?: string;
    applications?: string[];
  };
}

export interface AutoFillResult {
  targetField: AutoFillFieldName;
  value: unknown;
}

/**
 * Generate or refine a single Brand Brief field.
 */
export async function autoFillField(input: AutoFillInput): Promise<AutoFillResult> {
  const raw = await callApi<AutoFillResult & { _meta?: unknown }>(
    "strategist/auto-fill",
    { body: input },
  );
  const { _meta, ...result } = raw as any;
  return result as AutoFillResult;
}

/**
 * 为单张卡片生成 AI 变体内容，以当前品牌上下文作为创作锚点。
 */
export async function generateCardVariation<T = unknown>(
  cardType: string,
  brandBrief: CardVariationContext
): Promise<CardVariationResult<T>> {
  const brandContext: BrandContextFull = {
    name: brandBrief.brandName,
    tagline: brandBrief.tagline,
    keywords: brandBrief.keywords,
    description: brandBrief.description,
    targetAudience: brandBrief.targetAudience,
    visualConcept: brandBrief.visualConcept
      ? {
          concept: brandBrief.visualConcept.concept,
          description: brandBrief.visualConcept.description ?? "",
        }
      : undefined,
  };
  const raw = await callApi<T & { _meta?: CardVariationResult["_meta"] }>(
    "generate-card-variation",
    { body: { cardType, brandBrief, brandContext }, timeoutMs: 60_000 },
  );
  const { _meta, ...data } = raw as any;
  return { data: data as T, _meta };
}

// ─── Direction types ───────────────────────────────────────────────────────────

export interface DirectionColorName {
  hex: string;
  name: string;
}

export interface DirectionData {
  rationales: {
    logo: string;
    color: string;
    typography: string;
    artStyle: string;
  };
  colorNames: DirectionColorName[];
  brandInContextDescription: string;
  /** AI-generated paragraph expanding on the visual concept (always present after direction generation). */
  visualConceptContent?: string;
  /** Synthesized concept name when direction is generated without an active visual concept. */
  synthesizedVisualConcept?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEdgeRuntime503(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return /HTTP 503|SUPABASE_EDGE_RUNTIME_ERROR|Service Unavailable/i.test(err.message);
}

function stripDirectionImageContext(brandData: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...brandData };
  delete next.logoImageUrl;
  delete next.artStyleImageUrl;

  if (isRecord(next.artStyle) && "imageUrl" in next.artStyle) {
    const { imageUrl: _imageUrl, ...rest } = next.artStyle;
    next.artStyle = Object.keys(rest).length > 0 ? rest : undefined;
  }

  if (isRecord(next.logo) && "imageUrl" in next.logo) {
    const { imageUrl: _imageUrl, ...rest } = next.logo;
    next.logo = Object.keys(rest).length > 0 ? rest : undefined;
  }

  return next;
}

/**
 * Generate direction rationales, color names, and context descriptions via AI.
 */
export async function generateDirection(brandData: Record<string, unknown>): Promise<DirectionData> {
  try {
    const raw = await callApi<DirectionData & { _meta?: unknown }>("strategist/direction", {
      body: { brandData },
      timeoutMs: STRATEGIST_DIRECTION_TIMEOUT_MS,
    });
    const { _meta, ...data } = raw as any;
    return data as DirectionData;
  } catch (err) {
    if (!isEdgeRuntime503(err)) {
      throw err;
    }

    const fallbackBrandData = stripDirectionImageContext(brandData);
    const raw = await callApi<DirectionData & { _meta?: unknown }>("strategist/direction", {
      body: { brandData: fallbackBrandData },
      timeoutMs: STRATEGIST_DIRECTION_TIMEOUT_MS,
    });
    const { _meta, ...data } = raw as any;
    return data as DirectionData;
  }
}

// ─── User image upload ───────────────────────────────────────────────────────

export async function uploadImage(
  base64: string,
  mimeType: string,
  cardType: string,
): Promise<{ imageUrl: string }> {
  return callApi<{ imageUrl: string }>("upload-image", {
    body: { base64, mimeType, cardType },
    // COS retries can legitimately take longer than callApi's 30s default.
    timeoutMs: IMAGE_UPLOAD_TIMEOUT_MS,
  });
}

// ─── Project persistence ──────────────────────────────────────────────────────

export async function saveProject(data: Record<string, unknown>, projectId = "default"): Promise<void> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await callApi<{ ok: boolean }>("save-project", { body: { projectId, data } });
      return;
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      const isRetryable =
        /HTTP 5\d\d/.test(message)
        || message.includes("SUPABASE_EDGE_RUNTIME_ERROR")
        || message.includes("Service Unavailable");
      if (!isRetryable || attempt === 2) break;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function loadProject(projectId = "default"): Promise<{ found: boolean; data?: Record<string, unknown> }> {
  return callApi<{ found: boolean; data?: Record<string, unknown> }>(
    `load-project?projectId=${encodeURIComponent(projectId)}`,
    { method: "GET" },
  );
}
