// ─────────────────────────────────────────────────────────────────────────────
// shared/gemini.tsx — All Gemini API callers and image storage utilities
// Extracted from index.tsx so every agent can call the same primitives.
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseClient } from "../supabase-client.tsx";
import type {
  GeminiTextConfig,
  ImageResult,
  ImageError,
} from "./types.tsx";

// ── Constants ────────────────────────────────────────────────────────────────

export const TEXT_MODEL = "gemini-3-flash-preview";

// Image models: try Pro first for quality, then Flash if Pro fails (e.g. quota or model not enabled).
export const PRIORITY_IMAGE_MODELS = [
  {
    shortName: "gemini-3-pro-image-preview",
    strategy: "gemini-generateContent" as const,
  },
  {
    shortName: "gemini-3.1-flash-image-preview",
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

// ── Gemini text generation ───────────────────────────────────────────────────

export async function callGeminiText(
  apiKey: string,
  prompt: string,
  config: GeminiTextConfig = {},
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

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${TEXT_MODEL}:generateContent?key=${apiKey}`,
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
    throw new Error(`Gemini API error (HTTP ${res.status}): ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    const finishReason = data.candidates?.[0]?.finishReason ?? "unknown";
    throw new Error(`Gemini returned empty content (finishReason: ${finishReason})`);
  }
  return text;
}

// ── Gemini text + multiple images → text (for guideline rationale writing) ───

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
    throw new Error(`Gemini multimodal API error (HTTP ${res.status}): ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    const finishReason = data.candidates?.[0]?.finishReason ?? "unknown";
    throw new Error(`Gemini multimodal returned empty content (finishReason: ${finishReason})`);
  }
  return text;
}

// ── Gemini vision (image + text → text) ──────────────────────────────────────

export async function callGeminiVision(
  apiKey: string,
  prompt: string,
  imageB64: string,
  imageMimeType: string,
  config: GeminiTextConfig = {},
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

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${TEXT_MODEL}:generateContent?key=${apiKey}`,
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
    throw new Error(`Gemini Vision API error (HTTP ${res.status}): ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    const finishReason = data.candidates?.[0]?.finishReason ?? "unknown";
    throw new Error(`Gemini Vision returned empty content (finishReason: ${finishReason})`);
  }
  return text;
}

// ── Fetch remote image as base64 (SSRF-hardened) ───────────────────────────────

const ALLOWED_IMAGE_HOSTS = [
  /^[a-z0-9-]+\.supabase\.co$/i,
  /^fonts\.googleapis\.com$/i,
  /^fonts\.gstatic\.com$/i,
];

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB

function isAllowedImageUrl(urlString: string): boolean {
  try {
    const u = new URL(urlString);
    if (u.protocol !== "https:") return false;
    const host = u.hostname;
    return ALLOWED_IMAGE_HOSTS.some((re) => re.test(host));
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

// ── Gemini text+images → image (moodboard / multi-reference) ──────────────────

export async function callGeminiGenerateContentWithImages(
  apiKey: string,
  model: string,
  prompt: string,
  images: Array<{ b64: string; mimeType: string }>,
  aspectRatio?: string,
): Promise<ImageResult | ImageError> {
  try {
    const finalPrompt = withAspectHint(prompt, aspectRatio);
    const parts: any[] = [{ text: finalPrompt }];
    for (const img of images) {
      parts.push({
        inlineData: {
          mimeType: img.mimeType,
          data: img.b64,
        },
      });
    }

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
      return { error: `${model} :generateContent(moodboard) → HTTP ${res.status}: ${errText.slice(0, 300)}` };
    }

    const data = await res.json();
    const responseParts: any[] = data.candidates?.[0]?.content?.parts ?? [];
    const imagePart = responseParts.find((p: any) => p.inlineData?.data);

    if (!imagePart) {
      return { error: `${model} :generateContent(moodboard) → no inlineData: ${JSON.stringify(data).slice(0, 300)}` };
    }

    return {
      b64: imagePart.inlineData.data,
      mimeType: imagePart.inlineData.mimeType ?? "image/png",
    };
  } catch (err: unknown) {
    const name = (err as Error)?.name ?? "";
    if (name === "AbortError" || name === "TimeoutError") {
      return { error: `${model} :generateContent(moodboard) → timed out (80 s)` };
    }
    return { error: `${model} :generateContent(moodboard) → fetch error: ${String(err)}` };
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
): Promise<ImageResult | ImageError> {
  try {
    const finalPrompt = withAspectHint(prompt, aspectRatio);
    const requestParts: any[] = [{ text: finalPrompt }];
    if (extraImageB64) {
      requestParts.push({ inlineData: { mimeType: extraMimeType, data: extraImageB64 } });
    }
    requestParts.push({ inlineData: { mimeType: imageMimeType, data: imageB64 } });

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

export async function generateImage(
  apiKey: string,
  prompt: string,
  sourceImage?: { b64: string; mimeType: string },
  paletteImage?: { b64: string; mimeType: string },
  aspectRatio?: string,
): Promise<{ b64: string; mimeType: string; errors: string[] }> {
  const errors: string[] = [];

  for (const model of PRIORITY_IMAGE_MODELS) {
    console.log(`Trying ${model.strategy}: ${model.shortName}`);
    let attempt: ImageResult | ImageError;

    if (sourceImage && model.strategy === "gemini-generateContent") {
      attempt = await callGeminiImageEdit(
        apiKey, model.shortName, prompt,
        sourceImage.b64, sourceImage.mimeType,
        paletteImage?.b64, paletteImage?.mimeType,
        aspectRatio,
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
      return { ...attempt, errors };
    }
  }

  throw new Error(`All image models failed: ${errors.join(" | ")}`);
}

// ── Moodboard image generation (prompt + multiple reference images) ───────────

export async function generateMoodboardImage(
  apiKey: string,
  prompt: string,
  images: Array<{ b64: string; mimeType: string }>,
  aspectRatio?: string,
): Promise<{ b64: string; mimeType: string; errors: string[] }> {
  const errors: string[] = [];

  for (const model of PRIORITY_IMAGE_MODELS) {
    console.log(`Trying moodboard via ${model.strategy}: ${model.shortName}`);
    let attempt: ImageResult | ImageError;

    if (model.strategy === "gemini-generateContent") {
      attempt = await callGeminiGenerateContentWithImages(apiKey, model.shortName, prompt, images, aspectRatio);
    } else if (model.strategy === "imagen-predict") {
      // Imagen predict does not support extra reference images; fall back to text-only prompt.
      attempt = await callImagenPredict(apiKey, model.shortName, prompt, aspectRatio);
    } else {
      attempt = await callGeminiGenerateContent(apiKey, model.shortName, prompt, aspectRatio);
    }

    if ("error" in attempt) {
      console.log(`  ✗ ${attempt.error}`);
      errors.push(attempt.error);
    } else {
      console.log(`  ✓ Moodboard success with ${model.shortName}`);
      lastUsedImageModel = { shortName: model.shortName, strategy: model.strategy };
      return { ...attempt, errors };
    }
  }

  throw new Error(`All image models failed for moodboard: ${errors.join(" | ")}`);
}

// ── Upload image to Supabase Storage and return a signed URL ─────────────────

export async function uploadAndSignImage(
  b64: string,
  mimeType: string,
  cardType: string,
): Promise<string> {
  const binary = atob(b64);
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i);

  const supabase = getSupabaseClient();
  await ensureBucket(supabase);

  const ext = mimeType.includes("jpeg") ? "jpg" : "png";
  const fileName = `${cardType}-${Date.now()}.${ext}`;
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
