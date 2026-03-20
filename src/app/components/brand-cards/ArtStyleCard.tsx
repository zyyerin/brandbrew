import React from "react";
import type { VariationMeta, VariationState } from "./types";
import { ImageCard } from "./ImageCard";

interface ArtStyleCardProps {
  imageUrl: string;
  state?: VariationState;
  onToggleActive?: () => void;
  onAddVariation?: () => void;
  onDelete?: () => void;
  meta?: VariationMeta;
  onAspectRatioChange?: (aspectRatio: number) => void;
}

export function ArtStyleCard({
  imageUrl,
  state,
  onToggleActive,
  onAddVariation,
  onDelete,
  meta,
  onAspectRatioChange,
}: ArtStyleCardProps) {
  return (
    <ImageCard
      label="Art Style"
      imageUrl={imageUrl}
      state={state}
      onToggleActive={onToggleActive}
      onAddVariation={onAddVariation}
      onDelete={onDelete}
      meta={meta}
      onAspectRatioChange={onAspectRatioChange}
    />
  );
}
