import assert from "node:assert/strict";
import test from "node:test";

import {
  buildApplicationImagePrompt,
  buildArtStyleImagePrompt,
} from "../supabase/functions/server/shared/art-director-image-prompts.ts";
import {
  buildImageTextPolicy,
  findRenderableSpecLeaks,
  formatColorSchemeSpec,
  formatTypefaceCharacterSpec,
} from "../supabase/functions/server/shared/image-text-policy.ts";
import { buildSnapshotPrompt } from "../supabase/functions/server/shared/snapshot-prompts.ts";

const ctx = {
  brandName: "Northstar",
  tagline: "Find your way",
  description: "A navigation platform for independent teams.",
  visualConcept: {
    concept: "Guiding light",
    description: "Precise geometry with a warm focal point",
  },
  keywords: ["precise", "warm"],
  colorPalette: ["#14213D", "#FCA311", "#FFFFFF"],
  titleFont: "Fraunces",
  bodyFont: "Source Sans 3",
  application: "Coffee sleeve",
};

test("color spec names the values as inks, not as a Brand colors caption", () => {
  const spec = formatColorSchemeSpec(ctx.colorPalette);
  assert.match(spec, /fills and inks only/);
  assert.match(spec, /#14213D/);
  assert.doesNotMatch(spec, /Brand colors:/);
  assert.doesNotMatch(spec, /"#14213D"/);
});

test("logo-mark color spec keeps palette colors off the canvas", () => {
  const spec = formatColorSchemeSpec(ctx.colorPalette, { applyTo: "logo-mark" });
  assert.match(spec, /fills and inks of the mark and wordmark only/);
  assert.match(spec, /never as the canvas, paper, or background/);
  assert.match(spec, /#FCA311/);
  assert.doesNotMatch(spec, /"#FCA311"/);
  assert.doesNotMatch(spec, /Brand colors:/);
});

test("typeface spec stays unquoted and talks about visual character", () => {
  const spec = formatTypefaceCharacterSpec(ctx.titleFont, ctx.bodyFont);
  assert.match(spec, /visual character of Fraunces/);
  assert.match(spec, /Source Sans 3/);
  assert.doesNotMatch(spec, /"Fraunces"/);
  assert.doesNotMatch(spec, /Typography:/);
});

test("text policy with no renderable strings forbids all lettering", () => {
  const policy = buildImageTextPolicy();
  assert.match(policy, /Render no text, letters, or numbers at all/);
  assert.match(policy, /hex codes or numeric color values/);
  assert.match(policy, /typeface or font names/);
});

test("identity-board policy asks for type specimens instead of banning lettering", () => {
  const policy = buildImageTextPolicy({
    purpose: "identity-board",
    renderable: ["Northstar"],
  });
  assert.match(policy, /live lettering should include "Northstar"/i);
  assert.match(policy, /type specimens/);
  assert.match(policy, /Fill every compartment/);
  assert.doesNotMatch(policy, /Render no text, letters, or numbers at all/);
  assert.doesNotMatch(policy, /The only literal text that may appear/);
});

test("packaging policy forbids reprinting the identity board", () => {
  const policy = buildImageTextPolicy({
    purpose: "packaging",
    renderable: ["Northstar"],
    preserveExistingText: true,
  });
  assert.match(policy, /The only pack copy that may appear is "Northstar"/);
  assert.match(policy, /do not reproduce the board/);
  assert.match(policy, /no type-specimen sheets/);
});

test("findRenderableSpecLeaks flags quoted fonts and field labels, not bare hex", () => {
  const leaky = `Brand colors: "#14213D". Typography: "Fraunces".`;
  const leaks = findRenderableSpecLeaks(leaky, ["Fraunces"]);
  assert.deepEqual(leaks, [`"#14213D"`, `"Fraunces"`, "Brand colors:", "Typography:"]);

  const safe = formatColorSchemeSpec(["#14213D"]) + " " + formatTypefaceCharacterSpec("Fraunces");
  assert.deepEqual(findRenderableSpecLeaks(safe, ["Fraunces"]), []);
});

test("art-style prompt is a graphic style board, without the later text policy", () => {
  const prompt = buildArtStyleImagePrompt(ctx);
  assert.match(prompt, /modular, variable-panel brand style board for "Northstar"/);
  assert.match(prompt, /Visual concept: Guiding light. Precise geometry with a warm focal point/);
  assert.match(prompt, /Color palette: #14213D, #FCA311, #FFFFFF/);
  assert.match(prompt, /No photorealism/);
  assert.doesNotMatch(prompt, /finished brand logo lockup/);
  assert.doesNotMatch(prompt, /Render no text, letters, or numbers at all/);
  assert.doesNotMatch(prompt, /Keep the text already present/);
});

test("art-style prompt with a logo reference places that exact lockup", () => {
  const prompt = buildArtStyleImagePrompt({ ...ctx, hasVisualRefs: true });
  assert.match(prompt, /modular, variable-panel brand style board for "Northstar"/);
  assert.match(prompt, /The reference image is the finished brand logo lockup/);
  assert.match(prompt, /Place that exact lockup/);
  assert.match(prompt, /Do not redraw, restyle, or invent a different mark/);
  assert.match(prompt, /Do not add a second logo, wordmark, or alternate lockup/);
  assert.match(prompt, /Keep the text already present in the source image/);
  assert.doesNotMatch(prompt, /Color palette:/);
  assert.doesNotMatch(prompt, /"Fraunces"/);
  assert.doesNotMatch(prompt, /Typography:/);
  assert.deepEqual(findRenderableSpecLeaks(prompt, [ctx.titleFont, ctx.bodyFont]), []);
});

test("application prompt extracts from an identity board instead of reprinting it", () => {
  const prompt = buildApplicationImagePrompt({ ...ctx, hasVisualRefs: true });
  assert.match(prompt, /Coffee sleeve mockup of Northstar/);
  assert.match(prompt, /brand identity board/);
  assert.match(prompt, /Do not reprint the board on the product/);
  assert.doesNotMatch(prompt, /#14213D/);
  assert.doesNotMatch(prompt, /Fraunces/);
  assert.doesNotMatch(prompt, /Typography:/);
  assert.match(prompt, /The only pack copy that may appear is "Northstar" and "Find your way"/);
  assert.deepEqual(findRenderableSpecLeaks(prompt, [ctx.titleFont, ctx.bodyFont]), []);
});

test("application prompt uses unquoted specs when there are no visual refs", () => {
  const prompt = buildApplicationImagePrompt(ctx);
  assert.match(prompt, /visual character of Fraunces/);
  assert.match(prompt, /#14213D/);
  assert.doesNotMatch(prompt, /"Fraunces"/);
  assert.doesNotMatch(prompt, /Brand colors:/);
  assert.doesNotMatch(prompt, /Typography:/);
  assert.deepEqual(findRenderableSpecLeaks(prompt, [ctx.titleFont, ctx.bodyFont]), []);
});

test("snapshot keeps live type specimens and filled color blocks, without caption labels", () => {
  const prompt = buildSnapshotPrompt({
    brandName: ctx.brandName,
    colorPalette: ctx.colorPalette,
    font1: ctx.titleFont,
    font2: ctx.bodyFont,
    hasPalette: false,
    referenceImageRoles: ["logo", "art-style"],
  });
  assert.match(prompt, /filled modular brand identity snapshot/);
  assert.match(prompt, /no blank panels/);
  assert.match(prompt, /the Logo from Image 1/);
  assert.match(prompt, /graphic elements remixed from Image 2/);
  assert.match(prompt, /filled color-block compartment/);
  assert.match(prompt, /#14213D/);
  assert.match(prompt, /filled lettering compartment of live type in the visual character of Fraunces and Source Sans 3/);
  assert.match(prompt, /set "Northstar"/);
  assert.match(prompt, /short type specimens/);
  assert.doesNotMatch(prompt, /Fonts:/);
  assert.doesNotMatch(prompt, /Color Palette:/);
  assert.doesNotMatch(prompt, /Brand colors:/);
  assert.doesNotMatch(prompt, /"Fraunces"/);
  assert.doesNotMatch(prompt, /The only literal text that may appear/);
  assert.doesNotMatch(prompt, /Render no text, letters, or numbers at all/);
  assert.deepEqual(findRenderableSpecLeaks(prompt, [ctx.titleFont, ctx.bodyFont]), []);
});

test("snapshot still includes a lettering compartment when a logo reference is present", () => {
  const prompt = buildSnapshotPrompt({
    brandName: ctx.brandName,
    font1: ctx.titleFont,
    font2: ctx.bodyFont,
    hasPalette: false,
    referenceImageRoles: ["logo"],
  });
  assert.match(prompt, /filled lettering compartment/);
  assert.match(prompt, /Fraunces/);
});
