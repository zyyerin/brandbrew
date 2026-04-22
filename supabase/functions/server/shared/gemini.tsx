// ─────────────────────────────────────────────────────────────────────────────
// shared/gemini.tsx — All Gemini API callers and image storage utilities
// Extracted from index.tsx so every agent can call the same primitives.
// ─────────────────────────────────────────────────────────────────────────────

import { jsonrepair } from "https://esm.sh/jsonrepair@3.12.0";
import { getSupabaseClient } from "../supabase-client.tsx";
import type {
  GeminiTextConfig,
  ImageResult,
  ImageError,
} from "./types.tsx";

// ── Constants ────────────────────────────────────────────────────────────────

export const TEXT_MODEL = "gemini-3-flash-preview";
export const PRO_IMAGE_MODEL = "gemini-3-pro-image-preview";
export const FLASH_IMAGE_MODEL = "gemini-3.1-flash-image-preview";

const PRO_CARD_TYPES = new Set(["art-style", "visual-snapshot", "application"]);

function isProImageEnabled(): boolean {
  const denoEnv = (globalThis as { Deno?: { env?: { get?: (key: string) => string | undefined } } }).Deno?.env;
  const raw = denoEnv?.get?.("ENABLE_PRO") ?? denoEnv?.get?.("ENABLE_PRO_IMAGE_FOR_KEY_CARDS");
  return raw === "true";
}

// Image models: try Pro first for quality, then Flash if Pro fails (e.g. quota or model not enabled).
export const PRIORITY_IMAGE_MODELS = [
  // Flag out pro for developing purposes! the model is too expensive to run when developing.
  // !!!
  // {
  //   shortName: "gemini-3-pro-image-preview",
  //   strategy: "gemini-generateContent" as const,
  // },
  {
    shortName: FLASH_IMAGE_MODEL,
    strategy: "gemini-generateContent" as const,
  },
];

const BUCKET_NAME = "make-e35291a5-brand-images";

let lastUsedImageModel: { shortName: string; strategy: string } | null = null;

export function getLastUsedImageModel() {
  return lastUsedImageModel;
}

// ── Bucket helper ────────────────────────────────────────────────────────────

async function ensureBucket(supabase: ReturnType<typeof getSupabaseClient>) {
  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = (buckets as any[])?.some((b) => b.name === BUCKET_NAME);
  if (!exists) {
    const { error } = await supabase.storage.createBucket(BUCKET_NAME);
    if (error) console.log("Bucket creation error:", error.message);
  }
}

// ── JSON parsing with code-fence stripping ────────────────────────────────────

/**
 * Strip optional markdown code fences from Gemini text output, then parse JSON.
 * Throws a descriptive error that includes a preview of the raw text on failure,
 * making it easy to trace the exact model output that caused the issue.
 */
export function safeParseJson<T = unknown>(text: string, context = "unknown"): T {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Gemini occasionally emits unescaped quotes or other minor JSON violations
    // inside long string values. Try jsonrepair as a fallback before giving up.
    try {
      const repaired = jsonrepair(cleaned);
      console.warn(`[safeParseJson:${context}] Used jsonrepair fallback`);
      return JSON.parse(repaired) as T;
    } catch (err) {
      throw new Error(
        `[safeParseJson:${context}] ${(err as Error).message} | raw preview: "${cleaned.slice(0, 300)}"`,
      );
    }
  }
}

// ── Gemini text generation ───────────────────────────────────────────────────

export async function callGeminiText(
  apiKey: string,
  prompt: string,
  config: GeminiTextConfig = {},
  model = TEXT_MODEL,
): Promise<string> {
  const {
    temperature = 0.9,
    maxOutputTokens,
    responseMimeType = "application/json",
  } = config;

  const generationConfig: Record<string, unknown> = {
    responseMimeType,
    temperature,
  };
  if (maxOutputTokens) generationConfig.maxOutputTokens = maxOutputTokens;

  console.log(`[gemini] callGeminiText → model=${model} prompt="${prompt.slice(0, 120).replace(/\n/g, " ")}…"`);

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig,
      }),
    },
  );

  if (!res.ok) {
    const errText = await res.text();
    let errMsg = errText.slice(0, 300);
    try {
      const errJson = JSON.parse(errText);
      if (errJson?.error?.message) {
        errMsg = `${errJson.error.message} (code: ${errJson.error.code ?? errJson.error.status ?? res.status})`;
      }
    } catch { /* non-JSON error body */ }
    throw new Error(`Gemini API error (HTTP ${res.status}): ${errMsg}`);
  }

  const data = await res.json();
  const finishReason: string = data.candidates?.[0]?.finishReason ?? "STOP";
  const WARN_REASONS = ["SAFETY", "MAX_TOKENS", "RECITATION"];
  if (WARN_REASONS.includes(finishReason)) {
    console.warn(`[gemini] callGeminiText → finishReason=${finishReason} (response may be incomplete or blocked)`);
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error(`Gemini returned empty content (finishReason: ${finishReason})`);
  }
  console.log(`[gemini] callGeminiText → ok (${text.length} chars) preview: "${text.slice(0, 120).replace(/\n/g, " ")}…"`);
  return text;
}

