import assert from "node:assert/strict";
import test from "node:test";

import type { MergeSpec } from "../supabase/functions/server/shared/types.tsx";
import { resolveMergeUiHint } from "../supabase/functions/server/shared/merge-ui-hints.ts";
import { SUPPORTED_MERGE_PAIRS } from "../supabase/functions/server/shared/merge-pairs.ts";
import {
  mergeCardIdToField,
  omitsCurrentPaletteInSlotExtract,
  omitsCurrentTargetInTextMerge,
  prepareTextMerge,
} from "../supabase/functions/server/shared/merge-text.ts";

const PALETTE = ["#1A1A1A", "#F4EDE4", "#C45C26"];
const EXISTING_FONT = { titleFont: "Fraunces", bodyFont: "Source Sans 3" };
const NEW_FONT = { titleFont: "Playfair Display", bodyFont: "Lato" };

/** Mirrors MERGE_SPECS["color-palette"]["font"] text-merge fields used by /txt2txt. */
const COLOR_TO_FONT_SPEC: MergeSpec = {
  newHint: "Find a Google Fonts pairing (titleFont + bodyFont) whose mood and character reflects the emotional tone of the given color palette",
  allowedFields: ["font.titleFont", "font.bodyFont"],
  instruction:
    "Recommend a Google Fonts pairing (titleFont + bodyFont) whose typographic mood matches the emotional tone of the given color palette. Change only titleFont and bodyFont.",
};

/**
 * Slot drop color→font sends checked slots only (see buildMergeFullBrandContext),
 * then overrides colorPalette with the dragged variation.
 */
function slotMergeBrandData(opts: {
  sourcePalette: string[];
  checkedFont: { titleFont: string; bodyFont: string } | null;
}) {
  return {
    colorPalette: opts.sourcePalette,
    font: opts.checkedFont,
  };
}

/** Same JSON identity check as projectHasEquivalentVariation. */
function clientWouldKeepMergeResult(
  existingFontDatas: unknown[],
  patchFont: unknown | null,
): boolean {
  if (patchFont == null) return false;
  const key = JSON.stringify(patchFont);
  return !existingFontDatas.some((data) => JSON.stringify(data) === key);
}

function diagnoseColorToFontSlotMerge(opts: {
  checkedFont: { titleFont: string; bodyFont: string } | null;
  existingFonts: { titleFont: string; bodyFont: string }[];
  sourcePalette: string[];
  modelPatchFont?: { titleFont: string; bodyFont: string } | null;
}) {
  const prepared = prepareTextMerge(
    "color-palette",
    "font",
    slotMergeBrandData({
      sourcePalette: opts.sourcePalette,
      checkedFont: opts.checkedFont,
    }),
    COLOR_TO_FONT_SPEC,
  );
  if (!prepared.ok) {
    return {
      wouldCallModel: false,
      abortReason: prepared.reason,
      wouldKeepCard: false,
    };
  }
  if (opts.modelPatchFont === undefined) {
    return { wouldCallModel: true, abortReason: null, wouldKeepCard: null };
  }
  return {
    wouldCallModel: true,
    abortReason: null,
    wouldKeepCard: clientWouldKeepMergeResult(opts.existingFonts, opts.modelPatchFont),
  };
}

test("color-palette→font is a supported text merge, not an unsupported-pair abort", () => {
  assert.ok(
    SUPPORTED_MERGE_PAIRS.some(([source, target]) => source === "color-palette" && target === "font"),
  );
  assert.equal(mergeCardIdToField("font"), "font");
  assert.equal(resolveMergeUiHint("slot", "color-palette", "font"), "Create font pairing inspired by colors");

  const prepared = prepareTextMerge(
    "color-palette",
    "font",
    { colorPalette: PALETTE, font: EXISTING_FONT },
    COLOR_TO_FONT_SPEC,
  );
  assert.equal(prepared.ok, true);
  if (prepared.ok) {
    assert.equal(prepared.targetField, "font");
    assert.deepEqual(prepared.spec.allowedFields, ["font.titleFont", "font.bodyFont"]);
  }
});

test("instant vanish: no checked typography aborts before the model (missing-target-data)", () => {
  const emptyQueue = diagnoseColorToFontSlotMerge({
    checkedFont: null,
    existingFonts: [],
    sourcePalette: PALETTE,
  });
  assert.deepEqual(emptyQueue, {
    wouldCallModel: false,
    abortReason: "missing-target-data",
    wouldKeepCard: false,
  });

  const uncheckedExistingFont = diagnoseColorToFontSlotMerge({
    checkedFont: null,
    existingFonts: [EXISTING_FONT],
    sourcePalette: PALETTE,
  });
  assert.equal(uncheckedExistingFont.abortReason, "missing-target-data");
  assert.equal(uncheckedExistingFont.wouldCallModel, false);
});

test("duplicate skip cannot explain an instant vanish: it only runs after a model patch", () => {
  const emptyQueue = diagnoseColorToFontSlotMerge({
    checkedFont: null,
    existingFonts: [],
    sourcePalette: PALETTE,
    modelPatchFont: NEW_FONT,
  });
  assert.equal(emptyQueue.wouldCallModel, false, "server aborts before any patch exists");
  assert.equal(
    clientWouldKeepMergeResult([], NEW_FONT),
    true,
    "an empty typography queue has nothing to dedupe against",
  );

  const afterModelDuplicate = diagnoseColorToFontSlotMerge({
    checkedFont: EXISTING_FONT,
    existingFonts: [EXISTING_FONT],
    sourcePalette: PALETTE,
    modelPatchFont: EXISTING_FONT,
  });
  assert.equal(afterModelDuplicate.wouldCallModel, true);
  assert.equal(afterModelDuplicate.wouldKeepCard, false);
});

test("checked typography lets the merge reach the model (seconds, not instant)", () => {
  const result = diagnoseColorToFontSlotMerge({
    checkedFont: EXISTING_FONT,
    existingFonts: [EXISTING_FONT],
    sourcePalette: PALETTE,
    modelPatchFont: NEW_FONT,
  });
  assert.deepEqual(result, {
    wouldCallModel: true,
    abortReason: null,
    wouldKeepCard: true,
  });
});

test("prompt omits current typography for this pair, but the route still requires font payload", () => {
  assert.equal(omitsCurrentTargetInTextMerge("color-palette", "font"), true);
  assert.equal(omitsCurrentTargetInTextMerge("font", "color-palette"), true);
  assert.equal(omitsCurrentTargetInTextMerge("color-palette", "logo"), false);

  const withoutFont = prepareTextMerge(
    "color-palette",
    "font",
    { colorPalette: PALETTE },
    COLOR_TO_FONT_SPEC,
  );
  assert.equal(withoutFont.ok, false);
  if (!withoutFont.ok) assert.equal(withoutFont.reason, "missing-target-data");
});

test("slot extract-palette omits the checked palette; card extract keeps it", () => {
  assert.equal(omitsCurrentPaletteInSlotExtract("color-palette"), true);
  assert.equal(omitsCurrentPaletteInSlotExtract("color-palette", undefined), true);
  assert.equal(omitsCurrentPaletteInSlotExtract("color-palette", "var_palette"), false);
  assert.equal(omitsCurrentPaletteInSlotExtract("font"), false);
  assert.equal(omitsCurrentPaletteInSlotExtract("font", "var_font"), false);
});
