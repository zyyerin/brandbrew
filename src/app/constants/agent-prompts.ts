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
import { PALETTE_FONTS_TASK_DESCRIPTION } from "@server-shared/art-director-prompts.ts";
import { buildCreativeBrief } from "@server-shared/art-director-image-prompts.ts";
import type { LogoComposition } from "@server-shared/logo-prompts.ts";

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

export const PALETTE_FONTS_PROMPT = PALETTE_FONTS_TASK_DESCRIPTION;

// ─── Image prompt builder (same function the art-director agent uses) ────────

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
    logoComposition?: LogoComposition;
  },
): string {
  return buildCreativeBrief(cardType, {
    brandName: ctx.brandName,
    description: ctx.brandDescription,
    visualConcept: ctx.visualConcept,
    keywords: ctx.keywords,
    colorPalette: ctx.colorPalette,
    newHint: ctx.newHint,
    titleFont: ctx.font?.titleFont,
    bodyFont: ctx.font?.bodyFont,
    logoComposition: ctx.logoComposition,
  });
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
        font: request.font as { titleFont: string; bodyFont: string } | undefined,
        logoComposition: request.logoComposition as LogoComposition | undefined,
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
