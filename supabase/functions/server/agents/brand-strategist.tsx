// ─────────────────────────────────────────────────────────────────────────────
// agents/brand-strategist.tsx — Brand Strategist Agent
//
// Persona:  Professional brand strategist focused on verbal identity,
//           positioning, and brand architecture.
// Scope:    All text-to-text operations — brand generation, card variations,
//           text-card merges, and guideline rationale writing.
// Model:    Gemini text model (gemini-3-flash-preview)
// ─────────────────────────────────────────────────────────────────────────────

import { Hono } from "npm:hono";
import { callGeminiText, callGeminiTextWithImages, fetchImageAsBase64, TEXT_MODEL } from "../shared/gemini.tsx";
import {
  MERGE_SPECS,
  mergeCardIdToField,
  applyFieldGuard,
} from "../shared/merge-specs.tsx";

const strategist = new Hono();

// ── Agent persona ────────────────────────────────────────────────────────────
// This system-level identity is prepended to every task prompt so the model
// maintains a consistent voice, depth of thinking, and output discipline.

const STRATEGIST_PERSONA = `You are a senior brand strategist with deep expertise in brand architecture, verbal identity, and visual positioning.
You think holistically — every decision (naming, color, typography, concept) must reinforce a unified brand narrative.
You write with confident, editorial precision. You never pad with filler.
You always return ONLY valid JSON — no markdown, no explanation, no code fences.`;

// ── Task-specific prompts ────────────────────────────────────────────────────

const BRAND_GENERATION_PROMPT = `Given the user's brand description, generate a complete brand identity foundation.
Return ONLY valid JSON with this exact structure:
{
  "brandBrief": {
    "name": "Brand name — use the name from the user's description if one is provided, otherwise create a 2-3 word evocative name",
    "tagline": "Short tagline (5-8 words)",
    "description": "2-3 sentences covering the brand's essence, positioning, and values"
  },
  "keywords": ["word1", "word2", "word3"],
  "visualConcept": {
    "conceptName": "Poetic concept name (2-4 words)",
    "points": [
      "Primary visual metaphor or symbol description",
      "Style direction: aesthetic and design language",
      "Color and texture direction"
    ]
  },
  "colorPalette": ["#RRGGBB", "#RRGGBB", "#RRGGBB", "#RRGGBB", "#RRGGBB"],
  "font": {
    "titleFont": "Google Fonts display/heading font name",
    "bodyFont": "Google Fonts body font name"
  }
}
Rules:
- If the user explicitly states a brand name, you MUST use it exactly as given.
- Color palette must be harmonious and reflect the brand mood (valid hex codes).
- Keywords: single words or very short phrases that capture core brand attributes.
- Font names must be real Google Fonts.`;

const ENHANCE_BRIEF_PROMPT = `You are given a partial Brand Summary. Some fields may be empty or missing.
Your task: generate content ONLY for fields that are empty or missing. Do NOT change or overwrite any non-empty value.
Return ONLY valid JSON with this exact structure (use the provided value when non-empty, otherwise generate an appropriate value):
{
  "brandBrief": {
    "name": "string — use provided or create 2-3 word evocative name",
    "tagline": "string — use provided or create 5-8 word tagline",
    "description": "string — use provided or write 2-3 sentences"
  },
  "targetAudience": "string — use provided or write one clear sentence",
  "keywords": ["word1", "word2", "word3"]
}
Rules:
- Preserve every non-empty input value exactly. Only fill in empty/missing fields.
- Keywords: if provided as non-empty string or array, preserve and normalize to array; if empty, generate 3-5 evocative single words or short phrases.
- No markdown, no explanation, no code fences — raw JSON only.`;

