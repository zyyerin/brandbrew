#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// diagnose-mcu-palette.mjs
//
// Visual check for the proposed color pipeline:
//   canned brief + visual concept → LLM seed knobs (no hex) → MCU 5-role expand
//
// Does not change production design-palette-fonts. Writes an HTML swatch
// report so the palettes can be judged by eye.
//
// Usage:
//   node scripts/diagnose-mcu-palette.mjs
//   node scripts/diagnose-mcu-palette.mjs --limit=5
//   node scripts/diagnose-mcu-palette.mjs --ids=lumen-short,pebble-kids
//   node scripts/diagnose-mcu-palette.mjs --compare --delay=1500
//
// Prefers GEMINI_API_KEY (env or .env.local). If missing, falls back to the
// deployed art-director/design-palette-fonts route using .env.local Supabase auth.
// ─────────────────────────────────────────────────────────────────────────────

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

import {
  CHROMA_KEYS,
  ROLE_ORDER,
  VARIANTS,
  expandMcuPalette,
  knobsFromHex,
  normalizeHex,
  pickCoreHex,
} from "./lib/mcu-palette.mjs";

const TEXT_MODEL = "gemini-3-flash-preview";
const REQUEST_TIMEOUT_MS = 240_000;
const REPORT_ROOT = path.resolve(process.cwd(), "reports/mcu-palette");

const BRIEFS = [
  {
    id: "lumen-short",
    mood: "precise modern",
    brandName: "Lumen",
    tagline: "See clearly",
    description: "A navigation app for independent teams.",
    targetAudience: "Urban professionals",
    keywords: ["clear", "precise", "modern"],
    visualConcept: {
      concept: "Guiding light",
      description: "The brand exists to make orientation feel inevitable. Personality is calm, exacting, and quietly confident about the next step.",
    },
  },
  {
    id: "northstar-letterpress",
    mood: "heritage tactile",
    brandName: "Northstar Letterpress",
    tagline: "Ink, paper, time",
    description: "A small letterpress studio that prints distinctive custom stationery from original metal type.",
    targetAudience: "Collectors of printed ephemera",
    keywords: ["tactile", "heritage", "bespoke"],
    visualConcept: {
      concept: "Pressed impression",
      description: "Craft is treated as a slow conversation with material. The studio values patience, physical presence, and marks that cannot be rushed.",
    },
  },
  {
    id: "shiguang-zh",
    mood: "Chinese warm",
    brandName: "拾光",
    tagline: "把时间收进手里",
    description: "一家记录日常片刻的影像工作室。",
    targetAudience: "喜欢胶片质感的年轻人",
    keywords: ["温暖", "纪实", "从容"],
    visualConcept: {
      concept: "口袋里的黄昏",
      description: "品牌相信日常值得被郑重地收存。气质从容、亲近，强调被记住的不是事件本身，而是相处时的温度。",
    },
  },
  {
    id: "clin-path",
    mood: "clinical cold",
    brandName: "ClinPath",
    tagline: "Evidence, not guesswork",
    description: "A diagnostics lab that delivers rapid, readable reports for independent clinics.",
    targetAudience: "Clinic directors and attending physicians",
    keywords: ["clinical", "trust", "clarity"],
    visualConcept: {
      concept: "Quiet certainty",
      description: "Authority comes from restraint. The lab speaks without drama, privileging verification, neutrality, and the dignity of being precise.",
    },
  },
  {
    id: "nocturne-bar",
    mood: "nocturnal",
    brandName: "Nocturne",
    tagline: "After the last train",
    description: "A late-night listening bar for people who stay out to hear one more record.",
    targetAudience: "Night-shift creatives and vinyl listeners",
    keywords: ["nocturnal", "intimate", "low-key"],
    visualConcept: {
      concept: "After hours",
      description: "The brand holds space for people who come alive when the city thins out. It is hushed, adult, and protective of attention.",
    },
  },
  {
    id: "pebble-kids",
    mood: "playful kids",
    brandName: "Pebble",
    tagline: "Small hands, big days",
    description: "A line of washable play objects for preschoolers and the adults who clean up after them.",
    targetAudience: "Parents of children aged 2–5",
    keywords: ["playful", "safe", "curious"],
    visualConcept: {
      concept: "First grab",
      description: "Wonder is treated as a serious job. The brand is generous, bounce-back optimistic, and built around a child's right to try again.",
    },
  },
  {
    id: "oriel-luxury",
    mood: "luxury",
    brandName: "Oriel",
    tagline: "Light, held",
    description: "A small atelier making limited jewelry for evening wear.",
    targetAudience: "Collectors of quiet luxury",
    keywords: ["refined", "scarce", "ceremonial"],
    visualConcept: {
      concept: "Held light",
      description: "Luxury here is composure, not display. The atelier believes rarity should feel earned, private, and slightly ceremonial.",
    },
  },
  {
    id: "mossbank",
    mood: "eco forest",
    brandName: "Mossbank",
    tagline: "Grow where you stand",
    description: "A community nursery restoring native plants for urban edges.",
    targetAudience: "Neighborhood stewards and first-time gardeners",
    keywords: ["rooted", "restorative", "communal"],
    visualConcept: {
      concept: "Slow return",
      description: "Repair is a public act. The nursery values patience, shared labor, and the idea that a place can recover if people stay with it.",
    },
  },
  {
    id: "frostline",
    mood: "icy tech",
    brandName: "Frostline",
    tagline: "Keep the signal clean",
    description: "An infrastructure studio building low-latency monitoring for climate-tech operators.",
    targetAudience: "Ops leads at climate-tech companies",
    keywords: ["exact", "cool", "instrumented"],
    visualConcept: {
      concept: "Clean signal",
      description: "The brand treats attention as a scarce instrument. It is unsentimental, high-resolution, and unwilling to decorate the facts.",
    },
  },
  {
    id: "chili-kitchen",
    mood: "food spice",
    brandName: "Chili Kitchen",
    tagline: "Heat with a point",
    description: "A condiment maker bottling regional chili oils for home cooks who want a sharp finish.",
    targetAudience: "Home cooks who chase heat",
    keywords: ["bold", "appetite", "regional"],
    visualConcept: {
      concept: "Pointed heat",
      description: "Flavor is an argument, not a backdrop. The brand is generous, a little loud, and proud of recipes that remember a specific place.",
    },
  },
];

