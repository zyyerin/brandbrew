import { functionsBaseUrl } from "../config/public-env";
import { supabase } from "../lib/supabase-client";

export const BASE_URL = functionsBaseUrl;
const DEFAULT_TIMEOUT_MS = 30_000;

export interface CallApiOptions {
  method?: "GET" | "POST";
  body?: unknown;
  timeoutMs?: number;
}

/**
 * Ensure we have a user session and return the access token for Edge Function auth.
 */
async function ensureUserSession(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.access_token) return session.access_token;
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw new Error(error.message);
  if (!data.session?.access_token) throw new Error("No session after sign-in");
  return data.session.access_token;
}

/**
 * Parse a non-2xx response into a descriptive Error.
 */
async function handleApiError(res: Response): Promise<never> {
  const err = await res.json().catch(() => ({}));
  throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
}

/**
 * Unified fetch wrapper for all Edge Function calls.
 * Uses authenticated user's access token. Retries once after sign-in on 401.
 */
export async function callApi<T>(
  path: string,
  opts: CallApiOptions = {},
): Promise<T> {
  const { method = "POST", body, timeoutMs = DEFAULT_TIMEOUT_MS } = opts;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let token = await ensureUserSession();
  const doFetch = async (): Promise<Response> => {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };
    if (method === "POST") {
      headers["Content-Type"] = "application/json";
    }
    return fetch(`${BASE_URL}/${path}`, {
      method,
      headers,
      body: method === "POST" && body != null ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  };

  try {
    let res = await doFetch();
    if (res.status === 401) {
      token = await ensureUserSession();
      res = await doFetch();
    }
    if (!res.ok) await handleApiError(res);

    return res.json() as Promise<T>;
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw new Error(`Request timed out (>${timeoutMs / 1000}s)`);
    }
    const msg = (err as Error)?.message ?? String(err);
    if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
      throw new Error(`Network error reaching the server. Check your connection and try again. (${msg})`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
