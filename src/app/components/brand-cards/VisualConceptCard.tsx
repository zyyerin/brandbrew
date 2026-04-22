import React, { useEffect, useRef } from "react";
import type { VariationMeta, VariationState } from "./types";
import type { VisualConceptData } from "../../types/project";
import { ElementWrapper } from "./ElementWrapper";
import { TYPE, LAYOUT, adaptiveSize } from "../../utils/design-tokens";
import { useCanvasZoom } from "../../contexts/CanvasZoomContext";
import { useCardEditing } from "./useCardEditing";

interface VisualConceptProps {
  data: VisualConceptData;
  state?: VariationState;
  onToggleActive?: () => void;
  onChange?: (data: VisualConceptData) => void;
  onDelete?: () => void;
  meta?: VariationMeta;
}

export function VisualConceptCard({
  data,
  state,
  onToggleActive,
  onChange,
  onDelete,
  meta,
}: VisualConceptProps) {
  const { isEditing, local, updateField, editingProps } = useCardEditing<VisualConceptData>(
    data,
    {
      onChange,
      transformOnSave: (d) => ({ ...d, concept: d.concept.trim() }),
    },
  );
  const conceptRef = useRef<HTMLTextAreaElement>(null);

  const zoom = useCanvasZoom();
  const conceptFontSize = Math.round(adaptiveSize(
    TYPE.size.xl,
    zoom,
    TYPE.size.baseSm,
  ));
  const isActive = state === "active";
  const conceptDotSize = Math.round(
    adaptiveSize(LAYOUT.connection.portRadius * 2, zoom),
  );

  useEffect(() => {
    if (isEditing && conceptRef.current) {
      const el = conceptRef.current;
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [isEditing, local.concept]);

  const handleConceptKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); editingProps.onEditSave(); }
    else if (e.key === "Escape") { e.preventDefault(); editingProps.onEditCancel(); }
  };

  return (
    <ElementWrapper
      label="Visual Concept"
      state={state}
      editVariant="text"
      {...editingProps}
      onDelete={onDelete}
      onToggleActive={isEditing ? undefined : onToggleActive}
      meta={meta}
    >
      <div
        className="flex-1 flex flex-row items-center justify-center gap-2 px-2 min-w-0"
        onClick={(e) => isEditing && e.stopPropagation()}
      >
        {isEditing ? (
          <textarea
            ref={conceptRef}
            autoFocus
            value={local.concept}
            onChange={(e) => updateField("concept", e.target.value)}
            onKeyDown={handleConceptKeyDown}
            className="w-full italic bg-transparent border-b border-bb-user-active-border focus:border-bb-user-active-accent outline-none text-foreground resize-none overflow-hidden leading-snug text-center"
            style={{ fontSize: conceptFontSize }}
            placeholder="Concept name"
            rows={1}
          />
        ) : (
          <>
            {isActive && (
              <span
                aria-hidden
                className="shrink-0 rounded-full"
                style={{
                  width: conceptDotSize,
                  height: conceptDotSize,
                  background: "var(--bb-ai-active-ring)",
                }}
              />
            )}
            <span
              className="italic text-foreground/80 leading-snug text-center min-w-0"
              style={{ fontSize: conceptFontSize }}
            >
              {data.concept}
            </span>
          </>
        )}
      </div>
    </ElementWrapper>
  );
}
