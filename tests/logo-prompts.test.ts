import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  assignedLogoCompositionBlock,
  attachAssignedLogoComposition,
  buildLogoImagePrompt,
  collectExcludedLogoCompositions,
  pickLogoCompositionMode,
  validateLogoComposition,
  validateOptionalLogoComposition,
  withLogoWhiteCanvas,
  LOGO_WHITE_CANVAS_RULE,
  type LogoComposition,
} from "../supabase/functions/server/shared/logo-prompts.ts";
import { PALETTE_FONTS_TASK_DESCRIPTION } from "../supabase/functions/server/shared/art-director-prompts.ts";
import {
  buildBriefIdentityContextText,
  omitTaglineDeep,
  omitTaglineForLogo,
} from "../supabase/functions/server/shared/brand-context.ts";

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
  assert.match(prompt, /The canvas must stay solid #FFFFFF/);
  assert.match(prompt, /Off-white, cream, ivory, beige/);
  assert.match(prompt, /never as the canvas, paper, or background/);
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

test("art-director styling prompt requires a rationale for an assigned composition", () => {
  assert.match(PALETTE_FONTS_TASK_DESCRIPTION, /"logoComposition"/);
  assert.match(PALETTE_FONTS_TASK_DESCRIPTION, /"rationale"/);
  assert.match(PALETTE_FONTS_TASK_DESCRIPTION, /assigned by the system/);
  assert.match(PALETTE_FONTS_TASK_DESCRIPTION, /rationale must be a non-empty/);
  assert.doesNotMatch(PALETTE_FONTS_TASK_DESCRIPTION, /Choose symbol-wordmark-horizontal/);
  assert.doesNotMatch(PALETTE_FONTS_TASK_DESCRIPTION, /Choose symbol-wordmark-stacked/);
  assert.doesNotMatch(PALETTE_FONTS_TASK_DESCRIPTION, /Choose wordmark-only/);
  assert.doesNotMatch(PALETTE_FONTS_TASK_DESCRIPTION, /mode must be exactly one of/);
});

test("styling prompt example JSON does not hardcode a composition mode", () => {
  assert.doesNotMatch(
    PALETTE_FONTS_TASK_DESCRIPTION,
    /"logoComposition": \{\s*"mode":/,
  );
});

test("art-director samples a composition mode and ignores the model's mode field", () => {
  const source = readFileSync(
    new URL("../supabase/functions/server/agents/art-director.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /excludedPalettes/);
  assert.match(source, /excludedFonts/);
  assert.match(source, /excludedCompositions/);
  assert.match(source, /pickLogoCompositionMode/);
  assert.match(source, /attachAssignedLogoComposition/);
  assert.doesNotMatch(source, /validateLogoComposition\(result\.logoComposition\)/);
});

test("picks a weighted composition mode and skips excluded ones", () => {
  assert.equal(pickLogoCompositionMode([], () => 0), "symbol-wordmark-horizontal");
  assert.equal(pickLogoCompositionMode([], () => 0.41), "symbol-wordmark-stacked");
  assert.equal(pickLogoCompositionMode([], () => 0.71), "wordmark-only");
  assert.equal(
    pickLogoCompositionMode(["symbol-wordmark-horizontal"], () => 0),
    "symbol-wordmark-stacked",
  );
  assert.equal(
    pickLogoCompositionMode(["symbol-wordmark-horizontal"], () => 0.51),
    "wordmark-only",
  );
  assert.equal(
    pickLogoCompositionMode(
      ["symbol-wordmark-horizontal", "symbol-wordmark-stacked", "wordmark-only"],
      () => 0,
    ),
    "symbol-wordmark-horizontal",
  );
  assert.equal(pickLogoCompositionMode(["not-a-mode"], () => 0), "symbol-wordmark-horizontal");
});

test("attaches the assigned mode and ignores any mode the model returns", () => {
  assert.deepEqual(
    attachAssignedLogoComposition(
      { mode: "symbol-wordmark-horizontal", rationale: "  Custom lettering should lead.  " },
      "wordmark-only",
    ),
    {
      mode: "wordmark-only",
      rationale: "Custom lettering should lead.",
    },
  );
  assert.throws(
    () => attachAssignedLogoComposition({ mode: "wordmark-only", rationale: "   " }, "wordmark-only"),
    /rationale must be a non-empty string/,
  );
});

test("collects used composition modes from variation meta and pipeline seed", () => {
  assert.deepEqual(
    collectExcludedLogoCompositions([
      { meta: { logoComposition: { mode: "wordmark-only", rationale: "Name first." } } },
      { meta: { pipelineSeed: { logoComposition: { mode: "symbol-wordmark-stacked", rationale: "Seal." } } } },
      { meta: { logoComposition: { mode: "wordmark-only", rationale: "Repeat." } } },
      { meta: {} },
      {},
    ]),
    ["wordmark-only", "symbol-wordmark-stacked"],
  );
});

test("assigned composition block names the sampled mode", () => {
  assert.match(
    assignedLogoCompositionBlock("wordmark-only"),
    /Assigned logo composition mode: wordmark-only/,
  );
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
  assert.match(prompt, /selected title typeface Fraunces/);
  assert.doesNotMatch(prompt, /"Fraunces"/);
  assert.doesNotMatch(prompt, /Brand colors:/);
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
  assert.match(prompt, /selected title typeface Fraunces/);
  assertSharedRules(prompt);
});

test("builds a custom wordmark-only prompt with the title font", () => {
  const prompt = buildLogoImagePrompt({
    ...baseContext,
    logoComposition: composition("wordmark-only"),
  });

  assert.match(prompt, /wordmark-only logo using distinctive custom lettering/);
  assert.match(prompt, /selected title typeface Fraunces/);
  assert.match(prompt, /Do not add a separate symbol, icon, emblem, or pictorial mark/);
  assert.doesNotMatch(prompt, /"Fraunces"/);
  assertSharedRules(prompt);
});

test("keeps the legacy symbol-only prompt when no composition is supplied", () => {
  const prompt = buildLogoImagePrompt(baseContext);

  assert.match(prompt, /Purely graphic symbol/);
  assert.match(prompt, /absolutely NO text, NO letters, NO words, NO characters/);
  assert.doesNotMatch(prompt, /Logo composition decision/);
  assert.doesNotMatch(prompt, /\.\./);
});

test("drops nested tagline fields from logo payloads only", () => {
  const payload = {
    brandName: "Northstar",
    tagline: "Find your way",
    brandContext: {
      name: "Northstar",
      tagline: "Find your way",
      brandBrief: { core: { name: "Northstar", tagline: "Find your way" } },
    },
    keywords: ["clear", "precise"],
  };

  const stripped = omitTaglineForLogo("logo", payload);
  assert.equal("tagline" in stripped, false);
  assert.equal("tagline" in stripped.brandContext, false);
  assert.equal("tagline" in stripped.brandContext.brandBrief.core, false);
  assert.deepEqual(stripped.keywords, ["clear", "precise"]);
  assert.equal(buildBriefIdentityContextText(stripped.brandContext), 'Brand: "Northstar"');

  const kept = omitTaglineForLogo("art-style", payload);
  assert.equal(kept.tagline, "Find your way");
  assert.equal(omitTaglineDeep(payload).brandContext.name, "Northstar");
});

test("palette-to-logo identity text does not quote a tagline after stripping", () => {
  const coreText = buildBriefIdentityContextText(
    omitTaglineDeep({
      name: "Northstar",
      tagline: "Find your way",
      keywords: ["clear"],
    }),
  );
  assert.match(coreText, /Brand: "Northstar"/);
  assert.match(coreText, /Keywords: clear/);
  assert.doesNotMatch(coreText, /Tagline:/);
  assert.doesNotMatch(coreText, /Find your way/);
});

test("logo image prompt does not interpolate a leaked tagline field", () => {
  const ctx = {
    ...baseContext,
    logoComposition: composition("symbol-wordmark-horizontal"),
    tagline: "Find your way",
  };
  const prompt = buildLogoImagePrompt(ctx);
  assert.doesNotMatch(prompt, /Find your way/);
  assert.doesNotMatch(prompt, /Tagline:/);
  assertSharedRules(prompt);
});

test("withLogoWhiteCanvas appends the canvas lock only for logo targets", () => {
  assert.equal(withLogoWhiteCanvas("Design a style board.", "art-style"), "Design a style board.");
  const locked = withLogoWhiteCanvas("Design a logo.", "logo");
  assert.match(locked, /^Design a logo\.\n\n/);
  assert.ok(locked.endsWith(LOGO_WHITE_CANVAS_RULE));
  assert.equal(
    withLogoWhiteCanvas(`Design a logo.\n\n${LOGO_WHITE_CANVAS_RULE}`, "logo"),
    `Design a logo.\n\n${LOGO_WHITE_CANVAS_RULE}`,
  );
});

test("color-palette→logo slot merge keeps light palette colors off the canvas", () => {
  const mergeSpecs = readFileSync(
    new URL("../supabase/functions/server/shared/merge-specs.tsx", import.meta.url),
    "utf8",
  );
  const visualDesigner = readFileSync(
    new URL("../supabase/functions/server/agents/visual-designer.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    mergeSpecs,
    /Keep a solid white canvas; apply the scheme only to the mark and wordmark/,
  );
  assert.match(mergeSpecs, /cardType === "logo" \? "logo-mark"/);
  assert.match(visualDesigner, /withLogoWhiteCanvas\(/);
  assert.match(visualDesigner, /sourceTextData,\s*cardType,/);
});

test("art-style drawing fetches the finished logo as a reference image", () => {
  const source = readFileSync(
    new URL("../supabase/functions/server/agents/art-director.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /fetchLogoReferenceImages/);
  assert.match(source, /cardType === "art-style"/);
  assert.match(source, /refImages: refImages\.length > 0 \? refImages : undefined/);
  assert.doesNotMatch(
    source,
    /Promise\.all\(\[\s*artDirector\.request\("\/design-logo"/,
  );
});

test("pipeline waits for the logo before requesting art-style with that lockup", () => {
  const source = readFileSync(
    new URL("../src/app/hooks/usePipeline.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /logoImageUrl/);
  assert.match(source, /endpoint: "art-director\/design-logo"/);
  assert.match(source, /endpoint: "art-director\/design-art-style"/);
  assert.doesNotMatch(source, /allSettledMaybeSequential/);
  assert.doesNotMatch(source, /not held back by the art style/);
});