const CARD_VARIATION_PROMPTS: Record<string, string> = {
  "brand-brief":
    `Generate a creative variation of the Brand Summary that explores a distinctly different angle or tone from the current content. Return JSON: {"name":"...","tagline":"...","description":"..."}. Description should be 2-3 sentences.`,
  "keywords":
    `Generate 3 fresh brand keywords that are meaningfully different from the current ones — different vocabulary, different facets of the brand. Return JSON: {"keywords":["...","...","..."]}. Single evocative words or very short phrases.`,
  "color-palette":
    `Generate a harmonious 5-color palette that is distinctly different from the current palette — explore a different mood, temperature, or contrast level while still fitting the brand. Return JSON: {"colorPalette":["#RRGGBB","#RRGGBB","#RRGGBB","#RRGGBB","#RRGGBB"]}.`,
  "visual-concept":
    `Generate a fresh visual concept with a completely different metaphor and direction from the current one. Return JSON: {"conceptName":"...","points":["...","...","..."]}. conceptName is poetic (2-4 words). Points describe the visual form, style direction, and color/texture direction.`,
  "font":
    `Recommend a font pairing with a clearly different personality from the current one — different style category (e.g. serif vs sans-serif, geometric vs humanist). Return JSON: {"titleFont":"...","bodyFont":"..."}. Use only real Google Fonts names.`,
};

const MERGE_PROMPT = `You are performing a precise, scoped merge operation on brand identity data.
You will be given:
  1. A specific task instruction
  2. A list of the ONLY fields you are allowed to modify
  3. The current state of the target card
  4. The source card data to draw inspiration from

Rules:
- Return ONLY a valid JSON object representing the complete updated target card.
- Modify ONLY the fields listed in "Allowed fields". All other fields must be returned EXACTLY as given.
- No markdown, no explanation, no code fences — raw JSON only.
- For hex colors: always use 6-digit lowercase hex strings (e.g. "#a3b4c5").
- For font names: use real Google Fonts names only.`;

const GUIDELINE_PROMPT = `You are writing the rationale sections of a brand guideline document.
You are given the complete brand identity data AND, where available, the actual logo and art style images attached to this message (first image = logo, second image = art style / visual snapshot).

Return ONLY valid JSON with this exact structure (see notes below for optional fields):
{
  "rationales": {
    "logo": "2-3 sentences describing what the logo actually looks like (shapes, marks, type treatment) and how those visual choices embody the brand identity.",
    "color": "2-3 sentences explaining the color palette choices, emotional associations, and how they work together as a system.",
    "typography": "2-3 sentences explaining the font pairing rationale, how the heading font contrasts with the body font, and what personality they convey.",
    "artStyle": "2-3 sentences describing the visual aesthetic and art direction visible in the art style reference, and how that aesthetic reinforces the brand's visual language."
  },
  "colorNames": [
    {"hex": "#RRGGBB", "name": "Evocative Color Name"},
    {"hex": "#RRGGBB", "name": "Evocative Color Name"}
  ],
  "brandInContextDescription": "One sentence describing how the brand identity system translates across digital and physical touchpoints."
}
IMPORTANT — When visual concept is NOT provided (missing or empty): You MUST also include "synthesizedVisualConcept" in your output. Look at the visual snapshot / art style image and synthesize a visual concept from what you see. Use this structure:
  "synthesizedVisualConcept": {
    "conceptName": "Poetic concept name (2-4 words) derived from the visual snapshot",
    "points": [
      "Primary visual metaphor or style visible in the image",
      "Style direction and aesthetic observed",
      "Color, texture, and mood direction"
    ]
  }
When visual concept IS provided, omit synthesizedVisualConcept.

Rules:
- For logo and artStyle rationales: base your descriptions on what you can ACTUALLY SEE in the attached images. Do not invent or assume visual details not visible.
- If no logo image is attached, write the logo rationale based on the brand brief and visual concept (or synthesized concept).
- If no art style image is attached, write the artStyle rationale based on the visual concept points (or synthesize from other brand data).
- When synthesizing a visual concept from the snapshot: conceptName must be evocative (2-4 words); points must be exactly 3 strings describing what you observe in the image.
- Color and typography rationales are always based on the provided brand data (hex codes and font names).
- Color names should be evocative and brand-specific (e.g. "Sunrise Gold", "Deep Ocean Blue"), not generic ("Yellow", "Blue").
- Each colorNames entry must correspond to a color in the provided palette, in order.
- Write in a confident, editorial tone — like a creative director presenting to a client.
- Reference the visual concept name and font names in the rationales where appropriate.
- Return ONLY valid JSON — no markdown, no code fences, no explanation.`;

