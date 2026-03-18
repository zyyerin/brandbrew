// ─────────────────────────────────────────────────────────────────────────────
// index.tsx — Main Hono router
//
// Mounts the three agent sub-routers and keeps persistence / debug routes.
// Old endpoints are forwarded to the new agent paths for backward compat.
// ─────────────────────────────────────────────────────────────────────────────

import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.tsx";
import { getSupabaseClient } from "./supabase-client.tsx";
import {
  TEXT_MODEL,
  PRIORITY_IMAGE_MODELS,
  getLastUsedImageModel,
  uploadAndSignImage,
} from "./shared/gemini.tsx";
import { IMAGE_CARD_CONFIGS } from "./shared/image-config.tsx";

import { requireAuth, projectStorageKey } from "./auth-middleware.tsx";
import strategist from "./agents/brand-strategist.tsx";
import artDirector from "./agents/art-director.tsx";
import visualDesigner from "./agents/visual-designer.tsx";

// Supabase invokes this function at /functions/v1/server, so path includes /server
const PREFIX = "/server/make-server-e35291a5";

const app = new Hono();

app.use("*", logger(console.log));

app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

app.use(`${PREFIX}/*`, requireAuth);

// ── Mount agent sub-routers ──────────────────────────────────────────────────

app.route(`${PREFIX}/strategist`, strategist);
app.route(`${PREFIX}/art-director`, artDirector);
app.route(`${PREFIX}/visual-designer`, visualDesigner);

// ── Health ────────────────────────────────────────────────────────────────────

app.get(`${PREFIX}/health`, (c) =>
  c.json({ status: "ok", version: "9-agents" }),
);

// ── Debug: list available Gemini models (gated by ENABLE_DEV_ROUTES) ───────────

