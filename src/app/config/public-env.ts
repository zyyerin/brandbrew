/**
 * Public (browser-safe) config from Vite env. Never put service_role or Gemini keys here.
 */

function requireEnv(name: keyof ImportMetaEnv): string {
  const v = import.meta.env[name];
  if (v == null || String(v).trim() === "") {
    throw new Error(
      `Missing ${String(name)}. Copy .env.example to .env.local and set your Supabase values.`,
    );
  }
  return String(v).trim();
}

export const supabaseProjectRef = requireEnv("VITE_SUPABASE_PROJECT_REF");
export const supabaseAnonKey = requireEnv("VITE_SUPABASE_ANON_KEY");

/** Must match Edge PREFIX in supabase/functions/server/index.tsx */
export const edgeRoutePrefix =
  (import.meta.env.VITE_EDGE_ROUTE_PREFIX?.trim() || "make-server-e35291a5");

export const functionsBaseUrl = `https://${supabaseProjectRef}.supabase.co/functions/v1/server/${edgeRoutePrefix}`;
