// ─────────────────────────────────────────────────────────────────────────────
// shared/gemini.tsx — All Gemini API callers and image storage utilities
// Extracted from index.tsx so every agent can call the same primitives.
// ─────────────────────────────────────────────────────────────────────────────

import { jsonrepair } from "https://esm.sh/jsonrepair@3.12.0";
import { getSupabaseClient } from "../supabase-client.tsx";
import { buildImageBaseName } from "./storage-paths.ts";
import { parseImageGenPurpose, resolveImageModel, type ImageGenPurpose } from "./image-config.tsx";
import type { Timer } from "./timing.ts";
import type {
  GeminiTextConfig,
  ImageResult,
  ImageError,
} from "./types.tsx";

// ── Constants ────────────────────────────────────────────────────────────────

export const TEXT_MODEL = "gemini-3-flash-preview";

// Supabase Edge Functions are killed at ~150 s wall clock (HTTP 546), and each
// request now makes exactly one model attempt, so this budget only has to leave
// room for the surrounding upload. Keep it configurable for tuning.
const DEFAULT_IMAGE_TIMEOUT_MS = 80_000;

function imageTimeoutMs(): number {
  const raw = (globalThis as { Deno?: { env?: { get?: (key: string) => string | undefined } } })
    .Deno?.env?.get?.("IMAGE_TIMEOUT_MS");
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_IMAGE_TIMEOUT_MS;
}

const BUCKET_NAME = "make-e35291a5-brand-images";

let lastUsedImageModel: string | null = null;

export function getLastUsedImageModel() {
  return lastUsedImageModel;
}

// ── Bucket helper ────────────────────────────────────────────────────────────

// Bucket state is stable for the lifetime of an isolate, so the listBuckets
// round-trip only needs to happen once per cold start rather than per upload.
let bucketReady = false;

