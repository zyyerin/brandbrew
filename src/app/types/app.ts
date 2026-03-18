/**
 * @deprecated Legacy types kept for backward compatibility with unmigrated components.
 * Use types from `./project.ts` instead:
 *   - SnapshotBvi → use resolveSnapshotData() from project.ts
 *   - SnapshotHistoryItem → use SnapshotItem from project.ts
 *   - SnapshotGenerationMeta → use SnapshotGenerationMeta from project.ts
 *   - OutputType → no longer needed (ElementId is the universal key)
 */

/** @deprecated Use resolveSnapshotData() from project.ts to derive snapshot data */
export interface SnapshotBvi {
  brandBrief?: { name: string; tagline: string; description: string };
  targetAudience?: string;
  keywords?: string[];
  colorPalette?: string[];
  visualConcept?: { conceptName: string; points: string[] };
  artStyle?: { imageUrl: string };
  font?: { titleFont: string; bodyFont: string };
  logoInspiration?: { imageUrl: string };
  layout?: { imageUrl: string };
  styleReferences?: { id: string; imageUrl: string; label: string }[];
  guidelineApplications?: string[];
}

/** @deprecated Use SnapshotGenerationMeta from project.ts */
export interface SnapshotGenerationMeta {
  prompt?: string;
  model?: string;
  referenceImageUrls?: string[];
  hasPalette?: boolean;
  paletteImageDataUrl?: string;
  selectedElementLabels?: string[];
}

/** @deprecated Use SnapshotItem from project.ts */
export interface SnapshotHistoryItem {
  id: string;
  imageUrl: string;
  createdAt: Date;
  sourceVariationIds: string[];
  generationMeta?: SnapshotGenerationMeta;
  bvi?: SnapshotBvi;
}

/** @deprecated No longer needed — use ElementId from project.ts as the universal key */
export type OutputType =
  | "Visual Concept"
  | "Art Style"
  | "Font"
  | "Color"
  | "Style Reference"
  | "Logo Inspiration"
  | "Visual Snapshot"
  | "Brand Summary"
  | "Keywords";
