#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// diagnose-logo-composition.mjs
//
// Splits two hypotheses about logo lockups collapsing to icon+wordmark:
//   A. Art Director almost never picks wordmark-only
//   B. The image model ignores wordmark-only and still draws an icon
//
// Phase 1 calls art-director/design-palette-fonts (text only) and histograms
// logoComposition.mode. Phase 2 forces each of the three modes into
// art-director/design-logo so the images can be compared visually.
//
// Auth and rate-limit posture match scripts/bench-image-gen.mjs: serial
// requests against the deployed Edge Function, with a delay between calls.
//
// Usage:
//   node scripts/diagnose-logo-composition.mjs
//   node scripts/diagnose-logo-composition.mjs --runs=8 --delay=1500
//   node scripts/diagnose-logo-composition.mjs --skip-images
// ─────────────────────────────────────────────────────────────────────────────

import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const REQUEST_TIMEOUT_MS = 240_000;
const REPORT_DIR = path.resolve(process.cwd(), "reports/logo-composition");

const MODES = [
  "symbol-wordmark-horizontal",
  "symbol-wordmark-stacked",
  "wordmark-only",
];

const BRIEFS = [
  {
    id: "lumen-short",
    intent: "short generic name — current rules should prefer horizontal",
    brandName: "Lumen",
    tagline: "See clearly",
    description: "A navigation app for independent teams.",
    targetAudience: "Urban professionals",
    keywords: ["clear", "precise", "modern"],
    visualConcept: {
      concept: "Guiding light",
      description: "Precise geometry with a warm focal point.",
    },
  },
  {
    id: "northstar-letterpress",
    intent: "distinctive long name — current rules should prefer wordmark-only",
    brandName: "Northstar Letterpress",
    tagline: "Ink, paper, time",
    description: "A small letterpress studio that prints distinctive custom stationery from original metal type.",
    targetAudience: "Collectors of printed ephemera",
    keywords: ["tactile", "heritage", "bespoke"],
    visualConcept: {
      concept: "Pressed impression",
      description: "Deep letterpress bite and tactile paper grain.",
    },
  },
  {
    id: "shiguang-zh",
    intent: "short Chinese name — check whether language shifts the choice",
    brandName: "拾光",
    tagline: "把时间收进手里",
    description: "一家记录日常片刻的影像工作室。",
    targetAudience: "喜欢胶片质感的年轻人",
    keywords: ["温暖", "纪实", "从容"],
    visualConcept: {
      concept: "口袋里的黄昏",
      description: "柔和的侧光与手持的亲密距离。",
    },
  },
];

const IMAGE_BRIEF_ID = "lumen-short";

const FORCED_COMPOSITIONS = [
  {
    mode: "symbol-wordmark-horizontal",
    rationale: "Diagnostic lock: horizontal combination mark.",
  },
  {
    mode: "symbol-wordmark-stacked",
    rationale: "Diagnostic lock: stacked combination mark.",
  },
  {
    mode: "wordmark-only",
    rationale: "Diagnostic lock: wordmark-only lettering with no separate symbol.",
  },
];

