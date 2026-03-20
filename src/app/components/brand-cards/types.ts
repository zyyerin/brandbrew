import type { VariationMeta } from "../../types/project";
export type { VariationMeta } from "../../types/project";

export type GeneratedCardType =
  | "visual-concept"
  | "font"
  | "color"
  | "style-reference"
  | "logo"
  | "visual-snapshot"
  | "brand-brief"
  | "art-style";

export interface GeneratedCardItem {
  id: string;
  type: GeneratedCardType;
  label: string;
  data: any;
  createdAt: Date;
  componentId?: string;
  meta?: VariationMeta;
}

export type VariationState = "inactive" | "active" | "waiting" | "merging" | "available" | "uploading";

export type EditVariant = "text" | "image" | "color" | "font";
