#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// bench-image-gen.mjs — Measures where wall-clock time goes in generation.
//
// Runs each scenario serially N times against the deployed Edge Function,
// reading the per-stage `_meta.timings` spans emitted by shared/timing.ts.
// Serial by design: concurrent runs would contend for bandwidth and trip the
// 20 req/min per-user rate limit, both of which distort the numbers.
//
// Usage:
//   node scripts/bench-image-gen.mjs --runs=3
//   node scripts/bench-image-gen.mjs --scenario=logo-split,context --runs=5
//   node scripts/bench-image-gen.mjs --list
// ─────────────────────────────────────────────────────────────────────────────

import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const REQUEST_TIMEOUT_MS = 240_000;
const REPORT_DIR = path.resolve(process.cwd(), "reports");

// ── CLI args ─────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { runs: 3, scenarios: null, list: false, delayMs: 1500 };
  for (const raw of argv) {
    if (raw === "--list") args.list = true;
    else if (raw.startsWith("--runs=")) args.runs = Number(raw.slice(7));
    else if (raw.startsWith("--delay=")) args.delayMs = Number(raw.slice(8));
    else if (raw.startsWith("--scenario=")) {
      args.scenarios = raw.slice(11).split(",").map((s) => s.trim()).filter(Boolean);
    }
  }
  if (!Number.isFinite(args.runs) || args.runs < 1) {
    throw new Error("--runs must be a positive integer");
  }
  return args;
}

// ── .env.local ───────────────────────────────────────────────────────────────

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

// ── Stats ────────────────────────────────────────────────────────────────────

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const rank = (p / 100) * (sorted.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  if (low === high) return sorted[low];
  return sorted[low] + (sorted[high] - sorted[low]) * (rank - low);
}

function summarize(values) {
  const clean = values.filter((v) => typeof v === "number" && Number.isFinite(v));
  if (clean.length === 0) return null;
  const sorted = [...clean].sort((a, b) => a - b);
  return {
    n: sorted.length,
    min: Math.round(sorted[0]),
    p50: Math.round(percentile(sorted, 50)),
    p90: Math.round(percentile(sorted, 90)),
    max: Math.round(sorted[sorted.length - 1]),
  };
}