app.get(`${PREFIX}/list-models`, async (c) => {
  if (Deno.env.get("ENABLE_DEV_ROUTES") !== "true") return c.json({ error: "Not found" }, 404);
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return c.json({ error: "GEMINI_API_KEY not set" }, 500);

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=200`,
  );
  const data = await res.json();
  const summary = (data.models ?? []).map((m: any) => ({
    name: m.name,
    displayName: m.displayName,
    methods: m.supportedGenerationMethods,
  }));
  return c.json({ count: summary.length, models: summary });
});

// ── Dev info endpoint (gated by ENABLE_DEV_ROUTES) ────────────────────────────

app.get(`${PREFIX}/dev-info`, (c) => {
  if (Deno.env.get("ENABLE_DEV_ROUTES") !== "true") return c.json({ error: "Not found" }, 404);
  return c.json({
    textModel: TEXT_MODEL,
    imageModel: getLastUsedImageModel() ?? null,
    discoveredModels: PRIORITY_IMAGE_MODELS.map((m) => ({
      shortName: m.shortName,
      strategy: m.strategy,
    })),
    agents: ["brand-strategist", "art-director", "visual-designer"],
    imageCardConfigs: IMAGE_CARD_CONFIGS,
    cacheSource: "fixed-priority",
  });
});

// ── Project persistence (KV store, user-scoped) ───────────────────────────────

app.post(`${PREFIX}/save-project`, async (c) => {
  try {
    const userId = c.get("userId") as string;
    const body = await c.req.json();
    const { projectId: pid, data } = body;
    const id = pid ?? "default";
    const key = projectStorageKey(userId, id);
    await kv.set(key, { ...data, _projectId: id, _savedAt: new Date().toISOString() });
    console.log(`Project saved: ${key}`);
    return c.json({ ok: true });
  } catch (err) {
    console.log("save-project error:", err);
    return c.json({ error: `Save failed: ${String(err)}` }, 500);
  }
});

app.get(`${PREFIX}/load-project`, async (c) => {
  try {
    const userId = c.get("userId") as string;
    const pid = c.req.query("projectId") ?? "default";
    const key = projectStorageKey(userId, pid);
    let data = await kv.get(key);
    if (!data) {
      const legacyKey = `project:${pid}`;
      const legacy = await kv.get(legacyKey);
      if (legacy) {
        await kv.set(key, { ...legacy, _projectId: pid, _savedAt: new Date().toISOString() });
        data = legacy;
      }
    }
    if (!data) {
      console.log(`No saved project found for key: ${key}`);
      return c.json({ found: false });
    }
    console.log(`Project loaded: ${key} (saved at ${data._savedAt})`);
    return c.json({ found: true, data });
  } catch (err) {
    console.log("load-project error:", err);
    return c.json({ error: `Load failed: ${String(err)}` }, 500);
  }
});

app.get(`${PREFIX}/list-projects`, async (c) => {
  try {
    const userId = c.get("userId") as string;
    const prefix = projectStorageKey(userId, "");
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("kv_store_e35291a5")
      .select("key, value")
      .like("key", prefix + "%");
    if (error) throw new Error(error.message);

    const projects = (data ?? []).map((d: any) => {
      const key = d.key as string;
      const id = key.startsWith(prefix) ? key.slice(prefix.length) : key;
      return {
        id,
        name: d.value?.projectName ?? "Untitled",
        savedAt: d.value?._savedAt ?? null,
      };
    });
    projects.sort((a: any, b: any) =>
      (b.savedAt ?? "").localeCompare(a.savedAt ?? ""),
    );
    return c.json({ projects });
  } catch (err) {
    console.log("list-projects error:", err);
    return c.json({ error: `List failed: ${String(err)}` }, 500);
  }
});

app.post(`${PREFIX}/delete-project`, async (c) => {
  try {
    const userId = c.get("userId") as string;
    const { projectId: pid } = await c.req.json();
    if (!pid) return c.json({ error: "projectId required" }, 400);
    const key = projectStorageKey(userId, pid);
    await kv.del(key);
    console.log(`Project deleted: ${key}`);
    return c.json({ ok: true });
  } catch (err) {
    console.log("delete-project error:", err);
    return c.json({ error: `Delete failed: ${String(err)}` }, 500);
  }
});

// ── User image upload (hardened) ─────────────────────────────────────────────

const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);
const CARD_TYPE_SLUG = /^[a-z0-9-]{1,40}$/i;
const MAX_UPLOAD_DECODED_BYTES = 12 * 1024 * 1024; // 12MB

app.post(`${PREFIX}/upload-image`, async (c) => {
  try {
    const { base64, mimeType, cardType } = await c.req.json();
    if (!base64 || !mimeType || !cardType) {
      return c.json({ error: "base64, mimeType, and cardType are required" }, 400);
    }
    const mime = String(mimeType).split(";")[0].trim().toLowerCase();
    if (!ALLOWED_MIME.has(mime)) {
      return c.json({ error: "Invalid mimeType" }, 400);
    }
    const slug = CARD_TYPE_SLUG.test(String(cardType).trim()) ? String(cardType).trim() : "upload";
    const decodedLen = Math.ceil((String(base64).length * 3) / 4);
    if (decodedLen > MAX_UPLOAD_DECODED_BYTES) {
      return c.json({ error: "Image too large" }, 400);
    }
    const signedUrl = await uploadAndSignImage(String(base64), mime, slug);
    return c.json({ imageUrl: signedUrl });
  } catch (err) {
    console.error("upload-image error:", err);
    return c.json({ error: `Upload failed: ${String(err)}` }, 500);
  }
});

// ── Backward-compatible redirects ────────────────────────────────────────────
// Old endpoints forward to the new agent routes so in-flight / cached
// requests still work. Remove after one release cycle.

app.post(`${PREFIX}/generate-brand-data`, async (c) => {
  console.log("[compat] /generate-brand-data → /strategist/generate-brand");
  const body = await c.req.json();
  const url = new URL(c.req.url);
  url.pathname = `${PREFIX}/strategist/generate-brand`;
  const res = await app.request(url.pathname, {
    method: "POST",
    headers: c.req.raw.headers,
    body: JSON.stringify(body),
  });
  return res;
});

app.post(`${PREFIX}/enhance-brief`, async (c) => {
  const body = await c.req.json();
  const res = await app.request(`${PREFIX}/strategist/enhance-brief`, {
    method: "POST",
    headers: c.req.raw.headers,
    body: JSON.stringify(body),
  });
  return res;
});

app.post(`${PREFIX}/generate-card-variation`, async (c) => {
  console.log("[compat] /generate-card-variation → /strategist/variation");
  const body = await c.req.json();
  const res = await app.request(`${PREFIX}/strategist/variation`, {
    method: "POST",
    headers: c.req.raw.headers,
    body: JSON.stringify(body),
  });
  return res;
});

app.post(`${PREFIX}/merge-cards`, async (c) => {
  console.log("[compat] /merge-cards → /strategist/merge");
  const body = await c.req.json();
  const res = await app.request(`${PREFIX}/strategist/merge`, {
    method: "POST",
    headers: c.req.raw.headers,
    body: JSON.stringify(body),
  });
  return res;
});

app.post(`${PREFIX}/comment-modify`, async (c) => {
  console.log("[compat] /comment-modify → /strategist/comment-modify");
  const body = await c.req.json();
  const res = await app.request(`${PREFIX}/strategist/comment-modify`, {
    method: "POST",
    headers: c.req.raw.headers,
    body: JSON.stringify(body),
  });
  return res;
});

app.post(`${PREFIX}/generate-guideline`, async (c) => {
  console.log("[compat] /generate-guideline → /strategist/guideline");
  const body = await c.req.json();
  const res = await app.request(`${PREFIX}/strategist/guideline`, {
    method: "POST",
    headers: c.req.raw.headers,
    body: JSON.stringify(body),
  });
  return res;
});

app.post(`${PREFIX}/extract-palette`, async (c) => {
  console.log("[compat] /extract-palette → /visual-designer/extract-palette");
  const body = await c.req.json();
  const res = await app.request(`${PREFIX}/visual-designer/extract-palette`, {
    method: "POST",
    headers: c.req.raw.headers,
    body: JSON.stringify(body),
  });
  return res;
});

app.post(`${PREFIX}/generate-image`, async (c) => {
  const body = await c.req.json();
  const cardType = body.cardType as string | undefined;
  const referenceImageUrls = body.referenceImageUrls as string[] | undefined;
  const paletteImageBase64 = body.paletteImageBase64 as string | undefined;

  // Visual Snapshot: only via moodboard (generateMoodboardImage → PRIORITY_IMAGE_MODELS).
  // Never route VS to art-director so we never use txt2img or wrong model for snapshots.
  if (cardType === "visual-snapshot") {
    const hasMoodboardInputs =
      (referenceImageUrls && referenceImageUrls.length > 0) || !!paletteImageBase64;
    if (!hasMoodboardInputs) {
      return c.json(
        { error: "Visual snapshot requires referenceImageUrls or paletteImageBase64" },
        400,
      );
    }
    console.log("[compat] /generate-image (moodboard) → /visual-designer/moodboard");
    const res = await app.request(`${PREFIX}/visual-designer/moodboard`, {
      method: "POST",
      headers: c.req.raw.headers,
      body: JSON.stringify(body),
    });
    return res;
  }

  if (body.titleFont && cardType === "logo") {
    console.log("[compat] /generate-image (wordmark) → /visual-designer/wordmark");
    const res = await app.request(`${PREFIX}/visual-designer/wordmark`, {
      method: "POST",
      headers: c.req.raw.headers,
      body: JSON.stringify(body),
    });
    return res;
  } else if (body.sourceImageUrl) {
    console.log("[compat] /generate-image (img2img) → /visual-designer/edit");
    const res = await app.request(`${PREFIX}/visual-designer/edit`, {
      method: "POST",
      headers: c.req.raw.headers,
      body: JSON.stringify(body),
    });
    return res;
  } else {
    console.log("[compat] /generate-image (txt2img) → /art-director/generate");
    const res = await app.request(`${PREFIX}/art-director/generate`, {
      method: "POST",
      headers: c.req.raw.headers,
      body: JSON.stringify(body),
    });
    return res;
  }
});

Deno.serve(app.fetch);
