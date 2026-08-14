// ─────────────────────────────────────────────────────────────────────────────
// shared/art-director-image-prompts.ts — txt2img briefs for drawing-stage cards
//
// Art-style and application prompts used to dump labeled fields (Brand colors,
// Typography, Keywords) and quoted font names into the image model. Those
// strings look like captions, so they get printed onto style boards and
// packaging. This builder keeps specification values unquoted and ends with
// the shared text-rendering contract.
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
  const name = ctx.brandName?.trim() || "the brand";
  const focus = ctx.newHint ? `Creative direction: ${asSentence(ctx.newHint)} ` : "";
  const prompt = [
    `${focus}An abstract 2D graphic composition that establishes the visual language of ${name}.`,
    visualDirection(ctx),
    "Shape grammar, pattern rhythm, contrast hierarchy, and abstract textures. Flat or semi-flat, poster-like. No photorealism, no people, no products, no environments, no swatches, no legends, no type specimens.",
    formatColorSchemeSpec(ctx.colorPalette),
    buildImageTextPolicy(),
  ].filter((part) => part.trim().length > 0).join(" ");

  warnIfSpecLeaks("art-style-prompt", prompt, [ctx.titleFont, ctx.bodyFont]);
  return prompt;
}

export function buildApplicationImagePrompt(ctx: ImagePromptContext): string {
  const name = ctx.brandName?.trim() || "the brand";
  const touchpoint = ctx.application?.trim() || "brand packaging";
  const focus = ctx.newHint ? `Creative direction: ${asSentence(ctx.newHint)} ` : "";
  const hasVisualRefs = !!ctx.hasVisualRefs;

  const specLines = hasVisualRefs
    ? [
        "Match the color, graphic language, and mark from the reference images.",
        "Do not copy incidental lettering from the references except the brand mark.",
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