// ── Gemini text + multiple images → text (for direction rationale writing) ───

export async function callGeminiTextWithImages(
  apiKey: string,
  prompt: string,
  images: Array<{ b64: string; mimeType: string }>,
  config: GeminiTextConfig = {},
): Promise<string> {
  const {
    temperature = 0.7,
    maxOutputTokens,
    responseMimeType = "application/json",
  } = config;

  const generationConfig: Record<string, unknown> = {
    responseMimeType,
    temperature,
  };
  if (maxOutputTokens) generationConfig.maxOutputTokens = maxOutputTokens;

  const parts: unknown[] = images.map((img) => ({
    inlineData: { mimeType: img.mimeType, data: img.b64 },
  }));
  parts.push({ text: prompt });

  console.log(`[gemini] callGeminiTextWithImages → model=${TEXT_MODEL} images=${images.length} prompt="${prompt.slice(0, 120).replace(/\n/g, " ")}…"`);

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${TEXT_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig,
      }),
    },
  );

  if (!res.ok) {
    const errText = await res.text();
    let errMsg = errText.slice(0, 300);
    try {
      const errJson = JSON.parse(errText);
      if (errJson?.error?.message) {
        errMsg = `${errJson.error.message} (code: ${errJson.error.code ?? errJson.error.status ?? res.status})`;
      }
    } catch { /* non-JSON error body */ }
    throw new Error(`Gemini multimodal API error (HTTP ${res.status}): ${errMsg}`);
  }

  const data = await res.json();
  const finishReason: string = data.candidates?.[0]?.finishReason ?? "STOP";
  const WARN_REASONS = ["SAFETY", "MAX_TOKENS", "RECITATION"];
  if (WARN_REASONS.includes(finishReason)) {
    console.warn(`[gemini] callGeminiTextWithImages → finishReason=${finishReason} (response may be incomplete or blocked)`);
  }
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error(`Gemini multimodal returned empty content (finishReason: ${finishReason})`);
  }
  console.log(`[gemini] callGeminiTextWithImages → ok (${text.length} chars) preview: "${text.slice(0, 120).replace(/\n/g, " ")}…"`);
  return text;
}

// ── Gemini vision (image + text → text) ──────────────────────────────────────

export async function callGeminiVision(
  apiKey: string,
  prompt: string,
  imageB64: string,
  imageMimeType: string,
  config: GeminiTextConfig = {},
  model = TEXT_MODEL,
): Promise<string> {
  const {
    temperature = 0.2,
    maxOutputTokens,
    responseMimeType = "application/json",
  } = config;

  const generationConfig: Record<string, unknown> = {
    responseMimeType,
    temperature,
  };
  if (maxOutputTokens) generationConfig.maxOutputTokens = maxOutputTokens;

  console.log(`[gemini] callGeminiVision → model=${model} prompt="${prompt.slice(0, 120).replace(/\n/g, " ")}…"`);

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inlineData: { mimeType: imageMimeType, data: imageB64 } },
            { text: prompt },
          ],
        }],
        generationConfig,
      }),
    },
  );

  if (!res.ok) {
    const errText = await res.text();
    let errMsg = errText.slice(0, 300);
    try {
      const errJson = JSON.parse(errText);
      if (errJson?.error?.message) {
        errMsg = `${errJson.error.message} (code: ${errJson.error.code ?? errJson.error.status ?? res.status})`;
      }
    } catch { /* non-JSON error body */ }
    throw new Error(`Gemini Vision API error (HTTP ${res.status}): ${errMsg}`);
  }

  const data = await res.json();
  const finishReason: string = data.candidates?.[0]?.finishReason ?? "STOP";
  const WARN_REASONS = ["SAFETY", "MAX_TOKENS", "RECITATION"];
  if (WARN_REASONS.includes(finishReason)) {
    console.warn(`[gemini] callGeminiVision → finishReason=${finishReason} (response may be incomplete or blocked)`);
  }
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error(`Gemini Vision returned empty content (finishReason: ${finishReason})`);
  }
  console.log(`[gemini] callGeminiVision → ok (${text.length} chars) preview: "${text.slice(0, 120).replace(/\n/g, " ")}…"`);
  return text;
}

