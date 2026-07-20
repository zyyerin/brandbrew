import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLogoImagePrompt,
  validateLogoComposition,
  validateOptionalLogoComposition,
  type LogoComposition,
} from "../supabase/functions/server/shared/logo-prompts.ts";
import { PALETTE_FONTS_TASK_DESCRIPTION } from "../supabase/functions/server/shared/art-director-prompts.ts";

const baseContext = {
  brandName: "Northstar",
  description: "A navigation platform for independent teams.",
  visualConcept: {
    concept: "Guiding light",
    description: "Precise geometry with a warm focal point",
  },
  colorPalette: ["#14213D", "#FCA311", "#FFFFFF"],
  titleFont: "Fraunces",
};

function composition(mode: LogoComposition["mode"]): LogoComposition {
  return {
    mode,
    rationale: "The composition matches the brand's concise, directional identity.",
  };
}

function assertSharedRules(prompt: string): void {
  assert.match(prompt, /Render the brand name exactly as "Northstar", once and only once/);
  assert.match(prompt, /Show no tagline, subtitle, explanation, label, or any other text or characters/);
  assert.match(prompt, /one cohesive lockup only/);
  assert.match(prompt, /no logo sheet/);
  assert.match(prompt, /no alternate variants/);
  assert.match(prompt, /no application mockup/);
  assert.match(prompt, /pure white background with generous padding/);
  assert.doesNotMatch(prompt, /\.\./);
}

test("validates and trims a supported logo composition", () => {
  assert.deepEqual(
    validateLogoComposition({
      mode: "symbol-wordmark-horizontal",
      rationale: "  Balanced recognition for a compact name.  ",
    }),
    {
      mode: "symbol-wordmark-horizontal",
      rationale: "Balanced recognition for a compact name.",
    },
  );
});

test("art-director styling prompt requires the structured composition decision", () => {
  assert.match(PALETTE_FONTS_TASK_DESCRIPTION, /"logoComposition"/);
  assert.match(PALETTE_FONTS_TASK_DESCRIPTION, /symbol-wordmark-horizontal/);
  assert.match(PALETTE_FONTS_TASK_DESCRIPTION, /symbol-wordmark-stacked/);
  assert.match(PALETTE_FONTS_TASK_DESCRIPTION, /wordmark-only/);
  assert.match(PALETTE_FONTS_TASK_DESCRIPTION, /rationale must be a non-empty/);
});

test("rejects missing or invalid logo compositions", () => {
  assert.throws(() => validateLogoComposition(undefined), /logoComposition is required/);
  assert.throws(
    () => validateLogoComposition({ mode: "symbol-only", rationale: "Legacy mode" }),
    /logoComposition\.mode must be one of/,
  );
  assert.throws(
    () => validateLogoComposition({ mode: "wordmark-only", rationale: "   " }),
    /logoComposition\.rationale must be a non-empty string/,
  );
  assert.equal(validateOptionalLogoComposition(undefined), undefined);
  assert.equal(validateOptionalLogoComposition(null), undefined);
});

test("builds a horizontal combination-mark prompt with the title font", () => {
  const prompt = buildLogoImagePrompt({
    ...baseContext,
    logoComposition: composition("symbol-wordmark-horizontal"),
  });

  assert.match(prompt, /horizontal combination mark/);
  assert.match(prompt, /symbol on the left/);
  assert.match(prompt, /wordmark on the right/);
  assert.match(prompt, /selected title typeface "Fraunces"/);
  assert.match(prompt, /Visual concept: Guiding light\./);
  assert.doesNotMatch(prompt, /Brand description/);
  assert.doesNotMatch(prompt, /A navigation platform for independent teams/);
  assert.doesNotMatch(prompt, /Precise geometry with a warm focal point/);
  assertSharedRules(prompt);
});

test("builds a stacked combination-mark prompt with the title font", () => {
  const prompt = buildLogoImagePrompt({
    ...baseContext,
    logoComposition: composition("symbol-wordmark-stacked"),
  });

  assert.match(prompt, /stacked combination mark/);
  assert.match(prompt, /symbol above/);
  assert.match(prompt, /wordmark below/);
  assert.match(prompt, /selected title typeface "Fraunces"/);
  assertSharedRules(prompt);
});

test("builds a custom wordmark-only prompt without the title font", () => {
  const prompt = buildLogoImagePrompt({
    ...baseContext,
    logoComposition: composition("wordmark-only"),
  });

  assert.match(prompt, /wordmark-only logo using distinctive custom lettering/);
  assert.match(prompt, /Do not add a separate symbol, icon, emblem, or pictorial mark/);
  assert.doesNotMatch(prompt, /Fraunces/);
  assertSharedRules(prompt);
});

test("keeps the legacy symbol-only prompt when no composition is supplied", () => {
  const prompt = buildLogoImagePrompt(baseContext);

  assert.match(prompt, /Purely graphic symbol/);
  assert.match(prompt, /absolutely NO text, NO letters, NO words, NO characters/);
  assert.doesNotMatch(prompt, /Logo composition decision/);
  assert.doesNotMatch(prompt, /\.\./);
});
