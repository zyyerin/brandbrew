import React from "react";
import type { VariationMeta, VariationState } from "./types";
import { ElementWrapper } from "./ElementWrapper";
import { useCardEditing } from "./useCardEditing";
import { useGoogleFont } from "../../utils/useGoogleFont";
import { FontPicker } from "../font-picker";
import { TYPOGRAPHY, adaptiveSize } from "../../utils/design-tokens";
import { useCanvasZoom } from "../../contexts/CanvasZoomContext";

interface FontCardProps {
  titleFont: string;
  bodyFont: string;
  brandName?: string;
  brandSummary?: string;
  state?: VariationState;
  onToggleActive?: () => void;
  onChange?: (data: { titleFont: string; bodyFont: string }) => void;
  onAddVariation?: () => void;
  onDelete?: () => void;
  meta?: VariationMeta;
}

export function FontCard({ titleFont, bodyFont, brandName, brandSummary, state, onToggleActive, onChange, onAddVariation, onDelete, meta }: FontCardProps) {
  const { isEditing, local, updateField, editingProps } = useCardEditing(
    { titleFont, bodyFont },
    { onChange },
  );

  const headingFamily = useGoogleFont(local.titleFont);
  const bodyFamily = useGoogleFont(local.bodyFont);

  const zoom = useCanvasZoom();
  const adaptiveHeadingSize = Math.round(adaptiveSize(TYPOGRAPHY.fontPreviewHeading.fontSize, zoom, TYPOGRAPHY.cardBodySm.fontSize));
  const adaptiveBodySize = Math.round(adaptiveSize(15, zoom, TYPOGRAPHY.cardBodySm.fontSize));
  const adaptiveMicroSize = Math.round(adaptiveSize(TYPOGRAPHY.microLabel.fontSize, zoom, 8));

  return (
    <ElementWrapper
      label="Typography"
      state={state}
      editVariant="font"
      {...editingProps}
      onAddVariation={onAddVariation}
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
              className="text-foreground my-4"
              style={{ fontFamily: headingFamily, fontSize: adaptiveHeadingSize, fontWeight: TYPOGRAPHY.fontPreviewHeading.fontWeight, lineHeight: TYPOGRAPHY.fontPreviewHeading.lineHeight }}
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
              className="text-foreground/60 leading-relaxed mt-4"
              style={{ fontFamily: bodyFamily, fontSize: adaptiveBodySize }}
            >
              {brandSummary || "brand summary"}
            </p>
          </div>
        ) : (
          <div>
            <span className="uppercase text-muted-foreground/60 block mb-0.5" style={{ fontSize: adaptiveMicroSize, letterSpacing: TYPOGRAPHY.microLabel.letterSpacing }}>
              Heading: <span className="normal-case tracking-normal font-medium text-foreground/70">{local.titleFont}</span>
            </span>
            <p
              className="text-foreground mb-5"
              style={{ fontFamily: headingFamily, fontSize: adaptiveHeadingSize, fontWeight: TYPOGRAPHY.fontPreviewHeading.fontWeight, lineHeight: TYPOGRAPHY.fontPreviewHeading.lineHeight }}
            >
              {brandName || "Brand Name"}
            </p>
            <span className="uppercase text-muted-foreground/60 block mb-0.5" style={{ fontSize: adaptiveMicroSize, letterSpacing: TYPOGRAPHY.microLabel.letterSpacing }}>
              Body: <span className="normal-case tracking-normal font-medium text-foreground/70">{local.bodyFont}</span>
            </span>
            <p
              className="text-foreground/60 leading-relaxed"
              style={{ fontFamily: bodyFamily, fontSize: adaptiveBodySize }}
            >
              {brandSummary || "brand summary"}
            </p>
          </div>
        )}
      </div>
    </ElementWrapper>
  );
}
