import type { GeneratedCardItem } from "../components/brand-cards";

export interface BrandData {
  /**
   * Core Brand Summary object (name / tagline / description) used across the board.
   */
  brandBrief?: {
    name: string;
    tagline: string;
    description: string;
  };
  targetAudience?: string;
  colorPalette?: string[];
  keywords?: string[];
  visualConcept?: {
    conceptName: string;
    points: string[];
  };
  artStyle?: { imageUrl: string };
  font?: {
    titleFont: string;
    bodyFont: string;
  };
  logoInspiration?: { imageUrl: string };
  layout?: { imageUrl: string };
  styleReferences?: { id: string; imageUrl: string; label: string }[];
  generatedCards?: GeneratedCardItem[];
  guidelineApplications?: string[];
}
