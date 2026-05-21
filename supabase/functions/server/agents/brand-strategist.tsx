// ─────────────────────────────────────────────────────────────────────────────
// agents/brand-strategist.tsx — Brand Strategist Agent
//
// Persona:  Professional brand strategist focused on verbal identity,
//           positioning, and brand architecture.
// Scope:    All text-to-text operations — brand generation, card variations,
//           text-card merges, and direction rationale writing.
// Model:    Gemini text model (gemini-3-flash-preview)
// ─────────────────────────────────────────────────────────────────────────────

import { Hono } from "npm:hono";
import { callGeminiText, callGeminiTextWithImages, fetchImageAsBase64, TEXT_MODEL, safeParseJson } from "../shared/gemini.tsx";
import {
  AUTO_ENHANCE_TASK_DESCRIPTION,
  AUTO_FILL_TASK_DESCRIPTION,
  BRAND_GENERATION_TASK_DESCRIPTION,
  CARD_VARIATION_TASK_DESCRIPTIONS,
  PERSONA_STRATEGIST,
  TEMPERATURES,
  buildVisualConceptTaskDescription,
  pickCreativeDirectionSeed,
  buildAutoCompleteTaskDescription,
  buildDirectionTaskDescription,
  buildPrompt,
  getStrategistRules,
} from "../shared/strategist-prompts.ts";
import {
  buildFullContextText,
  normalizeFullContext,
} from "../shared/brand-context.ts";

const strategist = new Hono();

function hasFullContext(body: unknown): boolean {
  return !!(
    body &&
    typeof body === "object" &&
    "brandContext" in body &&
    body.brandContext &&
    typeof body.brandContext === "object"
  );
}

const AUTO_FILL_FIELD_SPECS: Record<string, { jsonShape: string; rules: string; enhanceRules?: string }> = {
  name: {
    jsonShape: '{ "value": "Brand name here" }',
    rules: "Generate a 1–3 word evocative brand name that reflects the brand's positioning and personality.",
    enhanceRules: "The field has existing content (shown below). Generate a single improved brand name that builds on the existing name's spirit but explores a different direction — vary tone, style, or linguistic approach. Must be 2–3 words. Do NOT keep the existing value as-is.",
  },
  tagline: {
    jsonShape: '{ "value": "Tagline here" }',
    rules: "Generate a punchy up-to-8 words tagline that captures the brand's core promise.",
    enhanceRules: "The field has existing content (shown below). Generate a single improved tagline that improves or reinterprets the existing one — vary rhythm, emotional angle, or emphasis. Must be punchy 5–8 words. Do NOT keep the existing value as-is.",
  },
  description: {
    jsonShape: '{ "value": "Description here" }',
    rules: "Write 2–3 sentences covering the brand's essence, positioning, and values.",
    enhanceRules: "The field has existing content (shown below). Rewrite and improve it: preserve the core intent but make it more polished, specific, and evocative. Keep it 2–3 sentences. You may restructure, refine wording, or add nuance — do NOT keep it exactly as-is.",
  },
  targetAudience: {
    jsonShape: '{ "value": "Target audience here" }',
    rules: "Write one clear sentence describing the primary target audience.",
    enhanceRules: "The field has existing content (shown below). Rewrite it to be more specific and vivid — add demographic, psychographic, or behavioral detail that makes the audience clearer. Keep it to one concise sentence. Do NOT keep it exactly as-is.",
  },
  keywords: {
    jsonShape: '{ "value": ["word1", "word2", "word3"] }',
    rules: "Generate 3–5 evocative single words or very short phrases that capture core brand attributes.",
    enhanceRules: "The field already has keywords (shown below). Generate exactly 3 NEW keywords that are complementary but distinct from the existing ones — explore different brand facets, emotions, or associations. Do NOT repeat any existing keyword.",
  },
  applications: {
    jsonShape: '{ "value": ["App 1", "App 2", "App 3"] }',
    rules: `Generate 3 brand touchpoint mockup ideas relevant to this brand's industry and audience. Each item must be 1–3 words, no adjective prefix (e.g. "Coffee Sleeve", "Loyalty Card", "Menu Board", "Tote Bag"). Be context-specific — never use generic placeholders.`,
    enhanceRules: `The field already has applications (shown below). Generate exactly 3 NEW brand touchpoint ideas that differ from the existing ones — explore other surfaces, formats, or contexts relevant to this brand. Each item must be 1–3 words, no adjective prefix. Do NOT repeat any existing application.`,
  },
};

