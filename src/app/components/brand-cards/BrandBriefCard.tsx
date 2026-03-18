import React from "react";
import type { CardMeta, CardState } from "./types";
import { CardWrapper } from "./CardWrapper";
import { useCardEditing } from "./useCardEditing";

interface BrandBriefProps {
  name: string;
  tagline: string;
  description: string;
  state?: CardState;
  onToggleActive?: () => void;
  onChange?: (data: { name: string; tagline: string; description: string }) => void;
  onRefresh?: () => void;
  onDelete?: () => void;
  meta?: CardMeta;
}

export function BrandBriefCard({ name, tagline, description, state, onToggleActive, onChange, onRefresh, onDelete, meta }: BrandBriefProps) {
  const { isEditing, local, updateField, editingProps } = useCardEditing(
    { name, tagline, description },
    { onChange },
  );

  return (
    <CardWrapper
      label="Brand Summary"
      state={state}
      editVariant="text"
      {...editingProps}
      onRegenerate={onRefresh}
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
              className="text-[28px] text-foreground bg-transparent border-b border-blue-300 focus:border-blue-500 outline-none w-full"
              style={{ fontWeight: 400, lineHeight: 1.2 }}
              placeholder="Brand name"
            />
            <input
              value={local.tagline}
              onChange={(e) => updateField("tagline", e.target.value)}
              className="text-[14px] text-muted-foreground italic bg-transparent border-b border-blue-300 focus:border-blue-500 outline-none w-full"
              placeholder="Tagline"
            />
            <textarea
              value={local.description}
              onChange={(e) => updateField("description", e.target.value)}
              rows={4}
              className="text-[13px] text-foreground/70 leading-[1.7] bg-muted/20 border border-blue-300 focus:border-blue-500 outline-none w-full rounded-lg px-2 py-1.5 resize-none"
              placeholder="Description"
            />
          </div>
        ) : (
          <div>
            <h2 className="text-[28px] text-foreground mb-1" style={{ fontWeight: 400, lineHeight: 1.2 }}>{local.name}</h2>
            <p className="text-[14px] text-muted-foreground italic mb-3">{local.tagline}</p>
            <p className="text-[13px] text-foreground/70 leading-[1.7]">{local.description}</p>
          </div>
        )}
      </div>
    </CardWrapper>
  );
}