const VISUAL_CONCEPT_PROMPT = `Given the user's brand brief, generate a visual concept that captures the brand's essence as a single poetic metaphor.
Return ONLY valid JSON with this exact structure:
{
  "visualConcept": {
    "conceptName": "Poetic concept name (2-4 words)",
    "points": [
      "Primary visual metaphor or symbol description",
      "Style direction: aesthetic and design language",
      "Color and texture direction"
    ]
  }
}
Rules:
- The concept must feel intentional and strategically aligned with the brand's positioning.
- conceptName: evocative, 2-4 words that could serve as a creative brief title.
- points: exactly 3 strings — visual form, style direction, and color/texture direction.
- No markdown, no explanation, no code fences — raw JSON only.`;

// ── Route: POST /generate-visual-concept ─────────────────────────────────────

strategist.post("/generate-visual-concept", async (c) => {
  try {
    const startTime = Date.now();
    const { brandName, tagline, description, targetAudience, keywords } = await c.req.json();
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return c.json({ error: "GEMINI_API_KEY not configured" }, 500);

    const briefContext = [
      brandName && `Brand name: "${brandName}"`,
      tagline && `Tagline: "${tagline}"`,
      description && `Description: ${description}`,
      targetAudience && `Target audience: ${targetAudience}`,
      keywords?.length && `Keywords: ${Array.isArray(keywords) ? keywords.join(", ") : keywords}`,
    ].filter(Boolean).join("\n");

    const fullPrompt =
      `${STRATEGIST_PERSONA}\n\n${VISUAL_CONCEPT_PROMPT}\n\nBrand brief:\n${briefContext || "A creative brand."}`;

    const text = await callGeminiText(apiKey, fullPrompt, { temperature: 0.9 });
    const result = JSON.parse(text);
    const generationTime = Date.now() - startTime;
    console.log(`[strategist] Visual concept generated: ${result?.visualConcept?.conceptName} (${generationTime}ms)`);

    return c.json({
      visualConcept: result.visualConcept,
      _meta: {
        agent: "brand-strategist",
        prompt: fullPrompt,
        model: TEXT_MODEL,
        generationTime,
        ingredients: [brandName, ...(Array.isArray(keywords) ? keywords : [])].filter(Boolean),
      },
    });
  } catch (err) {
    console.log("[strategist] generate-visual-concept error:", err);
    return c.json({ error: `Visual concept generation failed: ${String(err)}` }, 500);
  }
});

// ── Route: POST /generate-brand ──────────────────────────────────────────────

strategist.post("/generate-brand", async (c) => {
  try {
    const startTime = Date.now();
    const { userPrompt } = await c.req.json();
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return c.json({ error: "GEMINI_API_KEY not configured" }, 500);

    const fullPrompt =
      `${STRATEGIST_PERSONA}\n\n${BRAND_GENERATION_PROMPT}\n\nUser brand description: "${userPrompt}"`;

    const text = await callGeminiText(apiKey, fullPrompt, { temperature: 0.9 });
    const brandData = JSON.parse(text);
    const generationTime = Date.now() - startTime;
    console.log(`[strategist] Brand generated: ${brandData?.brandBrief?.name} (${generationTime}ms)`);

    return c.json({
      ...brandData,
      _meta: {
        agent: "brand-strategist",
        prompt: fullPrompt,
        model: TEXT_MODEL,
        generationTime,
        ingredients: [userPrompt],
      },
    });
  } catch (err) {
    console.log("[strategist] generate-brand error:", err);
    return c.json({ error: `Brand generation failed: ${String(err)}` }, 500);
  }
});

