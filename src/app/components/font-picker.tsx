import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDown, Search, Check } from "lucide-react";

// ─── Curated list of popular Google Fonts ────────────────────────────────────
export const GOOGLE_FONTS: { name: string; category: string }[] = [
  // Sans-serif
  { name: "Inter", category: "Sans-serif" },
  { name: "Roboto", category: "Sans-serif" },
  { name: "Open Sans", category: "Sans-serif" },
  { name: "Lato", category: "Sans-serif" },
  { name: "Montserrat", category: "Sans-serif" },
  { name: "Poppins", category: "Sans-serif" },
  { name: "Raleway", category: "Sans-serif" },
  { name: "Nunito", category: "Sans-serif" },
  { name: "Work Sans", category: "Sans-serif" },
  { name: "Rubik", category: "Sans-serif" },
  { name: "DM Sans", category: "Sans-serif" },
  { name: "Plus Jakarta Sans", category: "Sans-serif" },
  { name: "Outfit", category: "Sans-serif" },
  { name: "Manrope", category: "Sans-serif" },
  { name: "Figtree", category: "Sans-serif" },
  { name: "Syne", category: "Sans-serif" },
  { name: "Space Grotesk", category: "Sans-serif" },
  { name: "Karla", category: "Sans-serif" },
  { name: "Mulish", category: "Sans-serif" },
  { name: "Josefin Sans", category: "Sans-serif" },
  { name: "Barlow", category: "Sans-serif" },
  { name: "Exo 2", category: "Sans-serif" },
  { name: "Urbanist", category: "Sans-serif" },
  { name: "Albert Sans", category: "Sans-serif" },
  { name: "Lexend", category: "Sans-serif" },
  // Serif
  { name: "Playfair Display", category: "Serif" },
  { name: "Merriweather", category: "Serif" },
  { name: "Lora", category: "Serif" },
  { name: "Cormorant Garamond", category: "Serif" },
  { name: "EB Garamond", category: "Serif" },
  { name: "PT Serif", category: "Serif" },
  { name: "Libre Baskerville", category: "Serif" },
  { name: "Noto Serif", category: "Serif" },
  { name: "Source Serif 4", category: "Serif" },
  { name: "Crimson Text", category: "Serif" },
  { name: "DM Serif Display", category: "Serif" },
  { name: "Spectral", category: "Serif" },
  { name: "Bitter", category: "Serif" },
  { name: "Arvo", category: "Serif" },
  { name: "Zilla Slab", category: "Serif" },
  { name: "Cormorant", category: "Serif" },
  { name: "Bodoni Moda", category: "Serif" },
  { name: "Cardo", category: "Serif" },
  { name: "Domine", category: "Serif" },
  { name: "Freight Text Pro", category: "Serif" },
  // Display / Decorative
  { name: "Bebas Neue", category: "Display" },
  { name: "Anton", category: "Display" },
  { name: "Righteous", category: "Display" },
  { name: "Paytone One", category: "Display" },
  { name: "Alfa Slab One", category: "Display" },
  { name: "Abril Fatface", category: "Display" },
  { name: "Passion One", category: "Display" },
  { name: "Russo One", category: "Display" },
  { name: "Teko", category: "Display" },
  { name: "Barlow Condensed", category: "Display" },
  { name: "Fjalla One", category: "Display" },
  { name: "Yanone Kaffeesatz", category: "Display" },
  { name: "Black Ops One", category: "Display" },
  { name: "Staatliches", category: "Display" },
  { name: "Big Shoulders Display", category: "Display" },
  // Monospace
  { name: "JetBrains Mono", category: "Monospace" },
  { name: "Fira Code", category: "Monospace" },
  { name: "Source Code Pro", category: "Monospace" },
  { name: "Roboto Mono", category: "Monospace" },
  { name: "IBM Plex Mono", category: "Monospace" },
  { name: "Space Mono", category: "Monospace" },
  { name: "Courier Prime", category: "Monospace" },
  { name: "Inconsolata", category: "Monospace" },
  // Handwriting / Script
  { name: "Dancing Script", category: "Handwriting" },
  { name: "Pacifico", category: "Handwriting" },
  { name: "Great Vibes", category: "Handwriting" },
  { name: "Sacramento", category: "Handwriting" },
  { name: "Caveat", category: "Handwriting" },
  { name: "Satisfy", category: "Handwriting" },
  { name: "Kaushan Script", category: "Handwriting" },
  { name: "Courgette", category: "Handwriting" },
  { name: "Allura", category: "Handwriting" },
  { name: "Yellowtail", category: "Handwriting" },
  { name: "Lobster", category: "Handwriting" },
  { name: "Cookie", category: "Handwriting" },
  { name: "Pinyon Script", category: "Handwriting" },
  { name: "Permanent Marker", category: "Handwriting" },
];

// ─── Font loading helpers ────────────────────────────────────────────────────
const loadedPreviews = new Set<string>();

