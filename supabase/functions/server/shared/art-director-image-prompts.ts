// ─────────────────────────────────────────────────────────────────────────────
// shared/art-director-image-prompts.ts — txt2img briefs for drawing-stage cards
//
// Art-style is a modular style board. When a finished lockup is supplied as a
// reference image, that exact mark is placed on the board rather than redrawn.
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
  const vc = ctx.visualConcept;
  const conceptStr = vc ? `${vc.concept}. ${vc.description}` : "";
  const hasLogoRef = !!ctx.hasVisualRefs;
  const palette = hasLogoRef
    ? ""
    : (ctx.colorPalette ?? []).length > 0
      ? `Color palette: ${ctx.colorPalette!.join(", ")}. `
      : "";
  const logoClause = hasLogoRef
    ? "The reference image is the finished brand logo lockup. Place that exact lockup on the style board as one of the modules. Copy it faithfully: the same composition, lettering, colors, and proportions. Do not redraw, restyle, or invent a different mark. Do not add a second logo, wordmark, or alternate lockup. "
    : "";
  const policy = hasLogoRef
    ? ` ${buildImageTextPolicy({
        renderable: [ctx.brandName],
        preserveExistingText: true,
      })}`
    : "";

  const prompt = (
    `Create a modular, variable-panel brand style board for "${name}". ` +
    `The board must be segmented into distinct, non-fixed modules, selecting organically from a library of visual elements to create a dynamic composition. This potential library includes abstract patterns, icon systems, geometric forms, textural explorations, and typographic shapes. Select a balanced subset of these modules, and arrange them non-symmetrically across the canvas, avoiding any fixed grid. Each variation should feature a unique, organic combination of elements. ` +
    `${conceptStr ? `Visual concept: ${conceptStr} ` : ""}` +
    `${palette}` +
    `${logoClause}` +
    `No photorealism.` +
    policy
  );

  if (hasLogoRef) warnIfSpecLeaks("art-style-prompt", prompt, [ctx.titleFont, ctx.bodyFont]);
  return prompt;
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
