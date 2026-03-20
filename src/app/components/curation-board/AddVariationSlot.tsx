import React, { useState, useRef } from "react";
import { Plus, DiamondPlus, Upload } from "lucide-react";
import { ElementWrapper } from "../brand-cards";
import { LAYOUT } from "../../utils/design-tokens";
import type { QueueColors } from "./QueueAffordanceSlot";

interface AddVariationSlotProps {
  label: string;
  colors: QueueColors;
  isLoading: boolean;
  onClick: () => void;
  isImageElementType?: boolean;
  onUploadImage?: (file: File) => void;
  /** Invokes the file picker; use when file input lives in a stable parent to avoid unmount loss. */
  onTriggerUpload?: () => void;
}

const VIOLET = "var(--bb-ai-active-ring)";
const BLUE = "var(--bb-user-active-accent)";

/** Icon and label size for all slot icons. Change this to resize from one place. */
const SLOT_ICON_SIZE = 24;
const SLOT_LABEL_SIZE = 14;

/** Base style for all slot labels (color is set per label). */
const SLOT_LABEL_STYLE: React.CSSProperties = {
  fontSize: SLOT_LABEL_SIZE,
};

type SlotState = "loading" | "idle" | "active";

function getSlotState(
  isLoading: boolean,
  isHovered: boolean,
  isImageElementType: boolean | undefined,
  hasUpload: boolean
): SlotState {
  if (isLoading) return "loading";
  const showAi = isHovered;
  const showUpload = isHovered && !!isImageElementType && hasUpload;
  if (showAi || showUpload) return "active";
  return "idle";
}

export function AddVariationSlot({
  label,
  isLoading,
  onClick,
  isImageElementType,
  onUploadImage,
  onTriggerUpload,
}: AddVariationSlotProps) {
  const [isHovered, setIsHovered] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasUpload = !!(onTriggerUpload ?? onUploadImage);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onUploadImage?.(file);
    e.target.value = "";
  };

  const slotState = getSlotState(isLoading, isHovered, isImageElementType, hasUpload);
  const showAiButton = isHovered;
  const showUploadButton = isHovered && isImageElementType && hasUpload;
  const hasBoth = showAiButton && showUploadButton;

  const triggerUpload = () => {
    if (onTriggerUpload) onTriggerUpload();
    else fileInputRef.current?.click();
  };

  return (
    <div
      className="absolute inset-0"
      style={{ zIndex: 15, cursor: slotState === "active" ? "pointer" : "default" }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {!onTriggerUpload && (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
      )}

      {slotState === "loading" ? (
        <div className="absolute inset-0">
          <ElementWrapper label={label} state="waiting">
            <div />
          </ElementWrapper>
        </div>
      ) : slotState === "active" ? (
        <div
          className="absolute inset-0 z-30 flex flex-col gap-1.5"
          style={{ padding: LAYOUT.ADD_SLOT_PADDING }}
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
              <DiamondPlus size={SLOT_ICON_SIZE} style={{ color: VIOLET }} />
              <span
                className="px-2 text-center leading-tight"
                style={{ ...SLOT_LABEL_STYLE, color: VIOLET }}
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
              onClick={(e) => { e.stopPropagation(); triggerUpload(); }}
            >
              <Upload size={SLOT_ICON_SIZE} style={{ color: BLUE }} />
              <span
                className="px-2 text-center leading-tight"
                style={{ ...SLOT_LABEL_STYLE, color: BLUE }}
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
            border: `2px dashed var(--bb-user-inactive-border)`,
            background: `var(--bb-user-inactive-bg)`,
          }}
        >
          {!isHovered && <Plus size={SLOT_ICON_SIZE} style={{ color: "var(--bb-user-inactive-accent)" }} />}
          <span
            className="px-2 text-center leading-tight"
            style={{ ...SLOT_LABEL_STYLE, color: "var(--bb-user-inactive-accent)" }}
          >
            {isImageElementType ? "Hover to add or upload" : "Select one element to add a variation"}
          </span>
        </div>
      )}
    </div>
  );
}
