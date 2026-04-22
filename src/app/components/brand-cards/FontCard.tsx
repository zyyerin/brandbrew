import React from "react";
import type { VariationMeta, VariationState } from "./types";
import { ElementWrapper } from "./ElementWrapper";
import { useCardEditing } from "./useCardEditing";
import { useGoogleFont } from "../../utils/useGoogleFont";
import { FontPicker } from "../font-picker";
import { TYPE, adaptiveSize } from "../../utils/design-tokens";
import { useCanvasZoom } from "../../contexts/CanvasZoomContext";

interface FontCardProps {
  titleFont: string;
  bodyFont: string;
  brandName?: string;
  brandDescription?: string;
  state?: VariationState;
  onToggleActive?: () => void;
  onChange?: (data: { titleFont: string; bodyFont: string }) => void;
  onDelete?: () => void;
  meta?: VariationMeta;
}

export function FontCard({ titleFont, bodyFont, brandName, brandDescription, state, onToggleActive, onChange, onDelete, meta }: FontCardProps) {
  const { isEditing, local, updateField, editingProps } = useCardEditing(
    { titleFont, bodyFont },
    { onChange },
  );

  const headingFamily = useGoogleFont(local.titleFont);
  const bodyFamily = useGoogleFont(local.bodyFont);

  const zoom = useCanvasZoom();
  const adaptiveHeadingSize = Math.round(adaptiveSize(TYPE.size.xxl, zoom, TYPE.size.baseSm));
  const adaptiveBodySize = Math.round(adaptiveSize(15, zoom, TYPE.size.baseSm));
  const adaptiveMicroSize = Math.round(adaptiveSize(TYPE.size.xs, zoom, 8));

  return (
    <ElementWrapper
      label="Typography"
      state={state}
      editVariant="font"
      {...editingProps}
      onDelete={onDelete}
      onToggleActive={isEditing ? undefined : onToggleActive}
      meta={meta}
    >
      <div onClick={(e) => isEditing && e.stopPropagation()}>
        {isEditing ? (
          <div className="flex flex-col gap-4">
            <FontPicker
              label="Heading"
              value={local.titleFont}
              onChange={(v) => updateField("titleFont", v)}
              variant="heading"
            />
            <FontPicker
              label="Body"
              value={local.bodyFont}
              onChange={(v) => updateField("bodyFont", v)}
              variant="body"
            />
          </div>
        ) : (
          <div>
            <span className="uppercase text-muted-foreground/60 block mb-0.5" style={{ fontSize: adaptiveMicroSize, letterSpacing: TYPE.tracking.wide }}>
              Heading: <span className="normal-case tracking-normal font-medium text-foreground/70">{local.titleFont}</span>
            </span>
            <p
              className="text-foreground mb-5"
              style={{ fontFamily: headingFamily, fontSize: adaptiveHeadingSize, fontWeight: TYPE.weight.normal, lineHeight: TYPE.leading.tight }}
            >
              {brandName || "Brand Name"}
            </p>
            <span className="uppercase text-muted-foreground/60 block mb-0.5" style={{ fontSize: adaptiveMicroSize, letterSpacing: TYPE.tracking.wide }}>
              Body: <span className="normal-case tracking-normal font-medium text-foreground/70">{local.bodyFont}</span>
            </span>
            <p
              className="text-foreground/60 leading-relaxed"
              style={{ fontFamily: bodyFamily, fontSize: adaptiveBodySize }}
            >
              {brandDescription || "brand description"}
            </p>
          </div>
        )}
      </div>
    </ElementWrapper>
  );
}
