import React from "react";
import type { CardMeta, CardState } from "./types";
import { CardWrapper } from "./CardWrapper";
import { useCardEditing } from "./useCardEditing";
import { useGoogleFont } from "../../utils/useGoogleFont";
import { FontPicker } from "../font-picker";

interface FontCardProps {
  titleFont: string;
  bodyFont: string;
  brandName?: string;
  brandSummary?: string;
  state?: CardState;
  onToggleActive?: () => void;
  onChange?: (data: { titleFont: string; bodyFont: string }) => void;
  onRefresh?: () => void;
  onDelete?: () => void;
  meta?: CardMeta;
}

export function FontCard({ titleFont, bodyFont, brandName, brandSummary, state, onToggleActive, onChange, onRefresh, onDelete, meta }: FontCardProps) {
  const { isEditing, local, updateField, editingProps } = useCardEditing(
    { titleFont, bodyFont },
    { onChange },
  );

  const headingFamily = useGoogleFont(local.titleFont);
  const bodyFamily = useGoogleFont(local.bodyFont);

  return (
    <CardWrapper
      label="Typography"
      state={state}
      editVariant="font"
      {...editingProps}
      onRegenerate={onRefresh}
      onDelete={onDelete}
      onToggleActive={isEditing ? undefined : onToggleActive}
      meta={meta}
    >
      <div onClick={(e) => isEditing && e.stopPropagation()}>
        {isEditing ? (
          <div>
            <FontPicker
              label="Heading"
              value={local.titleFont}
              onChange={(v) => updateField("titleFont", v)}
              variant="heading"
            />
            <p
              className="text-[28px] text-foreground my-4"
              style={{ fontFamily: headingFamily, fontWeight: 400, lineHeight: 1.15 }}
            >
              {brandName || "Brand Name"}
            </p>
            <FontPicker
              label="Body"
              value={local.bodyFont}
              onChange={(v) => updateField("bodyFont", v)}
              variant="body"
            />
            <p
              className="text-[15px] text-foreground/60 leading-relaxed line-clamp-3 mt-4"
              style={{ fontFamily: bodyFamily }}
            >
              {brandSummary || "brand summary"}
            </p>
          </div>
        ) : (
          <div>
            <span className="text-[10px] tracking-[0.12em] uppercase text-muted-foreground/60 block mb-0.5">
              Heading: <span className="normal-case tracking-normal font-medium text-foreground/70">{local.titleFont}</span>
            </span>
            <p
              className="text-[28px] text-foreground mb-5"
              style={{ fontFamily: headingFamily, fontWeight: 400, lineHeight: 1.15 }}
            >
              {brandName || "Brand Name"}
            </p>
            <span className="text-[10px] tracking-[0.12em] uppercase text-muted-foreground/60 block mb-0.5">
              Body: <span className="normal-case tracking-normal font-medium text-foreground/70">{local.bodyFont}</span>
            </span>
            <p
              className="text-[15px] text-foreground/60 leading-relaxed line-clamp-3"
              style={{ fontFamily: bodyFamily }}
            >
              {brandSummary || "brand summary"}
            </p>
          </div>
        )}
      </div>
    </CardWrapper>
  );
}
