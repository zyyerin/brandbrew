import { useState, useCallback, useRef } from "react";
import { ChevronDown, Check } from "lucide-react";
import { TIMING, TYPE } from "../utils/design-tokens";
import { Popover, PopoverTrigger, PopoverContent } from "./ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "./ui/command";

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
  placeholder = "Select font…",
  variant = "body",
}: FontPickerProps) {
  const [open, setOpen] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const previewFontSize =
    variant === "heading"
      ? TYPE.size.lg
      : TYPE.size.baseLg;

  const handleSelect = useCallback(
    (fontName: string) => {
      loadFontPreview(fontName);
      onChange(fontName);
      setOpen(false);
    },
    [onChange],
  );

  const handleMouseEnter = useCallback((name: string) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(
      () => loadFontPreview(name),
      TIMING.FONT_HOVER_DELAY,
    );
  }, []);

  const handleOpenChange = useCallback((next: boolean) => {
    if (next) {
      // Pre-load first visible batch when opening
      GOOGLE_FONTS.slice(0, 18).forEach((f) => loadFontPreview(f.name));
    }
    setOpen(next);
  }, []);

  return (
    <div className="w-full">
      {label && (
        <span
          className="uppercase text-muted-foreground/60 block mb-1.5"
          style={{
            fontSize: TYPE.size.xs,
            letterSpacing: TYPE.tracking.wide,
          }}
        >
          {label}
        </span>
      )}

      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border text-left transition-colors
              ${
                open
                  ? "border-blue-400 ring-2 ring-blue-200/50 bg-white"
                  : "border-border/60 bg-muted/20 hover:border-blue-300"
              }`}
          >
            <span
              className="text-foreground truncate"
              style={{
                fontFamily: value ? `"${value}", sans-serif` : undefined,
                fontSize: previewFontSize,
              }}
            >
              {value || (
                <span
                  className="text-muted-foreground/40"
                  style={{ fontSize: TYPE.size.base }}
                >
                  {placeholder}
                </span>
              )}
            </span>
            <ChevronDown
              size={13}
              className={`text-muted-foreground/50 shrink-0 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
            />
          </button>
        </PopoverTrigger>

        <PopoverContent
          className="p-0 rounded-xl border-border/60 shadow-2xl shadow-black/10"
          style={{
            width: "max(var(--radix-popover-trigger-width), min(90vw, 26rem))",
          }}
          align="start"
          sideOffset={6}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Command>
            <CommandInput placeholder="Search by name or style…" />
            <CommandList className="max-h-[260px]">
              <CommandEmpty className="py-4 text-[12px] text-muted-foreground/50">
                No fonts found.
              </CommandEmpty>
              <CommandGroup>
                {GOOGLE_FONTS.map((font) => {
                  const isSelected = value === font.name;
                  return (
                    <CommandItem
                      key={font.name}
                      value={font.name}
                      keywords={[font.category]}
                      onSelect={() => handleSelect(font.name)}
                      onMouseEnter={() => handleMouseEnter(font.name)}
                      className={`flex items-center justify-between gap-3 px-3 py-2 cursor-pointer rounded-sm
                        ${isSelected ? "bg-blue-50 text-blue-600" : ""}`}
                    >
                      <span
                        className="leading-tight truncate"
                        style={{
                          fontFamily: `"${font.name}", sans-serif`,
                          fontSize: previewFontSize,
                        }}
                      >
                        {font.name}
                      </span>

                      <div className="flex items-center gap-2 shrink-0 ml-auto">
                        <span
                          className={`text-[9px] tracking-wide px-1.5 py-0.5 rounded-full font-medium ${CATEGORY_COLOURS[font.category] ?? "bg-muted text-muted-foreground"}`}
                        >
                          {font.category}
                        </span>
                        {isSelected && (
                          <Check
                            size={12}
                            className="text-blue-500"
                            strokeWidth={2.5}
                          />
                        )}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
