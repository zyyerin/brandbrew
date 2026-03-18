import type { CardMeta } from "../../types/project";
export type { CardMeta } from "../../types/project";

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
  meta?: CardMeta;
}

export type CardState = "inactive" | "active" | "waiting" | "merging" | "available";

export type EditVariant = "text" | "image" | "color" | "font";
