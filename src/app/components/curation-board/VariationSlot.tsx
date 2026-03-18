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
import type { CardState } from "../brand-cards";
import { CARD_LABELS as LABELS } from "../../utils/design-tokens";
import type { VariationItem } from "../variations-panel";
import type { BrandData } from "../../types/brand";

interface VariationSlotProps {
  cardId: string;
  variation: VariationItem;
  isActive: boolean;
  canDelete: boolean;
  cardState: CardState;
  peerVariationIds: string[];
  brandBrief?: BrandData["brandBrief"];
  onEditSave?: (componentId: string, patch: Partial<BrandData>) => void;
  onRefresh?: (componentId: string) => void;
  onToggleVariationChecked?: (variationId: string, peerVariationIds: string[]) => void;
  onDeleteVariation?: (componentId: string, variationId: string) => void;
  onImageAspectRatioChange?: (variationId: string, aspectRatio: number) => void;
}

export function VariationSlot({
  cardId,
  variation,
  isActive,
  canDelete,
  cardState,
  peerVariationIds,
  brandBrief,
  onEditSave,
  onRefresh,
  onToggleVariationChecked,
  onDeleteVariation,
  onImageAspectRatioChange,
}: VariationSlotProps) {
  const { type, data } = variation;

  const stateHandlers = {
    state: cardState,
    onToggleActive: () => onToggleVariationChecked?.(variation.id, peerVariationIds),
  };

  const deleteHandler = canDelete ? () => onDeleteVariation?.(cardId, variation.id) : undefined;

  switch (type) {
    case "brand-brief":
      return (
        <BrandBriefCard
          name={data.name ?? ""}
          tagline={data.tagline ?? ""}
          description={data.description ?? ""}
          {...stateHandlers}
          onChange={(d) => onEditSave?.(cardId, { brandBrief: d })}
          onRefresh={isActive ? () => onRefresh?.(cardId) : undefined}
          onDelete={deleteHandler}
          meta={variation.meta}
        />
      );

    case "color":
      return (
        <ColorPaletteCard
          colors={data.colors ?? []}
          {...stateHandlers}
          onChange={(colors) => onEditSave?.(cardId, { colorPalette: colors })}
          onRefresh={isActive ? () => onRefresh?.(cardId) : undefined}
          onDelete={deleteHandler}
          meta={variation.meta}
        />
      );

    case "visual-concept":
      return (
        <VisualConceptCard
          conceptName={data.conceptName ?? ""}
          points={data.points ?? []}
          {...stateHandlers}
          onChange={(d) => onEditSave?.(cardId, { visualConcept: d })}
          onRefresh={isActive ? () => onRefresh?.(cardId) : undefined}
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
          onRefresh={isActive ? () => onRefresh?.(cardId) : undefined}
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
          onChange={(d) => onEditSave?.(cardId, { font: d })}
          onRefresh={isActive ? () => onRefresh?.(cardId) : undefined}
          onDelete={deleteHandler}
          meta={variation.meta}
        />
      );

    default:
      if (data?.imageUrl) {
        if (type === "visual-snapshot" || (type === "style-reference" && cardId === "visual-snapshot")) {
          return (
            <VisualSnapshotCard
              images={[{ id: variation.id, imageUrl: data.imageUrl, label: variation.label }]}
              onAspectRatioChange={(aspectRatio) => onImageAspectRatioChange?.(variation.id, aspectRatio)}
              {...stateHandlers}
              onRefresh={isActive ? () => onRefresh?.(cardId) : undefined}
              onDelete={deleteHandler}
              meta={variation.meta}
            />
          );
        }
        return (
          <ImageCard
            label={variation.label || LABELS[cardId] || cardId}
            imageUrl={data.imageUrl}
            onAspectRatioChange={(aspectRatio) => onImageAspectRatioChange?.(variation.id, aspectRatio)}
            {...stateHandlers}
            onRefresh={isActive ? () => onRefresh?.(cardId) : undefined}
            onDelete={deleteHandler}
            meta={variation.meta}
          />
        );
      }
      return null;
  }
}
