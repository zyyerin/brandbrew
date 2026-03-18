import { useEffect, useRef } from "react";

// Module-level cache so fonts are only injected once per session
const injectedFonts = new Set<string>();

/**
 * Dynamically loads a Google Font by name and returns the CSS font-family
 * string ready to drop into a `style` prop. Loading is debounced by 500 ms
 * so keystrokes during editing don't fire a new request on every character.
 *
 * Returns `undefined` while the font name is empty so callers can fall back
 * to the inherited font.
 */
export function useGoogleFont(fontName: string): string | undefined {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const name = fontName.trim();
    if (!name) return;

    // Already loaded — nothing to do
    if (injectedFonts.has(name)) return;

    // Debounce: wait for the user to stop typing before hitting Google Fonts
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const slug = name.replace(/\s+/g, "+");
      // Load regular + bold weights for heading use, regular for body
      const href = `https://fonts.googleapis.com/css2?family=${slug}:ital,wght@0,400;0,700;1,400&display=swap`;

      // Guard against duplicate injections (race condition)
      if (injectedFonts.has(name)) return;
      injectedFonts.add(name);

      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      document.head.appendChild(link);
    }, 500);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [fontName]);

  const name = fontName.trim();
  if (!name) return undefined;
  return `"${name}", sans-serif`;
}