async function ensureBucket(supabase: ReturnType<typeof getSupabaseClient>) {
  if (bucketReady) return;

  const { data: buckets } = await supabase.storage.listBuckets();
  const existing = (buckets as any[])?.find((b) => b.name === BUCKET_NAME);

  // Image URLs are persisted inside saved projects and exported directions, so
  // they must outlive any signed-URL expiry — the bucket has to be public.
  if (!existing) {
    const { error } = await supabase.storage.createBucket(BUCKET_NAME, { public: true });
    if (error) {
      console.log("Bucket creation error:", error.message);
      return;
    }
  } else if (!existing.public) {
    const { error } = await supabase.storage.updateBucket(BUCKET_NAME, { public: true });
    if (error) {
      console.log("Bucket visibility update error:", error.message);
      return;
    }
    console.log(`[storage] Bucket ${BUCKET_NAME} switched to public`);
  }

  bucketReady = true;
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

async function fetchImageAsBase64Once(url: string, timer?: Timer): Promise<ImageResult | ImageError> {
  try {
    const closeHttp = timer?.open("refImage.http");
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    closeHttp?.(`HTTP ${res.status}`);
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
    const closeDownload = timer?.open("refImage.download");
    const arrayBuf = await res.arrayBuffer();
    closeDownload?.(`${arrayBuf.byteLength}B`);
    if (arrayBuf.byteLength > MAX_IMAGE_BYTES) {
      return { error: "fetchImage → response too large" };
    }
    const closeEncode = timer?.open("refImage.base64Encode");
    const bytes = new Uint8Array(arrayBuf);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const b64 = btoa(binary);
    closeEncode?.(`${bytes.length}B`);
    return { b64, mimeType };
  } catch (err: unknown) {
    return { error: `fetchImage → ${String(err)}` };
  }
}

export async function fetchImageAsBase64(
  url: string,
  timer?: Timer,
): Promise<ImageResult | ImageError> {
  if (!isAllowedImageUrl(url)) {
    return { error: "fetchImage → URL not allowed" };
  }
  const first = await fetchImageAsBase64Once(url, timer);
  if (!("error" in first)) return first;

  // A transient network blip / storage hiccup here silently degrades the
  // downstream generation (agents fall back to generating without this
  // reference image), which the user perceives as an unrelated / inconsistent
  // result. One short-backoff retry avoids giving up on a single flaky fetch.
  console.warn(`[gemini] fetchImageAsBase64 first attempt failed (${first.error}), retrying once…`);
  timer?.mark("refImage.retryBackoff", 500, first.error);
  await new Promise((resolve) => setTimeout(resolve, 500));
  return fetchImageAsBase64Once(url, timer);
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
  timer?: Timer,
): Promise<ImageResult | ImageError> {
  const timeoutMs = imageTimeoutMs();
  try {
    const generationConfig: any = { responseModalities: ["IMAGE", "TEXT"] };
    const finalPrompt = withAspectHint(prompt, aspectRatio);

    const closeHttp = timer?.open("model.http");
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Generate an image: ${finalPrompt}` }] }],
          generationConfig,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      },
    );
    closeHttp?.(`HTTP ${res.status}`);

    if (!res.ok) {
      const errText = await res.text();
      return { error: `${model} :generateContent → HTTP ${res.status}: ${errText.slice(0, 300)}` };
    }

    const closeRead = timer?.open("model.readBody");
    const data = await res.json();
    closeRead?.();
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
      return { error: `${model} :generateContent → timed out (${timeoutMs} ms)` };
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
  timer?: Timer,
): Promise<ImageResult | ImageError> {
  const timeoutMs = imageTimeoutMs();
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

    const closeSerialize = timer?.open("model.serializeRequest");
    const requestBody = JSON.stringify({
      contents: [{ parts }],
      generationConfig,
    });
    closeSerialize?.(`${requestBody.length}B`);

    const closeHttp = timer?.open("model.http");
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody,
        signal: AbortSignal.timeout(timeoutMs),
      },
    );
    closeHttp?.(`HTTP ${res.status}`);

    if (!res.ok) {
      const errText = await res.text();
      return { error: `${model} :generateContent(multiRef) → HTTP ${res.status}: ${errText.slice(0, 300)}` };
    }

    const closeRead = timer?.open("model.readBody");
    const data = await res.json();
    closeRead?.();
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
      return { error: `${model} :generateContent(multiRef) → timed out (${timeoutMs} ms)` };
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
  timer?: Timer,
): Promise<ImageResult | ImageError> {
  const timeoutMs = imageTimeoutMs();
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

    const closeHttp = timer?.open("model.http");
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: requestParts }],
          generationConfig,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      },
    );
    closeHttp?.(`HTTP ${res.status}`);

    if (!res.ok) {
      const errText = await res.text();
      return { error: `${model} :imageEdit → HTTP ${res.status}: ${errText.slice(0, 300)}` };
    }

    const closeRead = timer?.open("model.readBody");
    const data = await res.json();
    closeRead?.();
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
      return { error: `${model} :imageEdit → timed out (${timeoutMs} ms)` };
    }
    return { error: `${model} :imageEdit → fetch error: ${String(err)}` };
  }
}

// ── Image generation ─────────────────────────────────────────────────────────
// Unified entry point for all image generation modes:
//   - refImages[]   → multi-reference guided generation
//   - sourceImage   → img2img editing (with optional paletteImage)
//   - neither       → txt2img generation
//
// The model comes from IMAGE_CARD_CONFIGS via the card type — one attempt, no
// fallback to a different model. A failure surfaces to the caller so it is
// visible in the UI, instead of quietly returning a lower-tier image.

export type GenerateImageOpts = {
  cardType?: string;
  sourceImage?: { b64: string; mimeType: string };
  paletteImage?: { b64: string; mimeType: string };
  /** Additional reference image for img2img merge (e.g. source card image in card-to-card merge) */
  referenceImage?: { b64: string; mimeType: string };
  refImages?: Array<{ b64: string; mimeType: string }>;
  aspectRatio?: string;
  /** Direct merge uses Pro for every card type; omitted means per-card generate mapping. */
  purpose?: ImageGenPurpose;
  /** Collects per-attempt wall-clock spans. Pass a child timer for concurrent branches. */
  timer?: Timer;
};

export async function generateImage(
  apiKey: string,
  prompt: string,
  opts: GenerateImageOpts = {},
): Promise<{ b64: string; mimeType: string; usedModel: string }> {
  const { cardType, sourceImage, paletteImage, referenceImage, refImages, aspectRatio, timer } = opts;
  const hasRefs = refImages && refImages.length > 0;
  const purpose = parseImageGenPurpose(opts.purpose);
  const model = resolveImageModel(cardType, purpose);

  const mode = hasRefs ? "multiRef" : sourceImage ? "img2img" : "txt2img";
  console.log(`[gemini] generateImage → cardType=${cardType} purpose=${purpose} model=${model} mode=${mode}`);

  const attemptTimer = timer?.child(`model-${model.includes("pro") ? "pro" : "flash"}`);
  const closeAttempt = attemptTimer?.open("total");

  let attempt: ImageResult | ImageError;
  if (hasRefs) {
    attempt = await callGeminiGenerateContentWithImages(apiKey, model, prompt, refImages, aspectRatio, attemptTimer);
  } else if (sourceImage) {
    attempt = await callGeminiImageEdit(
      apiKey, model, prompt,
      sourceImage.b64, sourceImage.mimeType,
      paletteImage?.b64, paletteImage?.mimeType,
      aspectRatio,
      referenceImage,
      attemptTimer,
    );
  } else {
    attempt = await callGeminiGenerateContent(apiKey, model, prompt, aspectRatio, attemptTimer);
  }

  if ("error" in attempt) {
    console.log(`  ✗ ${attempt.error}`);
    closeAttempt?.("failed");
    throw new Error(`Image generation failed (cardType=${cardType}, model=${model}): ${attempt.error}`);
  }

  console.log(`  ✓ Success with ${model}`);
  closeAttempt?.(`ok ${model} ${attempt.b64.length}B-b64`);
  lastUsedImageModel = model;
  return { ...attempt, usedModel: model };
}

// ── Tencent Cloud COS upload helpers ─────────────────────────────────────────

function isCosConfigured(): boolean {
  const env = (globalThis as any).Deno?.env;
  return !!(env?.get?.("COS_SECRET_ID") && env?.get?.("COS_SECRET_KEY") && env?.get?.("COS_BUCKET") && env?.get?.("COS_REGION"));
}

/**
 * Which object store receives generated images. COS lives in a different region
 * from the Edge Function, so the cross-region leg can dominate the request;
 * this switch allows measuring and choosing between the two backends without a
 * redeploy. Defaults to the historical behaviour (COS when configured).
 */
function preferredStorageBackend(): "cos" | "supabase" {
  const raw = (globalThis as any).Deno?.env?.get?.("STORAGE_BACKEND")?.trim?.().toLowerCase?.();
  if (raw === "supabase") return "supabase";
  if (raw === "cos") return "cos";
  return isCosConfigured() ? "cos" : "supabase";
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

function getCosPublicUrl(host: string, pathname: string, cdnDomain?: string | null): string {
  const baseUrl = cdnDomain ? `https://${cdnDomain}` : `https://${host}`;
  return `${baseUrl}${pathname}`;
}

async function verifyCosObjectExists(
  secretId: string,
  secretKey: string,
  host: string,
  pathname: string,
): Promise<boolean> {
  try {
    const auth = await cosAuthorization(secretId, secretKey, "HEAD", pathname, host);
    const res = await fetch(`https://${host}${pathname}`, {
      method: "HEAD",
      headers: { Host: host, Authorization: auth },
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function confirmCosObjectWithRetry(
  secretId: string,
  secretKey: string,
  host: string,
  pathname: string,
): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const exists = await verifyCosObjectExists(secretId, secretKey, host, pathname);
    if (exists) return true;
    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
    }
  }
  return false;
}

async function uploadToCos(buffer: Uint8Array, mimeType: string, fileName: string): Promise<string> {
  const { secretId, secretKey, bucket, region, cdnDomain } = getCosConfig();
  const host = `${bucket}.cos.${region}.myqcloud.com`;
  const pathname = `/${fileName}`;
  const publicUrl = getCosPublicUrl(host, pathname, cdnDomain);

  const timeoutsMs = [45_000, 90_000];
  let lastError: unknown;

  for (let attempt = 0; attempt < timeoutsMs.length; attempt++) {
    const auth = await cosAuthorization(secretId, secretKey, "PUT", pathname, host);
    try {
      const res = await fetch(`https://${host}${pathname}`, {
        method: "PUT",
        headers: { Host: host, Authorization: auth, "Content-Type": mimeType, "Content-Length": String(buffer.length) },
        body: buffer,
        signal: AbortSignal.timeout(timeoutsMs[attempt]),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`COS upload error (HTTP ${res.status}): ${errText.slice(0, 300)}`);
      }
      return publicUrl;
    } catch (err) {
      lastError = err;
      const name = err instanceof Error ? err.name : "";
      if (name === "AbortError" || name === "TimeoutError") {
        const exists = await confirmCosObjectWithRetry(secretId, secretKey, host, pathname);
        if (exists) {
          console.warn(`[cos] Upload timed out after object became available: ${fileName}`);
          return publicUrl;
        }
        console.warn(`[cos] Upload attempt ${attempt + 1} timed out for ${fileName}`);
      } else {
        throw err;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

// ── Upload image and return a public URL ─────────────────────────────────────
// Backend is chosen by STORAGE_BACKEND (see preferredStorageBackend). Both paths
// return a non-expiring public URL: a COS CDN URL, or a Supabase Storage public
// object URL. Nothing here returns a signed URL — saved projects and exported
// directions keep these URLs indefinitely, so they must not expire.

export async function uploadAndSignImage(
  b64: string,
  mimeType: string,
  cardType: string,
  projectId?: string,
  timer?: Timer,
): Promise<string> {
  const closeDecode = timer?.open("upload.base64Decode");
  const binary = atob(b64);
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i);
  closeDecode?.(`${buffer.length}B`);

  const baseName = buildImageBaseName(cardType, mimeType);
  const fileName = projectId ? `projects/${projectId}/${baseName}` : baseName;

  // ── Tencent Cloud COS (preferred when configured) ────────────────────────
  if (preferredStorageBackend() === "cos" && isCosConfigured()) {
    const closeCos = timer?.open("upload.cosPut");
    const url = await uploadToCos(buffer, mimeType, fileName);
    closeCos?.(`${buffer.length}B`);
    console.log(`Image ready (COS): ${fileName}`);
    return url;
  }

  // ── Supabase Storage fallback ────────────────────────────────────────────
  const supabase = getSupabaseClient();
  const closeBucket = timer?.open("upload.ensureBucket");
  await ensureBucket(supabase);
  closeBucket?.();

  const closeUpload = timer?.open("upload.storagePut");
  const { error: uploadError } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(fileName, buffer, { contentType: mimeType });
  closeUpload?.(`${buffer.length}B`);

  if (uploadError) {
    throw new Error(`Storage upload error: ${uploadError.message}`);
  }

  const { data: pub } = supabase.storage.from(BUCKET_NAME).getPublicUrl(fileName);
  if (!pub?.publicUrl) {
    throw new Error(`Failed to resolve public URL for ${fileName}`);
  }

  console.log(`Image ready: ${fileName}`);
  return pub.publicUrl;
}
