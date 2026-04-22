import React, { useState, useCallback, useRef, useEffect } from "react";
import { HexColorPicker } from "react-colorful";
import { Pipette } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Input } from "../ui/input";

interface ColorPickerPopoverProps {
  color: string;
  onChange: (color: string) => void;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
}

const HEX_RE = /^#?([0-9A-Fa-f]{6})$/;

// EyeDropper API — available in Chrome/Edge 95+, not in Firefox/Safari
const supportsEyeDropper = typeof window !== "undefined" && "EyeDropper" in window;

function hexToRgb(hex: string) {
  const m = hex.replace("#", "").match(/.{2}/g);
  if (!m || m.length < 3) return { r: 0, g: 0, b: 0 };
  return { r: parseInt(m[0], 16), g: parseInt(m[1], 16), b: parseInt(m[2], 16) };
}

function rgbToHex(r: number, g: number, b: number) {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[clamp(r), clamp(g), clamp(b)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export function ColorPickerPopover({
  color,
  onChange,
  children,
  side = "top",
  align = "center",
}: ColorPickerPopoverProps) {
  const [open, setOpen] = useState(false);
  const [hexInput, setHexInput] = useState(color);
  const [rgb, setRgb] = useState(() => hexToRgb(color));
  const [eyedropping, setEyedropping] = useState(false);
  const suppressSync = useRef(false);

  useEffect(() => {
    if (suppressSync.current) {
      suppressSync.current = false;
      return;
    }
    setHexInput(color);
    setRgb(hexToRgb(color));
  }, [color]);

  const applyHex = useCallback(
    (hex: string) => {
      const lower = hex.toLowerCase();
      suppressSync.current = true;
      setHexInput(lower);
      setRgb(hexToRgb(lower));
      onChange(lower);
    },
    [onChange],
  );

  const handlePickerChange = useCallback(
    (hex: string) => applyHex(hex),
    [applyHex],
  );

  const commitHex = useCallback(
    (raw: string) => {
      const cleaned = raw.startsWith("#") ? raw : `#${raw}`;
      if (HEX_RE.test(cleaned)) applyHex(cleaned);
    },
    [applyHex],
  );

  const handleRgbChange = useCallback(
    (channel: "r" | "g" | "b", value: string) => {
      const num = value === "" ? 0 : parseInt(value, 10);
      if (isNaN(num)) return;
      const next = { ...rgb, [channel]: Math.max(0, Math.min(255, num)) };
      setRgb(next);
      const hex = rgbToHex(next.r, next.g, next.b);
      suppressSync.current = true;
      setHexInput(hex);
      onChange(hex);
    },
    [rgb, onChange],
  );

  const handleEyeDropper = useCallback(async () => {
    if (!supportsEyeDropper) return;
    try {
      setEyedropping(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dropper = new (window as any).EyeDropper();
      const result = await dropper.open();
      applyHex(result.sRGBHex);
    } catch {
      // User pressed Escape or browser denied — silently ignore
    } finally {
      setEyedropping(false);
    }
  }, [applyHex]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        className="w-[232px] p-3 space-y-3"
        side={side}
        sideOffset={8}
        align={align}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <HexColorPicker
          color={color}
          onChange={handlePickerChange}
          style={{ width: "100%", height: 160 }}
        />

        {/* Hex input row + eyedropper */}
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-md border border-border/60 shrink-0 shadow-inner"
            style={{ backgroundColor: color }}
          />
          <Input
            value={hexInput}
            onChange={(e) => setHexInput(e.target.value)}
            onBlur={() => commitHex(hexInput)}
            onKeyDown={(e) => e.key === "Enter" && commitHex(hexInput)}
            className="font-mono text-xs h-8 uppercase flex-1 min-w-0"
            spellCheck={false}
          />
          {supportsEyeDropper && (
            <button
              onClick={handleEyeDropper}
              title="Pick color from screen"
              className={[
                "w-8 h-8 shrink-0 rounded-md flex items-center justify-center transition-colors",
                eyedropping
                  ? "bg-blue-100 text-blue-600 ring-2 ring-blue-400/40"
                  : "text-muted-foreground/60 hover:text-foreground hover:bg-accent",
              ].join(" ")}
            >
              <Pipette size={14} strokeWidth={1.75} />
            </button>
          )}
        </div>

        {/* RGB inputs */}
        <div className="grid grid-cols-3 gap-1.5">
          {(["r", "g", "b"] as const).map((ch) => (
            <div key={ch} className="flex flex-col gap-0.5">
              <span className="text-[10px] font-medium text-muted-foreground/60 uppercase text-center">
                {ch}
              </span>
              <Input
                type="number"
                min={0}
                max={255}
                value={rgb[ch]}
                onChange={(e) => handleRgbChange(ch, e.target.value)}
                className="text-xs h-7 text-center font-mono tabular-nums [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
