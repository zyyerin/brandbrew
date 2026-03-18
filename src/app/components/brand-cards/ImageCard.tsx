import React, { useCallback } from "react";
import type { CardMeta, CardState } from "./types";
import { CardWrapper } from "./CardWrapper";
import { ImageWithFallback } from "../figma/ImageWithFallback";

interface ImageCardProps {
  label: string;
  imageUrl: string;
  state?: CardState;
  onToggleActive?: () => void;
  onRefresh?: () => void;
  onDelete?: () => void;
  meta?: CardMeta;
  minHeight?: string;
  onAspectRatioChange?: (aspectRatio: number) => void;
}

export function ImageCard({
  label,
  imageUrl,
  state,
  onToggleActive,
  onRefresh,
  onDelete,
  meta,
  minHeight = "160px",
  onAspectRatioChange,
}: ImageCardProps) {
  const handleImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const { naturalWidth, naturalHeight } = e.currentTarget;
      if (!naturalWidth || !naturalHeight) return;
      onAspectRatioChange?.(naturalWidth / naturalHeight);
    },
    [onAspectRatioChange],
  );

  return (
    <CardWrapper
      label={label}
      state={state}
      onRegenerate={onRefresh}
      onDelete={onDelete}
      onToggleActive={onToggleActive}
      meta={meta}
    >
      <div
        className="relative rounded-lg overflow-hidden flex-1 bg-muted/30 cursor-pointer"
        style={{ minHeight }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (imageUrl) window.open(imageUrl, "_blank", "noopener,noreferrer");
        }}
        title="Double-click to open image in new window"
      >
        {imageUrl && (
          <ImageWithFallback
            src={imageUrl}
            alt={label}
            className="w-full h-full object-contain absolute inset-0"
            onLoad={handleImageLoad}
          />
        )}
      </div>
    </CardWrapper>
  );
}

interface VisualSnapshotProps {
  images: { id: string; imageUrl: string; label: string }[];
  state?: CardState;
  onToggleActive?: () => void;
  onRefresh?: () => void;
  onDelete?: () => void;
  meta?: CardMeta;
  onAspectRatioChange?: (aspectRatio: number) => void;
}

export function VisualSnapshotCard({
  images,
  onAspectRatioChange,
  ...rest
}: VisualSnapshotProps) {
  return (
    <ImageCard
      label="Visual Snapshot"
      imageUrl={images[0]?.imageUrl ?? ""}
      minHeight="200px"
      onAspectRatioChange={onAspectRatioChange}
      {...rest}
    />
  );
}
