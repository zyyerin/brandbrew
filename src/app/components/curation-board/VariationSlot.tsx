import React from "react";
import {
  ColorPaletteCard,
  VisualConceptCard,
  FontCard,
  ArtStyleCard,
  ImageCard,
  VisualSnapshotCard,
} from "../brand-cards";
import type { VariationState } from "../brand-cards";
import { ELEMENT_TYPE_LABELS as LABELS } from "../../utils/design-tokens";
import type { VariationItem } from "../variations-panel";

interface VariationSlotProps {
  elementType: string;
  variation: VariationItem;
  isActive: boolean;
  canDelete: boolean;
  variationState: VariationState;
  peerVariationIds: string[];
  brandBrief?: { name?: string; tagline?: string; description?: string };
  onEditSave?: (elementId: string, data: unknown) => void;
  onToggleVariationChecked?: (variationId: string, peerVariationIds: string[]) => void;
  onDeleteVariation?: (componentId: string, variationId: string) => void;
  onImageAspectRatioChange?: (variationId: string, aspectRatio: number) => void;
}

export function VariationSlot({
  elementType,
  variation,
  isActive,
  canDelete,
  variationState,
  peerVariationIds,
  brandBrief,
  onEditSave,
  onToggleVariationChecked,
  onDeleteVariation,
  onImageAspectRatioChange,
}: VariationSlotProps) {
  const { type, data } = variation;

  const stateHandlers = {
    state: variationState,
    onToggleActive: () => onToggleVariationChecked?.(variation.id, peerVariationIds),
  };

  const deleteHandler = canDelete ? () => onDeleteVariation?.(elementType, variation.id) : undefined;

  switch (type) {
    case "color":
      return (
        <ColorPaletteCard
          colors={data.colors ?? []}
          {...stateHandlers}
          onChange={(colors) => onEditSave?.(elementType, colors)}
          onDelete={deleteHandler}
          meta={variation.meta}
        />
      );

    case "visual-concept": {
      const vcData = data && typeof data === "object" && "concept" in data
        ? data as { concept: string; description: string }
        : { concept: typeof data === "string" ? data : "", description: "" };
      return (
        <VisualConceptCard
          data={vcData}
          {...stateHandlers}
          onChange={(d) => onEditSave?.(elementType, d)}
          onDelete={deleteHandler}
          meta={variation.meta}
        />
      );
    }

    case "art-style":
      return (
        <ArtStyleCard
          imageUrl={data.imageUrl ?? ""}
          onAspectRatioChange={(aspectRatio) => onImageAspectRatioChange?.(variation.id, aspectRatio)}
          {...stateHandlers}
          onDelete={deleteHandler}
          meta={variation.meta}
        />
      );

    case "font":
      return (
        <FontCard
          titleFont={data.titleFont ?? ""}
          bodyFont={data.bodyFont ?? ""}
          brandName={brandBrief?.name}
          brandDescription={brandBrief?.description}
          {...stateHandlers}
          onChange={(d) => onEditSave?.(elementType, d)}
          onDelete={deleteHandler}
          meta={variation.meta}
        />
      );

    default:
      if (data?.imageUrl) {
        if (type === "visual-snapshot" || (type === "style-reference" && elementType === "visual-snapshot")) {
          return (
            <VisualSnapshotCard
              images={[{ id: variation.id, imageUrl: data.imageUrl, label: variation.label }]}
              onAspectRatioChange={(aspectRatio) => onImageAspectRatioChange?.(variation.id, aspectRatio)}
              {...stateHandlers}
              onDelete={deleteHandler}
              meta={variation.meta}
            />
          );
        }
        return (
          <ImageCard
            label={variation.label || LABELS[elementType] || elementType}
            imageUrl={data.imageUrl}
            onAspectRatioChange={(aspectRatio) => onImageAspectRatioChange?.(variation.id, aspectRatio)}
            {...stateHandlers}
            onDelete={deleteHandler}
            meta={variation.meta}
          />
        );
      }
      return null;
  }
}
