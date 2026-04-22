/**
 * Default prompt templates for debugger UI.
 * Used by PipelineDebugPanel to show/edit prompts before they are sent.
 */

import type { PipelineStage } from "../types/project";
import {
  PERSONA_STRATEGIST,
  RULE_OUTPUT_JSON,
  RULE_VISUAL_CONCEPT,
  VISUAL_CONCEPT_TASK_DESCRIPTION,
} from "@server-shared/strategist-prompts.ts";

// ─── Personas ─────────────────────────────────────────────────────────────────

export const STRATEGIST_PERSONA = PERSONA_STRATEGIST;

export const ART_DIRECTOR_TEXT_PERSONA = `You are a creative director with deep expertise in color theory, typography, and art direction.
You make precise visual design decisions grounded in brand strategy — every color, font, and style choice must feel intentional.
You always return ONLY valid JSON — no markdown, no explanation, no code fences.`;

export const ART_DIRECTOR_PERSONA = `You are a creative director translating brand strategy into compelling visual concepts.
You think in terms of composition, symbolism, color psychology, and visual narrative.
Every image you direct must feel intentional — reinforcing the brand's core identity.`;

// ─── Task prompts ─────────────────────────────────────────────────────────────

export const VISUAL_CONCEPT_PROMPT = `${VISUAL_CONCEPT_TASK_DESCRIPTION}

Rules:
- ${RULE_OUTPUT_JSON}
- ${RULE_VISUAL_CONCEPT}`;

export const PALETTE_FONTS_PROMPT = `Given the brand brief and visual concept, design a color palette and typography system.
Return ONLY valid JSON with this exact structure:
{
  "colorPalette": ["#RRGGBB", ...],
  "font": {
    "titleFont": "Google Fonts display/heading font name",
    "bodyFont": "Google Fonts body font name"
  }
}
Rules:
- Color palette: 3 to 5 harmonious hex colors that reflect the brand mood and visual concept direction.
- Colors should form a usable system: 1 primary, 1-2 secondary, 1-2 neutral/accent.
- Font names must be real Google Fonts. Choose fonts that embody the brand personality.
- The title font should have strong character; the body font should be highly readable.
- Typography and color choices must reinforce the visual concept's aesthetic direction.`;

// ─── Image prompt builder (mirrors art-director.tsx buildCreativeBrief) ──────

export function buildCreativeBriefPreview(
  cardType: string,
  ctx: {
    brandName?: string;
    brandDescription?: string;
    visualConcept?: { concept: string; description: string };
    keywords?: string[];
    colorPalette?: string[];
    newHint?: string;
    font?: { titleFont: string; bodyFont: string };
  },
): string {
  const name       = ctx.brandName ?? "the brand";
  const vc         = ctx.visualConcept;
  const conceptStr = vc ? `${vc.concept}. ${vc.description}` : "";
  const kwds       = (ctx.keywords ?? []).join(", ");
  const focus      = ctx.newHint ? `Creative direction: ${ctx.newHint}. ` : "";
  const palette    = (ctx.colorPalette ?? []).length > 0
    ? `Brand colors: ${ctx.colorPalette!.join(", ")}. `
    : "";

  switch (cardType) {
    case "logo":
      return (
        `${focus}Brand logo design concept for "${name}". ` +
        `${conceptStr ? `Visual concept: ${conceptStr}. ` : ""}` +
        `${palette}` +
        `Minimal clean graphic, white background, professional brand mark, ` +
        `no photorealism, no text labels, vector illustration style.`
      );
    case "art-style":
      return (
        `${focus}Art style reference image for "${name}" brand. ` +
        `${conceptStr ? `Visual concept: ${conceptStr}. ` : ""}` +
        `${kwds ? `Keywords: ${kwds}. ` : ""}` +
        `${palette}` +
        `Create a visual art direction reference board showing the brand's aesthetic style, ` +
        `mood, texture, and visual language.`
      );
    case "application": {
      return (
        `${focus}Brand application mockup for "${name}". ` +
        `${conceptStr ? `Visual concept: ${conceptStr}. ` : ""}` +
        `${palette}` +
        `Show the brand identity applied to a realistic touchpoint. ` +
        `Use the brand's colors, typography, and visual style. ` +
        `Clean studio photography, white background, professional product mockup.`
      );
    }
    default:
      return `Professional brand design image for "${name}". ${conceptStr}. Minimal, modern.`;
  }
}

// ─── Per-stage prompt metadata ────────────────────────────────────────────────

export interface StagePromptTemplate {
  persona: string;
  taskPrompt: string;
  /** For image-gen stages, the built image prompt (computed at runtime) */
  imagePrompts?: Record<string, string>;
}

export function getStagePromptTemplates(
  stage: NonNullable<PipelineStage>,
  request: Record<string, unknown>,
): StagePromptTemplate {
  switch (stage) {
    case "conceptualizing":
      return {
        persona: STRATEGIST_PERSONA,
        taskPrompt: VISUAL_CONCEPT_PROMPT,
      };
    case "styling":
      return {
        persona: ART_DIRECTOR_TEXT_PERSONA,
        taskPrompt: PALETTE_FONTS_PROMPT,
      };
    case "drawing": {
      const ctx = {
        brandName: request.brandName as string | undefined,
        brandDescription: request.description as string | undefined,
        visualConcept: request.visualConcept as { concept: string; description: string } | undefined,
        keywords: request.keywords as string[] | undefined,
        colorPalette: request.colorPalette as string[] | undefined,
      };
      return {
        persona: ART_DIRECTOR_PERSONA,
        taskPrompt: "(Image generation — see image prompts below)",
        imagePrompts: {
          logo: buildCreativeBriefPreview("logo", ctx),
          "art-style": buildCreativeBriefPreview("art-style", ctx),
        },
      };
    }
    case "synthesizing":
      return { persona: "", taskPrompt: "" };
  }
}
