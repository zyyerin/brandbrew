import { functionsBaseUrl } from "../config/public-env";
import { supabase } from "../lib/supabase-client";
import { clearAccessToken } from "../components/PassphraseGate";

export const BASE_URL = functionsBaseUrl;
const DEFAULT_TIMEOUT_MS = 30_000;

export interface CallApiOptions {
  method?: "GET" | "POST";
  body?: unknown;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/**
 * Try to recover the current session before falling back to a new anonymous user.
 * Preserves the existing userId (and therefore all stored project data).
 */
async function forceRefreshToken(): Promise<string> {
  const { data: refreshed } = await supabase.auth.refreshSession();
  if (refreshed.session?.access_token) return refreshed.session.access_token;

  await supabase.auth.signOut({ scope: "local" });
  return signInFresh();
}

const DEV_EMAIL = import.meta.env.VITE_DEV_EMAIL as string | undefined;
const DEV_PASSWORD = import.meta.env.VITE_DEV_PASSWORD as string | undefined;

async function signInFresh(): Promise<string> {
  if (DEV_EMAIL && DEV_PASSWORD) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: DEV_EMAIL,
      password: DEV_PASSWORD,
    });
    if (error) throw new Error(`Dev sign-in failed: ${error.message}`);
    if (!data.session?.access_token) throw new Error("No session after dev sign-in");
    return data.session.access_token;
  }
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw new Error(error.message);
  if (!data.session?.access_token) throw new Error("No session after sign-in");
  return data.session.access_token;
}

/**
 * Ensure we have a user session and return the access token for Edge Function auth.
 */
async function ensureUserSession(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.access_token) return session.access_token;
  return signInFresh();
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
  const { method = "POST", body, timeoutMs = DEFAULT_TIMEOUT_MS, signal: externalSignal } = opts;

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener("abort", onExternalAbort, { once: true });
    }
  }

  let token = await ensureUserSession();
  const doFetch = async (): Promise<Response> => {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };
    const accessToken = sessionStorage.getItem("bb-access-token");
    if (accessToken) {
      headers["X-Access-Token"] = accessToken;
    }
    const projectId = localStorage.getItem("bb_currentProjectId");
    if (projectId) {
      headers["X-Project-Id"] = projectId;
    }
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
      token = await forceRefreshToken();
      res = await doFetch();
    }
    if (res.status === 403) {
      clearAccessToken();
      window.location.reload();
      throw new Error("Invalid access token");
    }
    if (!res.ok) await handleApiError(res);

    return res.json() as Promise<T>;
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      if (timedOut) {
        throw new Error(`Request timed out (>${timeoutMs / 1000}s)`);
      }
      throw new Error("Request aborted by user");
    }
    const msg = (err as Error)?.message ?? String(err);
    if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
      throw new Error(`Network error reaching the server. Check your connection and try again. (${msg})`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
    if (externalSignal) {
      externalSignal.removeEventListener("abort", onExternalAbort);
    }
  }
}
