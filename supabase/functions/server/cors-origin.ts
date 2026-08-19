const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

/**
 * True for browser origins served from the local machine (Vite, etc.).
 * Hostname match is exact so `localhost.evil.com` cannot slip through.
 */
export function isLoopbackDevOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const hostname = url.hostname.replace(/^\[|\]$/g, "");
    return LOOPBACK_HOSTS.has(hostname);
  } catch {
    return false;
  }
}

/**
 * Decide Access-Control-Allow-Origin.
 *
 * - Loopback is always allowed so `npm run dev` can call the deployed function
 *   even when CORS_ORIGIN is locked to the production site.
 * - If CORS_ORIGIN is unset, reflect the request origin (works with credentials).
 * - Otherwise only configured production origins are allowed.
 */
export function resolveCorsAllowOrigin(
  requestOrigin: string,
  configuredOrigins: readonly string[],
  corsOriginConfigured: boolean,
): string | undefined {
  if (!requestOrigin) return undefined;
  if (isLoopbackDevOrigin(requestOrigin)) return requestOrigin;
  if (!corsOriginConfigured) return requestOrigin;
  return configuredOrigins.includes(requestOrigin) ? requestOrigin : undefined;
}