// ── Route: POST /enhance-brief ───────────────────────────────────────────────
strategist.post("/enhance-brief", async (c) => {
  try {
    const startTime = Date.now();
    const body = await c.req.json();
    const { partialBrief = {}, targetAudience = "", keywords: keywordsInput = "" } = body;
    const { name = "", tagline = "", description = "" } = partialBrief;
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return c.json({ error: "GEMINI_API_KEY not configured" }, 500);

    const context = [
      name && `Brand name (keep exactly): "${name}"`,
      tagline && `Tagline (keep exactly): "${tagline}"`,
      description && `Description (keep exactly): "${description}"`,
      targetAudience && `Target audience (keep exactly): "${targetAudience}"`,
      keywordsInput && `Keywords (keep or normalize): "${typeof keywordsInput === "string" ? keywordsInput : (keywordsInput || []).join(", ")}"`,
    ].filter(Boolean).join("\n");

    const fullPrompt =
      `${STRATEGIST_PERSONA}\n\n${ENHANCE_BRIEF_PROMPT}\n\nCurrent partial brief (preserve non-empty, fill empty):\n${context || "All fields empty — generate a complete brief."}`;

    const text = await callGeminiText(apiKey, fullPrompt, { temperature: 0.7 });
    const out = JSON.parse(text);
    const generationTime = Date.now() - startTime;
    console.log(`[strategist] Enhance brief done (${generationTime}ms)`);

    return c.json({
      brandBrief: out.brandBrief ?? { name: "", tagline: "", description: "" },
      targetAudience: out.targetAudience ?? "",
      keywords: Array.isArray(out.keywords) ? out.keywords : (out.keywords ? [out.keywords] : []),
      _meta: { agent: "brand-strategist", model: TEXT_MODEL, generationTime },
    });
  } catch (err) {
    console.log("[strategist] enhance-brief error:", err);
    return c.json({ error: `Enhance brief failed: ${String(err)}` }, 500);
  }
});

// ── Route: POST /variation ───────────────────────────────────────────────────

strategist.post("/variation", async (c) => {
  try {
    const startTime = Date.now();
    const { cardType, brandContext } = await c.req.json();
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return c.json({ error: "GEMINI_API_KEY not configured" }, 500);

    const { brandName, tagline, description, keywords, concept, existingContent } = brandContext ?? {};
    const summary = [
      brandName && `Brand: "${brandName}"`,
      tagline && `Tagline: "${tagline}"`,
      description && `Description: ${description}`,
      keywords?.length && `Keywords: ${keywords.join(", ")}`,
      concept && `Visual concept: ${concept}`,
    ].filter(Boolean).join(". ");

    const taskPrompt = CARD_VARIATION_PROMPTS[cardType];
    if (!taskPrompt) return c.json({ error: `Unknown card type: ${cardType}` }, 400);

    const existingBlock = existingContent
      ? `\n\nCurrent card content (DO NOT repeat or closely paraphrase this — the new variation must be meaningfully different):\n${JSON.stringify(existingContent, null, 2)}`
      : "";

    const fullPrompt =
      `${STRATEGIST_PERSONA}\n\nBrand context: ${summary}${existingBlock}\n\n${taskPrompt}`;

    const text = await callGeminiText(apiKey, fullPrompt, { temperature: 1.0 });
    const variation = JSON.parse(text);
    const generationTime = Date.now() - startTime;
    console.log(`[strategist] Variation generated: ${cardType} (${generationTime}ms)`);

    return c.json({
      ...variation,
      _meta: {
        agent: "brand-strategist",
        prompt: fullPrompt,
        model: TEXT_MODEL,
        generationTime,
        ingredients: [brandName, concept, ...(keywords ?? [])].filter(Boolean),
      },
    });
  } catch (err) {
    console.log("[strategist] variation error:", err);
    return c.json({ error: `Variation generation failed: ${String(err)}` }, 500);
  }
});

// ── Route: POST /merge ───────────────────────────────────────────────────────

