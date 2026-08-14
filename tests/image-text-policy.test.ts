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

test("findRenderableSpecLeaks flags quoted fonts and field labels, not bare hex", () => {
  const leaky = `Brand colors: "#14213D". Typography: "Fraunces".`;
  const leaks = findRenderableSpecLeaks(leaky, ["Fraunces"]);
  assert.deepEqual(leaks, [`"#14213D"`, `"Fraunces"`, "Brand colors:", "Typography:"]);

  const safe = formatColorSchemeSpec(["#14213D"]) + " " + formatTypefaceCharacterSpec("Fraunces");
  assert.deepEqual(findRenderableSpecLeaks(safe, ["Fraunces"]), []);
});

test("art-style prompt does not invite a labeled style board", () => {
  const prompt = buildArtStyleImagePrompt(ctx);
  assert.match(prompt, /abstract 2D graphic composition/);
  assert.match(prompt, /The atmosphere is precise, warm/);
  assert.doesNotMatch(prompt, /style board/i);
  assert.doesNotMatch(prompt, /Keywords:/);
  assert.doesNotMatch(prompt, /Tagline:/);
  assert.doesNotMatch(prompt, /Target audience:/);
  assert.doesNotMatch(prompt, /Brand colors:/);
  assert.doesNotMatch(prompt, /"Fraunces"/);
  assert.doesNotMatch(prompt, /"Northstar"/);
  assert.match(prompt, /Render no text, letters, or numbers at all/);
  assert.deepEqual(findRenderableSpecLeaks(prompt, [ctx.titleFont, ctx.bodyFont]), []);
});

test("application prompt omits hex and fonts when visual refs are present", () => {
  const prompt = buildApplicationImagePrompt({ ...ctx, hasVisualRefs: true });
  assert.match(prompt, /Coffee sleeve mockup of Northstar/);
  assert.match(prompt, /Match the color, graphic language, and mark from the reference images/);
  assert.doesNotMatch(prompt, /#14213D/);
  assert.doesNotMatch(prompt, /Fraunces/);
  assert.doesNotMatch(prompt, /Typography:/);
  assert.match(prompt, /Keep the text already present in the source image and add no new text beyond "Northstar" and "Find your way"/);
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