// ── Input length limits ───────────────────────────────────────────────────────
const MAX_USER_PROMPT_LEN = 2000;
const MAX_BRIEF_FIELD_LEN = 500;
const MAX_EXISTING_VALUE_LEN = 500;

function buildVisualConceptErrorResponse(err: unknown): {
  status: 429 | 500;
  body: { error: string; code?: string; provider?: string; details?: string };
} {
  const details = err instanceof Error ? err.message : String(err);
  const isGeminiQuotaError =
    /Gemini(?:\s+\w+)? API error \(HTTP 429\)|\(code:\s*429\)|monthly spending cap|quota|rate limit|RESOURCE_EXHAUSTED/i.test(details);

  if (isGeminiQuotaError) {
    return {
      status: 429,
      body: {
        error: "Visual concept generation failed: Gemini quota or spending cap reached",
        code: "UPSTREAM_QUOTA_EXCEEDED",
        provider: "gemini",
        details,
      },
    };
  }

  return {
    status: 500,
    body: {
      error: `Visual concept generation failed: ${details}`,
    },
  };
}


// ── Route: POST /generate-visual-concept ─────────────────────────────────────

strategist.post("/generate-visual-concept", async (c) => {
  let _rawGeminiText: string | undefined;
  try {
    const startTime = Date.now();
    const body = await c.req.json();
    if (!hasFullContext(body)) {
      return c.json({ error: "brandContext is required" }, 400);
    }
    const { _promptOverride, existingConcepts } = body;
    const fullContext = normalizeFullContext(body);
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return c.json({ error: "GEMINI_API_KEY not configured" }, 500);

    const briefContext = buildFullContextText(fullContext);

    const existingConceptsList: Array<{ concept: string; description?: string }> =
      Array.isArray(existingConcepts) ? existingConcepts : [];

    const extraBlocks: string[] = [];

    if (existingConceptsList.length > 0) {
      extraBlocks.push(
        `Already generated concepts (you MUST NOT repeat, paraphrase, or closely resemble ANY of these — explore a COMPLETELY DIFFERENT metaphorical direction, mood, and aesthetic territory):\n${existingConceptsList.map((ec: { concept: string; description?: string }, i: number) => `${i + 1}. "${ec.concept}"${ec.description ? ` — ${ec.description}` : ""}`).join("\n")}`,
      );
    }

    const directionSeed = pickCreativeDirectionSeed(existingConceptsList.length);
    if (directionSeed) {
      extraBlocks.push(`Creative direction hint (use as a starting point, not a constraint):\n${directionSeed}`);
    }

    const persona = _promptOverride?.persona ?? PERSONA_STRATEGIST;
    const taskPrompt = _promptOverride?.taskPrompt ?? buildVisualConceptTaskDescription(existingConceptsList.length);
    const fullPrompt = _promptOverride?.fullPrompt ??
      buildPrompt({
        persona,
        taskDescription: taskPrompt,
        contextBody: briefContext || "A creative brand.",
        rules: getStrategistRules("generate-visual-concept"),
        extraBlocks: extraBlocks.length > 0 ? extraBlocks : [],
      });

    _rawGeminiText = await callGeminiText(apiKey, fullPrompt, { temperature: TEMPERATURES["generate-visual-concept"] });
    const result = safeParseJson<{ visualConcept: { concept: string; description: string } }>(_rawGeminiText, "generate-visual-concept");
    const generationTime = Date.now() - startTime;
    console.log(`[strategist] Visual concept generated (${generationTime}ms)`);

    return c.json({
      visualConcept: result.visualConcept,
      _meta: {
        agent: "brand-strategist",
        ...(Deno.env.get("ENABLE_DEV_ROUTES") === "true" && { prompt: fullPrompt }),
        model: TEXT_MODEL,
        generationTime,
        contextMode: "full",
        ingredients: [fullContext.name, ...(fullContext.keywords ?? [])].filter(Boolean),
      },
    });
  } catch (err) {
    const isDev = Deno.env.get("ENABLE_DEV_ROUTES") === "true";
    console.error("[strategist] generate-visual-concept error:", (err as Error)?.stack ?? String(err));
    const response = buildVisualConceptErrorResponse(err);
    return c.json({
      ...response.body,
      ...(isDev && _rawGeminiText !== undefined && { _debug: { rawText: _rawGeminiText.slice(0, 500) } }),
    }, response.status);
  }
});

