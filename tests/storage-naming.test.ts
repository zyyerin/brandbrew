import assert from "node:assert/strict";
import test from "node:test";

import { createProjectId } from "../src/app/utils/current-project-id.ts";
import {
  buildImageBaseName,
  formatStorageTimestamp,
} from "../supabase/functions/server/shared/storage-paths.ts";

test("creates readable project ids with local creation time and a short suffix", () => {
  const createdAt = new Date(2026, 7, 10, 9, 46, 25);
  assert.equal(
    createProjectId(createdAt, "A83F2C1D-extra"),
    "proj-20260810-094625-a83f2c1d",
  );
});

test("formats COS timestamps in the configured Shanghai timezone", () => {
  const utcTime = new Date("2026-08-10T01:46:25.000Z");
  assert.equal(formatStorageTimestamp(utcTime), "20260810-094625");
});

test("creates readable, safe image names with the correct extension", () => {
  const utcTime = new Date("2026-08-10T02:37:48.000Z");
  assert.equal(
    buildImageBaseName("Visual Snapshot", "image/jpeg", utcTime, "a5537ebb-14f4-401c-a9ad-fc859654d9d4"),
    "visual-snapshot-20260810-103748-a5537ebb.jpg",
  );
  assert.equal(
    buildImageBaseName("art-style", "image/webp", utcTime, "baa3cad0-1217-4cc1-99fe-06d2392e2439"),
    "art-style-20260810-103748-baa3cad0.webp",
  );
});
