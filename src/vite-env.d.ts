/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_PROJECT_REF: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** Edge path segment after /server/, e.g. make-server-e35291a5 */
  readonly VITE_EDGE_ROUTE_PREFIX?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
