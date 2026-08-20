import assert from "node:assert/strict";
import test from "node:test";

import { parseTagList } from "../src/app/utils/parse-tag-list.ts";

test("splits comma-separated tags", () => {
  assert.deepEqual(parseTagList("fresh, credible, energetic"), [
    "fresh",
    "credible",
    "energetic",
  ]);
});

test("splits markdown bullet lists using - as a delimiter", () => {
  assert.deepEqual(
    parseTagList("- fresh\n- credible\n- energetic"),
    ["fresh", "credible", "energetic"],
  );
});

test("splits inline hyphen-space lists", () => {
  assert.deepEqual(parseTagList("- fresh - credible - energetic"), [
    "fresh",
    "credible",
    "energetic",
  ]);
});

test("preserves word-internal hyphens", () => {
  assert.deepEqual(parseTagList("eco-friendly, plant-based"), [
    "eco-friendly",
    "plant-based",
  ]);
});

test("strips a leading bullet from a single tag", () => {
  assert.deepEqual(parseTagList("- fresh"), ["fresh"]);
});

test("returns an empty array for blank input", () => {
  assert.deepEqual(parseTagList(""), []);
  assert.deepEqual(parseTagList("   "), []);
  assert.deepEqual(parseTagList(null), []);
});
