// ─────────────────────────────────────────────────────────────────────────────
// shared/art-director-image-prompts.ts — txt2img briefs for drawing-stage cards
//
// Art-style is a modular style board. When a finished lockup is supplied as a
// reference image, it is a style reference and is not printed on the board.
// The hex/font-name ban belongs on application mockups, not on this board.
// ─────────────────────────────────────────────────────────────────────────────

import type { ImagePromptContext } from "./types.tsx";
import {
  buildLogoImagePrompt,
  formatColorSchemeSpec,
  formatTypefaceCharacterSpec,
} from "./logo-prompts.ts";
import { IMAGE_TEXT_POLICY } from "./image-text-policy.ts";

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
    ? "The reference image is the finished brand logo lockup. Use it as a style reference without printing it on the board."
    : "";

  const prompt = (
    `Create a modular, variable-panel brand style board for "${name}". ` +
    `The board must be segmented into distinct, non-fixed modules, selecting organically from a library of visual elements to create a dynamic composition. This potential library includes graphic patterns, icon systems, geometric forms, textural explorations, and typographic shapes. Select 2-4 of these modules, and arrange them across the canvas. ` +
    `${conceptStr ? `Visual concept: ${conceptStr} ` : ""}` +
    `${palette}` +
    `${logoClause}` +
    `No photorealism.`
  );

  return prompt;
}

export function buildApplicationImagePrompt(ctx: ImagePromptContext): string {
  const name = ctx.brandName?.trim() || "the brand";
  const touchpoint = ctx.application?.trim() || "brand packaging";
  const focus = ctx.newHint ? `Creative direction: ${asSentence(ctx.newHint)} ` : "";
  const hasVisualRefs = !!ctx.hasVisualRefs;

  const specLines = hasVisualRefs
    ? [
        "The reference images include a finished logo lockup. Place that exact mark on the product.",
        "Take color and graphic motifs from any other reference, but do not reprint a board.",
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
    IMAGE_TEXT_POLICY,
  ].filter((part) => part.trim().length > 0).join(" ");

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