function parseArgs(argv) {
  const args = { runs: 8, delayMs: 1500, skipImages: false };
  for (const raw of argv) {
    if (raw === "--skip-images") args.skipImages = true;
    else if (raw.startsWith("--runs=")) args.runs = Number(raw.slice(7));
    else if (raw.startsWith("--delay=")) args.delayMs = Number(raw.slice(8));
  }
  if (!Number.isFinite(args.runs) || args.runs < 1) {
    throw new Error("--runs must be a positive integer");
  }
  return args;
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

function emptyCounts() {
  return Object.fromEntries(MODES.map((mode) => [mode, 0]));
}

function countModes(rows) {
  const counts = emptyCounts();
  let errors = 0;
  let other = 0;
  for (const row of rows) {
    if (!row.ok || !row.mode) {
      errors += 1;
      continue;
    }
    if (Object.hasOwn(counts, row.mode)) counts[row.mode] += 1;
    else other += 1;
  }
  const ok = rows.length - errors;
  const combo = counts["symbol-wordmark-horizontal"] + counts["symbol-wordmark-stacked"];
  return {
    n: rows.length,
    ok,
    errors,
    other,
    counts,
    comboRate: ok > 0 ? combo / ok : null,
    wordmarkOnlyRate: ok > 0 ? counts["wordmark-only"] / ok : null,
  };
}

function pct(value) {
  if (value == null || Number.isNaN(value)) return "—";
  return `${(value * 100).toFixed(0)}%`;
}

function histogramLine(label, count, total) {
  const width = 24;
  const filled = total > 0 ? Math.round((count / total) * width) : 0;
  const bar = "█".repeat(filled) + "░".repeat(Math.max(0, width - filled));
  return `  ${label.padEnd(28)} ${String(count).padStart(3)}  ${bar}`;
}

function formatSentence(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  const normalized = trimmed.replace(/\.+$/u, ".");
  return /[.!?。！？]$/u.test(normalized) ? normalized : `${normalized}.`;
}

/**
 * Local mirror of buildLogoImagePrompt, used when the deployed function does
 * not echo _meta.prompt (ENABLE_DEV_ROUTES is off in production).
 */
function reconstructLogoImagePrompt(ctx) {
  const name = ctx.brandName?.trim() || "the brand";
  const composition = ctx.logoComposition;
  const titleFont = ctx.titleFont?.trim();
  const palette = Array.isArray(ctx.colorPalette) && ctx.colorPalette.length > 0
    ? `Use this color scheme: ${ctx.colorPalette.join(", ")}. `
    : "";
  const conceptText = ctx.visualConcept?.concept?.trim()
    ? `Visual concept: ${formatSentence(ctx.visualConcept.concept)} `
    : "";

  let compositionInstruction = "";
  if (composition.mode === "symbol-wordmark-horizontal") {
    const typeface = titleFont
      ? `Use the visual character of the selected title typeface ${titleFont} for the wordmark.`
      : "Use the visual character of the selected display typeface for the wordmark.";
    compositionInstruction =
      `Create a horizontal combination mark: place one simple abstract symbol on the left `
      + `and the wordmark on the right. ${typeface}`;
  } else if (composition.mode === "symbol-wordmark-stacked") {
    const typeface = titleFont
      ? `Use the visual character of the selected title typeface ${titleFont} for the wordmark.`
      : "Use the visual character of the selected display typeface for the wordmark.";
    compositionInstruction =
      `Create a stacked combination mark: place one simple abstract symbol above `
      + `and the wordmark below. ${typeface}`;
  } else {
    compositionInstruction =
      `Create a wordmark-only logo using distinctive custom lettering derived from the brand personality. `
      + `Do not add a separate symbol, icon, emblem, or pictorial mark.`;
  }

  return [
    `Design exactly one finished logo lockup for the brand "${name}". `,
    conceptText,
    palette,
    `Logo composition decision: ${composition.mode}. `,
    `Brand-specific rationale: ${formatSentence(composition.rationale)} `,
    `${compositionInstruction} `,
    `Rules: Render the brand name exactly as "${name}", once and only once. `,
    `Show no tagline, subtitle, explanation, label, or any other text or characters. `,
    `Create one cohesive lockup only — no logo sheet, no alternate variants, and no application mockup. `,
    `Use a minimal flat vector style on a pure white background with generous padding. `,
    `Any symbol must be simple and abstract — not an illustration, scene, mascot, badge, or detailed drawing. `,
  ].join("");
}

function brandContextFromBrief(brief, extras = {}) {
  return {
    name: brief.brandName,
    tagline: brief.tagline,
    description: brief.description,
    targetAudience: brief.targetAudience,
    keywords: brief.keywords,
    visualConcept: brief.visualConcept,
    ...extras,
  };
}

function paletteFontsBody(brief) {
  const brandContext = brandContextFromBrief(brief);
  return {
    brandContext,
    brandName: brief.brandName,
    description: brief.description,
    keywords: brief.keywords,
    visualConcept: brief.visualConcept,
  };
}

function interpretHistograms(byBrief, overall) {
  const northstar = byBrief["northstar-letterpress"];
  const comboDominant = overall.comboRate != null && overall.comboRate > 0.9;
  const northstarWordmarkScarce = northstar?.wordmarkOnlyRate != null
    && northstar.wordmarkOnlyRate < 0.2;
  const wordmarkPresent = overall.wordmarkOnlyRate != null && overall.wordmarkOnlyRate >= 0.15;

  return {
    hypothesisA_decisionBias: comboDominant,
    hypothesisA_rulesIneffective: comboDominant && northstarWordmarkScarce,
    hypothesisA_insufficientAlone: wordmarkPresent,
    notes: [
      comboDominant
        ? "Combo marks (horizontal + stacked) exceed 90% of successful text decisions — hypothesis A holds."
        : "Combo marks are not >90% — hypothesis A is weak or mixed.",
      northstarWordmarkScarce
        ? "Northstar Letterpress still rarely yields wordmark-only — the brand-fit rules are not steering mode choice."
        : "Northstar Letterpress produced a non-trivial wordmark-only share, so the rules can fire for a distinctive name.",
      wordmarkPresent
        ? "wordmark-only appears often enough that image-model non-compliance (hypothesis B) must also be checked."
        : "wordmark-only is rare, so product sameness can be explained by the decision layer alone if images match their modes.",
    ],
  };
}

async function downloadImage(url, destBase) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`image download failed (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  const type = res.headers.get("content-type") ?? "";
  const ext = type.includes("jpeg") || type.includes("jpg") ? ".jpg" : ".png";
  const dest = `${destBase}${ext}`;
  await writeFile(dest, buf);
  return { path: dest, contentType: type || null, bytes: buf.length };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = parseEnv(await readFile(".env.local", "utf8"));
  const projectRef = env.VITE_SUPABASE_PROJECT_REF;
  const anonKey = env.VITE_SUPABASE_ANON_KEY;
  if (!projectRef || !anonKey) {
    throw new Error("Missing VITE_SUPABASE_PROJECT_REF / VITE_SUPABASE_ANON_KEY in .env.local");
  }

  const baseUrl = `https://${projectRef}.supabase.co/functions/v1/server/make-server-e35291a5`;
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

  let projectId = "diagnose-logo-composition";
  const call = async (routePath, body, method = "POST") => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const started = Date.now();
    try {
      const res = await fetch(`${baseUrl}/${routePath}`, {
        method,
        headers: {
          Authorization: `Bearer ${bearer}`,
          "Content-Type": "application/json",
          ...(env.VITE_ACCESS_PASSPHRASE ? { "X-Access-Token": env.VITE_ACCESS_PASSPHRASE } : {}),
          "X-Project-Id": projectId,
        },
        body: method === "POST" ? JSON.stringify(body) : undefined,
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

  const listRes = await call("list-projects", null, "GET");
  if (Array.isArray(listRes.body?.projects) && listRes.body.projects.length > 0) {
    projectId = listRes.body.projects[0].id;
  }

  await mkdir(REPORT_DIR, { recursive: true });

  console.log(`Endpoint : ${baseUrl}`);
  console.log(`Project  : ${projectId}`);
  console.log(`Runs     : ${args.runs} per brief, serial, delay=${args.delayMs}ms`);
  console.log(`Images   : ${args.skipImages ? "skipped" : `forced 3 modes on ${IMAGE_BRIEF_ID}`}\n`);

  const phase1 = [];
  const seedByBrief = {};

  for (const brief of BRIEFS) {
    console.log(`── Phase 1  ${brief.id}  (${brief.brandName})`);
    console.log(`   ${brief.intent}`);
    const rows = [];

    for (let i = 0; i < args.runs; i++) {
      const res = await call("art-director/design-palette-fonts", paletteFontsBody(brief));
      const composition = res.body?.logoComposition;
      const row = {
        briefId: brief.id,
        run: i + 1,
        ok: res.ok,
        status: res.status,
        clientMs: res.clientMs,
        mode: typeof composition?.mode === "string" ? composition.mode : null,
        rationale: typeof composition?.rationale === "string" ? composition.rationale : null,
        titleFont: res.body?.font?.titleFont ?? null,
        bodyFont: res.body?.font?.bodyFont ?? null,
        colorPalette: Array.isArray(res.body?.colorPalette) ? res.body.colorPalette : null,
        ...(res.ok ? {} : { error: res.body?.error ?? "unknown" }),
      };
      rows.push(row);
      phase1.push(row);

      if (res.ok && composition?.mode && !seedByBrief[brief.id]) {
        seedByBrief[brief.id] = {
          colorPalette: row.colorPalette,
          font: {
            titleFont: row.titleFont,
            bodyFont: row.bodyFont,
          },
        };
      }

      const flag = res.ok ? "ok  " : "FAIL";
      console.log(
        `   ${flag} run ${i + 1}/${args.runs}  ${row.mode ?? "—"}`
        + (row.rationale ? `  ${row.rationale.slice(0, 90)}` : "")
        + (row.error ? `  ${String(row.error).slice(0, 120)}` : ""),
      );

      if (i < args.runs - 1 && args.delayMs > 0) await sleep(args.delayMs);
    }

    const summary = countModes(rows);
    console.log(
      `   → combo=${pct(summary.comboRate)}  wordmark-only=${pct(summary.wordmarkOnlyRate)}`
      + `  ok=${summary.ok}/${summary.n}\n`,
    );
  }

  const byBrief = {};
  for (const brief of BRIEFS) {
    byBrief[brief.id] = countModes(phase1.filter((row) => row.briefId === brief.id));
  }
  const overall = countModes(phase1);
  const interpretation = interpretHistograms(byBrief, overall);

  console.log("═".repeat(78));
  console.log("PHASE 1 MODE HISTOGRAM");
  console.log("═".repeat(78));
  for (const brief of BRIEFS) {
    const summary = byBrief[brief.id];
    console.log(`\n${brief.id}  (${brief.brandName})  n=${summary.ok} ok`);
    for (const mode of MODES) {
      console.log(histogramLine(mode, summary.counts[mode], summary.ok));
    }
    console.log(`  comboRate=${pct(summary.comboRate)}  wordmarkOnlyRate=${pct(summary.wordmarkOnlyRate)}`);
  }
  console.log(`\noverall  n=${overall.ok} ok`);
  for (const mode of MODES) {
    console.log(histogramLine(mode, overall.counts[mode], overall.ok));
  }
  console.log(`  comboRate=${pct(overall.comboRate)}  wordmarkOnlyRate=${pct(overall.wordmarkOnlyRate)}`);
  console.log("\nInterpretation:");
  for (const note of interpretation.notes) console.log(`  - ${note}`);
  console.log();

  const phase2 = [];
  if (!args.skipImages) {
    const imageBrief = BRIEFS.find((brief) => brief.id === IMAGE_BRIEF_ID);
    let seed = seedByBrief[IMAGE_BRIEF_ID];
    if (!seed) {
      console.log("Phase 2 seed missing from Phase 1 — fetching one palette/fonts result.");
      const res = await call("art-director/design-palette-fonts", paletteFontsBody(imageBrief));
      if (!res.ok) {
        throw new Error(`Phase 2 seed failed: ${res.body?.error ?? res.status}`);
      }
      seed = {
        colorPalette: res.body.colorPalette,
        font: res.body.font,
      };
      if (args.delayMs > 0) await sleep(args.delayMs);
    }

    console.log(`── Phase 2  forced modes on ${imageBrief.brandName}`);
    const brandContext = brandContextFromBrief(imageBrief, {
      colorPalette: seed.colorPalette,
      font: seed.font,
    });

    const callLogo = async (composition) => {
      let res;
      for (let attempt = 1; attempt <= 3; attempt++) {
        res = await call("art-director/design-logo", {
          brandContext,
          brandName: imageBrief.brandName,
          description: imageBrief.description,
          keywords: imageBrief.keywords,
          visualConcept: imageBrief.visualConcept,
          colorPalette: seed.colorPalette,
          font: seed.font,
          logoComposition: composition,
        });
        const err = String(res.body?.error ?? "");
        const retryable = !res.ok && (
          res.status === 500 || res.status === 503
          || /UNAVAILABLE|Deadline expired/i.test(err)
        );
        if (!retryable || attempt === 3) return res;
        console.log(`   retry ${attempt}/2 for ${composition.mode} after HTTP ${res.status}`);
        await sleep(Math.max(args.delayMs, 2000));
      }
      return res;
    };

    for (const [index, composition] of FORCED_COMPOSITIONS.entries()) {
      const reconstructedPrompt = reconstructLogoImagePrompt({
        brandName: imageBrief.brandName,
        visualConcept: imageBrief.visualConcept,
        colorPalette: seed.colorPalette,
        titleFont: seed.font?.titleFont,
        logoComposition: composition,
      });
      const res = await callLogo(composition);

      const logoImageUrl = typeof res.body?.logoImageUrl === "string" ? res.body.logoImageUrl : null;
      const serverPrompt = typeof res.body?._meta?.prompt === "string" ? res.body._meta.prompt : null;
      const promptPath = path.join(REPORT_DIR, `${composition.mode}.prompt.txt`);
      await writeFile(promptPath, `${serverPrompt ?? reconstructedPrompt}\n`, "utf8");

      const row = {
        mode: composition.mode,
        ok: res.ok,
        status: res.status,
        clientMs: res.clientMs,
        logoImageUrl,
        promptSource: serverPrompt ? "server-_meta.prompt" : "local-reconstruction",
        promptPath: path.relative(process.cwd(), promptPath),
        imagePath: null,
        error: res.ok ? null : (res.body?.error ?? "unknown"),
      };

      if (logoImageUrl) {
        try {
          const saved = await downloadImage(
            logoImageUrl,
            path.join(REPORT_DIR, composition.mode),
          );
          row.imagePath = path.relative(process.cwd(), saved.path);
          row.contentType = saved.contentType;
          row.bytes = saved.bytes;
        } catch (err) {
          row.error = `download failed: ${String(err?.message ?? err)}`;
        }
      }

      phase2.push(row);
      const flag = res.ok && row.imagePath ? "ok  " : "FAIL";
      console.log(
        `   ${flag} ${composition.mode}`
        + (row.imagePath ? `  ${row.imagePath}` : "")
        + (row.error ? `  ${String(row.error).slice(0, 120)}` : ""),
      );

      if (index < FORCED_COMPOSITIONS.length - 1 && args.delayMs > 0) {
        await sleep(args.delayMs);
      }
    }
    console.log();
  }

  const report = {
    generatedAt: new Date().toISOString(),
    endpoint: baseUrl,
    projectId,
    runsPerBrief: args.runs,
    skipImages: args.skipImages,
    briefs: BRIEFS.map((brief) => ({ id: brief.id, brandName: brief.brandName, intent: brief.intent })),
    phase1: {
      overall,
      byBrief,
      interpretation,
      runs: phase1,
    },
    phase2: {
      briefId: IMAGE_BRIEF_ID,
      images: phase2,
      visualCheck: [
        "Inspect wordmark-only: if a separate icon/symbol is still present, hypothesis B holds.",
        "Inspect horizontal vs stacked: if both look like the same left-right combo, the image model is also collapsing layout.",
      ],
    },
  };

  const outPath = path.join(REPORT_DIR, "modes.json");
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Raw report: ${path.relative(process.cwd(), outPath)}`);

  await supabase.auth.signOut();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
