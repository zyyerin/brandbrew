import { createClient } from "npm:@supabase/supabase-js";

let _client: ReturnType<typeof createClient> | null = null;

/**
 * Singleton Supabase admin client for Edge Functions.
 * Uses SUPABASE_SERVICE_ROLE_KEY for full access.
 */
export function getSupabaseClient() {
  if (!_client) {
    _client = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
  }
  return _client;
}