strategist.post("/merge", async (c) => {
  try {
    const startTime = Date.now();
    const { sourceId, targetId, brandData } = await c.req.json();
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return c.json({ error: "GEMINI_API_KEY not configured" }, 500);

    const spec = MERGE_SPECS[sourceId]?.[targetId];
    if (!spec || spec.allowedFields.length === 0) {
      return c.json({ patch: null });
    }

    const targetField = mergeCardIdToField(targetId);
    const sourceField = mergeCardIdToField(sourceId);
    if (!targetField) return c.json({ patch: null });

    const targetData = brandData[targetField];
    const sourceData = sourceField ? brandData[sourceField] : null;
    if (targetData === undefined || targetData === null) return c.json({ patch: null });

    const fullPrompt = `${STRATEGIST_PERSONA}\n\n${MERGE_PROMPT}

Task: ${spec.instruction}

Allowed fields (modify ONLY these): ${spec.allowedFields.join(", ")}

Current target card ("${targetField}"):
${JSON.stringify(targetData, null, 2)}

Source card data:
${JSON.stringify(sourceData, null, 2)}

Additional brand context (read-only):
${JSON.stringify(
  { brandBrief: brandData.brandBrief, visualConcept: brandData.visualConcept, keywords: brandData.keywords },
  null, 2,
)}

Return the complete updated "${targetField}" object with ONLY the allowed fields changed.`;

    const text = await callGeminiText(apiKey, fullPrompt, {
      temperature: 0.4,
      maxOutputTokens: 2048,
    });

    const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    const parsed: unknown = JSON.parse(cleaned);

    // Unwrap if the model wrapped an array value in an object
    let unwrapped = parsed;
    if (Array.isArray(targetData) && !Array.isArray(parsed) && typeof parsed === "object" && parsed !== null) {
      const keys = Object.keys(parsed as Record<string, unknown>);
      if (keys.length === 1 && Array.isArray((parsed as any)[keys[0]])) {
        unwrapped = (parsed as any)[keys[0]];
      }
    }

    const guarded = applyFieldGuard(targetData, unwrapped, spec.allowedFields, targetField);
    const generationTime = Date.now() - startTime;
    console.log(`[strategist] Merge complete: ${sourceId} → ${targetId} (field: ${targetField}, ${generationTime}ms)`);
    return c.json({
      patch: { [targetField]: guarded },
      _meta: {
        agent: "brand-strategist",
        prompt: fullPrompt,
        model: TEXT_MODEL,
        generationTime,
        ingredients: [sourceId, targetId],
      },
    });
  } catch (err) {
    console.log("[strategist] merge error:", err);
    return c.json({ error: `Merge failed: ${String(err)}` }, 500);
  }
});

// ── Route: POST /comment-modify ──────────────────────────────────────────────

const COMMENT_MODIFY_PROMPT = `You are performing a user-directed modification on a brand identity card.
The user has provided a free-form instruction describing how they want the card to change.

Rules:
- Return ONLY a valid JSON object representing the complete updated target card.
- Follow the user's instruction as closely as possible while keeping the result coherent with the brand identity.
- No markdown, no explanation, no code fences — raw JSON only.
- For hex colors: always use 6-digit lowercase hex strings (e.g. "#a3b4c5").
- For font names: use real Google Fonts names only.`;

const COMMENT_MODIFY_FIELDS: Record<string, string[]> = {
  "brand-brief":     ["brandBrief.name", "brandBrief.tagline", "brandBrief.description"],
  "visual-concept":  ["visualConcept.conceptName", "visualConcept.points"],
  "color-palette":   ["colorPalette"],
  "font":            ["font.titleFont", "font.bodyFont"],
};

