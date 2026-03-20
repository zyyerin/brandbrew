import React from "react";
import {
  BrandBriefCard,
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
  onAddVariation?: (componentId: string, sourceVariationId?: string | null) => void;
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
  onAddVariation,
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
    case "brand-brief":
      return (
        <BrandBriefCard
          name={data.name ?? ""}
          tagline={data.tagline ?? ""}
          description={data.description ?? ""}
          {...stateHandlers}
          onChange={(d) => onEditSave?.(elementType, d)}
          onAddVariation={onAddVariation ? () => onAddVariation(elementType, variation.id) : undefined}
          onDelete={deleteHandler}
          meta={variation.meta}
        />
      );

    case "color":
      return (
        <ColorPaletteCard
          colors={data.colors ?? []}
          {...stateHandlers}
          onChange={(colors) => onEditSave?.(elementType, colors)}
          onAddVariation={onAddVariation ? () => onAddVariation(elementType, variation.id) : undefined}
          onDelete={deleteHandler}
          meta={variation.meta}
        />
      );

    case "visual-concept":
      return (
        <VisualConceptCard
          phrase={typeof data === "string" ? data : ""}
          {...stateHandlers}
          onChange={(phrase) => onEditSave?.(elementType, phrase)}
          onAddVariation={onAddVariation ? () => onAddVariation(elementType, variation.id) : undefined}
          onDelete={deleteHandler}
          meta={variation.meta}
        />
      );

    case "art-style":
      return (
        <ArtStyleCard
          imageUrl={data.imageUrl ?? ""}
          onAspectRatioChange={(aspectRatio) => onImageAspectRatioChange?.(variation.id, aspectRatio)}
          {...stateHandlers}
          onAddVariation={onAddVariation ? () => onAddVariation(elementType, variation.id) : undefined}
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
          brandSummary={brandBrief?.description}
          {...stateHandlers}
          onChange={(d) => onEditSave?.(elementType, d)}
          onAddVariation={onAddVariation ? () => onAddVariation(elementType, variation.id) : undefined}
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
              onAddVariation={onAddVariation ? () => onAddVariation(elementType, variation.id) : undefined}
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
            onAddVariation={onAddVariation ? () => onAddVariation(elementType, variation.id) : undefined}
            onDelete={deleteHandler}
            meta={variation.meta}
          />
        );
      }
      return null;
  }
}
