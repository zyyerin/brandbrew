import assert from "node:assert/strict";
import test from "node:test";

import {
  CHROMA_VALUES,
  DislikeAnalyzer,
  expandMcuPalette,
  Hct,
  ROLE_ORDER,
  ROLE_TONES,
  argbFromHex,
  knobsFromHex,
  pickCoreHex,
  snapHue,
} from "../scripts/lib/mcu-palette.mjs";

const blueSeed = {
  hue: 250,
  chroma: "standard" as const,
  variant: "content" as const,
};

test("snapHue quantizes to 5° and wraps", () => {
  assert.equal(snapHue(32), 30);
  assert.equal(snapHue(33), 35);
  assert.equal(snapHue(358), 0);
  assert.equal(snapHue(-10), 350);
});

test("expandMcuPalette is deterministic", () => {
  const a = expandMcuPalette(blueSeed);
  const b = expandMcuPalette(blueSeed);
  assert.deepEqual(a.hexes, b.hexes);
  assert.deepEqual(a.roles, b.roles);
  assert.equal(a.hexes.length, 5);
  assert.deepEqual(ROLE_ORDER, ["paper", "primary", "muted", "accent", "ink"]);
});

test("muted chroma is lower than vivid on the same hue", () => {
  const muted = expandMcuPalette({ hue: 250, chroma: "muted", variant: "content" });
  const vivid = expandMcuPalette({ hue: 250, chroma: "vivid", variant: "content" });
  assert.ok(muted.hct.chroma < vivid.hct.chroma);
  assert.equal(muted.hct.requestedChroma, CHROMA_VALUES.muted);
  assert.equal(vivid.hct.requestedChroma, CHROMA_VALUES.vivid);
});

test("disliked dark yellow-green primary is lifted", () => {
  const dirty = expandMcuPalette({ hue: 100, chroma: "vivid", variant: "content" });
  const primaryHct = Hct.fromInt(argbFromHex(dirty.roles.primary.hex));
  assert.equal(DislikeAnalyzer.isDisliked(primaryHct), false);
  assert.ok(primaryHct.tone >= 65);

  const rawAtForty = Hct.from(100, CHROMA_VALUES.vivid, ROLE_TONES.primary);
  assert.equal(DislikeAnalyzer.isDisliked(rawAtForty), true);
});

test("a liked blue primary stays near the brand-hero tone", () => {
  const expanded = expandMcuPalette(blueSeed);
  const primaryHct = Hct.fromInt(argbFromHex(expanded.roles.primary.hex));
  assert.ok(Math.abs(primaryHct.tone - ROLE_TONES.primary) < 3);
  assert.equal(DislikeAnalyzer.isDisliked(primaryHct), false);
});

test("locked primaryHex is used verbatim", () => {
  const expanded = expandMcuPalette({
    primaryHex: "#FFCB05",
    variant: "content",
  });
  assert.equal(expanded.roles.primary.hex, "#FFCB05");
  assert.equal(expanded.roles.primary.source, "locked");
  assert.equal(expanded.hexes[1], "#FFCB05");
  assert.notEqual(expanded.roles.paper.hex, "#FFCB05");
  assert.notEqual(expanded.roles.ink.hex, "#FFCB05");
});

test("pickCoreHex prefers the chromatic color over slate or paper", () => {
  const core = pickCoreHex(["#F5F0E8", "#C45C26", "#1A1A1A"]);
  assert.equal(core.toUpperCase(), "#C45C26");
  assert.equal(pickCoreHex(["#0F172A", "#38BDF8", "#F8FAFC", "#64748B"]).toUpperCase(), "#38BDF8");
  const knobs = knobsFromHex(core);
  assert.equal(typeof knobs.hue, "number");
  assert.ok(["muted", "standard", "vivid"].includes(knobs.chroma));
});
