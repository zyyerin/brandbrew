import { callApi } from "./apiClient";
import type { VariationMeta } from "../types/project";

// ─── 类型定义 ─────────────────────────────────────────────────────────────────

export interface AiBrandData {
  brandBrief: { name: string; tagline: string; description: string };
  keywords: string[];
  colorPalette: string[];
  visualConcept: string[];
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
  keywords?: string[];
  concept?: string;
  existingContent?: unknown;
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
}

export interface VisualConceptResult {
  visualConcept: string[];
  _meta?: VariationMeta;
}

export async function generateVisualConcept(input: VisualConceptInput): Promise<VisualConceptResult> {
  const raw = await callApi<{ visualConcept: string[]; _meta?: VariationMeta }>(
    "strategist/generate-visual-concept",
    { body: input },
  );
  return { visualConcept: raw.visualConcept, _meta: raw._meta };
}

export interface AutoCompleteInput {
  partialBrief?: { name?: string; tagline?: string; description?: string };
  targetAudience?: string;
  keywords?: string;
  /** When auto-filling a single field that already has content, pass the current
   *  value here so the model enhances/improves it rather than generating from scratch. */
  enhanceHint?: string;
  /** The field key being enhanced (e.g. "name", "tagline"). Helps the model focus. */
  targetField?: string;
}

export interface AutoCompleteResult {
  brandBrief: { name: string; tagline: string; description: string };
  targetAudience: string;
  keywords: string[];
  applications?: string[];
}

/**
 * Ask brand strategist to fill only empty brief fields; preserves user-filled values.
 */
export async function autoCompleteBrief(input: AutoCompleteInput): Promise<AutoCompleteResult> {
  const raw = await callApi<AutoCompleteResult & { _meta?: unknown }>("auto-complete", {
    body: {
      partialBrief: input.partialBrief ?? {},
      targetAudience: input.targetAudience ?? "",
      keywords: input.keywords ?? "",
      enhanceHint: input.enhanceHint,
      targetField: input.targetField,
    },
  });
  const { _meta, ...result } = raw as any;
  return result as AutoCompleteResult;
}

/**
 * 为单张卡片生成 AI 变体内容，以当前品牌上下文作为创作锚点。
 */
export async function generateCardVariation<T = unknown>(
  cardType: string,
  brandContext: CardVariationContext
): Promise<CardVariationResult<T>> {
  const raw = await callApi<T & { _meta?: CardVariationResult["_meta"] }>("generate-card-variation", { body: { cardType, brandContext }, timeoutMs: 60_000 });
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

/**
 * Generate direction rationales, color names, and context descriptions via AI.
 */
export async function generateDirection(brandData: Record<string, unknown>): Promise<DirectionData> {
  const raw = await callApi<DirectionData & { _meta?: unknown }>("generate-direction", { body: { brandData } });
  const { _meta, ...data } = raw as any;
  return data as DirectionData;
}

// ─── User image upload ───────────────────────────────────────────────────────

export async function uploadImage(
  base64: string,
  mimeType: string,
  cardType: string,
): Promise<{ imageUrl: string }> {
  return callApi<{ imageUrl: string }>("upload-image", {
    body: { base64, mimeType, cardType },
  });
}

// ─── Project persistence ──────────────────────────────────────────────────────

export async function saveProject(data: Record<string, unknown>, projectId = "default"): Promise<void> {
  await callApi<{ ok: boolean }>("save-project", { body: { projectId, data } });
}

export async function loadProject(projectId = "default"): Promise<{ found: boolean; data?: Record<string, unknown> }> {
  return callApi<{ found: boolean; data?: Record<string, unknown> }>(
    `load-project?projectId=${encodeURIComponent(projectId)}`,
    { method: "GET" },
  );
}