function parseArgs(argv) {
  const args = { runs: 1, delayMs: 1500, compare: false, limit: null, ids: null };
  for (const raw of argv) {
    if (raw === "--compare") args.compare = true;
    else if (raw.startsWith("--runs=")) args.runs = Number(raw.slice(7));
    else if (raw.startsWith("--delay=")) args.delayMs = Number(raw.slice(8));
    else if (raw.startsWith("--limit=")) args.limit = Number(raw.slice(8));
    else if (raw.startsWith("--ids=")) {
      args.ids = raw.slice(6).split(",").map((id) => id.trim()).filter(Boolean);
    }
  }
  if (!Number.isFinite(args.runs) || args.runs < 1) {
    throw new Error("--runs must be a positive integer");
  }
  if (!Number.isFinite(args.delayMs) || args.delayMs < 0) {
    throw new Error("--delay must be a non-negative number");
  }
  if (args.limit != null && (!Number.isFinite(args.limit) || args.limit < 1)) {
    throw new Error("--limit must be a positive integer");
  }
  return args;
}

function selectBriefs(args) {
  if (args.ids?.length) {
    return args.ids.map((id) => {
      const brief = BRIEFS.find((item) => item.id === id);
      if (!brief) throw new Error(`Unknown brief id: ${id}`);
      return brief;
    });
  }
  if (args.limit != null) return BRIEFS.slice(0, args.limit);
  return BRIEFS;
}

function parseEnv(text) {
  const env = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\""))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stampDir() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function contextBlock(brief) {
  return [
    `Brand name: ${brief.brandName}`,
    brief.tagline ? `Tagline: ${brief.tagline}` : "",
    `Description: ${brief.description}`,
    `Target audience: ${brief.targetAudience}`,
    `Keywords: ${brief.keywords.join(", ")}`,
    `Visual concept: ${brief.visualConcept.concept} — ${brief.visualConcept.description}`,
  ].filter(Boolean).join("\n");
}

