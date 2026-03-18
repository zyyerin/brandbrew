import { useState, useCallback, useRef, type MutableRefObject } from "react";
import type { ProjectData, ElementId, Variation, CardMeta } from "../types/project";
import { IMAGE_ELEMENT_IDS, ELEMENT_LABELS, getActiveElementData } from "../types/project";
import type { BrandSummaryFields } from "../components/brand-summary";
import type { BriefGeneratedKey } from "../components/brand-summary";
import { generateVisualConcept, enhanceBrief, generateCardVariation, uploadImage } from "../utils/generate-brand";
import { generateBrandImage, generateMergeImage, designPaletteAndFonts, designLogoAndStyle, designLayout } from "../utils/generate-image";
import type { ImageCardType } from "../utils/generate-image";
import {
  isMergeSupported,
  getMergeHint,
  performMerge,
  performPaletteExtraction,
  performVisionTextMerge,
  performCommentModify,
} from "../utils/merge-logic";
import { normalizeColorPalette, paletteToBase64 } from "../utils/helpers";
import { SUGGESTION_PROMPTS } from "../constants/suggestions";

// ── Display phase (transient animation state for the board) ─────────────────
export type BoardDisplayPhase =
  | "empty"
  | "generating-concept"
  | "generating-palette-fonts"
  | "generating-logo-style"
  | "generating-layout"
  | "visual-complete";

export interface UseBrandGenerationParams {
  project: ProjectData;
  setProject: React.Dispatch<React.SetStateAction<ProjectData>>;
  projectRef: MutableRefObject<ProjectData>;
  generationCounterRef: MutableRefObject<number>;
}

function addVariationToProject(
  prev: ProjectData,
  elementId: ElementId,
  variation: Variation,
  setActive = true,
): ProjectData {
  const slot = prev.elements[elementId];
  return {
    ...prev,
    elements: {
      ...prev.elements,
      [elementId]: {
        ...slot,
        variations: [...slot.variations, variation],
        activeVariationId: setActive ? variation.id : slot.activeVariationId,
      },
    },
  };
}

/** Avoid duplicate queue cards when merge API returns the same payload as an existing variation. */
function projectHasEquivalentVariation(
  elements: ProjectData["elements"],
  elementId: ElementId,
  data: unknown,
): boolean {
  const slot = elements[elementId];
  if (!slot?.variations?.length) return false;
  const key = JSON.stringify(data);
  return slot.variations.some((v) => JSON.stringify(v.data) === key);
}

function fieldsToSummary(fields: BrandSummaryFields) {
  return {
    name: fields.brandName?.trim() || "",
    tagline: fields.tagline?.trim() || "",
    description: fields.brandDescription?.trim() || "",
    targetAudience: fields.targetAudience?.trim() || "",
    keywords: fields.keywords
      ? fields.keywords.split(",").map((k) => k.trim()).filter(Boolean)
      : [],
  };
}

