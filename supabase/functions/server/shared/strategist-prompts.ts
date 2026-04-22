import { buildPrompt } from "./prompt-builder.ts";
import { RULE_OUTPUT_JSON } from "./prompt-rules.ts";

export const PERSONA_STRATEGIST = `You are a senior brand strategist. Keep outputs coherent, specific, and brand-grounded.`;

const VISUAL_CONCEPT_CONSTRAINTS = `- "concept": align with the brand's personality/values; prefer vivid and distinctive wording (concrete or evocative); no "the" prefix; avoid rare words.
- "description": 2-3 sentences about strategic core only (core values, personality, vision/impact). Do NOT describe physical visuals. If tagline/keywords are provided in the brief context, integrate them naturally.
- Generation order (internal): write "description" first, then derive "concept" from that description.`;

export const RULE_VISUAL_CONCEPT = `visualConcept constraints:
${VISUAL_CONCEPT_CONSTRAINTS}`;

export type StrategistRouteKey =
  | "generate-visual-concept"
  | "generate-brand"
  | "auto-complete"
  | "auto-fill"
  | "variation"
  | "direction";

export const TEMPERATURES: Record<StrategistRouteKey, number> = {
  "generate-visual-concept": 1.0,
  "generate-brand": 0.7,
  "auto-complete": 0.7,
  "auto-fill": 0.7,
  "variation": 0.9,
  "direction": 0.7,
};

export function getStrategistRules(
  route: StrategistRouteKey,
  options?: { cardType?: string },
): string[] {
  const base = [RULE_OUTPUT_JSON];
  if (route === "generate-visual-concept" || route === "generate-brand") {
    return [...base, RULE_VISUAL_CONCEPT];
  }
  if (route === "variation" && options?.cardType === "visual-concept") {
    return [...base, RULE_VISUAL_CONCEPT];
  }
  return base;
}

export const BRAND_GENERATION_TASK_DESCRIPTION = `Given the user's brand description, generate a complete brand identity foundation.
Return JSON with this exact structure:
{
  "brandBrief": {
    "name": "Brand name — use the name from the user's description if one is provided, otherwise create a 2-3 word evocative name",
    "tagline": "Short tagline (5-8 words)",
    "description": "2-3 sentences covering the brand's essence, positioning, and values"
  },
  "keywords": ["word1", "word2", "word3"],
  "visualConcept": {
    "concept": "Concept name (displayed as a headline to the user). No "the" prefix. No rare words.",
    "description": "2-3 sentence strategic summary defining the brand's inner core — articulate core values, personality, and vision/impact"
  },
  "colorPalette": ["#RRGGBB", "#RRGGBB", "#RRGGBB", "#RRGGBB", "#RRGGBB"],
  "font": {
    "titleFont": "Google Fonts display/heading font name",
    "bodyFont": "Google Fonts body font name"
  }
}
Additional requirements:
- If the user explicitly states a brand name, you MUST use it exactly as given.
- Color palette must be harmonious and reflect the brand mood (valid hex codes).
- Keywords: single words or very short phrases that capture core brand attributes.
- Font names must be real Google Fonts.`;

export function buildAutoCompleteTaskDescription(applicationsInstruction: string): string {
  return `You are given a partial Brand Brief. Some fields may be empty or missing.
Your task: generate content ONLY for fields that are empty or missing. Do NOT change or overwrite any non-empty value.
Return JSON with this exact structure (use the provided value when non-empty, otherwise generate an appropriate value):
{
  "brandBrief": {
    "name": "string — use provided or create 2-3 word evocative name",
    "tagline": "string — use provided or create 5-8 word tagline",
    "description": "string — use provided or write 2-3 sentences"
  },
  "targetAudience": "string — use provided or write one clear sentence",
  "keywords": ["word1", "word2", "word3"],
  "applications": ["Mockup 1", "Mockup 2", "Mockup 3", "Mockup 4"]
}
Additional requirements:
- Preserve every non-empty input value exactly. Only fill in empty/missing fields.
- Keywords: if provided as non-empty string or array, preserve and normalize to array; if empty, generate 3-5 evocative single words or short phrases.
- Applications: ${applicationsInstruction}`;
}

export const AUTO_FILL_TASK_DESCRIPTION = `Generate content for a single Brand Brief field from scratch, using the other fields as context for coherence.
Return JSON matching the specified shape.`;

export const AUTO_ENHANCE_TASK_DESCRIPTION = `Improve a single Brand Brief field that already has content. The existing value and enhancement rules are provided below.
Return JSON matching the specified shape.`;

export const VISUAL_CONCEPT_TASK_DESCRIPTION = `Generate one visual concept from the brand brief.
Follow the visualConcept rules.
Output JSON:
{
  "visualConcept": {
    "concept": "concept name",
    "description": "2-3 sentence strategic summary"
  }
}`;

