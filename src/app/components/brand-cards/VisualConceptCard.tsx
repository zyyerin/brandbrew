import React, { useState, useEffect, useRef, useCallback } from "react";
import type { VariationMeta, VariationState } from "./types";
import { ElementWrapper } from "./ElementWrapper";
import { TYPOGRAPHY, adaptiveSize } from "../../utils/design-tokens";
import { useCanvasZoom } from "../../contexts/CanvasZoomContext";

interface VisualConceptProps {
  phrase: string;
  state?: VariationState;
  onToggleActive?: () => void;
  onChange?: (phrase: string) => void;
  onAddVariation?: () => void;
  onDelete?: () => void;
  meta?: VariationMeta;
}

export function VisualConceptCard({
  phrase,
  state,
  onToggleActive,
  onChange,
  onAddVariation,
  onDelete,
  meta,
}: VisualConceptProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [localPhrase, setLocalPhrase] = useState(phrase);
  const originalRef = useRef(phrase);

  const zoom = useCanvasZoom();
  const adaptiveFontSize = Math.round(adaptiveSize(
    TYPOGRAPHY.cardHeadingMd.fontSize,
    zoom,
    TYPOGRAPHY.cardBodySm.fontSize,
  ));

  useEffect(() => {
    if (!isEditing) {
      setLocalPhrase(phrase);
      originalRef.current = phrase;
    }
  }, [phrase, isEditing]);

  const handleEditEnter = useCallback(() => setIsEditing(true), []);

  const handleEditSave = useCallback(() => {
    const next = localPhrase.trim();
    setIsEditing(false);
    if (next !== originalRef.current) {
      onChange?.(next || originalRef.current);
    }
  }, [localPhrase, onChange]);

  const handleEditCancel = useCallback(() => {
    setIsEditing(false);
    setLocalPhrase(originalRef.current);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleEditSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleEditCancel();
    }
  };

  return (
    <ElementWrapper
      label="Visual Concept"
      state={state}
      editVariant="text"
      isEditing={isEditing}
      onEditEnter={handleEditEnter}
      onEditSave={handleEditSave}
      onEditCancel={handleEditCancel}
      onAddVariation={onAddVariation}
      onDelete={onDelete}
      onToggleActive={isEditing ? undefined : onToggleActive}
      meta={meta}
    >
      <div
        className="flex-1 flex items-center justify-center"
        onClick={(e) => isEditing && e.stopPropagation()}
      >
        {isEditing ? (
          <input
            autoFocus
            value={localPhrase}
            onChange={(e) => setLocalPhrase(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full italic bg-transparent border-b border-blue-300 focus:border-blue-500 outline-none text-foreground"
            style={{ fontSize: adaptiveFontSize }}
            placeholder="Concept phrase"
          />
        ) : (
          <span
            className="italic text-foreground/80 leading-snug"
            style={{ fontSize: adaptiveFontSize }}
          >
            {phrase}
          </span>
        )}
      </div>
    </ElementWrapper>
  );
}