// ── Route: POST /generate-brand ──────────────────────────────────────────────

strategist.post("/generate-brand", async (c) => {
  let _rawGeminiText: string | undefined;
  try {
    const startTime = Date.now();
    const { userPrompt } = await c.req.json();
    if (!userPrompt || typeof userPrompt !== "string")
      return c.json({ error: "userPrompt is required" }, 400);
    if (userPrompt.length > MAX_USER_PROMPT_LEN)
      return c.json({ error: `userPrompt exceeds maximum length of ${MAX_USER_PROMPT_LEN} characters` }, 400);

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return c.json({ error: "GEMINI_API_KEY not configured" }, 500);

    const fullPrompt = buildPrompt({
      persona: PERSONA_STRATEGIST,
      taskDescription: BRAND_GENERATION_TASK_DESCRIPTION,
      contextBody: `"${userPrompt}"`,
      rules: getStrategistRules("generate-brand"),
    });

    _rawGeminiText = await callGeminiText(apiKey, fullPrompt, { temperature: TEMPERATURES["generate-brand"] });
    const brandData = safeParseJson<Record<string, unknown>>(_rawGeminiText, "generate-brand");
    const generationTime = Date.now() - startTime;
    console.log(`[strategist] Brand generated: ${(brandData as any)?.brandBrief?.name} (${generationTime}ms)`);

    return c.json({
      ...brandData,
      _meta: {
        agent: "brand-strategist",
        ...(Deno.env.get("ENABLE_DEV_ROUTES") === "true" && { prompt: fullPrompt }),
        model: TEXT_MODEL,
        generationTime,
        userInput: userPrompt,
        ingredients: [],
      },
    });
  } catch (err) {
    const isDev = Deno.env.get("ENABLE_DEV_ROUTES") === "true";
    console.error("[strategist] generate-brand error:", (err as Error)?.stack ?? String(err));
    return c.json({
      error: `Brand generation failed: ${String(err)}`,
      ...(isDev && _rawGeminiText !== undefined && { _debug: { rawText: _rawGeminiText.slice(0, 500) } }),
    }, 500);
  }
});

