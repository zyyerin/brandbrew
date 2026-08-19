import assert from "node:assert/strict";
import test from "node:test";

import {
  isLoopbackDevOrigin,
  resolveCorsAllowOrigin,
} from "../supabase/functions/server/cors-origin.ts";

const PRODUCTION = "https://brandbrew-app.netlify.app";

test("isLoopbackDevOrigin accepts local Vite origins", () => {
  assert.equal(isLoopbackDevOrigin("http://localhost:5173"), true);
  assert.equal(isLoopbackDevOrigin("http://localhost:5174"), true);
  assert.equal(isLoopbackDevOrigin("http://127.0.0.1:5173"), true);
  assert.equal(isLoopbackDevOrigin("http://[::1]:5173"), true);
  assert.equal(isLoopbackDevOrigin("https://localhost:5173"), true);
});

test("isLoopbackDevOrigin rejects lookalikes and remote hosts", () => {
  assert.equal(isLoopbackDevOrigin("https://localhost.evil.com"), false);
  assert.equal(isLoopbackDevOrigin("http://127.0.0.1.nip.io"), false);
  assert.equal(isLoopbackDevOrigin(PRODUCTION), false);
  assert.equal(isLoopbackDevOrigin("not a url"), false);
});

test("production allowlist still permits the deployed origin", () => {
  assert.equal(
    resolveCorsAllowOrigin(PRODUCTION, [PRODUCTION], true),
    PRODUCTION,
  );
});

test("production allowlist still permits localhost on any port", () => {
  assert.equal(
    resolveCorsAllowOrigin("http://localhost:5173", [PRODUCTION], true),
    "http://localhost:5173",
  );
  assert.equal(
    resolveCorsAllowOrigin("http://127.0.0.1:5174", [PRODUCTION], true),
    "http://127.0.0.1:5174",
  );
});

test("production allowlist denies unknown remote origins", () => {
  assert.equal(
    resolveCorsAllowOrigin("https://evil.example", [PRODUCTION], true),
    undefined,
  );
});

test("unset CORS_ORIGIN reflects any origin", () => {
  assert.equal(
    resolveCorsAllowOrigin("https://evil.example", [], false),
    "https://evil.example",
  );
});
