import React, { useCallback } from "react";
import { Download, ExternalLink } from "lucide-react";
import type { VariationMeta, VariationState } from "./types";
import { ElementWrapper } from "./ElementWrapper";
import { ImageWithFallback } from "./ImageWithFallback";
import { LAYOUT, TYPE } from "../../utils/design-tokens";

interface ImageCardProps {
  label: string;
  imageUrl: string;
  state?: VariationState;
  onToggleActive?: () => void;
  onDelete?: () => void;
  meta?: VariationMeta;
  minHeight?: string;
  onAspectRatioChange?: (aspectRatio: number) => void;
}

export function ImageCard({
  label,
  imageUrl,
  state,
  onToggleActive,
  onDelete,
  meta,
  minHeight = `${LAYOUT.card.imageMinHeight}px`,
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

  const handleDownload = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!imageUrl) return;
      try {
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const ext = blob.type.split("/")[1] || "png";
        a.download = `${label.toLowerCase().replace(/\s+/g, "-")}.${ext}`;
        a.click();
        URL.revokeObjectURL(url);
      } catch {
        window.open(imageUrl, "_blank", "noopener,noreferrer");
      }
    },
    [imageUrl, label],
  );

  const downloadButton = imageUrl ? (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); window.open(imageUrl, "_blank", "noopener,noreferrer"); }}
        className="p-1 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-black/5 transition-colors"
        title="Open image in new tab"
        data-no-card-toggle
      >
        <ExternalLink size={TYPE.icon.base} />
      </button>
      <button
        onClick={handleDownload}
        className="p-1 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-black/5 transition-colors"
        title="Download image"
        data-no-card-toggle
      >
        <Download size={TYPE.icon.base} />
      </button>
    </>
  ) : null;

  return (
    <ElementWrapper
      label={label}
      state={state}
      onDelete={onDelete}
      onToggleActive={onToggleActive}
      meta={meta}
      extraActions={downloadButton}
    >
      <div
        className="relative rounded-lg overflow-hidden flex-1 bg-muted/30"
        style={{ minHeight }}
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
    </ElementWrapper>
  );
}

interface VisualSnapshotProps {
  images: { id: string; imageUrl: string; label: string }[];
  state?: VariationState;
  onToggleActive?: () => void;
  onDelete?: () => void;
  meta?: VariationMeta;
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
      minHeight={`${LAYOUT.card.snapshotMinHeight}px`}
      onAspectRatioChange={onAspectRatioChange}
      {...rest}
    />
  );
}