strategist.post("/comment-modify", async (c) => {
  try {
    const startTime = Date.now();
    const { targetId, comment, brandData } = await c.req.json();
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return c.json({ error: "GEMINI_API_KEY not configured" }, 500);

    const targetField = mergeCardIdToField(targetId);
    if (!targetField) return c.json({ patch: null });

    const targetData = brandData[targetField];
    if (targetData === undefined || targetData === null) return c.json({ patch: null });

    const allowedFields = COMMENT_MODIFY_FIELDS[targetId];
    if (!allowedFields) return c.json({ patch: null });

    const fullPrompt = `${STRATEGIST_PERSONA}\n\n${COMMENT_MODIFY_PROMPT}

User instruction: "${comment}"

Allowed fields (modify ONLY these): ${allowedFields.join(", ")}

Current target card ("${targetField}"):
${JSON.stringify(targetData, null, 2)}

Brand context (read-only):
${JSON.stringify(
  { brandBrief: brandData.brandBrief, visualConcept: brandData.visualConcept, keywords: brandData.keywords },
  null, 2,
)}

Return the complete updated "${targetField}" object with the user's instruction applied.`;

    const text = await callGeminiText(apiKey, fullPrompt, {
      temperature: 0.6,
      maxOutputTokens: 2048,
    });

    const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    const parsed: unknown = JSON.parse(cleaned);

    let unwrapped = parsed;
    if (Array.isArray(targetData) && !Array.isArray(parsed) && typeof parsed === "object" && parsed !== null) {
      const keys = Object.keys(parsed as Record<string, unknown>);
      if (keys.length === 1 && Array.isArray((parsed as any)[keys[0]])) {
        unwrapped = (parsed as any)[keys[0]];
      }
    }

    const guarded = applyFieldGuard(targetData, unwrapped, allowedFields, targetField);
    const generationTime = Date.now() - startTime;
    console.log(`[strategist] Comment-modify complete: "${comment.slice(0, 40)}" → ${targetId} (field: ${targetField}, ${generationTime}ms)`);
    return c.json({
      patch: { [targetField]: guarded },
      _meta: {
        agent: "brand-strategist",
        prompt: fullPrompt,
        model: TEXT_MODEL,
        generationTime,
        ingredients: [comment, targetId],
      },
    });
  } catch (err) {
    console.log("[strategist] comment-modify error:", err);
    return c.json({ error: `Comment-modify failed: ${String(err)}` }, 500);
  }
});

// ── Route: POST /guideline ───────────────────────────────────────────────────

strategist.post("/guideline", async (c) => {
  try {
    const startTime = Date.now();
    const { brandData } = await c.req.json();
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return c.json({ error: "GEMINI_API_KEY not configured" }, 500);

    const brandContext = JSON.stringify({
      brandBrief: brandData.brandBrief,
      keywords: brandData.keywords,
      colorPalette: brandData.colorPalette,
      visualConcept: brandData.visualConcept,
      artStyle: brandData.artStyle,
      font: brandData.font,
    }, null, 2);

    const fullPrompt =
      `${STRATEGIST_PERSONA}\n\n${GUIDELINE_PROMPT}\n\nBrand identity data:\n${brandContext}`;

    // Fetch logo and art style images to pass to the model as visual context.
    // Failures are non-fatal — fall back to text-only generation.
    const logoImageUrl = brandData.logoImageUrl as string | undefined;
    const artStyleImageUrl = brandData.artStyleImageUrl as string | undefined;

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

    let text: string;
    if (images.length > 0) {
      console.log(`[strategist] Generating guideline with ${images.length} image(s) attached`);
      text = await callGeminiTextWithImages(apiKey, fullPrompt, images, { temperature: 0.7 });
    } else {
      console.log("[strategist] Generating guideline (text-only fallback)");
      text = await callGeminiText(apiKey, fullPrompt, { temperature: 0.7 });
    }

    const guideline = JSON.parse(text);
    const generationTime = Date.now() - startTime;
    console.log(`[strategist] Guideline generated: ${brandData.brandBrief?.name} (${generationTime}ms, images: ${images.length})`);

    return c.json({
      ...guideline,
      _meta: { agent: "brand-strategist", model: TEXT_MODEL, generationTime, imageCount: images.length },
    });
  } catch (err) {
    console.log("[strategist] guideline error:", err);
    return c.json({ error: `Guideline generation failed: ${String(err)}` }, 500);
  }
});

export default strategist;