function seedPrompt(brief) {
  return `You are a creative director with deep expertise in color theory.
Given the brand brief and visual concept, choose a single brand core color as HCT knobs.
Do NOT output hex. Do NOT invent a full palette. Translate metaphor and personality into a hue family and chroma register.

Return ONLY valid JSON with this exact structure:
{
  "hue": 0,
  "chroma": "muted",
  "variant": "content",
  "rationale": "One concise sentence."
}

Rules:
- "hue": number from 0 to 359. Snap your intent to the nearest 5°.
- "chroma": exactly one of ${CHROMA_KEYS.map((k) => `"${k}"`).join(" | ")}.
  muted = craft / fog / heritage; standard = balanced brand color; vivid = high-energy or digital.
- "variant": exactly one of ${VARIANTS.map((k) => `"${k}"`).join(" | ")}.
  content = preserve the chroma; tonalSpot = product-UI harmony; vibrant = push saturation; neutral = almost no chroma.
- "rationale": one brand-specific sentence. Do not name hex codes.
- The visual concept is strategic, not a physical description. Infer temperature and chroma from personality, not from invented materials.

Brand context:
${contextBlock(brief)}`;
}

function parseSeedFromRationale(rationale) {
  const text = String(rationale ?? "");
  const match = text.match(/MCU_SEED\|(\{[\s\S]*?\})\|([\s\S]*)/);
  if (!match) return null;
  const seed = parseSeedKnobs(match[1]);
  return { ...seed, rationale: match[2].trim() || seed.rationale };
}

function edgeSeedTaskPrompt() {
  return `Given the brand brief and visual concept, choose a single brand core color as HCT knobs.
Do NOT invent a full palette of hex colors.
Return ONLY valid JSON with this exact structure:
{
  "colorPalette": ["#808080"],
  "font": {
    "titleFont": "Inter",
    "bodyFont": "Inter"
  },
  "logoComposition": {
    "rationale": "MCU_SEED|{\\"hue\\":32,\\"chroma\\":\\"muted\\",\\"variant\\":\\"content\\"}|One concise brand-specific sentence."
  }
}
Rules:
- colorPalette must be exactly ["#808080"] (placeholder; hex is discarded).
- font names must be Inter / Inter.
- logoComposition.rationale must start with MCU_SEED| then a JSON object with hue (0-359, nearest 5°), chroma (${CHROMA_KEYS.join(" | ")}), variant (${VARIANTS.join(" | ")}), then | and one sentence.
- Do not name hex codes in the rationale sentence.`;
}

function parseSeedKnobs(raw) {
  const text = String(raw ?? "").trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonText = (fenced ? fenced[1] : text).trim();
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    throw new Error(`seed JSON parse failed: ${err.message}`);
  }
  const hue = Number(parsed?.hue);
  const chroma = parsed?.chroma;
  const variant = parsed?.variant;
  const rationale = typeof parsed?.rationale === "string" ? parsed.rationale.trim() : "";
  if (!Number.isFinite(hue)) throw new Error("seed.hue is not a number");
  if (!CHROMA_KEYS.includes(chroma)) throw new Error(`seed.chroma is invalid: ${chroma}`);
  if (!VARIANTS.includes(variant)) throw new Error(`seed.variant is invalid: ${variant}`);
  return { hue, chroma, variant, rationale };
}

