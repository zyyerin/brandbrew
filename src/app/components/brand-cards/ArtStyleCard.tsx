import React from "react";
import type { VariationMeta, VariationState } from "./types";
import { ImageCard } from "./ImageCard";

interface ArtStyleCardProps {
  imageUrl: string;
  state?: VariationState;
  onToggleActive?: () => void;
  onDelete?: () => void;
  meta?: VariationMeta;
  onAspectRatioChange?: (aspectRatio: number) => void;
}

export function ArtStyleCard({
  imageUrl,
  state,
  onToggleActive,
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
      onDelete={onDelete}
      meta={meta}
      onAspectRatioChange={onAspectRatioChange}
    />
  );
}