// ── Fetch remote image as base64 (SSRF-hardened) ───────────────────────────────

const ALLOWED_IMAGE_HOSTS = [
  /^[a-z0-9-]+\.supabase\.co$/i,
  /^fonts\.googleapis\.com$/i,
  /^fonts\.gstatic\.com$/i,
  /^[a-z0-9-]+\.cos\.[a-z0-9-]+\.myqcloud\.com$/i,  // Tencent Cloud COS
  /^[a-z0-9-]+\.file\.myqcloud\.com$/i,              // Tencent Cloud COS default CDN
];

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB

function isAllowedImageUrl(urlString: string): boolean {
  try {
    const u = new URL(urlString);
    if (u.protocol !== "https:") return false;
    const host = u.hostname;
    if (ALLOWED_IMAGE_HOSTS.some((re) => re.test(host))) return true;
    // Also allow configured COS CDN custom domain
    const cdnDomain = (globalThis as any).Deno?.env?.get?.("COS_CDN_DOMAIN");
    if (cdnDomain && host === cdnDomain) return true;
    return false;
  } catch {
    return false;
  }
}

export async function fetchImageAsBase64(
  url: string,
): Promise<ImageResult | ImageError> {
  if (!isAllowedImageUrl(url)) {
    return { error: "fetchImage → URL not allowed" };
  }
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) {
      return { error: `fetchImage → HTTP ${res.status}` };
    }
    const cl = res.headers.get("content-length");
    if (cl != null) {
      const n = parseInt(cl, 10);
      if (!Number.isNaN(n) && n > MAX_IMAGE_BYTES) {
        return { error: "fetchImage → response too large" };
      }
    }
    const mimeType = res.headers.get("content-type") ?? "image/png";
    const arrayBuf = await res.arrayBuffer();
    if (arrayBuf.byteLength > MAX_IMAGE_BYTES) {
      return { error: "fetchImage → response too large" };
    }
    const bytes = new Uint8Array(arrayBuf);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return { b64: btoa(binary), mimeType };
  } catch (err: unknown) {
    return { error: `fetchImage → ${String(err)}` };
  }
}

// ── Imagen :predict caller ───────────────────────────────────────────────────

