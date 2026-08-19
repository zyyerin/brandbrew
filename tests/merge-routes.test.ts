import assert from "node:assert/strict";
import test from "node:test";

import { SUPPORTED_MERGE_PAIRS } from "../supabase/functions/server/shared/merge-pairs.ts";
import {
  isMergeSupported,
  resolveImg2ImgImpl,
  resolveImg2TxtImpl,
  resolveMergeKind,
  resolveTxt2ImgImpl,
  type MergeKind,
} from "../supabase/functions/server/shared/merge-routes.ts";

const SLOT: Record<string, MergeKind> = {
  "color-palette→logo": "txt2img",
  "color-palette→art-style": "txt2img",
  "color-palette→font": "txt2txt",
  "font→logo": "txt2img",
  "font→art-style": "txt2img",
  "font→color-palette": "txt2txt",
  "logo→art-style": "img2img",
  "logo→color-palette": "img2txt",
  "logo→font": "img2txt",
  "art-style→logo": "img2img",
  "art-style→color-palette": "img2txt",
  "art-style→font": "img2txt",
};

const CARD: Record<string, MergeKind> = {
  "color-palette→logo": "img2img",
  "color-palette→art-style": "img2img",
  "color-palette→font": "txt2txt",
  "font→logo": "img2img",
  "font→art-style": "img2img",
  "font→color-palette": "txt2txt",
  "logo→art-style": "img2img",
  "logo→color-palette": "img2txt",
  "logo→font": "img2txt",
  "art-style→logo": "img2img",
  "art-style→color-palette": "img2txt",
  "art-style→font": "img2txt",
};

test("covers every supported pair for slot and card", () => {
  assert.equal(Object.keys(SLOT).length, SUPPORTED_MERGE_PAIRS.length);
  assert.equal(Object.keys(CARD).length, SUPPORTED_MERGE_PAIRS.length);
  for (const [source, target] of SUPPORTED_MERGE_PAIRS) {
    const key = `${source}→${target}`;
    assert.equal(resolveMergeKind(source, target), SLOT[key], `slot ${key}`);
    assert.equal(resolveMergeKind(source, target, "var_target"), CARD[key], `card ${key}`);
    assert.equal(isMergeSupported(source, target), true, `supported ${key}`);
  }
});

test("font→logo is txt2img without a target card and img2img with one", () => {
  assert.equal(resolveMergeKind("font", "logo"), "txt2img");
  assert.equal(resolveMergeKind("font", "logo", "var_logo"), "img2img");
});

test("unsupported pairs return null", () => {
  assert.equal(resolveMergeKind("logo", "logo"), null);
  assert.equal(resolveMergeKind("visual-concept", "logo"), null);
  assert.equal(resolveMergeKind("font", "logo", undefined), "txt2img");
  assert.equal(isMergeSupported("logo", "logo"), false);
  assert.equal(isMergeSupported("visual-concept", "logo"), false);
});

test("txt2img impl: font→logo is wordmark, other text→image pairs generate", () => {
  assert.equal(resolveTxt2ImgImpl("font", "logo"), "wordmark");
  assert.equal(resolveTxt2ImgImpl("font", "art-style"), "generate");
  assert.equal(resolveTxt2ImgImpl("color-palette", "logo"), "generate");
  assert.equal(resolveTxt2ImgImpl("color-palette", "art-style"), "generate");
});

test("img2txt impl: palette extracts, font uses vision", () => {
  assert.equal(resolveImg2TxtImpl("color-palette"), "extract-palette");
  assert.equal(resolveImg2TxtImpl("font"), "vision");
  assert.equal(resolveImg2TxtImpl("logo"), "vision");
});

test("img2img impl: target bitmap edits, otherwise generate from source", () => {
  assert.equal(resolveImg2ImgImpl(true), "edit");
  assert.equal(resolveImg2ImgImpl(false), "generate");
});
