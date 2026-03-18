import React, { useState, useRef } from "react";
import { Plus, Sparkles, Upload } from "lucide-react";
import { CardWrapper } from "../brand-cards";
import type { QueueColors } from "./QueueAffordanceSlot";

interface AddVariationSlotProps {
  label: string;
  colors: QueueColors;
  isLoading: boolean;
  isAvailable: boolean;
  onClick: () => void;
  isImageCard?: boolean;
  onUploadImage?: (file: File) => void;
}

const VIOLET = "var(--bb-ai-active-ring)";
const BLUE = "var(--bb-user-active-accent)";

export function AddVariationSlot({
  label,
  isLoading,
  isAvailable,
  onClick,
  isImageCard,
  onUploadImage,
}: AddVariationSlotProps) {
  const [isHovered, setIsHovered] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (isLoading) {
    return (
      <div className="absolute inset-0" style={{ zIndex: 15 }}>
        <CardWrapper label={label} state="waiting">
          <div />
        </CardWrapper>
      </div>
    );
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onUploadImage?.(file);
    e.target.value = "";
  };

  const showAiButton = isHovered && isAvailable;
  const showUploadButton = isHovered && isImageCard && !!onUploadImage;
  const isActive = showAiButton || showUploadButton;
  const hasBoth = showAiButton && showUploadButton;

  return (
    <div
      className="absolute inset-0"
      style={{ zIndex: 15, cursor: isActive ? "pointer" : "default" }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {isActive ? (
        <div
          className="absolute inset-0 z-30 flex flex-col gap-1.5"
          style={{ padding: 2 }}
        >
          {showAiButton && (
            <button
              className="flex flex-col items-center justify-center gap-1 transition-colors hover:bg-violet-50/70 rounded-[10px]"
              style={{
                flex: hasBoth ? 1 : undefined,
                height: hasBoth ? undefined : "100%",
                border: `2px solid ${VIOLET}`,
                borderRadius: 10,
              }}
              onClick={(e) => { e.stopPropagation(); onClick(); }}
            >
              <Sparkles size={15} style={{ color: VIOLET }} />
              <span
                className="text-[9px] px-2 text-center leading-tight"
                style={{ fontWeight: 700, color: VIOLET }}
              >
                New {label} Variation
              </span>
            </button>
          )}

          {showUploadButton && (
            <button
              className="flex flex-col items-center justify-center gap-1 transition-colors hover:bg-blue-50/70 rounded-[10px]"
              style={{
                flex: hasBoth ? 1 : undefined,
                height: hasBoth ? undefined : "100%",
                border: `2px solid ${BLUE}`,
                borderRadius: 10,
              }}
              onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
            >
              <Upload size={14} style={{ color: BLUE }} />
              <span
                className="text-[9px] px-2 text-center leading-tight"
                style={{ fontWeight: 700, color: BLUE }}
              >
                Upload Image
              </span>
            </button>
          )}
        </div>
      ) : (
        <div
          className="absolute inset-0 rounded-xl flex flex-col items-center justify-center gap-1.5"
          style={{
            border: `2px dashed #d1d5db`,
            background: `rgba(0,0,0,0.02)`,
          }}
        >
          {!isHovered && <Plus size={22} style={{ color: "#9ca3af" }} />}
          <span
            className="text-[10px] px-2 text-center leading-tight"
            style={{ fontWeight: 600, color: "#9ca3af" }}
          >
            {isImageCard ? "Hover to add or upload" : "Select one element to add a variation"}
          </span>
        </div>
      )}
    </div>
  );
}