export async function callImagenPredict(
  apiKey: string,
  model: string,
  prompt: string,
  aspectRatio?: string,
): Promise<ImageResult | ImageError> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${apiKey}`;
  try {
    const parameters: any = { sampleCount: 1 };
    if (aspectRatio) {
      parameters.aspectRatio = aspectRatio;
    }

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters,
      }),
      signal: AbortSignal.timeout(25_000),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { error: `${model} :predict → HTTP ${res.status}: ${errText.slice(0, 300)}` };
    }

    const data = await res.json();
    const prediction = data.predictions?.[0];
    if (prediction?.bytesBase64Encoded) {
      return {
        b64: prediction.bytesBase64Encoded,
        mimeType: prediction.mimeType ?? "image/png",
      };
    }
    return { error: `${model} :predict → no image in response: ${JSON.stringify(data).slice(0, 300)}` };
  } catch (err: unknown) {
    const name = (err as Error)?.name ?? "";
    if (name === "AbortError" || name === "TimeoutError") {
      return { error: `${model} :predict → timed out (25 s)` };
    }
    return { error: `${model} :predict → fetch error: ${String(err)}` };
  }
}

// ── Aspect-ratio prompt hint (Gemini generateContent has no native AR param) ─

const AR_LABELS: Record<string, string> = {
  "1:1": "square (1:1)",
  "16:9": "wide landscape (16:9)",
  "9:16": "tall portrait (9:16)",
  "4:3": "landscape (4:3)",
  "3:4": "portrait (3:4)",
};

function withAspectHint(prompt: string, aspectRatio?: string): string {
  if (!aspectRatio) return prompt;
  const label = AR_LABELS[aspectRatio] ?? aspectRatio;
  return `${prompt} Output the image in ${label} aspect ratio.`;
}

// ── Gemini text-to-image ─────────────────────────────────────────────────────

export async function callGeminiGenerateContent(
  apiKey: string,
  model: string,
  prompt: string,
  aspectRatio?: string,
): Promise<ImageResult | ImageError> {
  try {
    const generationConfig: any = { responseModalities: ["IMAGE", "TEXT"] };
    const finalPrompt = withAspectHint(prompt, aspectRatio);

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Generate an image: ${finalPrompt}` }] }],
          generationConfig,
        }),
        signal: AbortSignal.timeout(80_000),
      },
    );

    if (!res.ok) {
      const errText = await res.text();
      return { error: `${model} :generateContent → HTTP ${res.status}: ${errText.slice(0, 300)}` };
    }

    const data = await res.json();
    const parts: any[] = data.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find((p: any) => p.inlineData?.data);

    if (!imagePart) {
      return { error: `${model} :generateContent → no inlineData: ${JSON.stringify(data).slice(0, 300)}` };
    }

    return {
      b64: imagePart.inlineData.data,
      mimeType: imagePart.inlineData.mimeType ?? "image/png",
    };
  } catch (err: unknown) {
    const name = (err as Error)?.name ?? "";
    if (name === "AbortError" || name === "TimeoutError") {
      return { error: `${model} :generateContent → timed out (80 s)` };
    }
    return { error: `${model} :generateContent → fetch error: ${String(err)}` };
  }
}

// ── Gemini text+images → image (multi-reference guided generation) ────────────

export async function callGeminiGenerateContentWithImages(
  apiKey: string,
  model: string,
  prompt: string,
  images: Array<{ b64: string; mimeType: string }>,
  aspectRatio?: string,
): Promise<ImageResult | ImageError> {
  try {
    const finalPrompt = withAspectHint(prompt, aspectRatio);
    const parts: any[] = [];
    for (const img of images) {
      parts.push({
        inlineData: {
          mimeType: img.mimeType,
          data: img.b64,
        },
      });
    }
    parts.push({ text: finalPrompt });

    const generationConfig: any = { responseModalities: ["IMAGE", "TEXT"] };

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig,
        }),
        signal: AbortSignal.timeout(80_000),
      },
    );

    if (!res.ok) {
      const errText = await res.text();
      return { error: `${model} :generateContent(multiRef) → HTTP ${res.status}: ${errText.slice(0, 300)}` };
    }

    const data = await res.json();
    const responseParts: any[] = data.candidates?.[0]?.content?.parts ?? [];
    const imagePart = responseParts.find((p: any) => p.inlineData?.data);

    if (!imagePart) {
      return { error: `${model} :generateContent(multiRef) → no inlineData: ${JSON.stringify(data).slice(0, 300)}` };
    }

    return {
      b64: imagePart.inlineData.data,
      mimeType: imagePart.inlineData.mimeType ?? "image/png",
    };
  } catch (err: unknown) {
    const name = (err as Error)?.name ?? "";
    if (name === "AbortError" || name === "TimeoutError") {
      return { error: `${model} :generateContent(multiRef) → timed out (80 s)` };
    }
    return { error: `${model} :generateContent(multiRef) → fetch error: ${String(err)}` };
  }
}

// ── Gemini image-to-image editing ────────────────────────────────────────────

