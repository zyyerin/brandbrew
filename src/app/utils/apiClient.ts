import {
  functionsBaseUrl,
  supabaseAnonKey,
} from "../config/public-env";

export const BASE_URL = functionsBaseUrl;
const DEFAULT_TIMEOUT_MS = 30_000;

export interface CallApiOptions {
  method?: "GET" | "POST";
  body?: unknown;
  timeoutMs?: number;
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
 * Handles auth, timeout, and error parsing.
 */
export async function callApi<T>(
  path: string,
  opts: CallApiOptions = {},
): Promise<T> {
  const { method = "POST", body, timeoutMs = DEFAULT_TIMEOUT_MS } = opts;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${supabaseAnonKey}`,
  };
  if (method === "POST") {
    headers["Content-Type"] = "application/json";
  }

  try {
    const res = await fetch(`${BASE_URL}/${path}`, {
      method,
      headers,
      body: method === "POST" && body != null ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

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