// ── Route: POST /auto-complete ───────────────────────────────────────────────
// Batch-fill all empty fields in the Brand Summary while preserving user values.
strategist.post("/auto-complete", async (c) => {
  let _rawGeminiText: string | undefined;
  try {
    const startTime = Date.now();
    const body = await c.req.json();
    const {
      partialBrief = {},
      targetAudience = "",
      keywords: keywordsInput = "",
      applications: applicationsInput,
    } = body;
    const { name = "", tagline = "", description = "" } = partialBrief;
    for (const [field, val] of [["name", name], ["tagline", tagline], ["description", description], ["targetAudience", targetAudience]] as [string, string][]) {
      if (typeof val === "string" && val.length > MAX_BRIEF_FIELD_LEN)
        return c.json({ error: `${field} exceeds maximum length of ${MAX_BRIEF_FIELD_LEN} characters` }, 400);
    }

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return c.json({ error: "GEMINI_API_KEY not configured" }, 500);

    const apps = Array.isArray(applicationsInput) ? applicationsInput : [];
    let applicationsInstruction: string;
    if (apps.length >= 4) {
      applicationsInstruction = `Return the provided applications exactly as-is, no changes.`;
    } else if (apps.length > 0) {
      const needed = 4 - apps.length;
      applicationsInstruction = `Keep the existing ${apps.length} items and generate ${needed} new ones (different from existing) to reach exactly 4 total. Each new item must be 1–3 words — just the touchpoint name.`;
    } else {
      applicationsInstruction = `Generate exactly 4 brand touchpoint mockup ideas relevant to this brand's industry, product type, and audience (e.g. "Coffee Sleeve", "Loyalty Card", "Menu Board", "Take-Away Cup"). Each item must be 1–3 words, no adjective prefix.`;
    }

    const context = [
      name && `Brand name (keep exactly): "${name}"`,
      tagline && `Tagline (keep exactly): "${tagline}"`,
      description && `Description (keep exactly): "${description}"`,
      targetAudience && `Target audience (keep exactly): "${targetAudience}"`,
      keywordsInput && `Keywords (keep or normalize): "${typeof keywordsInput === "string" ? keywordsInput : (keywordsInput || []).join(", ")}"`,
      apps.length > 0 ? `Applications: ${JSON.stringify(apps)}` : null,
    ].filter(Boolean).join("\n");

    const fullPrompt = buildPrompt({
      persona: PERSONA_STRATEGIST,
      taskDescription: buildAutoCompleteTaskDescription(applicationsInstruction),
      contextBody: context || "All fields empty — generate a complete brief.",
      rules: getStrategistRules("auto-complete"),
    });

    _rawGeminiText = await callGeminiText(apiKey, fullPrompt, { temperature: TEMPERATURES["auto-complete"] });
    const out = safeParseJson<Record<string, unknown>>(_rawGeminiText, "auto-complete");
    const generationTime = Date.now() - startTime;
    console.log(`[strategist] Auto-complete done (${generationTime}ms)`);

    return c.json({
      brandBrief: (out.brandBrief as any) ?? { name: "", tagline: "", description: "" },
      targetAudience: (out.targetAudience as string) ?? "",
      keywords: Array.isArray(out.keywords) ? out.keywords : (out.keywords ? [out.keywords] : []),
      applications: Array.isArray(out.applications) ? out.applications : [],
      _meta: { agent: "brand-strategist", model: TEXT_MODEL, generationTime, ...(Deno.env.get("ENABLE_DEV_ROUTES") === "true" && { prompt: fullPrompt }) },
    });
  } catch (err) {
    const isDev = Deno.env.get("ENABLE_DEV_ROUTES") === "true";
    console.error("[strategist] auto-complete error:", (err as Error)?.stack ?? String(err));
    return c.json({
      error: `Auto-complete failed: ${String(err)}`,
      ...(isDev && _rawGeminiText !== undefined && { _debug: { rawText: _rawGeminiText.slice(0, 500) } }),
    }, 500);
  }
});