export async function callGeminiImageEdit(
  apiKey: string,
  model: string,
  prompt: string,
  imageB64: string,
  imageMimeType: string,
  extraImageB64?: string,
  extraMimeType = "image/png",
  aspectRatio?: string,
  referenceImage?: { b64: string; mimeType: string },
): Promise<ImageResult | ImageError> {
  try {
    const finalPrompt = withAspectHint(prompt, aspectRatio);
    const requestParts: any[] = [];
    if (referenceImage) {
      requestParts.push({ inlineData: { mimeType: referenceImage.mimeType, data: referenceImage.b64 } });
    }
    if (extraImageB64) {
      requestParts.push({ inlineData: { mimeType: extraMimeType, data: extraImageB64 } });
    }
    requestParts.push({ inlineData: { mimeType: imageMimeType, data: imageB64 } });
    requestParts.push({ text: finalPrompt });

    const generationConfig: any = { responseModalities: ["IMAGE", "TEXT"] };

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: requestParts }],
          generationConfig,
        }),
        signal: AbortSignal.timeout(80_000),
      },
    );

    if (!res.ok) {
      const errText = await res.text();
      return { error: `${model} :imageEdit → HTTP ${res.status}: ${errText.slice(0, 300)}` };
    }

    const data = await res.json();
    const responseParts: any[] = data.candidates?.[0]?.content?.parts ?? [];
    const imagePart = responseParts.find((p: any) => p.inlineData?.data);

    if (!imagePart) {
      return { error: `${model} :imageEdit → no inlineData: ${JSON.stringify(data).slice(0, 300)}` };
    }

    return {
      b64: imagePart.inlineData.data,
      mimeType: imagePart.inlineData.mimeType ?? "image/png",
    };
  } catch (err: unknown) {
    const name = (err as Error)?.name ?? "";
    if (name === "AbortError" || name === "TimeoutError") {
      return { error: `${model} :imageEdit → timed out (80 s)` };
    }
    return { error: `${model} :imageEdit → fetch error: ${String(err)}` };
  }
}

// ── Image generation waterfall (tries models in priority order) ──────────────
// Unified entry point for all image generation modes:
//   - refImages[]   → multi-reference guided generation
//   - sourceImage   → img2img editing (with optional paletteImage)
//   - neither       → txt2img generation

export type GenerateImageOpts = {
  cardType?: string;
  sourceImage?: { b64: string; mimeType: string };
  paletteImage?: { b64: string; mimeType: string };
  /** Additional reference image for img2img merge (e.g. source card image in card-to-card merge) */
  referenceImage?: { b64: string; mimeType: string };
  refImages?: Array<{ b64: string; mimeType: string }>;
  aspectRatio?: string;
  /** Use this specific model instead of the PRIORITY_IMAGE_MODELS waterfall. */
  modelOverride?: string;
};

export async function generateImage(
  apiKey: string,
  prompt: string,
  opts: GenerateImageOpts = {},
): Promise<{ b64: string; mimeType: string; errors: string[]; usedModel: string }> {
  const { cardType, sourceImage, paletteImage, referenceImage, refImages, aspectRatio, modelOverride } = opts;
  const hasRefs = refImages && refImages.length > 0;
  const errors: string[] = [];
  const proEnabled = isProImageEnabled();

  const modelsToTry = modelOverride
    ? [{ shortName: modelOverride, strategy: "gemini-generateContent" as const }]
    : (proEnabled && cardType && PRO_CARD_TYPES.has(cardType))
      ? [
        { shortName: PRO_IMAGE_MODEL, strategy: "gemini-generateContent" as const },
        { shortName: FLASH_IMAGE_MODEL, strategy: "gemini-generateContent" as const },
      ]
    : PRIORITY_IMAGE_MODELS;

  console.log(`[gemini] generateImage → cardType=${cardType ?? "unknown"} ENABLE_PRO=${proEnabled} modelOverride=${modelOverride ?? "none"}`);

  for (const model of modelsToTry) {
    console.log(`Trying ${model.strategy}: ${model.shortName}`);
    let attempt: ImageResult | ImageError;

    if (hasRefs && model.strategy === "gemini-generateContent") {
      attempt = await callGeminiGenerateContentWithImages(apiKey, model.shortName, prompt, refImages, aspectRatio);
    } else if (sourceImage && model.strategy === "gemini-generateContent") {
      attempt = await callGeminiImageEdit(
        apiKey, model.shortName, prompt,
        sourceImage.b64, sourceImage.mimeType,
        paletteImage?.b64, paletteImage?.mimeType,
        aspectRatio,
        referenceImage,
      );
    } else if (model.strategy === "imagen-predict") {
      attempt = await callImagenPredict(apiKey, model.shortName, prompt, aspectRatio);
    } else {
      attempt = await callGeminiGenerateContent(apiKey, model.shortName, prompt, aspectRatio);
    }

    if ("error" in attempt) {
      console.log(`  ✗ ${attempt.error}`);
      errors.push(attempt.error);
    } else {
      console.log(`  ✓ Success with ${model.shortName}`);
      lastUsedImageModel = { shortName: model.shortName, strategy: model.strategy };
      return { ...attempt, errors, usedModel: model.shortName };
    }
  }

  throw new Error(`All image models failed: ${errors.join(" | ")}`);
}

