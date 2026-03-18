import React from "react";
import type { CardMeta, CardState } from "./types";
import { ImageCard } from "./ImageCard";

interface ArtStyleCardProps {
  imageUrl: string;
  state?: CardState;
  onToggleActive?: () => void;
  onRefresh?: () => void;
  onDelete?: () => void;
  meta?: CardMeta;
  onAspectRatioChange?: (aspectRatio: number) => void;
}

export function ArtStyleCard({
  imageUrl,
  state,
  onToggleActive,
  onRefresh,
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
      onRefresh={onRefresh}
      onDelete={onDelete}
      meta={meta}
      onAspectRatioChange={onAspectRatioChange}
    />
  );
}