export function useBrandGeneration({
  project,
  setProject,
  projectRef,
  generationCounterRef,
}: UseBrandGenerationParams) {
  const [isBrandGenerating, setIsBrandGenerating] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isAutoCompleting, setIsAutoCompleting] = useState(false);
  const [generatedBriefFields, setGeneratedBriefFields] = useState<Set<BriefGeneratedKey>>(new Set());
  const [loadingElements, setLoadingElements] = useState<Set<string>>(new Set());
  const [mergingElementIds, setMergingElementIds] = useState<Set<string>>(new Set());
  const mergeInFlightRef = useRef<Set<string>>(new Set());
  const [displayPhase, setDisplayPhase] = useState<BoardDisplayPhase>("empty");
  const [autoFillingFieldKey, setAutoFillingFieldKey] = useState<keyof BrandSummaryFields | null>(null);

  const runVisualGeneration = useCallback(
    async (briefContext: {
      brandName: string;
      tagline: string;
      description: string;
      targetAudience: string;
      keywords: string[];
    }) => {
      const makeVar = (id: string, data: unknown, meta?: CardMeta): Variation => ({
        id,
        data,
        source: "initial",
        createdAt: new Date(),
        meta,
      });

      try {
        // Step 0: Strategist -> Visual Concept
        setDisplayPhase("generating-concept");
        const vcResult = await generateVisualConcept({
          brandName: briefContext.brandName,
          tagline: briefContext.tagline,
          description: briefContext.description,
          targetAudience: briefContext.targetAudience,
          keywords: briefContext.keywords,
        });

        setProject((prev) => addVariationToProject(
          prev,
          "visual-concept",
          makeVar("visual-concept", vcResult.visualConcept, vcResult._meta),
        ));

        const designCtx = {
          brandName: briefContext.brandName,
          tagline: briefContext.tagline,
          description: briefContext.description,
          targetAudience: briefContext.targetAudience,
          keywords: briefContext.keywords,
          visualConcept: vcResult.visualConcept,
        };

        // Step 1: Art Director -> Palette + Fonts
        setDisplayPhase("generating-palette-fonts");
        const pfResult = await designPaletteAndFonts(designCtx);

        setProject((prev) => {
          let next = addVariationToProject(
            prev,
            "color-palette",
            makeVar("color-palette", pfResult.colorPalette, pfResult._meta),
          );
          next = addVariationToProject(
            next,
            "font",
            makeVar("font", pfResult.font, pfResult._meta),
          );
          return next;
        });

        // Step 2: Art Director -> Logo + Art Style
        setDisplayPhase("generating-logo-style");
        const lsResult = await designLogoAndStyle({
          ...designCtx,
          colorPalette: pfResult.colorPalette,
          font: pfResult.font,
        });

        setProject((prev) => {
          let next = addVariationToProject(
            prev,
            "logo",
            makeVar("logo", { imageUrl: lsResult.logoImageUrl }, lsResult._meta),
          );
          next = addVariationToProject(
            next,
            "art-style",
            makeVar("art-style", { imageUrl: lsResult.artStyleImageUrl }, lsResult._meta),
          );
          return next;
        });

        // Step 3: Art Director -> Layout
        setDisplayPhase("generating-layout");
        const layoutResult = await designLayout({
          ...designCtx,
          colorPalette: pfResult.colorPalette,
          font: pfResult.font,
          artStyleImageUrl: lsResult.artStyleImageUrl,
          logoImageUrl: lsResult.logoImageUrl,
        });

        setProject((prev) => {
          let next = addVariationToProject(
            prev,
            "layout",
            makeVar("layout", { imageUrl: layoutResult.layoutImageUrl }, layoutResult._meta),
          );
          next = { ...next, phase: "curating" };
          return next;
        });

        setDisplayPhase("visual-complete");
      } catch (err) {
        console.error("Visual generation pipeline failed:", err);
        setProject((prev) => ({ ...prev, phase: "curating" }));
        setDisplayPhase("visual-complete");
      }
    },
    [setProject],
  );

  const handleBrandSummarySubmit = useCallback(
    async (fields: BrandSummaryFields) => {
      setIsBrandGenerating(true);

      const summaryData = {
        name: fields.brandName?.trim() || "",
        tagline: fields.tagline?.trim() || "",
        description: fields.brandDescription?.trim() || "",
        targetAudience: fields.targetAudience?.trim() || "",
        keywords: fieldsToSummary(fields).keywords,
      };

      setProject((prev) => {
        const bsVersionId = `bs-${Date.now()}`;
        const bsVersion = {
          id: bsVersionId,
          data: { ...summaryData },
          createdAt: new Date(),
        };

        return {
          ...prev,
          projectName: fields.brandName?.trim() || prev.projectName,
          phase: "generating" as const,
          brandSummary: {
            current: summaryData,
            versions: [...prev.brandSummary.versions, bsVersion],
          },
        };
      });

      try {
        await runVisualGeneration({
          brandName: summaryData.name,
          tagline: summaryData.tagline,
          description: summaryData.description,
          targetAudience: summaryData.targetAudience,
          keywords: summaryData.keywords,
        });
      } catch (err) {
        console.error("Brand generation error:", err);
      } finally {
        setIsBrandGenerating(false);
      }
    },
    [setProject, runVisualGeneration],
  );

  const handleSuggestionClick = useCallback(
    (suggestion: string) => {
      const fields = SUGGESTION_PROMPTS[suggestion];
      if (fields) handleBrandSummarySubmit(fields);
    },
    [handleBrandSummarySubmit],
  );

  const handleEnhanceBrief = useCallback(
    async (fields: BrandSummaryFields) => {
      setIsEnhancing(true);
      setGeneratedBriefFields(new Set());
      try {
        const result = await enhanceBrief({
          partialBrief: {
            name: fields.brandName?.trim() || undefined,
            tagline: fields.tagline?.trim() || undefined,
            description: fields.brandDescription?.trim() || undefined,
          },
          targetAudience: fields.targetAudience?.trim() || undefined,
          keywords: fields.keywords?.trim() || undefined,
        });

        const userKeywords = fields.keywords?.trim()
          ? fields.keywords.split(",").map((k) => k.trim()).filter(Boolean)
          : [];

        const merged = {
          name: fields.brandName?.trim() || result.brandBrief.name || "",
          tagline: fields.tagline?.trim() || result.brandBrief.tagline || "",
          description: fields.brandDescription?.trim() || result.brandBrief.description || "",
          targetAudience: fields.targetAudience?.trim() || result.targetAudience || "",
          keywords: userKeywords.length ? userKeywords : result.keywords ?? [],
        };

        const generated = new Set<BriefGeneratedKey>();
        if (!fields.brandName?.trim() && merged.name) generated.add("brandName");
        if (!fields.tagline?.trim() && merged.tagline) generated.add("tagline");
        if (!fields.brandDescription?.trim() && merged.description) generated.add("brandDescription");
        if (!fields.targetAudience?.trim() && merged.targetAudience) generated.add("targetAudience");
        if (!fields.keywords?.trim() && merged.keywords.length) generated.add("keywords");

        setProject((prev) => ({
          ...prev,
          brandSummary: {
            ...prev.brandSummary,
            current: merged,
          },
        }));
        setGeneratedBriefFields(generated);
      } catch (err) {
        console.error("Enhance brief error:", err);
      } finally {
        setIsEnhancing(false);
      }
    },
    [setProject],
  );

  const handleAutoComplete = useCallback(
    async (fields: BrandSummaryFields) => {
      setIsAutoCompleting(true);
      setGeneratedBriefFields(new Set());
      try {
        await handleEnhanceBrief(fields);
      } catch (err) {
        console.error("Auto complete error:", err);
      } finally {
        setIsAutoCompleting(false);
      }
    },
    [handleEnhanceBrief],
  );

  const handleFieldAutoFill = useCallback(
    async (key: keyof BrandSummaryFields, fields: BrandSummaryFields) => {
      setAutoFillingFieldKey(key);
      try {
        const result = await enhanceBrief({
          partialBrief: {
            name: fields.brandName?.trim() || undefined,
            tagline: fields.tagline?.trim() || undefined,
            description: fields.brandDescription?.trim() || undefined,
          },
          targetAudience: fields.targetAudience?.trim() || undefined,
          keywords: fields.keywords?.trim() || undefined,
        });

        setProject((prev) => {
          const bs = { ...prev.brandSummary.current };
          const nextGenerated = new Set(generatedBriefFields);

          if (key === "brandName") {
            bs.name = fields.brandName?.trim() || result.brandBrief?.name || bs.name;
            if (!fields.brandName?.trim() && bs.name) nextGenerated.add("brandName");
          } else if (key === "tagline") {
            bs.tagline = fields.tagline?.trim() || result.brandBrief?.tagline || bs.tagline;
            if (!fields.tagline?.trim() && bs.tagline) nextGenerated.add("tagline");
          } else if (key === "brandDescription") {
            bs.description = fields.brandDescription?.trim() || result.brandBrief?.description || bs.description;
            if (!fields.brandDescription?.trim() && bs.description) nextGenerated.add("brandDescription");
          } else if (key === "targetAudience") {
            bs.targetAudience = fields.targetAudience?.trim() || result.targetAudience || bs.targetAudience;
            if (!fields.targetAudience?.trim() && bs.targetAudience) nextGenerated.add("targetAudience");
          } else if (key === "keywords") {
            const userKw = fields.keywords?.trim()
              ? fields.keywords.split(",").map((k) => k.trim()).filter(Boolean)
              : [];
            bs.keywords = userKw.length ? userKw : result.keywords ?? bs.keywords;
            if (!fields.keywords?.trim() && bs.keywords.length) nextGenerated.add("keywords");
          }

          setGeneratedBriefFields(nextGenerated);
          return {
            ...prev,
            brandSummary: { ...prev.brandSummary, current: bs },
          };
        });
      } catch (err) {
        console.error("Field auto-fill error:", err);
      } finally {
        setAutoFillingFieldKey((current) => (current === key ? null : current));
      }
    },
    [generatedBriefFields, setProject],
  );

  const handleGenerateRegenerate = useCallback(
    async (elementId: string | null) => {
      if (!elementId) return;
      const eid = elementId as ElementId;

      setLoadingElements((prev) => new Set([...prev, elementId]));

      try {
        const p = projectRef.current;
        const bs = p.brandSummary.current;
        const vc = getActiveElementData(p.elements, "visual-concept");
        const cp = getActiveElementData(p.elements, "color-palette");

        if (IMAGE_ELEMENT_IDS.has(eid)) {
          const result = await generateBrandImage(elementId as ImageCardType, {
            brandName: bs.name,
            brandDescription: bs.description,
            conceptName: vc?.conceptName,
            conceptPoints: vc?.points,
            keywords: bs.keywords,
            colorPalette: cp as string[] | undefined,
          });

          const paletteB64 = cp?.length ? paletteToBase64(cp as string[]) : undefined;
          const meta: CardMeta | undefined = result._meta
            ? {
                ...result._meta,
                paletteImageDataUrl:
                  paletteB64 ? `data:image/png;base64,${paletteB64}` : result._meta.paletteImageDataUrl,
              }
            : result._meta;

          const counter = generationCounterRef.current++;
          const variation: Variation = {
            id: `regenerate-${Date.now()}-${counter}`,
            data: { imageUrl: result.imageUrl },
            source: "regenerate",
            createdAt: new Date(),
            meta,
          };

          setProject((prev) => addVariationToProject(prev, eid, variation));
        } else {
          const existingContent = getActiveElementData(p.elements, eid);

          const result = await generateCardVariation(elementId, {
            brandName: bs.name,
            tagline: bs.tagline,
            description: bs.description,
            keywords: bs.keywords,
            concept: vc?.conceptName,
            existingContent,
          });

          const counter = generationCounterRef.current++;
          const variation: Variation = {
            id: `regenerate-${Date.now()}-${counter}`,
            data: eid === "color-palette"
              ? normalizeColorPalette(result.data)
              : result.data,
            source: "regenerate",
            createdAt: new Date(),
            meta: result._meta,
          };

          setProject((prev) => addVariationToProject(prev, eid, variation));
        }
      } catch (err) {
        console.error("Regenerate error:", err);
      } finally {
        setLoadingElements((prev) => {
          const n = new Set(prev);
          n.delete(elementId);
          return n;
        });
      }
    },
    [projectRef, generationCounterRef, setProject],
  );

  const handleMerge = useCallback(
    async (sourceId: string, targetId: string, sourceVarId?: string, targetVarId?: string) => {
      if (!isMergeSupported(sourceId, targetId)) return;
      if (mergeInFlightRef.current.has(targetId)) return;
      mergeInFlightRef.current.add(targetId);

      const sourceEid = sourceId as ElementId;
      const targetEid = targetId as ElementId;
      const hint = getMergeHint(sourceId, targetId);
      setMergingElementIds((prev) => new Set([...prev, targetId]));

      const removeMerging = () =>
        setMergingElementIds((prev) => {
          const n = new Set(prev);
          n.delete(targetId);
          return n;
        });

      const getVariationData = (eid: ElementId, varId?: string) => {
        const slot = projectRef.current.elements[eid];
        if (varId) {
          const v = slot.variations.find((v) => v.id === varId);
          if (v) return v.data;
        }
        return getActiveElementData(projectRef.current.elements, eid);
      };

      try {
        const p = projectRef.current;
        const bs = p.brandSummary.current;
        const vc = getActiveElementData(p.elements, "visual-concept");
        const cp = getActiveElementData(p.elements, "color-palette") as string[] | null;

        if (IMAGE_ELEMENT_IDS.has(sourceEid) && targetId === "color-palette") {
          const sourceData = getVariationData(sourceEid, sourceVarId) as { imageUrl: string } | null;
          const sourceImageUrl = sourceData?.imageUrl;
          if (!sourceImageUrl) return;
          const legacyBrandData = buildLegacyBrandDataForMerge(p);
          const { patch, _meta: extractMeta } = await performPaletteExtraction(sourceId, sourceImageUrl, legacyBrandData);
          if (patch) {
            const rawPalette = (patch as Record<string, unknown>).colorPalette;
            const normalized = normalizeColorPalette(rawPalette);
            if (normalized != null) {
              const counter = generationCounterRef.current++;
              const variation: Variation = {
                id: `merge-${Date.now()}-${counter}`,
                data: normalized,
                source: "merge",
                createdAt: new Date(),
                meta: extractMeta,
              };
              setProject((prev) =>
                projectHasEquivalentVariation(prev.elements, "color-palette", normalized)
                  ? prev
                  : addVariationToProject(prev, "color-palette", variation),
              );
            }
          }
        } else if (IMAGE_ELEMENT_IDS.has(sourceEid) && !IMAGE_ELEMENT_IDS.has(targetEid)) {
          const sourceData = getVariationData(sourceEid, sourceVarId) as { imageUrl: string } | null;
          const sourceImageUrl = sourceData?.imageUrl;
          if (!sourceImageUrl) return;
          const legacyBrandData = buildLegacyBrandDataForMerge(p);
          const { patch, _meta: visionMergeMeta } = await performVisionTextMerge(
            sourceId,
            targetId,
            sourceImageUrl,
            legacyBrandData,
          );
          if (patch) {
            const mergeData = extractMergeData(targetEid, patch);
            if (mergeData != null) {
              const variationData =
                targetEid === "color-palette"
                  ? normalizeColorPalette(mergeData)
                  : mergeData;
              const counter = generationCounterRef.current++;
              const variation: Variation = {
                id: `merge-${Date.now()}-${counter}`,
                data: variationData,
                source: "merge",
                createdAt: new Date(),
                meta: visionMergeMeta,
              };
              setProject((prev) =>
                projectHasEquivalentVariation(prev.elements, targetEid, variationData)
                  ? prev
                  : addVariationToProject(prev, targetEid, variation),
              );
            }
          }
        } else if (IMAGE_ELEMENT_IDS.has(targetEid)) {
          const isWordmarkMerge = sourceId === "font" && targetId === "logo";

          let mergeResult: { imageUrl: string; _meta?: CardMeta };

          if (!targetVarId && !isWordmarkMerge) {
            // Queue-slot drop → simple merge via visual-designer (hint + brand summary + source image)
            const sourceData = IMAGE_ELEMENT_IDS.has(sourceEid)
              ? getVariationData(sourceEid, sourceVarId) as { imageUrl: string } | null
              : null;
            mergeResult = await generateMergeImage(targetId as ImageCardType, {
              brandName: bs.name,
              brandDescription: bs.description,
              mergeContext: hint,
              sourceImageUrl: sourceData?.imageUrl,
            });
          } else {
            // Card drop → img2img editing, or wordmark merge
            const targetData = targetVarId
              ? getVariationData(targetEid, targetVarId) as { imageUrl: string } | null
              : null;
            const existingImageUrl = targetData?.imageUrl;
            const paletteImageBase64 =
              sourceId === "color-palette" && cp?.length
                ? paletteToBase64(cp)
                : undefined;
            const fontData = isWordmarkMerge
              ? getActiveElementData(p.elements, "font") as { titleFont: string; bodyFont: string } | null
              : null;

            mergeResult = await generateBrandImage(targetId as ImageCardType, {
              brandName: bs.name,
              brandDescription: bs.description,
              conceptName: vc?.conceptName,
              conceptPoints: vc?.points,
              keywords: bs.keywords,
              colorPalette: cp ?? undefined,
              mergeContext: hint,
              sourceImageUrl: isWordmarkMerge ? undefined : existingImageUrl,
              paletteImageBase64,
              titleFont: fontData?.titleFont,
            });
          }

          const counter = generationCounterRef.current++;
          const imgData = { imageUrl: mergeResult.imageUrl };
          const variation: Variation = {
            id: `merge-${Date.now()}-${counter}`,
            data: imgData,
            source: "merge",
            createdAt: new Date(),
            meta: mergeResult._meta,
          };
          setProject((prev) =>
            projectHasEquivalentVariation(prev.elements, targetEid, imgData)
              ? prev
              : addVariationToProject(prev, targetEid, variation),
          );
        } else {
          const legacyBrandData = buildLegacyBrandDataForMerge(p);
          const { patch, _meta: mergeMeta } = await performMerge(sourceId, targetId, legacyBrandData);
          if (patch) {
            const mergeData = extractMergeData(targetEid, patch);
            if (mergeData != null) {
              const variationData =
                targetEid === "color-palette"
                  ? normalizeColorPalette(mergeData)
                  : mergeData;
              const counter = generationCounterRef.current++;
              const variation: Variation = {
                id: `merge-${Date.now()}-${counter}`,
                data: variationData,
                source: "merge",
                createdAt: new Date(),
                meta: mergeMeta,
              };
              setProject((prev) =>
                projectHasEquivalentVariation(prev.elements, targetEid, variationData)
                  ? prev
                  : addVariationToProject(prev, targetEid, variation),
              );
            }
          }
        }
      } catch (err) {
        console.error("Merge error:", err);
      } finally {
        mergeInFlightRef.current.delete(targetId);
        removeMerging();
      }
    },
    [projectRef, generationCounterRef, setProject],
  );

  const handleCommentModify = useCallback(
    async (targetId: string, comment: string, targetVarId?: string) => {
      const targetEid = targetId as ElementId;
      setMergingElementIds((prev) => new Set([...prev, targetId]));

      const removeMerging = () =>
        setMergingElementIds((prev) => {
          const n = new Set(prev);
          n.delete(targetId);
          return n;
        });

      try {
        const p = projectRef.current;
        const bs = p.brandSummary.current;
        const vc = getActiveElementData(p.elements, "visual-concept");
        const cp = getActiveElementData(p.elements, "color-palette") as string[] | null;

        if (IMAGE_ELEMENT_IDS.has(targetEid)) {
          const slot = p.elements[targetEid];
          const targetVariation = targetVarId
            ? slot.variations.find((v) => v.id === targetVarId) ?? null
            : null;
          const existingImageUrl = (
            (targetVariation?.data ?? getActiveElementData(p.elements, targetEid)) as { imageUrl: string } | null
          )?.imageUrl;

          const result = await generateBrandImage(targetId as ImageCardType, {
            brandName: bs.name,
            brandDescription: bs.description,
            conceptName: vc?.conceptName,
            conceptPoints: vc?.points,
            keywords: bs.keywords,
            colorPalette: cp ?? undefined,
            mergeContext: comment,
            sourceImageUrl: existingImageUrl,
          });

          const counter = generationCounterRef.current++;
          const variation: Variation = {
            id: `comment-${Date.now()}-${counter}`,
            data: { imageUrl: result.imageUrl },
            source: "comment",
            createdAt: new Date(),
            meta: result._meta,
          };
          setProject((prev) => addVariationToProject(prev, targetEid, variation));
        } else {
          const legacyBrandData = buildLegacyBrandDataForMerge(p);
          const { patch, _meta: commentMeta } = await performCommentModify(targetId, comment, legacyBrandData);
          if (patch) {
            const modifiedData = extractMergeData(targetEid, patch);
            if (modifiedData != null) {
              const counter = generationCounterRef.current++;
              const variation: Variation = {
                id: `comment-${Date.now()}-${counter}`,
                data: targetEid === "color-palette"
                  ? normalizeColorPalette(modifiedData)
                  : modifiedData,
                source: "comment",
                createdAt: new Date(),
                meta: commentMeta,
              };
              setProject((prev) => addVariationToProject(prev, targetEid, variation));
            }
          }
        }
      } catch (err) {
        console.error("Comment modify error:", err);
      } finally {
        removeMerging();
      }
    },
    [projectRef, generationCounterRef, setProject],
  );

  const MAX_UPLOAD_SIZE = 5 * 1024 * 1024; // 5 MB

  const handleUploadVariation = useCallback(
    (elementId: string, file: File) => {
      const eid = elementId as ElementId;
      if (!IMAGE_ELEMENT_IDS.has(eid)) return;
      if (!file.type.startsWith("image/")) return;
      if (file.size > MAX_UPLOAD_SIZE) {
        console.warn(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 5 MB.`);
        return;
      }

      const blobUrl = URL.createObjectURL(file);
      const counter = generationCounterRef.current++;
      const varId = `upload-${Date.now()}-${counter}`;

      const variation: Variation = {
        id: varId,
        data: { imageUrl: blobUrl },
        source: "user-upload",
        createdAt: new Date(),
        meta: { source: "user-upload" },
      };

      setProject((prev) => addVariationToProject(prev, eid, variation));

      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const dataUrl = reader.result as string;
          const base64 = dataUrl.split(",")[1];
          const { imageUrl: signedUrl } = await uploadImage(base64, file.type, elementId);

          setProject((prev) => {
            const slot = prev.elements[eid];
            return {
              ...prev,
              elements: {
                ...prev.elements,
                [eid]: {
                  ...slot,
                  variations: slot.variations.map((v) =>
                    v.id === varId
                      ? { ...v, data: { imageUrl: signedUrl } }
                      : v,
                  ),
                },
              },
            };
          });

          URL.revokeObjectURL(blobUrl);
        } catch (err) {
          console.error("Image upload failed:", err);
        }
      };
      reader.readAsDataURL(file);
    },
    [generationCounterRef, setProject],
  );

  return {
    isBrandGenerating,
    setIsBrandGenerating,
    isEnhancing,
    isAutoCompleting,
    generatedBriefFields,
    setGeneratedBriefFields,
    loadingElements,
    setLoadingElements,
    mergingElementIds,
    setMergingElementIds,
    displayPhase,
    setDisplayPhase,
    handleBrandSummarySubmit,
    handleSuggestionClick,
    handleEnhanceBrief,
    handleAutoComplete,
    handleFieldAutoFill,
    autoFillingFieldKey,
    handleGenerateRegenerate,
    handleMerge,
    handleCommentModify,
    handleUploadVariation,
  };
}

// Construct a minimal legacy BrandData shape for the merge API call
function buildLegacyBrandDataForMerge(p: ProjectData): Record<string, unknown> {
  const bs = p.brandSummary.current;
  return {
    brandBrief: { name: bs.name, tagline: bs.tagline, description: bs.description },
    targetAudience: bs.targetAudience,
    keywords: bs.keywords,
    visualConcept: getActiveElementData(p.elements, "visual-concept"),
    artStyle: getActiveElementData(p.elements, "art-style"),
    colorPalette: getActiveElementData(p.elements, "color-palette"),
    font: getActiveElementData(p.elements, "font"),
    logoInspiration: getActiveElementData(p.elements, "logo"),
    layout: getActiveElementData(p.elements, "layout"),
  };
}

function extractMergeData(elementId: ElementId, patch: Record<string, unknown>): unknown {
  const map: Record<ElementId, string> = {
    "visual-concept": "visualConcept",
    "art-style": "artStyle",
    "color-palette": "colorPalette",
    "font": "font",
    "logo": "logoInspiration",
    "layout": "layout",
  };
  return patch[map[elementId]] ?? null;
}
