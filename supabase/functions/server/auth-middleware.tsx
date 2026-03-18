// ─────────────────────────────────────────────────────────────────────────────
// auth-middleware.tsx — JWT verification for Edge Function routes
// Requires Authorization: Bearer <user access_token>. Sets c.set("userId", user.id).
// ─────────────────────────────────────────────────────────────────────────────

import type { Context, Next } from "npm:hono";
import { getSupabaseClient } from "./supabase-client.tsx";

const PREFIX = "/server/make-server-e35291a5";

export function projectStorageKey(userId: string, projectId: string): string {
  return `project:${userId}:${projectId}`;
}

/**
 * Auth middleware: verify user JWT and set userId on context.
 * Skips OPTIONS and GET .../health.
 */
export async function requireAuth(c: Context, next: Next): Promise<void | Response> {
  if (c.req.method === "OPTIONS") return next();

  const path = new URL(c.req.url).pathname;
  if (path === `${PREFIX}/health`) return next();

  const auth = c.req.header("Authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  if (!token) return c.json({ error: "Unauthorized" }, 401);

  const supabase = getSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user?.id) return c.json({ error: "Unauthorized" }, 401);

  c.set("userId", user.id);
  return next();
}