export function buildVisualConceptTaskDescription(existingCount: number): string {
  if (existingCount === 0) return VISUAL_CONCEPT_TASK_DESCRIPTION;

  return `Generate one visual concept from the brand brief that is RADICALLY DIFFERENT from all previously generated concepts listed below.
Follow the visualConcept rules.
Output JSON:
{
  "visualConcept": {
    "concept": "concept name",
    "description": "2-3 sentence strategic summary"
  }
}

CRITICAL DIVERSITY REQUIREMENT (concept #${existingCount + 1}):
- Explore a completely different metaphorical territory from every previous concept (e.g., if they used nature metaphors, try architectural, technological, cultural, kinetic, or sensory ones).
- Shift the emotional register entirely (e.g., from warm/nurturing to bold/provocative, from minimal/refined to expressive/maximalist).
- The concept name must use a different linguistic style and evoke a distinct sensory world.
- Do NOT generate a concept that is a synonym, rephrasing, or thematic neighbor of any existing concept.`;
}

const CREATIVE_DIRECTION_SEEDS = [
  "Explore a metaphor rooted in natural phenomena — geology, weather patterns, biological growth, or elemental forces.",
  "Draw from architectural or spatial concepts — structure, negative space, thresholds, suspension, or monumental scale.",
  "Use a cultural or ritualistic lens — ceremony, craft traditions, folklore, or communal practice.",
  "Think in terms of movement and kinetics — flow, tension, rhythm, momentum, or gravitational pull.",
  "Ground the concept in material textures and fabrication — woven, forged, crystallized, liquid, or handmade.",
  "Explore temporal or narrative metaphors — origin stories, transformation arcs, legacy, or future-gazing.",
  "Use synesthesia — translate the brand into sound, taste, scent, or tactile sensation as the primary metaphor.",
  "Draw from mathematics or geometry — fractals, symmetry, tessellation, infinity, or precise proportions.",
  "Explore light and optics — refraction, luminescence, shadow play, spectral color, or dawn/dusk transitions.",
  "Root the concept in human connection — dialogue, embrace, mirroring, resonance, or collective memory.",
];

export function pickCreativeDirectionSeed(existingCount: number): string | undefined {
  if (existingCount === 0) return undefined;
  return CREATIVE_DIRECTION_SEEDS[existingCount % CREATIVE_DIRECTION_SEEDS.length];
}

export const VISUAL_CONCEPT_VARIATION_TASK_DESCRIPTION = `Generate one visual concept variation meaningfully different from current card content.
Follow the visualConcept rules.
Output JSON:
{
  "visualConcept": {
    "concept": "concept name",
    "description": "2-3 sentence strategic summary"
  }
}`;

export const CARD_VARIATION_TASK_DESCRIPTIONS: Record<string, string> = {
  "visual-concept": VISUAL_CONCEPT_VARIATION_TASK_DESCRIPTION,
};

const DIRECTION_SHARED_REQUIREMENTS = `Additional requirements:
- For logo and artStyle rationales: base your descriptions on what you can ACTUALLY SEE in the attached images. Do not invent or assume visual details not visible.
- If no logo image is attached, write the logo rationale based on the brand brief and visual concept.
- If no art style image is attached, write the artStyle rationale based on the visual concept.
- Color and typography rationales are always based on the provided brand data (hex codes and font names).
- Color names should be evocative and brand-specific (e.g. "Sunrise Gold", "Deep Ocean Blue"), not generic ("Yellow", "Blue").
- Each colorNames entry must correspond to a color in the provided palette, in order.
- Write in a confident, editorial tone — like a creative director presenting to a client.
- Reference the visual concept and font names in the rationales where appropriate.`;

const DIRECTION_SCHEMA_BASE = `{
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
  "brandInContextDescription": "One sentence describing how the brand identity system translates across digital and physical touchpoints.",
  "visualConceptContent": "2-3 sentences expanding on the visual concept — what it looks like in practice, the mood and world it evokes, and how it manifests across brand touchpoints."`;

export function buildDirectionTaskDescription(hasVisualConcept: boolean): string {
  const intro = `You are writing the rationale sections of a brand direction document.
You are given the complete brand identity data AND, where available, the actual logo and art style images attached to this message (first image = logo, second image = art style / visual snapshot).`;

  if (hasVisualConcept) {
    return `${intro}

Return JSON with this exact structure:
${DIRECTION_SCHEMA_BASE}
}
- visualConceptContent: expand on the provided visual concept — describe what it looks like in practice, the mood it evokes, and how it manifests across touchpoints.

${DIRECTION_SHARED_REQUIREMENTS}`;
  }

  return `${intro}

Return JSON with this exact structure:
${DIRECTION_SCHEMA_BASE},
  "synthesizedVisualConcept": "Evocative concept name distilled from the visual snapshot / art style image"
}
- synthesizedVisualConcept: look at the visual snapshot / art style image and synthesize a concept name from what you see.
- visualConceptContent: write it based on the synthesizedVisualConcept you generated.

${DIRECTION_SHARED_REQUIREMENTS}`;
}

export { buildPrompt };
export { RULE_OUTPUT_JSON };