function loadFontPreview(fontName: string) {
  if (!fontName || loadedPreviews.has(fontName)) return;
  loadedPreviews.add(fontName);
  const slug = fontName.replace(/\s+/g, "+");
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${slug}:wght@400;700&display=swap`;
  document.head.appendChild(link);
}

// ─── Category pill colours ────────────────────────────────────────────────────
const CATEGORY_COLOURS: Record<string, string> = {
  "Sans-serif": "bg-sky-50 text-sky-600",
  "Serif": "bg-amber-50 text-amber-600",
  "Display": "bg-purple-50 text-purple-600",
  "Monospace": "bg-emerald-50 text-emerald-600",
  "Handwriting": "bg-rose-50 text-rose-600",
};

// ─── Component ────────────────────────────────────────────────────────────────
interface FontPickerProps {
  value: string;
  onChange: (font: string) => void;
  label?: string;
  placeholder?: string;
  /** Size variant: "heading" renders 22 px preview, "body" renders 14 px */
  variant?: "heading" | "body";
}

export function FontPicker({
  value,
  onChange,
  label,
  placeholder = "Search fonts…",
  variant = "body",
}: FontPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Filtered list
  const filtered = query.trim()
    ? GOOGLE_FONTS.filter((f) =>
        f.name.toLowerCase().includes(query.toLowerCase()) ||
        f.category.toLowerCase().includes(query.toLowerCase())
      )
    : GOOGLE_FONTS;

  // Pre-load first visible batch when dropdown opens or query changes
  useEffect(() => {
    if (isOpen) {
      filtered.slice(0, 18).forEach((f) => loadFontPreview(f.name));
    }
  }, [isOpen, query]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        close();
      }
    };
    if (isOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  // Scroll selected item into view when opening
  useEffect(() => {
    if (!isOpen) return;
    setTimeout(() => {
      const el = listRef.current?.querySelector("[data-selected]") as HTMLElement | null;
      el?.scrollIntoView({ block: "center" });
      inputRef.current?.focus();
    }, 40);
  }, [isOpen]);

  // Load font on hover (debounced 150 ms so we don't spam while scrolling)
  const handleMouseEnter = useCallback((name: string) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => loadFontPreview(name), 150);
  }, []);

  function close() {
    setIsOpen(false);
    setQuery("");
  }

  function handleSelect(name: string) {
    loadFontPreview(name);
    onChange(name);
    close();
  }

  const previewSize = variant === "heading" ? "text-[18px]" : "text-[14px]";
  const triggerFontFamily = value ? `"${value}", sans-serif` : undefined;

  return (
    <div ref={containerRef} className="relative w-full">
      {label && (
        <span className="text-[10px] tracking-[0.12em] uppercase text-muted-foreground/60 block mb-1.5">
          {label}
        </span>
      )}

      {/* ── Trigger button ── */}
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border text-left transition-colors
          ${isOpen
            ? "border-blue-400 ring-2 ring-blue-200/50 bg-white"
            : "border-border/60 bg-muted/20 hover:border-blue-300"
          }`}
      >
        <span
          className={`${previewSize} text-foreground truncate`}
          style={{ fontFamily: triggerFontFamily }}
        >
          {value || <span className="text-muted-foreground/40 text-[13px]">{placeholder}</span>}
        </span>
        <ChevronDown
          size={13}
          className={`text-muted-foreground/50 shrink-0 transition-transform duration-150 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {/* ── Dropdown ── */}
      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1.5 bg-white border border-border/60 rounded-xl shadow-2xl shadow-black/10 overflow-hidden">

          {/* Search bar */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/40 bg-muted/10">
            <Search size={12} className="text-muted-foreground/40 shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or style…"
              className="flex-1 text-[13px] bg-transparent outline-none placeholder:text-muted-foreground/40"
              onKeyDown={(e) => e.key === "Escape" && close()}
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="text-[10px] text-muted-foreground/40 hover:text-foreground"
              >
                ✕
              </button>
            )}
          </div>

          {/* Font list */}
          <ul
            ref={listRef}
            className="max-h-[260px] overflow-y-auto overscroll-contain py-1"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-4 text-[12px] text-muted-foreground/50 text-center">
                No fonts match "{query}"
              </li>
            ) : (
              filtered.map((font) => {
                const isSelected = value === font.name;
                return (
                  <li
                    key={font.name}
                    data-selected={isSelected ? "true" : undefined}
                    onMouseEnter={() => handleMouseEnter(font.name)}
                    onClick={() => handleSelect(font.name)}
                    className={`flex items-center justify-between gap-3 px-3 py-2 cursor-pointer transition-colors
                      ${isSelected
                        ? "bg-blue-50"
                        : "hover:bg-slate-50"
                      }`}
                  >
                    {/* Font name rendered in its own typeface */}
                    <span
                      className={`${previewSize} leading-tight truncate ${isSelected ? "text-blue-600" : "text-foreground"}`}
                      style={{ fontFamily: `"${font.name}", sans-serif` }}
                    >
                      {font.name}
                    </span>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* Category badge */}
                      <span
                        className={`text-[9px] tracking-wide px-1.5 py-0.5 rounded-full font-medium ${CATEGORY_COLOURS[font.category] ?? "bg-muted text-muted-foreground"}`}
                      >
                        {font.category}
                      </span>
                      {/* Selected checkmark */}
                      {isSelected && (
                        <Check size={12} className="text-blue-500" strokeWidth={2.5} />
                      )}
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