// ── Route: POST /auto-fill ──────────────────────────────────────────────────
// Generate or refine a single Brand Brief field.
strategist.post("/auto-fill", async (c) => {
  let _rawGeminiText: string | undefined;
  try {
    const startTime = Date.now();
    const body = await c.req.json();
    const { targetField, existingValue, mode, brandBrief = {} } = body;
    if (typeof existingValue === "string" && existingValue.length > MAX_EXISTING_VALUE_LEN)
      return c.json({ error: `existingValue exceeds maximum length of ${MAX_EXISTING_VALUE_LEN} characters` }, 400);

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return c.json({ error: "GEMINI_API_KEY not configured" }, 500);

    if (!targetField || !AUTO_FILL_FIELD_SPECS[targetField]) {
      return c.json({ error: `Unknown target field: ${targetField}` }, 400);
    }

    const spec = AUTO_FILL_FIELD_SPECS[targetField];
    const isEnhance = mode === "enhance" && !!existingValue;
    const { name, tagline, description, targetAudience, keywords, applications } = brandBrief;

    const contextLines = [
      name && `Brand name: "${name}"`,
      tagline && `Tagline: "${tagline}"`,
      description && `Description: ${description}`,
      targetAudience && `Target audience: ${targetAudience}`,
      keywords && `Keywords: ${typeof keywords === "string" ? keywords : (keywords || []).join(", ")}`,
      Array.isArray(applications) && applications.length > 0
        ? `Applications: ${applications.join(", ")}`
        : null,
    ].filter(Boolean).join("\n");

    const activeRules = isEnhance && spec.enhanceRules ? spec.enhanceRules : spec.rules;

    const basePrompt = isEnhance ? AUTO_ENHANCE_TASK_DESCRIPTION : AUTO_FILL_TASK_DESCRIPTION;

    const fullPrompt = buildPrompt({
      persona: PERSONA_STRATEGIST,
      taskDescription: `${basePrompt}

Target field: "${targetField}"
Return JSON shape: ${spec.jsonShape}
Rules: ${activeRules}`,
      contextBody: contextLines || "No context provided — generate freely.",
      extraBlocks: existingValue ? [`Existing field content:\n"${existingValue}"`] : [],
      rules: getStrategistRules("auto-fill"),
    });

    _rawGeminiText = await callGeminiText(apiKey, fullPrompt, { temperature: TEMPERATURES["auto-fill"] });
    const out = safeParseJson<{ value: unknown }>(_rawGeminiText, "auto-fill");
    const generationTime = Date.now() - startTime;
    console.log(`[strategist] Auto-fill done: ${targetField} mode=${mode ?? "fill"} (${generationTime}ms)`);

    return c.json({
      targetField,
      value: out.value,
      _meta: { agent: "brand-strategist", model: TEXT_MODEL, generationTime, ...(Deno.env.get("ENABLE_DEV_ROUTES") === "true" && { prompt: fullPrompt }) },
    });
  } catch (err) {
    const isDev = Deno.env.get("ENABLE_DEV_ROUTES") === "true";
    console.error("[strategist] auto-fill error:", (err as Error)?.stack ?? String(err));
    return c.json({
      error: `Auto-fill failed: ${String(err)}`,
      ...(isDev && _rawGeminiText !== undefined && { _debug: { rawText: _rawGeminiText.slice(0, 500) } }),
    }, 500);
  }
});

// ── Route: POST /variation ───────────────────────────────────────────────────

strategist.post("/variation", async (c) => {
  let _rawGeminiText: string | undefined;
  try {
    const startTime = Date.now();
    const body = await c.req.json();
    if (!hasFullContext(body)) {
      return c.json({ error: "brandContext is required" }, 400);
    }
    const { cardType, brandBrief } = body;
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return c.json({ error: "GEMINI_API_KEY not configured" }, 500);

    const fullContext = normalizeFullContext(body);
    const existingContent = brandBrief?.existingContent;
    const summary = buildFullContextText(fullContext);

    const taskPrompt = CARD_VARIATION_TASK_DESCRIPTIONS[cardType];
    if (!taskPrompt) return c.json({ error: `Unknown card type: ${cardType}` }, 400);

    const existingBlock = existingContent
      ? `\n\nCurrent card content (DO NOT repeat or closely paraphrase this — the new variation must be meaningfully different):\n${JSON.stringify(existingContent, null, 2)}`
      : "";

    const fullPrompt = buildPrompt({
      persona: PERSONA_STRATEGIST,
      taskDescription: taskPrompt,
      contextBody: summary || "No brand context provided.",
      extraBlocks: existingBlock ? [existingBlock] : [],
      rules: getStrategistRules("variation", { cardType }),
    });

    _rawGeminiText = await callGeminiText(apiKey, fullPrompt, { temperature: TEMPERATURES["variation"] });
    const variation = safeParseJson<Record<string, unknown>>(_rawGeminiText, "variation");
    const generationTime = Date.now() - startTime;
    console.log(`[strategist] Variation generated: ${cardType} (${generationTime}ms)`);

    return c.json({
      ...variation,
      _meta: {
        agent: "brand-strategist",
        ...(Deno.env.get("ENABLE_DEV_ROUTES") === "true" && { prompt: fullPrompt }),
        model: TEXT_MODEL,
        generationTime,
        contextMode: "full",
        ingredients: [...(fullContext.keywords ?? [])].filter(Boolean),
      },
    });
  } catch (err) {
    const isDev = Deno.env.get("ENABLE_DEV_ROUTES") === "true";
    console.error("[strategist] variation error:", (err as Error)?.stack ?? String(err));
    return c.json({
      error: `Variation generation failed: ${String(err)}`,
      ...(isDev && _rawGeminiText !== undefined && { _debug: { rawText: _rawGeminiText.slice(0, 500) } }),
    }, 500);
  }
});