function fmtMs(ms) {
  if (ms == null) return "—";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

// ── Project fixture loading ──────────────────────────────────────────────────

function activeData(elements, elementId) {
  const slot = elements?.[elementId];
  if (!slot?.variations?.length) return undefined;
  const active = slot.variations.find((v) => v.id === slot.activeVariationId)
    ?? slot.variations[0];
  return active?.data;
}

async function loadFixture(call, projectId) {
  const res = await call(`load-project?projectId=${encodeURIComponent(projectId)}`, null, "GET");
  const data = res.body?.data;
  if (!data) throw new Error(`load-project returned no data (status ${res.status})`);

  const brief = data.brandBrief?.current ?? {};
  const elements = data.elements ?? {};
  const visualConcept = activeData(elements, "visual-concept");
  const colorPalette = activeData(elements, "color-palette");
  const font = activeData(elements, "font");
  const logoUrl = activeData(elements, "logo")?.imageUrl;
  const artStyleUrl = activeData(elements, "art-style")?.imageUrl;
  const snapshotUrl = data.snapshots?.[0]?.imageUrl;

  return {
    brandName: brief.name || "BrandBrew",
    tagline: brief.tagline || "",
    description: brief.description || "A modern specialty coffee brand.",
    targetAudience: brief.targetAudience || "Urban professionals",
    keywords: Array.isArray(brief.keywords) && brief.keywords.length
      ? brief.keywords
      : ["warm", "crafted", "modern"],
    applications: Array.isArray(brief.applications) && brief.applications.length
      ? brief.applications
      : ["Business Card", "Packaging", "Website Hero", "Tote Bag"],
    visualConcept: visualConcept ?? {
      concept: "Slow Morning Ritual",
      description: "Warm, unhurried mornings expressed through soft light and hand-crafted texture.",
    },
    colorPalette: Array.isArray(colorPalette) && colorPalette.length
      ? colorPalette
      : ["#2F1B12", "#C67B4A", "#E8D5C0", "#F5EFE7", "#1A1A1A"],
    font: font ?? { titleFont: "Playfair Display", bodyFont: "Inter" },
    logoUrl,
    artStyleUrl,
    snapshotUrl,
  };
}

// ── Scenarios ────────────────────────────────────────────────────────────────
// `stage` groups scenarios by their role in the perceived critical path.

function buildScenarios(fx) {
  const brandContext = {
    name: fx.brandName,
    tagline: fx.tagline,
    description: fx.description,
    targetAudience: fx.targetAudience,
    keywords: fx.keywords,
    visualConcept: fx.visualConcept,
    colorPalette: fx.colorPalette,
    font: fx.font,
  };

  return [
    {
      id: "visual-concept",
      stage: "pipeline text 1/2",
      route: "strategist/generate-visual-concept",
      note: "Pipeline stage 1 — pure wait before any pixel exists",
      body: {
        brandContext,
        brandName: fx.brandName,
        description: fx.description,
        targetAudience: fx.targetAudience,
        keywords: fx.keywords,
      },
    },
    {
      id: "palette-fonts",
      stage: "pipeline text 2/2",
      route: "art-director/design-palette-fonts",
      note: "Pipeline stage 2 — pure wait before any pixel exists",
      body: {
        brandContext,
        brandName: fx.brandName,
        description: fx.description,
        keywords: fx.keywords,
        visualConcept: fx.visualConcept,
      },
    },
    {
      id: "logo-single",
      stage: "image",
      route: "art-director/generate",
      note: "single logo, txt2img — flash-only baseline (logo is not a PRO_CARD_TYPE)",
      body: {
        cardType: "logo",
        brandContext,
        brandName: fx.brandName,
        keywords: fx.keywords,
        visualConcept: fx.visualConcept,
        colorPalette: fx.colorPalette,
      },
    },
    {
      id: "art-style-single",
      stage: "image",
      route: "art-director/generate",
      note: "single art-style, txt2img — hits the pro-first waterfall when ENABLE_PRO=true",
      body: {
        cardType: "art-style",
        brandContext,
        brandName: fx.brandName,
        keywords: fx.keywords,
        visualConcept: fx.visualConcept,
        colorPalette: fx.colorPalette,
      },
    },
    {
      id: "logo-split",
      stage: "image",
      route: "art-director/design-logo",
      note: "logo alone (flash) — what the pipeline now waits for instead of the combined response",
      body: {
        brandContext,
        brandName: fx.brandName,
        description: fx.description,
        keywords: fx.keywords,
        visualConcept: fx.visualConcept,
        colorPalette: fx.colorPalette,
        font: fx.font,
      },
    },
    {
      id: "art-style-split",
      stage: "image",
      route: "art-director/design-art-style",
      note: "art style alone (pro, pinned) — runs in parallel with logo-split",
      body: {
        brandContext,
        brandName: fx.brandName,
        description: fx.description,
        keywords: fx.keywords,
        visualConcept: fx.visualConcept,
        colorPalette: fx.colorPalette,
        font: fx.font,
      },
    },
    {
      id: "snapshot",
      stage: "image",
      route: "visual-designer/visual-snapshot",
      note: "multi-reference generation — reveals serial reference fetching",
      skipIf: () => (!fx.logoUrl && !fx.artStyleUrl)
        && "no logo/art-style image available (run the logo-split / art-style-split scenarios first)",
      body: () => ({
        cardType: "visual-snapshot",
        brandName: fx.brandName,
        brandContextShort: {
          name: fx.brandName,
          keywords: fx.keywords,
          visualConcept: fx.visualConcept,
          colorPalette: fx.colorPalette,
          titleFont: fx.font.titleFont,
          bodyFont: fx.font.bodyFont,
        },
        referenceImageUrls: [fx.logoUrl, fx.artStyleUrl].filter(Boolean),
        referenceImageRoles: ["logo", "art-style"]
          .filter((_, i) => [fx.logoUrl, fx.artStyleUrl][i]),
        prompt: "",
      }),
    },
    {
      id: "context",
      stage: "image",
      route: "visual-designer/context",
      note: "one Brand in Context mockup",
      body: () => ({
        application: fx.applications[0],
        brandName: fx.brandName,
        brandDescription: fx.description,
        ...(fx.snapshotUrl ? { referenceImageUrls: [fx.snapshotUrl] } : {}),
      }),
    },
  ];
}

/**
 * Feed generated images back into the fixture so later scenarios have real
 * reference images even when the saved project has none.
 */
function absorbGeneratedUrls(fixture, responseBody) {
  if (!responseBody || typeof responseBody !== "object") return;
  const { imageUrl, logoImageUrl, artStyleImageUrl, _meta } = responseBody;
  if (logoImageUrl) fixture.logoUrl = logoImageUrl;
  if (artStyleImageUrl) fixture.artStyleUrl = artStyleImageUrl;
  if (imageUrl && _meta?.agent === "visual-designer-visual-snapshot") {
    fixture.snapshotUrl = imageUrl;
  }
  if (imageUrl && _meta?.agent === "art-director" && !logoImageUrl && !artStyleImageUrl) {
    // /generate returns a bare imageUrl; infer the slot from the prompt context.
    const label = _meta?.selectedElementLabels ?? [];
    if (!fixture.logoUrl && label.length) fixture.logoUrl = imageUrl;
  }
}

// ── Span aggregation ─────────────────────────────────────────────────────────

function collectSpanStats(runs) {
  const byLabel = new Map();
  for (const run of runs) {
    for (const span of run.timings?.spans ?? []) {
      if (!byLabel.has(span.label)) byLabel.set(span.label, []);
      byLabel.get(span.label).push(span.ms);
    }
  }
  const out = {};
  for (const [label, values] of byLabel) {
    out[label] = summarize(values);
  }
  return out;
}

/**
 * Time inside the route that no span accounts for. A large value means the
 * instrumentation is missing a stage; a large `blockedMs` on a branch means
 * that branch finished early and then waited.
 */
function computeGaps(timings) {
  if (!timings?.spans?.length) return null;
  const top = timings.spans.filter((s) => !s.label.includes("."));
  const covered = top.length ? top : timings.spans;
  let cursor = 0;
  let uncovered = 0;
  for (const span of [...covered].sort((a, b) => a.startMs - b.startMs)) {
    if (span.startMs > cursor) uncovered += span.startMs - cursor;
    cursor = Math.max(cursor, span.startMs + span.ms);
  }
  if (timings.totalMs > cursor) uncovered += timings.totalMs - cursor;
  return uncovered;
}

// ── Main ─────────────────────────────────────────────────────────────────────

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

  let projectId = "default";
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

  const fixture = await loadFixture(call, projectId);
  const allScenarios = buildScenarios(fixture);

  if (args.list) {
    console.log("Available scenarios:\n");
    for (const s of allScenarios) {
      console.log(`  ${s.id.padEnd(16)} ${s.route}`);
      console.log(`  ${" ".repeat(16)} ${s.note}\n`);
    }
    await supabase.auth.signOut();
    return;
  }

  const selected = args.scenarios
    ? allScenarios.filter((s) => args.scenarios.includes(s.id))
    : allScenarios;
  if (selected.length === 0) {
    throw new Error(`No scenario matched. Known ids: ${allScenarios.map((s) => s.id).join(", ")}`);
  }

  console.log(`Endpoint : ${baseUrl}`);
  console.log(`Project  : ${projectId}`);
  console.log(`Fixture  : brand="${fixture.brandName}" logo=${!!fixture.logoUrl} artStyle=${!!fixture.artStyleUrl} snapshot=${!!fixture.snapshotUrl}`);
  console.log(`Runs     : ${args.runs} per scenario, serial`);
  console.log(`Scenarios: ${selected.map((s) => s.id).join(", ")}\n`);

  const results = [];

  for (const scenario of selected) {
    const skipReason = scenario.skipIf?.();
    if (skipReason) {
      console.log(`SKIP ${scenario.id} — ${skipReason}\n`);
      results.push({ scenario: scenario.id, route: scenario.route, skipped: skipReason, runs: [] });
      continue;
    }

    console.log(`── ${scenario.id} (${scenario.route})`);
    const runs = [];

    for (let i = 0; i < args.runs; i++) {
      const requestBody = typeof scenario.body === "function" ? scenario.body() : scenario.body;
      const res = await call(scenario.route, requestBody);
      absorbGeneratedUrls(fixture, res.body);
      const meta = res.body?._meta;
      const timings = meta?.timings ?? null;
      const serverMs = timings?.totalMs ?? meta?.generationTime ?? null;
      const overheadMs = serverMs != null ? res.clientMs - serverMs : null;

      const run = {
        run: i + 1,
        ok: res.ok,
        status: res.status,
        clientMs: res.clientMs,
        serverMs,
        overheadMs,
        model: meta?.model ?? null,
        timings,
        gapMs: computeGaps(timings),
        ...(res.ok ? {} : { error: res.body?.error ?? res.body?.warning ?? "unknown" }),
        ...(res.body?.warning ? { warning: res.body.warning } : {}),
      };
      runs.push(run);

      const flag = res.ok ? "ok  " : "FAIL";
      console.log(
        `   ${flag} run ${i + 1}/${args.runs}  client=${fmtMs(res.clientMs)}  server=${fmtMs(serverMs)}  overhead=${fmtMs(overheadMs)}`
        + (run.error ? `  ${String(run.error).slice(0, 120)}` : ""),
      );

      if (i < args.runs - 1 && args.delayMs > 0) {
        await new Promise((r) => setTimeout(r, args.delayMs));
      }
    }

    const okRuns = runs.filter((r) => r.ok);
    const summary = {
      client: summarize(runs.map((r) => r.clientMs)),
      server: summarize(okRuns.map((r) => r.serverMs)),
      overhead: summarize(okRuns.map((r) => r.overheadMs)),
      spans: collectSpanStats(okRuns),
      successRate: runs.length ? okRuns.length / runs.length : 0,
    };

    results.push({
      scenario: scenario.id,
      stage: scenario.stage,
      route: scenario.route,
      note: scenario.note,
      runs,
      summary,
    });

    if (summary.client) {
      console.log(
        `   → client p50=${fmtMs(summary.client.p50)} p90=${fmtMs(summary.client.p90)}`
        + `  server p50=${fmtMs(summary.server?.p50)}`
        + `  overhead p50=${fmtMs(summary.overhead?.p50)}`
        + `  success=${(summary.successRate * 100).toFixed(0)}%`,
      );
    }
    console.log();
  }

  printBreakdown(results);

  const report = {
    generatedAt: new Date().toISOString(),
    endpoint: baseUrl,
    projectId,
    runsPerScenario: args.runs,
    fixture: {
      brandName: fixture.brandName,
      hasLogo: !!fixture.logoUrl,
      hasArtStyle: !!fixture.artStyleUrl,
      hasSnapshot: !!fixture.snapshotUrl,
      applications: fixture.applications,
    },
    results,
  };
  await mkdir(REPORT_DIR, { recursive: true });
  const outPath = path.join(REPORT_DIR, `bench-image-gen-${Date.now()}.json`);
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Raw report: ${path.relative(process.cwd(), outPath)}`);

  await supabase.auth.signOut();
}

function printBreakdown(results) {
  console.log("═".repeat(78));
  console.log("STAGE BREAKDOWN (p50 unless noted)");
  console.log("═".repeat(78));

  for (const r of results) {
    if (r.skipped) {
      console.log(`\n${r.scenario}: SKIPPED (${r.skipped})`);
      continue;
    }
    if (!r.summary?.client) continue;

    console.log(`\n${r.scenario}  [${r.stage}]  ${r.route}`);
    console.log(
      `  end-to-end   p50=${fmtMs(r.summary.client.p50)}  p90=${fmtMs(r.summary.client.p90)}  max=${fmtMs(r.summary.client.max)}`,
    );
    console.log(
      `  server-side  p50=${fmtMs(r.summary.server?.p50)}   network+platform overhead p50=${fmtMs(r.summary.overhead?.p50)}`,
    );

    const spanEntries = Object.entries(r.summary.spans)
      .filter(([, v]) => v)
      .sort((a, b) => b[1].p50 - a[1].p50);

    if (spanEntries.length) {
      const serverP50 = r.summary.server?.p50 || 1;
      console.log("  spans:");
      for (const [label, stat] of spanEntries) {
        const share = ((stat.p50 / serverP50) * 100).toFixed(0);
        const bar = "█".repeat(Math.max(0, Math.min(28, Math.round(stat.p50 / serverP50 * 28))));
        console.log(
          `    ${label.padEnd(40)} ${fmtMs(stat.p50).padStart(7)} ${String(share).padStart(3)}%  ${bar}`,
        );
      }
    }

    const gaps = summarize(r.runs.map((run) => run.gapMs));
    if (gaps && gaps.p50 > 200) {
      console.log(`  unaccounted (no span covers it): p50=${fmtMs(gaps.p50)}`);
    }
  }
  console.log(`\n${"═".repeat(78)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
