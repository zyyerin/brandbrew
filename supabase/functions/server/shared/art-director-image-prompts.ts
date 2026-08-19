// ─────────────────────────────────────────────────────────────────────────────
// shared/art-director-image-prompts.ts — txt2img briefs for drawing-stage cards
//
// Art-style keeps the style-board brief (layered graphic language, not a single
// poster). Application mockups still use the shared text-rendering contract so
// hex codes and typeface names are not printed onto packaging.
// ─────────────────────────────────────────────────────────────────────────────

import type { ImagePromptContext } from "./types.tsx";
import { buildLogoImagePrompt } from "./logo-prompts.ts";
import {
  buildImageTextPolicy,
  formatColorSchemeSpec,
  formatTypefaceCharacterSpec,
  warnIfSpecLeaks,
} from "./image-text-policy.ts";

function asSentence(value?: string | null): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /[.!?。！？]$/u.test(trimmed) ? trimmed : `${trimmed}.`;
}

function visualDirection(ctx: ImagePromptContext): string {
  const vc = ctx.visualConcept;
  const concept = vc
    ? [vc.concept, vc.description].filter((part) => typeof part === "string" && part.trim().length > 0).join(". ")
    : "";
  const keywords = (ctx.keywords ?? []).filter((k) => k.trim().length > 0).join(", ");
  return [
    asSentence(ctx.description ?? ctx.brandDescription),
    asSentence(concept),
    keywords ? `The atmosphere is ${keywords}.` : "",
  ].filter((part) => part.length > 0).join(" ");
}

export function buildArtStyleImagePrompt(ctx: ImagePromptContext): string {
  const name = ctx.brandName ?? "the brand";
  const description = ctx.description ?? ctx.brandDescription;
  const tagline = ctx.tagline ? `Tagline: "${ctx.tagline}". ` : "";
  const audience = ctx.targetAudience ? `Target audience: ${ctx.targetAudience}. ` : "";
  const vc = ctx.visualConcept;
  const conceptStr = vc ? `${vc.concept}. ${vc.description}` : "";
  const kwds = (ctx.keywords ?? []).join(", ");
  const focus = ctx.newHint ? `Creative direction: ${ctx.newHint}. ` : "";
  const palette = (ctx.colorPalette ?? []).length > 0
    ? `Brand colors: ${ctx.colorPalette!.join(", ")}. `
    : "";

  return (
    `${focus}Art style reference image for "${name}" brand. ` +
    `${description ? `Brand description: ${description}. ` : ""}` +
    `${tagline}${audience}` +
    `${conceptStr ? `Visual concept: ${conceptStr}. ` : ""}` +
    `${kwds ? `Keywords: ${kwds}. ` : ""}` +
    `${palette}` +
    `Create a graphic style board that defines the brand's 2D visual language: ` +
    `shape grammar, pattern rhythm, contrast hierarchy, and abstract textures. ` +
    `Flat or semi-flat composition, poster-like design layout. ` +
    `No photorealism, no people, no products, no environments, no text labels.`
  );
}

export function buildApplicationImagePrompt(ctx: ImagePromptContext): string {
  const name = ctx.brandName?.trim() || "the brand";
  const touchpoint = ctx.application?.trim() || "brand packaging";
  const focus = ctx.newHint ? `Creative direction: ${asSentence(ctx.newHint)} ` : "";
  const hasVisualRefs = !!ctx.hasVisualRefs;

  const specLines = hasVisualRefs
    ? [
        "The reference images are a brand identity board. Take color, graphic motifs, the mark, and lettering style from them.",
        "Do not reprint the board on the product: no bento grid, no swatch legends, no type-specimen sheets, no hex codes, no typeface names.",
      ]
    : [
        formatColorSchemeSpec(ctx.colorPalette),
        formatTypefaceCharacterSpec(ctx.titleFont, ctx.bodyFont),
      ];

  const prompt = [
    `${focus}A realistic ${touchpoint} mockup of ${name}.`,
    visualDirection(ctx),
    `Show the brand identity applied to a physical ${touchpoint}. Clean studio photography, white background, professional product mockup.`,
    ...specLines,
    buildImageTextPolicy({
      purpose: "packaging",
      renderable: [ctx.brandName, ctx.tagline],
      preserveExistingText: hasVisualRefs,
    }),
  ].filter((part) => part.trim().length > 0).join(" ");

  warnIfSpecLeaks("application-prompt", prompt, [ctx.titleFont, ctx.bodyFont]);
  return prompt;
}

export function buildCreativeBrief(cardType: string, ctx: ImagePromptContext): string {
  switch (cardType) {
    case "logo":
      return buildLogoImagePrompt(ctx);
    case "art-style":
      return buildArtStyleImagePrompt(ctx);
    case "application":
      return buildApplicationImagePrompt(ctx);
    default: {
      const name = ctx.brandName?.trim() || "the brand";
      const vc = ctx.visualConcept;
      const conceptStr = vc ? `${vc.concept}. ${vc.description ?? ""}` : "";
      return `Professional brand design image for ${name}. ${conceptStr} Minimal, modern.`;
    }
  }
}
