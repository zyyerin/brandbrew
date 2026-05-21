import { useState, useCallback, useMemo, useRef } from "react";
import { ChevronDown, Check } from "lucide-react";
import { TIMING, TYPE } from "../utils/design-tokens";
import type { GoogleFont } from "../data/google-fonts";
import { Popover, PopoverTrigger, PopoverContent } from "./ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "./ui/command";

type FontOption = GoogleFont | { name: string; category: "Custom" };

const POPULAR_GOOGLE_FONTS: GoogleFont[] = [
  { name: "Inter", category: "Sans-serif" },
  { name: "Roboto", category: "Sans-serif" },
  { name: "Open Sans", category: "Sans-serif" },
  { name: "Lato", category: "Sans-serif" },
  { name: "Montserrat", category: "Sans-serif" },
  { name: "Poppins", category: "Sans-serif" },
  { name: "Playfair Display", category: "Serif" },
  { name: "Merriweather", category: "Serif" },
  { name: "Lora", category: "Serif" },
  { name: "Bebas Neue", category: "Display" },
  { name: "Anton", category: "Display" },
  { name: "JetBrains Mono", category: "Monospace" },
  { name: "Roboto Mono", category: "Monospace" },
  { name: "Dancing Script", category: "Handwriting" },
  { name: "Pacifico", category: "Handwriting" },
];

let fontCatalogPromise: Promise<GoogleFont[]> | null = null;

function loadFontCatalog() {
  fontCatalogPromise ??= import("../data/google-fonts").then(
    (module) => module.GOOGLE_FONTS,
  );
  return fontCatalogPromise;
}

// Font loading helpers
const loadedPreviews = new Set<string>();

function fontFamilyCss(fontName: string, fallback = "sans-serif") {
  return `"${fontName.replace(/"/g, '\\"')}", ${fallback}`;
}

function fontRequestName(fontName: string) {
  return encodeURIComponent(fontName.trim()).replace(/%20/g, "+");
}

function fontFallback(category?: string) {
  switch (category) {
    case "Serif":
      return "serif";
    case "Monospace":
      return "monospace";
    default:
      return "sans-serif";
  }
}

function loadFontPreview(fontName: string) {
  const name = fontName.trim();
  if (!name || loadedPreviews.has(name)) return;
  loadedPreviews.add(name);

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${fontRequestName(name)}:wght@400;700&display=swap`;
  document.head.appendChild(link);
}

// Category pill colours
const CATEGORY_COLOURS: Record<string, string> = {
  "Sans-serif": "bg-sky-50 text-sky-600",
  "Serif": "bg-amber-50 text-amber-600",
  "Display": "bg-purple-50 text-purple-600",
  "Monospace": "bg-emerald-50 text-emerald-600",
  "Handwriting": "bg-rose-50 text-rose-600",
  "Custom": "bg-muted text-muted-foreground",
};

// Component
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
  const [fontCatalog, setFontCatalog] = useState<GoogleFont[] | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const baseFonts = fontCatalog ?? POPULAR_GOOGLE_FONTS;

  const fontOptions = useMemo<FontOption[]>(() => {
    const selected = value.trim();
    if (!selected || baseFonts.some((font) => font.name === selected)) {
      return baseFonts;
    }

    return [
      { name: selected, category: "Custom" },
      ...baseFonts,
    ];
  }, [baseFonts, value]);

  const selectedFont = useMemo(
    () => fontOptions.find((font) => font.name === value),
    [fontOptions, value],
  );

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
      // Pre-load first visible batch when opening.
      fontOptions.slice(0, 18).forEach((font) => loadFontPreview(font.name));

      if (!fontCatalog) {
        setCatalogLoading(true);
        void loadFontCatalog()
          .then((fonts) => {
            setFontCatalog(fonts);
            fonts.slice(0, 18).forEach((font) => loadFontPreview(font.name));
          })
          .finally(() => setCatalogLoading(false));
      }
    }
    setOpen(next);
  }, [fontCatalog, fontOptions]);

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
                fontFamily: value
                  ? fontFamilyCss(value, fontFallback(selectedFont?.category))
                  : undefined,
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
                {catalogLoading ? "Loading fonts…" : "No fonts found."}
              </CommandEmpty>
              <CommandGroup>
                {fontOptions.map((font) => {
                  const isSelected = value === font.name;
                  return (
                    <CommandItem
                      key={font.name}
                      value={font.name}
                      keywords={[font.category, font.category.replace("-", " ")]}
                      onSelect={() => handleSelect(font.name)}
                      onMouseEnter={() => handleMouseEnter(font.name)}
                      className={`flex items-center justify-between gap-3 px-3 py-2 cursor-pointer rounded-sm
                        ${isSelected ? "bg-blue-50 text-blue-600" : ""}`}
                    >
                      <span
                        className="leading-tight truncate"
                        style={{
                          fontFamily: fontFamilyCss(
                            font.name,
                            fontFallback(font.category),
                          ),
                          fontSize: previewFontSize,
                        }}
                      >
                        {font.name}
                      </span>

                      <div className="flex items-center gap-2 shrink-0 ml-auto">
                        <span
                          className={`text-[9px] tracking-wide px-1.5 py-0.5 rounded-full font-medium ${CATEGORY_COLOURS[font.category] ?? CATEGORY_COLOURS.Custom}`}
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
