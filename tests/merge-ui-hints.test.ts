import assert from "node:assert/strict";
import test from "node:test";

import {
  MERGE_UI_HINTS,
  resolveMergeUiHint,
  resolveMoveUiHint,
  resolveSnapshotUiHint,
  supportedMergeUiHintKeys,
} from "../supabase/functions/server/shared/merge-ui-hints.ts";
import { toMergePairKey } from "../supabase/functions/server/shared/merge-pairs.ts";

const EXPECTED_HINTS = {
  "color-palette→font": {
    slot: "Create font pairing inspired by colors",
    card: "Match font pairing to colors",
  },
  "color-palette→logo": {
    slot: "Create logo from palette",
    card: "Recolor logo",
  },
  "color-palette→art-style": {
    slot: "Create art style from palette",
    card: "Recolor art style",
  },
  "font→color-palette": {
    slot: "Create palette from typography",
    card: "Match palette to typography",
  },
  "font→logo": {
    slot: "Create wordmark from typography",
    card: "Replace logo typography",
  },
  "font→art-style": {
    slot: "Create art style from typography",
    card: "Apply typography to art style",
  },
  "logo→color-palette": {
    slot: "Extract palette from logo",
    card: "Match palette to logo",
  },
  "logo→font": {
    slot: "Create font pairing from logo",
    card: "Match font pairing to logo",
  },
  "logo→art-style": {
    slot: "Create art style from logo",
    card: "Replace logo in art style",
  },
  "art-style→color-palette": {
    slot: "Extract palette from art style",
    card: "Match palette to art style",
  },
  "art-style→font": {
    slot: "Create font pairing from art style",
    card: "Match font pairing to art style",
  },
  "art-style→logo": {
    slot: "Create logo from art style",
    card: "Apply art style to logo",
  },
} as const;

test("covers every supported merge pair with exact slot and card copy", () => {
  const supportedKeys = supportedMergeUiHintKeys().sort();
  const actualKeys = Object.keys(MERGE_UI_HINTS).sort();
  const expectedKeys = Object.keys(EXPECTED_HINTS).sort();

  assert.deepEqual(actualKeys, supportedKeys);
  assert.deepEqual(actualKeys, expectedKeys);
  assert.deepEqual(MERGE_UI_HINTS, EXPECTED_HINTS);

  for (const key of expectedKeys) {
    const [sourceId, targetId] = key.split("→");
    const expected = EXPECTED_HINTS[key as keyof typeof EXPECTED_HINTS];
    assert.equal(toMergePairKey(sourceId, targetId), key);
    assert.equal(resolveMergeUiHint("slot", sourceId, targetId), expected.slot);
    assert.equal(resolveMergeUiHint("card", sourceId, targetId), expected.card);
  }
});

test("keeps all merge UI hints short, complete, and placeholder-free", () => {
  for (const hints of Object.values(MERGE_UI_HINTS)) {
    for (const hint of [hints.slot, hints.card]) {
      assert.ok(hint.length > 0);
      assert.ok(hint.length <= 40, `Hint is too long: ${hint}`);
      assert.doesNotMatch(hint, /[{}]/);
      assert.doesNotMatch(hint, /whose moo|mood and c|stylewith/i);
    }
  }
});

test("regresses the reversed logo and art-style card copy", () => {
  assert.equal(
    resolveMergeUiHint("card", "logo", "art-style"),
    "Replace logo in art style",
  );
  assert.equal(
    resolveMergeUiHint("card", "art-style", "logo"),
    "Apply art style to logo",
  );
});

test("resolves complete move and snapshot feedback", () => {
  assert.equal(resolveMoveUiHint("logo", "art-style"), "Move Logo to Art Style");
  assert.equal(resolveMoveUiHint("art-style", "logo"), "Move Art Style to Logo");
  assert.equal(resolveSnapshotUiHint("color-palette"), "Update snapshot with Color Palette");
  assert.equal(resolveSnapshotUiHint("font"), "Update snapshot with Typography");
  assert.equal(resolveSnapshotUiHint("logo"), "Update snapshot with Logo");
  assert.equal(resolveSnapshotUiHint("art-style"), "Update snapshot with Art Style");
});

test("uses a defensive fallback for unsupported merge pairs", () => {
  assert.equal(resolveMergeUiHint("slot", "logo", "logo"), "Combine cards");
  assert.equal(resolveMergeUiHint("card", "visual-concept", "font"), "Combine cards");
});