function luminance(hex) {
  const c = (String(hex).replace("#", "") + "000000").slice(0, 6);
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;
  const lin = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function fgFor(hex) {
  return luminance(hex) > 0.35 ? "rgba(0,0,0,0.72)" : "rgba(255,255,255,0.9)";
}

async function callGeminiJson(apiKey, prompt) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${TEXT_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            responseMimeType: "application/json",
          },
        }),
        signal: controller.signal,
      },
    );
    const text = await res.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text.slice(0, 500) };
    }
    if (!res.ok) {
      const message = parsed?.error?.message ?? text.slice(0, 300);
      throw new Error(`Gemini HTTP ${res.status}: ${message}`);
    }
    const modelText = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!modelText) {
      const reason = parsed?.candidates?.[0]?.finishReason ?? "empty";
      throw new Error(`Gemini returned no text (finishReason: ${reason})`);
    }
    return { text: modelText, clientMs: Date.now() - started };
  } catch (err) {
    if (err?.name === "AbortError") {
      throw new Error(`Gemini client timeout (${REQUEST_TIMEOUT_MS} ms)`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function brandContextFromBrief(brief) {
  return {
    name: brief.brandName,
    tagline: brief.tagline,
    description: brief.description,
    targetAudience: brief.targetAudience,
    keywords: brief.keywords,
    visualConcept: brief.visualConcept,
  };
}

function paletteFontsBody(brief, extras = {}) {
  return {
    brandContext: brandContextFromBrief(brief),
    brandName: brief.brandName,
    description: brief.description,
    keywords: brief.keywords,
    visualConcept: brief.visualConcept,
    ...extras,
  };
}

async function createCompareCaller(env) {
  const projectRef = env.VITE_SUPABASE_PROJECT_REF;
  const anonKey = env.VITE_SUPABASE_ANON_KEY;
  if (!projectRef || !anonKey) {
    throw new Error("Edge fallback / --compare requires VITE_SUPABASE_PROJECT_REF and VITE_SUPABASE_ANON_KEY in .env.local");
  }
  const prefix = env.VITE_EDGE_ROUTE_PREFIX?.trim() || "make-server-e35291a5";
  const baseUrl = `https://${projectRef}.supabase.co/functions/v1/server/${prefix}`;
  const supabase = createClient(`https://${projectRef}.supabase.co`, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const authRes = env.VITE_DEV_EMAIL && env.VITE_DEV_PASSWORD
    ? await supabase.auth.signInWithPassword({
      email: env.VITE_DEV_EMAIL,
      password: env.VITE_DEV_PASSWORD,
    })
    : await supabase.auth.signInAnonymously();
  if (authRes.error || !authRes.data.session?.access_token) {
    throw new Error(`Auth failed: ${authRes.error?.message ?? "no session"}`);
  }
  const bearer = authRes.data.session.access_token;
  let projectId = "diagnose-mcu-palette";

  const call = async (routePath, body) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const started = Date.now();
    try {
      const res = await fetch(`${baseUrl}/${routePath}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${bearer}`,
          "Content-Type": "application/json",
          ...(env.VITE_ACCESS_PASSPHRASE ? { "X-Access-Token": env.VITE_ACCESS_PASSPHRASE } : {}),
          "X-Project-Id": projectId,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await res.text();
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { raw: text.slice(0, 500) };
      }
      return { ok: res.ok, status: res.status, clientMs: Date.now() - started, body: parsed };
    } catch (err) {
      return {
        ok: false,
        status: null,
        clientMs: Date.now() - started,
        body: { error: err?.name === "AbortError" ? "client timeout" : String(err?.message ?? err) },
      };
    } finally {
      clearTimeout(timer);
    }
  };

  const listRes = await fetch(`${baseUrl}/list-projects`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${bearer}`,
      ...(env.VITE_ACCESS_PASSPHRASE ? { "X-Access-Token": env.VITE_ACCESS_PASSPHRASE } : {}),
    },
  });
  if (listRes.ok) {
    const listed = await listRes.json();
    if (Array.isArray(listed?.projects) && listed.projects.length > 0) {
      projectId = listed.projects[0].id;
    }
  }

  return {
    baseUrl,
    projectId,
    callCurrentPalette: (brief, extras = {}) => call("art-director/design-palette-fonts", paletteFontsBody(brief, extras)),
    signOut: () => supabase.auth.signOut(),
  };
}

function swatchStrip(colors, { labeled = false } = {}) {
  const cells = colors.map((item) => {
    const hex = typeof item === "string" ? item : item.hex;
    const label = typeof item === "string" ? hex : (item.label ?? hex);
    const sub = typeof item === "string" ? "" : (item.sub ?? hex);
    const fg = fgFor(hex);
    return `<div class="swatch" style="background:${escapeHtml(hex)};color:${fg}">
      ${labeled ? `<span class="swatch-label">${escapeHtml(label)}</span><span class="swatch-hex">${escapeHtml(sub)}</span>` : ""}
    </div>`;
  }).join("");
  return `<div class="strip">${cells}</div>`;
}

function renderHtml(report) {
  const cards = report.runs.map((row) => {
    if (!row.ok) {
      return `<article class="card fail">
        <header>
          <h2>${escapeHtml(row.brandName)}</h2>
          <p class="meta">${escapeHtml(row.briefId)} · ${escapeHtml(row.mood)} · run ${row.run}</p>
        </header>
        <p class="error">${escapeHtml(row.error)}</p>
      </article>`;
    }
    const roleColors = ROLE_ORDER.map((role) => ({
      hex: row.mcu.roles[role].hex,
      label: role,
      sub: row.mcu.roles[role].hex,
    }));
    const compare = row.currentPalette
      ? `<div class="block">
          <h3>Current LLM hexes</h3>
          ${swatchStrip((row.currentPalette ?? []).map((hex) => ({ hex, label: hex, sub: "" })), { labeled: true })}
        </div>`
      : "";
    return `<article class="card">
      <header>
        <h2>${escapeHtml(row.brandName)}</h2>
        <p class="meta">${escapeHtml(row.briefId)} · ${escapeHtml(row.mood)} · run ${row.run}${row.seedSource ? ` · ${escapeHtml(row.seedSource)}` : ""}</p>
      </header>
      <p class="concept"><strong>${escapeHtml(row.visualConcept.concept)}</strong> — ${escapeHtml(row.visualConcept.description)}</p>
      <p class="knobs">hue ${Math.round(row.seed.hue)} · chroma ${escapeHtml(row.seed.chroma)} · variant ${escapeHtml(row.seed.variant)} · HCT ${row.mcu.hct.hue.toFixed(1)} / ${row.mcu.hct.chroma.toFixed(1)} / ${row.mcu.hct.tone.toFixed(1)}</p>
      <p class="rationale">${escapeHtml(row.rationale)}</p>
      <div class="block">
        <h3>MCU roles · core ${escapeHtml(row.mcu.roles.primary.hex)}</h3>
        ${swatchStrip(roleColors, { labeled: true })}
      </div>
      ${compare}
    </article>`;
  }).join("\n");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>MCU palette diagnose</title>
  <style>
    :root { color-scheme: light; }
    body { margin: 0; font: 14px/1.45 ui-sans-serif, system-ui, sans-serif; background: #f4f1ea; color: #1c1917; }
    main { max-width: 1100px; margin: 0 auto; padding: 32px 20px 64px; }
    h1 { font-size: 22px; margin: 0 0 8px; }
    .lead { color: #57534e; margin: 0 0 28px; }
    .card { background: #fff; border-radius: 16px; padding: 20px; margin-bottom: 20px; box-shadow: 0 1px 0 rgba(0,0,0,.04); }
    .card.fail { border: 1px solid #f87171; }
    h2 { margin: 0; font-size: 18px; }
    .meta, .knobs { color: #78716c; font-size: 12px; margin: 4px 0 0; }
    .concept { margin: 12px 0; }
    .rationale { margin: 8px 0 16px; }
    .error { color: #b91c1c; }
    h3 { margin: 0 0 8px; font-size: 12px; letter-spacing: .04em; text-transform: uppercase; color: #78716c; }
    .block { margin-top: 14px; }
    .strip { display: flex; height: 88px; border-radius: 12px; overflow: hidden; }
    .swatch { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; padding: 8px; min-width: 0; }
    .swatch-label { font-size: 11px; font-weight: 650; }
    .swatch-hex { font-size: 10px; opacity: .85; font-variant-numeric: tabular-nums; }
  </style>
</head>
<body>
  <main>
    <h1>MCU palette diagnose</h1>
    <p class="lead">${escapeHtml(report.generatedAt)} · ${report.runs.length} palettes · model ${escapeHtml(report.model)}${report.compare ? " · with current LLM compare" : ""}</p>
    ${cards}
  </main>
</body>
</html>
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let envText;
  try {
    envText = await readFile(".env.local", "utf8");
  } catch {
    throw new Error("Missing .env.local. Copy .env.example and set GEMINI_API_KEY or Supabase auth.");
  }
  const env = parseEnv(envText);
  const apiKey = (process.env.GEMINI_API_KEY || env.GEMINI_API_KEY || "").trim();
  const useDirectGemini = Boolean(apiKey);
  const needEdge = !useDirectGemini || args.compare;
  const edge = needEdge ? await createCompareCaller(env) : null;
  if (!useDirectGemini && !edge) {
    throw new Error("Missing GEMINI_API_KEY and could not create Edge caller.");
  }

  const briefs = selectBriefs(args);
  const outDir = path.join(REPORT_ROOT, stampDir());
  await mkdir(outDir, { recursive: true });

  console.log(`Model    : ${TEXT_MODEL}`);
  console.log(`Seed     : ${useDirectGemini ? "direct Gemini knobs" : "Edge Function (override, then hex snap)"}`);
  console.log(`Briefs   : ${briefs.map((b) => b.id).join(", ")} × ${args.runs} run(s), delay=${args.delayMs}ms`);
  console.log(`Compare  : ${args.compare || !useDirectGemini ? "current design-palette-fonts" : "off"}`);
  console.log(`Report   : ${path.relative(process.cwd(), outDir)}\n`);

  const runs = [];
  const jobs = [];
  for (const brief of briefs) {
    for (let i = 0; i < args.runs; i++) jobs.push({ brief, run: i + 1 });
  }

  for (const [index, job] of jobs.entries()) {
    const { brief, run } = job;
    const row = {
      briefId: brief.id,
      mood: brief.mood,
      brandName: brief.brandName,
      visualConcept: brief.visualConcept,
      run,
      ok: false,
    };
    try {
      let seed;
      let currentPalette = null;

      if (useDirectGemini) {
        const gemini = await callGeminiJson(apiKey, seedPrompt(brief));
        seed = parseSeedKnobs(gemini.text);
        row.clientMs = gemini.clientMs;
        row.rawModelText = gemini.text;
        row.seedSource = "direct-knobs";
        if (args.compare && edge) {
          const current = await edge.callCurrentPalette(brief);
          row.currentOk = current.ok;
          row.currentMs = current.clientMs;
          currentPalette = Array.isArray(current.body?.colorPalette) ? current.body.colorPalette : null;
          if (!current.ok) row.currentError = current.body?.error ?? `HTTP ${current.status}`;
        }
      } else {
        const current = await edge.callCurrentPalette(brief, {
          _promptOverride: { taskPrompt: edgeSeedTaskPrompt() },
        });
        row.clientMs = current.clientMs;
        if (!current.ok) {
          throw new Error(current.body?.error ?? `HTTP ${current.status}`);
        }
        currentPalette = Array.isArray(current.body?.colorPalette) ? current.body.colorPalette : null;
        row.currentOk = true;
        const fromRationale = parseSeedFromRationale(current.body?.logoComposition?.rationale);
        if (fromRationale) {
          seed = fromRationale;
          row.seedSource = "edge-override-knobs";
        } else {
          if (!currentPalette?.length) throw new Error("Edge palette missing colorPalette");
          const coreHex = pickCoreHex(currentPalette);
          seed = knobsFromHex(coreHex);
          seed.primaryHex = coreHex;
          seed.rationale = `Primary locked to LLM core ${normalizeHex(coreHex)}; other roles MCU-expanded.`;
          row.seedSource = "edge-hex-lock";
          row.coreHex = coreHex;
        }
      }

      const mcu = expandMcuPalette(seed);
      row.ok = true;
      row.seed = { hue: seed.hue, chroma: seed.chroma, variant: seed.variant };
      row.rationale = seed.rationale ?? "";
      row.mcu = {
        hexes: mcu.hexes,
        roles: mcu.roles,
        hct: mcu.hct,
      };
      if (currentPalette) row.currentPalette = currentPalette;
      console.log(
        `ok   ${brief.id}  run ${run}  ${row.seedSource}  H${Math.round(row.seed.hue)} ${row.seed.chroma}/${row.seed.variant}  core ${row.mcu.roles.primary.hex}`
        + (row.rationale ? `  ${row.rationale.slice(0, 80)}` : ""),
      );
    } catch (err) {
      row.error = String(err?.message ?? err);
      console.log(`FAIL ${brief.id}  run ${run}  ${row.error.slice(0, 160)}`);
    }
    runs.push(row);
    if (index < jobs.length - 1 && args.delayMs > 0) await sleep(args.delayMs);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    model: TEXT_MODEL,
    seedMode: useDirectGemini ? "direct-gemini" : "edge-fallback",
    compare: Boolean(args.compare || !useDirectGemini),
    delayMs: args.delayMs,
    runsPerBrief: args.runs,
    briefs: briefs.map((brief) => ({
      id: brief.id,
      mood: brief.mood,
      brandName: brief.brandName,
      visualConcept: brief.visualConcept,
    })),
    runs,
  };

  const jsonPath = path.join(outDir, "results.json");
  const htmlPath = path.join(outDir, "palettes.html");
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(htmlPath, renderHtml(report), "utf8");

  const okCount = runs.filter((row) => row.ok).length;
  console.log(`\n${okCount}/${runs.length} palettes ok`);
  console.log(`HTML : ${path.relative(process.cwd(), htmlPath)}`);
  console.log(`JSON : ${path.relative(process.cwd(), jsonPath)}`);

  if (edge) await edge.signOut();
  if (okCount === 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