// ── Route: POST /direction ───────────────────────────────────────────────────

strategist.post("/direction", async (c) => {
  let _rawGeminiText: string | undefined;
  try {
    const startTime = Date.now();
    const body = await c.req.json();
    const brandData =
      body && typeof body === "object" && "brandData" in body && body.brandData && typeof body.brandData === "object"
        ? body.brandData as Record<string, unknown>
        : {};
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return c.json({ error: "GEMINI_API_KEY not configured" }, 500);

    const fullContext = normalizeFullContext({ brandContext: brandData });
    const hasVisualConcept = !!(fullContext.visualConcept?.concept);
    const brandPayload = JSON.stringify({
      name: fullContext.name,
      tagline: fullContext.tagline,
      keywords: fullContext.keywords,
      description: fullContext.description,
      targetAudience: fullContext.targetAudience,
      applications: fullContext.applications,
      colorPalette: fullContext.colorPalette,
      visualConcept: fullContext.visualConcept,
      font: fullContext.font,
      artStyleImageUrl: fullContext.artStyleImageUrl,
      logoImageUrl: fullContext.logoImageUrl,
    }, null, 2);

    const fullPrompt = buildPrompt({
      persona: PERSONA_STRATEGIST,
      taskDescription: buildDirectionTaskDescription(hasVisualConcept),
      contextBody: brandPayload,
      rules: getStrategistRules("direction"),
    });

    // Fetch logo and art style images to pass to the model as visual context.
    // Failures are non-fatal — fall back to text-only generation.
    const logoImageUrl = fullContext.logoImageUrl;
    const artStyleImageUrl = fullContext.artStyleImageUrl;

    const imageResults = await Promise.all([
      logoImageUrl ? fetchImageAsBase64(logoImageUrl) : Promise.resolve(null),
      artStyleImageUrl ? fetchImageAsBase64(artStyleImageUrl) : Promise.resolve(null),
    ]);

    const images: Array<{ b64: string; mimeType: string }> = [];
    for (const result of imageResults) {
      if (result && !("error" in result)) {
        images.push({ b64: result.b64, mimeType: result.mimeType });
      } else if (result && "error" in result) {
        console.log(`[strategist] Image fetch skipped: ${result.error}`);
      }
    }

    if (images.length > 0) {
      console.log(`[strategist] Generating direction with ${images.length} image(s) attached`);
      _rawGeminiText = await callGeminiTextWithImages(apiKey, fullPrompt, images, { temperature: TEMPERATURES["direction"] });
    } else {
      console.log("[strategist] Generating direction (text-only fallback)");
      _rawGeminiText = await callGeminiText(apiKey, fullPrompt, { temperature: TEMPERATURES["direction"] });
    }

    const direction = safeParseJson<Record<string, unknown>>(_rawGeminiText, "direction");
    const generationTime = Date.now() - startTime;
    console.log(`[strategist] Direction generated: ${fullContext.name ?? "unknown"} (${generationTime}ms, images: ${images.length})`);

    return c.json({
      ...direction,
      _meta: {
        agent: "brand-strategist",
        model: TEXT_MODEL,
        generationTime,
        imageCount: images.length,
        contextMode: "full",
      },
    });
  } catch (err) {
    const isDev = Deno.env.get("ENABLE_DEV_ROUTES") === "true";
    console.error("[strategist] direction error:", (err as Error)?.stack ?? String(err));
    return c.json({
      error: `Direction generation failed: ${String(err)}`,
      ...(isDev && _rawGeminiText !== undefined && { _debug: { rawText: _rawGeminiText.slice(0, 500) } }),
    }, 500);
  }
});

export default strategist;