// ── Tencent Cloud COS upload helpers ─────────────────────────────────────────

function isCosConfigured(): boolean {
  const env = (globalThis as any).Deno?.env;
  return !!(env?.get?.("COS_SECRET_ID") && env?.get?.("COS_SECRET_KEY") && env?.get?.("COS_BUCKET") && env?.get?.("COS_REGION"));
}

function getCosConfig() {
  const env = Deno.env;
  return {
    secretId: env.get("COS_SECRET_ID")!,
    secretKey: env.get("COS_SECRET_KEY")!,
    bucket: env.get("COS_BUCKET")!,
    region: env.get("COS_REGION")!,
    cdnDomain: env.get("COS_CDN_DOMAIN"),  // optional custom CDN domain
  };
}

async function hmacSha1Hex(key: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw", enc.encode(key), { name: "HMAC", hash: "SHA-1" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha1Hex(data: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(data));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function cosAuthorization(
  secretId: string, secretKey: string, method: string, pathname: string, host: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const keyTime = `${now - 60};${now + 3600}`;
  const signKey = await hmacSha1Hex(secretKey, keyTime);
  const httpString = `${method.toLowerCase()}\n${pathname}\n\nhost=${host}\n`;
  const stringToSign = `sha1\n${keyTime}\n${await sha1Hex(httpString)}\n`;
  const signature = await hmacSha1Hex(signKey, stringToSign);
  return `q-sign-algorithm=sha1&q-ak=${secretId}&q-sign-time=${keyTime}&q-key-time=${keyTime}&q-header-list=host&q-url-param-list=&q-signature=${signature}`;
}

async function uploadToCos(buffer: Uint8Array, mimeType: string, fileName: string): Promise<string> {
  const { secretId, secretKey, bucket, region, cdnDomain } = getCosConfig();
  const host = `${bucket}.cos.${region}.myqcloud.com`;
  const pathname = `/${fileName}`;
  const auth = await cosAuthorization(secretId, secretKey, "PUT", pathname, host);

  const res = await fetch(`https://${host}${pathname}`, {
    method: "PUT",
    headers: { Host: host, Authorization: auth, "Content-Type": mimeType, "Content-Length": String(buffer.length) },
    body: buffer,
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`COS upload error (HTTP ${res.status}): ${errText.slice(0, 300)}`);
  }
  const baseUrl = cdnDomain ? `https://${cdnDomain}` : `https://${host}`;
  return `${baseUrl}${pathname}`;
}

// ── Upload image and return a public URL ─────────────────────────────────────
// Uses Tencent Cloud COS when configured, falls back to Supabase Storage.

export async function uploadAndSignImage(
  b64: string,
  mimeType: string,
  cardType: string,
  projectId?: string,
): Promise<string> {
  const binary = atob(b64);
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i);

  const ext = mimeType.includes("jpeg") ? "jpg" : "png";
  const baseName = `${cardType}-${Date.now()}.${ext}`;
  const fileName = projectId ? `projects/${projectId}/${baseName}` : baseName;

  // ── Tencent Cloud COS (preferred when configured) ────────────────────────
  if (isCosConfigured()) {
    const url = await uploadToCos(buffer, mimeType, fileName);
    console.log(`Image ready (COS): ${fileName}`);
    return url;
  }

  // ── Supabase Storage fallback ────────────────────────────────────────────
  const supabase = getSupabaseClient();
  await ensureBucket(supabase);

  const { error: uploadError } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(fileName, buffer, { contentType: mimeType });

  if (uploadError) {
    throw new Error(`Storage upload error: ${uploadError.message}`);
  }

  const { data: signed, error: signError } = await supabase.storage
    .from(BUCKET_NAME)
    .createSignedUrl(fileName, 60 * 60 * 24 * 7);

  if (signError || !signed?.signedUrl) {
    throw new Error(`Failed to create signed URL: ${signError?.message}`);
  }

  console.log(`Image ready: ${fileName}`);
  return signed.signedUrl;
}
