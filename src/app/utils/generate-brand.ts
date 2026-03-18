import { callApi } from "./apiClient";
import type { CardMeta } from "../types/project";

// ─── 类型定义 ─────────────────────────────────────────────────────────────────

export interface AiBrandData {
  brandBrief: { name: string; tagline: string; description: string };
  keywords: string[];
  colorPalette: string[];
  visualConcept: { conceptName: string; points: string[] };
  artStyle: { imageUrl: string };
  font: { titleFont: string; bodyFont: string };
}

/** @deprecated Use CardMeta from brand-cards.tsx instead */
export type BrandGenMeta = CardMeta;

export interface AiBrandDataResult {
  brandData: AiBrandData;
  _meta?: CardMeta;
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
  _meta?: CardMeta;
}

// ─── 对外暴露的 API 函数 ───────────────────────────────────────────────────────

/**
 * 调用 Gemini（经由服务端），根据用户的自由描述一次性生成完整品牌 Identity。
 */
export async function generateBrandData(userPrompt: string): Promise<AiBrandDataResult> {
  const raw = await callApi<AiBrandData & { _meta?: CardMeta }>("generate-brand-data", { body: { userPrompt } });
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
  visualConcept: { conceptName: string; points: string[] };
  _meta?: CardMeta;
}

export async function generateVisualConcept(input: VisualConceptInput): Promise<VisualConceptResult> {
  const raw = await callApi<{ visualConcept: { conceptName: string; points: string[] }; _meta?: CardMeta }>(
    "strategist/generate-visual-concept",
    { body: input },
  );
  return { visualConcept: raw.visualConcept, _meta: raw._meta };
}

export interface EnhanceBriefInput {
  partialBrief?: { name?: string; tagline?: string; description?: string };
  targetAudience?: string;
  keywords?: string;
}

export interface EnhanceBriefResult {
  brandBrief: { name: string; tagline: string; description: string };
  targetAudience: string;
  keywords: string[];
}

/**
 * Ask brand strategist to fill only empty brief fields; preserves user-filled values.
 */
export async function enhanceBrief(input: EnhanceBriefInput): Promise<EnhanceBriefResult> {
  const raw = await callApi<EnhanceBriefResult & { _meta?: unknown }>("enhance-brief", {
    body: {
      partialBrief: input.partialBrief ?? {},
      targetAudience: input.targetAudience ?? "",
      keywords: input.keywords ?? "",
    },
  });
  const { _meta, ...result } = raw as any;
  return result as EnhanceBriefResult;
}

/**
 * 为单张卡片生成 AI 变体内容，以当前品牌上下文作为创作锚点。
 */
export async function generateCardVariation<T = unknown>(
  cardType: string,
  brandContext: CardVariationContext
): Promise<CardVariationResult<T>> {
  const raw = await callApi<T & { _meta?: CardVariationResult["_meta"] }>("generate-card-variation", { body: { cardType, brandContext } });
  const { _meta, ...data } = raw as any;
  return { data: data as T, _meta };
}

// ─── Guideline types ──────────────────────────────────────────────────────────

export interface GuidelineColorName {
  hex: string;
  name: string;
}

export interface GuidelineData {
  rationales: {
    logo: string;
    color: string;
    typography: string;
    artStyle: string;
  };
  colorNames: GuidelineColorName[];
  brandInContextDescription: string;
  /** When guideline is generated without a visual concept, the agent synthesizes one from the visual snapshot. */
  synthesizedVisualConcept?: {
    conceptName: string;
    points: string[];
  };
}

/**
 * Generate guideline rationales, color names, and context descriptions via AI.
 */
export async function generateGuideline(brandData: Record<string, unknown>): Promise<GuidelineData> {
  const raw = await callApi<GuidelineData & { _meta?: unknown }>("generate-guideline", { body: { brandData } });
  const { _meta, ...data } = raw as any;
  return data as GuidelineData;
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
