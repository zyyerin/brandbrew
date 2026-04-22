// ─────────────────────────────────────────────────────────────────────────────
// auth-middleware.tsx — JWT + access-token verification for Edge Function routes
// 1. Requires Authorization: Bearer <supabase JWT>. Sets c.set("userId", …).
// 2. If ACCESS_TOKENS secret is set, also requires X-Access-Token header.
// ─────────────────────────────────────────────────────────────────────────────

import type { Context, Next } from "npm:hono";
import { getSupabaseClient } from "./supabase-client.tsx";

const PREFIX = "/server/make-server-e35291a5";

function getValidTokens(): string[] {
  return (Deno.env.get("ACCESS_TOKENS") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

export function projectStorageKey(userId: string, projectId: string): string {
  return `project:${userId}:${projectId}`;
}

/**
 * Auth middleware: verify user JWT + optional access token, then set userId.
 * Skips OPTIONS and GET .../health.
 */
export async function requireAuth(c: Context, next: Next): Promise<void | Response> {
  if (c.req.method === "OPTIONS") return next();

  const path = new URL(c.req.url).pathname;
  if (path === `${PREFIX}/health`) return next();

  // ── Access-token gate ────────────────────────────────────────────────────
  const validTokens = getValidTokens();
  if (validTokens.length > 0) {
    const accessToken = c.req.header("X-Access-Token")?.trim();
    if (!accessToken || !validTokens.includes(accessToken)) {
      return c.json({ error: "Invalid access token" }, 403);
    }
  }

  // ── Supabase JWT ─────────────────────────────────────────────────────────
  const auth = c.req.header("Authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  if (!token) return c.json({ error: "Unauthorized" }, 401);

  const supabase = getSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user?.id) return c.json({ error: "Unauthorized" }, 401);

  c.set("userId", user.id);
  return next();
}
