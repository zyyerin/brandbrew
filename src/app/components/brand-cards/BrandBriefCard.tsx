import React from "react";
import type { VariationMeta, VariationState } from "./types";
import { ElementWrapper } from "./ElementWrapper";
import { useCardEditing } from "./useCardEditing";
import { TYPOGRAPHY } from "../../utils/design-tokens";

interface BrandBriefProps {
  name: string;
  tagline: string;
  description: string;
  state?: VariationState;
  onToggleActive?: () => void;
  onChange?: (data: { name: string; tagline: string; description: string }) => void;
  onAddVariation?: () => void;
  onDelete?: () => void;
  meta?: VariationMeta;
}

export function BrandBriefCard({ name, tagline, description, state, onToggleActive, onChange, onAddVariation, onDelete, meta }: BrandBriefProps) {
  const { isEditing, local, updateField, editingProps } = useCardEditing(
    { name, tagline, description },
    { onChange },
  );

  return (
    <ElementWrapper
      label="Brand Summary"
      state={state}
      editVariant="text"
      {...editingProps}
      onAddVariation={onAddVariation}
      onDelete={onDelete}
      onToggleActive={isEditing ? undefined : onToggleActive}
      meta={meta}
    >
      <div onClick={(e) => isEditing && e.stopPropagation()}>
        {isEditing ? (
          <div className="flex flex-col gap-2.5">
            <input
              autoFocus
              value={local.name}
              onChange={(e) => updateField("name", e.target.value)}
              className="text-foreground bg-transparent border-b border-blue-300 focus:border-blue-500 outline-none w-full"
              style={{ fontSize: TYPOGRAPHY.cardHeadingLg.fontSize, fontWeight: TYPOGRAPHY.cardHeadingLg.fontWeight, lineHeight: TYPOGRAPHY.cardHeadingLg.lineHeight }}
              placeholder="Brand name"
            />
            <input
              value={local.tagline}
              onChange={(e) => updateField("tagline", e.target.value)}
              className="text-muted-foreground italic bg-transparent border-b border-blue-300 focus:border-blue-500 outline-none w-full"
              style={{ fontSize: TYPOGRAPHY.cardTagline.fontSize }}
              placeholder="Tagline"
            />
            <textarea
              value={local.description}
              onChange={(e) => updateField("description", e.target.value)}
              rows={4}
              className="text-foreground/70 bg-muted/20 border border-blue-300 focus:border-blue-500 outline-none w-full rounded-lg px-2 py-1.5 resize-none"
              style={{ fontSize: TYPOGRAPHY.cardBody.fontSize, lineHeight: TYPOGRAPHY.cardBody.lineHeight }}
              placeholder="Description"
            />
          </div>
        ) : (
          <div>
            <h2 className="text-foreground mb-1" style={{ fontSize: TYPOGRAPHY.cardHeadingLg.fontSize, fontWeight: TYPOGRAPHY.cardHeadingLg.fontWeight, lineHeight: TYPOGRAPHY.cardHeadingLg.lineHeight }}>{local.name}</h2>
            <p className="text-muted-foreground italic mb-3" style={{ fontSize: TYPOGRAPHY.cardTagline.fontSize }}>{local.tagline}</p>
            <p className="text-foreground/70" style={{ fontSize: TYPOGRAPHY.cardBody.fontSize, lineHeight: TYPOGRAPHY.cardBody.lineHeight }}>{local.description}</p>
          </div>
        )}
      </div>
    </ElementWrapper>
  );
}
