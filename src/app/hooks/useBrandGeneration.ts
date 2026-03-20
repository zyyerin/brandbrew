import { useState, useCallback, useRef, type MutableRefObject } from "react";
import type { ProjectData, ElementId, Variation, VariationMeta, PipelineStage } from "../types/project";
import { IMAGE_ELEMENT_IDS, ELEMENT_LABELS, getActiveElementData, getVariationDataById } from "../types/project";
import type { BrandSummaryFields } from "../components/brand-summary";
import type { BriefGeneratedKey } from "../components/brand-summary";
import { generateVisualConcept, autoCompleteBrief, generateCardVariation, uploadImage } from "../utils/generate-brand";
import { generateBrandImage, generateMergeImage, designPaletteAndFonts, designLogoAndStyle, designApplication } from "../utils/generate-image";
import type { ImageCardType } from "../utils/generate-image";
import { toast } from "sonner";
import {
  isMergeSupported,
  getMergeHint,
  performMerge,
  performPaletteExtraction,
  performVisionTextMerge,
  performCommentModify,
  type MergeBrandContext,
} from "../utils/merge-logic";
import { normalizeColorPalette, normalizeAndSortColorPalette, sortColorPaletteForHarmony, paletteToBase64 } from "../utils/helpers";
import { SUGGESTION_PROMPTS } from "../constants/suggestions";

export interface UseBrandGenerationParams {
  project: ProjectData;
  setProject: React.Dispatch<React.SetStateAction<ProjectData>>;
  projectRef: MutableRefObject<ProjectData>;
  generationCounterRef: MutableRefObject<number>;
  uploadingVariationIdsRef?: MutableRefObject<Set<string>>;
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
    applications: fields.applications
      ? fields.applications.split(",").map((a) => a.trim()).filter(Boolean)
      : [],
  };
}

export function useBrandGeneration({
  project,
  setProject,
  projectRef,
  generationCounterRef,
  uploadingVariationIdsRef,
}: UseBrandGenerationParams) {
  const [uploadingVariationIds, setUploadingVariationIds] = useState<Set<string>>(new Set());
  const [isBrandGenerating, setIsBrandGenerating] = useState(false);
  const [isAutoCompleting, setIsAutoCompleting] = useState(false);
  const [generatedBriefFields, setGeneratedBriefFields] = useState<Set<BriefGeneratedKey>>(new Set());
  const [loadingElements, setLoadingElements] = useState<Set<string>>(new Set());
  const [mergingElementIds, setMergingElementIds] = useState<Set<string>>(new Set());
  const mergeInFlightRef = useRef<Set<string>>(new Set());
  const [displayPhase, setDisplayPhase] = useState<PipelineStage>(null);
  const [autoFillingFieldKey, setAutoFillingFieldKey] = useState<keyof BrandSummaryFields | null>(null);

  const runVisualGeneration = useCallback(
    async (briefContext: {
      brandName: string;
      tagline: string;
      description: string;
      targetAudience: string;
      keywords: string[];
      applications?: string[];
    }) => {
      const makeVar = (id: string, data: unknown, meta?: VariationMeta): Variation => ({
        id,
        data,
        source: "initial",
        createdAt: new Date(),
        meta,
      });

      try {
        // Step 0: Strategist -> Visual Concept
        setDisplayPhase("conceptualizing");
        const vcResult = await generateVisualConcept({
          brandName: briefContext.brandName,
          tagline: briefContext.tagline,
          description: briefContext.description,
          targetAudience: briefContext.targetAudience,
          keywords: briefContext.keywords,
        });

        setProject((prev) => {
          // Split the 3-phrase array into individual string variations, one card per keyword.
          // Only the first is set as active; the others sit in the queue for later selection/merge.
          const [first, ...rest] = vcResult.visualConcept;
          let next = addVariationToProject(
            prev,
            "visual-concept",
            makeVar("visual-concept", first, vcResult._meta),
            true,
          );
          for (let i = 0; i < rest.length; i++) {
            next = addVariationToProject(
              next,
              "visual-concept",
              makeVar(`visual-concept--kw-${i + 1}`, rest[i], vcResult._meta),
              false,
            );
          }
          return next;
        });

        const designCtx = {
          brandName: briefContext.brandName,
          tagline: briefContext.tagline,
          description: briefContext.description,
          targetAudience: briefContext.targetAudience,
          keywords: briefContext.keywords,
          visualConcept: vcResult.visualConcept,
        };

        // Step 1: Art Director -> Palette + Fonts
        setDisplayPhase("styling");
        const pfResult = await designPaletteAndFonts(designCtx);

        setProject((prev) => {
          let next = addVariationToProject(
            prev,
            "color-palette",
            makeVar("color-palette", sortColorPaletteForHarmony(pfResult.colorPalette), pfResult._meta),
          );
          next = addVariationToProject(
            next,
            "font",
            makeVar("font", pfResult.font, pfResult._meta),
          );
          return next;
        });

        // Step 2: Art Director -> Logo + Art Style
        setDisplayPhase("drawing");
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

        // Step 3: Art Director -> Application Mockup
        setDisplayPhase("visualizing");
        const firstApplication = briefContext.applications?.[0] ?? "packaging and label";
        const applicationResult = await designApplication({
          ...designCtx,
          colorPalette: pfResult.colorPalette,
          font: pfResult.font,
          artStyleImageUrl: lsResult.artStyleImageUrl,
          logoImageUrl: lsResult.logoImageUrl,
          application: firstApplication,
        });

        setProject((prev) => {
          let next = addVariationToProject(
            prev,
            "application",
            makeVar("application", { imageUrl: applicationResult.applicationImageUrl }, applicationResult._meta),
          );
          next = { ...next, phase: "curating" };
          return next;
        });

        setDisplayPhase(null);
      } catch (err) {
        console.error("Visual generation pipeline failed:", err);
        setProject((prev) => ({ ...prev, phase: "curating" }));
        setDisplayPhase(null);
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
        applications: fieldsToSummary(fields).applications,
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
          phase: "curating" as const,
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
          applications: summaryData.applications,
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

  const handleAutoComplete = useCallback(
    async (fields: BrandSummaryFields) => {
      setIsAutoCompleting(true);
      setGeneratedBriefFields(new Set());
      try {
        const result = await autoCompleteBrief({
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
          applications: result.applications ?? [],
        };

        const generated = new Set<BriefGeneratedKey>();
        if (!fields.brandName?.trim() && merged.name) generated.add("brandName");
        if (!fields.tagline?.trim() && merged.tagline) generated.add("tagline");
        if (!fields.brandDescription?.trim() && merged.description) generated.add("brandDescription");
        if (!fields.targetAudience?.trim() && merged.targetAudience) generated.add("targetAudience");
        if (!fields.keywords?.trim() && merged.keywords.length) generated.add("keywords");

        const userApplications = fields.applications?.trim()
          ? fields.applications.split(",").map((a) => a.trim()).filter(Boolean)
          : [];
        if (!userApplications.length && merged.applications.length) generated.add("applications");

        setProject((prev) => ({
          ...prev,
          brandSummary: {
            ...prev.brandSummary,
            current: merged,
          },
        }));

        setGeneratedBriefFields(generated);
      } catch (err) {
        console.error("Auto-complete error:", err);
      } finally {
        setIsAutoCompleting(false);
      }
    },
    [setProject],
  );

  const handleFieldAutoFill = useCallback(
    async (key: keyof BrandSummaryFields, fields: BrandSummaryFields) => {
      setAutoFillingFieldKey(key);
      try {
        // Map UI field key to the partialBrief / API field name.
        const fieldToApiName: Record<keyof BrandSummaryFields, string> = {
          brandName: "name",
          tagline: "tagline",
          brandDescription: "description",
          targetAudience: "targetAudience",
          keywords: "keywords",
          applications: "applications",
        };

        // Capture the existing value. If non-empty, we send it as enhanceHint
        // and clear the field from partialBrief so the model generates a new version.
        const existingValue: string = fields[key]?.trim() ?? "";
        const isEnhance = existingValue.length > 0;

        const result = await autoCompleteBrief({
          partialBrief: {
            name: key === "brandName" && isEnhance ? undefined : (fields.brandName?.trim() || undefined),
            tagline: key === "tagline" && isEnhance ? undefined : (fields.tagline?.trim() || undefined),
            description: key === "brandDescription" && isEnhance ? undefined : (fields.brandDescription?.trim() || undefined),
          },
          targetAudience: key === "targetAudience" && isEnhance ? undefined : (fields.targetAudience?.trim() || undefined),
          keywords: key === "keywords" && isEnhance ? undefined : (fields.keywords?.trim() || undefined),
          enhanceHint: isEnhance ? existingValue : undefined,
          targetField: isEnhance ? fieldToApiName[key] : undefined,
        });

        setProject((prev) => {
          const bs = { ...prev.brandSummary.current };
          const nextGenerated = new Set(generatedBriefFields);

          if (key === "brandName") {
            const newVal = result.brandBrief?.name || bs.name;
            if (newVal !== bs.name || isEnhance) {
              bs.name = newVal;
              nextGenerated.add("brandName");
            }
          } else if (key === "tagline") {
            const newVal = result.brandBrief?.tagline || bs.tagline;
            if (newVal !== bs.tagline || isEnhance) {
              bs.tagline = newVal;
              nextGenerated.add("tagline");
            }
          } else if (key === "brandDescription") {
            const newVal = result.brandBrief?.description || bs.description;
            if (newVal !== bs.description || isEnhance) {
              bs.description = newVal;
              nextGenerated.add("brandDescription");
            }
          } else if (key === "targetAudience") {
            const newVal = result.targetAudience || bs.targetAudience;
            if (newVal !== bs.targetAudience || isEnhance) {
              bs.targetAudience = newVal;
              nextGenerated.add("targetAudience");
            }
          } else if (key === "keywords") {
            const userKw = fields.keywords?.trim()
              ? fields.keywords.split(",").map((k) => k.trim()).filter(Boolean)
              : [];
            const newKw = isEnhance ? (result.keywords ?? bs.keywords) : (userKw.length ? userKw : (result.keywords ?? bs.keywords));
            bs.keywords = newKw;
            nextGenerated.add("keywords");
          } else if (key === "applications") {
            const newApps = result.applications ?? bs.applications;
            bs.applications = newApps;
            nextGenerated.add("applications");
          }

          setGeneratedBriefFields(nextGenerated);
          return {
            ...prev,
            brandSummary: { ...prev.brandSummary, current: bs },
          };
        });
      } catch (err) {
        console.error("Field auto-complete error:", err);
      } finally {
        setAutoFillingFieldKey((current) => (current === key ? null : current));
      }
    },
    [generatedBriefFields, setProject],
  );

  const handleAddVariation = useCallback(
    async (elementId: string | null, sourceVariationId?: string | null) => {
      if (!elementId) return;
      const eid = elementId as ElementId;

      setLoadingElements((prev) => new Set([...prev, elementId]));

      try {
        const p = projectRef.current;
        const bs = p.brandSummary.current;
        const vc = getActiveElementData(p.elements, "visual-concept");
        const cp = getActiveElementData(p.elements, "color-palette");

        const getSourceData = () => {
          if (!sourceVariationId) return null;
          return getVariationDataById(p.elements, eid, sourceVariationId);
        };
        const sourceData = getSourceData();

        if (IMAGE_ELEMENT_IDS.has(eid)) {
          const imgSource = sourceData as { imageUrl?: string } | null;
          const sourceImageUrl = imgSource?.imageUrl;

          const result = await generateBrandImage(elementId as ImageCardType, {
            brandName: bs.name,
            brandDescription: bs.description,
            conceptPhrases: typeof vc === "string" && vc ? [vc] : undefined,
            keywords: bs.keywords,
            colorPalette: cp as string[] | undefined,
            sourceImageUrl,
          });

          const paletteB64 = cp?.length ? paletteToBase64(cp as string[]) : undefined;
          const addVariationSource = sourceVariationId ? "from-variation" as const : "original-brand" as const;
          const meta: VariationMeta | undefined = result._meta
            ? {
                ...result._meta,
                paletteImageDataUrl:
                  paletteB64 ? `data:image/png;base64,${paletteB64}` : result._meta.paletteImageDataUrl,
                addVariationSource,
                sourceVariationId: sourceVariationId ?? undefined,
              }
            : { addVariationSource, sourceVariationId: sourceVariationId ?? undefined };

          const counter = generationCounterRef.current++;
          const variation: Variation = {
            id: `add-variation-${Date.now()}-${counter}`,
            data: { imageUrl: result.imageUrl },
            source: "add-variation",
            createdAt: new Date(),
            meta,
          };

          setProject((prev) => addVariationToProject(prev, eid, variation));
        } else {
          const existingContent = sourceData ?? undefined;

          const result = await generateCardVariation(elementId, {
            brandName: bs.name,
            tagline: bs.tagline,
            description: bs.description,
            keywords: bs.keywords,
            concept: typeof vc === "string" ? vc : undefined,
            existingContent,
          });

          const counter = generationCounterRef.current++;
          const addVariationSource = sourceVariationId ? "from-variation" as const : "original-brand" as const;
          const meta: VariationMeta | undefined = result._meta
            ? {
                ...result._meta,
                addVariationSource,
                sourceVariationId: sourceVariationId ?? undefined,
              }
            : { addVariationSource, sourceVariationId: sourceVariationId ?? undefined };
          const variation: Variation = {
            id: `add-variation-${Date.now()}-${counter}`,
            data: eid === "color-palette"
              ? normalizeAndSortColorPalette(result.data)
              : eid === "visual-concept"
                ? (typeof result.data === "string"
                    ? result.data
                    : (result.data as any)?.visualConcept ?? "")
                : result.data,
            source: "add-variation",
            createdAt: new Date(),
            meta,
          };

          setProject((prev) => addVariationToProject(prev, eid, variation));
        }
      } catch (err) {
        console.error("Add variation error:", err);
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
          const mergeContext = buildMergeContext(p);
          const { patch, _meta: extractMeta } = await performPaletteExtraction(sourceId, sourceImageUrl, mergeContext);
          if (patch) {
            const rawPalette = (patch as Record<string, unknown>).colorPalette;
            const normalized = normalizeAndSortColorPalette(rawPalette);
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
          const mergeContext = buildMergeContext(p);
          const { patch, _meta: visionMergeMeta } = await performVisionTextMerge(
            sourceId,
            targetId,
            sourceImageUrl,
            mergeContext,
          );
          if (patch) {
            const mergeData = extractMergeData(targetEid, patch);
            if (mergeData != null) {
              const variationData =
                targetEid === "color-palette"
                  ? normalizeAndSortColorPalette(mergeData)
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

          let mergeResult: { imageUrl: string; _meta?: VariationMeta };

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
              conceptPhrases: typeof vc === "string" && vc ? [vc] : undefined,
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
          const mergeContext = buildMergeContext(p);
          const { patch, _meta: mergeMeta } = await performMerge(sourceId, targetId, mergeContext);
          if (patch) {
            const mergeData = extractMergeData(targetEid, patch);
            if (mergeData != null) {
              const variationData =
                targetEid === "color-palette"
                  ? normalizeAndSortColorPalette(mergeData)
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
            conceptPhrases: typeof vc === "string" && vc ? [vc] : undefined,
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
          const mergeContext = buildMergeContext(p);
          const { patch, _meta: commentMeta } = await performCommentModify(targetId, comment, mergeContext);
          if (patch) {
            const modifiedData = extractMergeData(targetEid, patch);
            if (modifiedData != null) {
              const counter = generationCounterRef.current++;
              const variation: Variation = {
                id: `comment-${Date.now()}-${counter}`,
                data: targetEid === "color-palette"
                  ? normalizeAndSortColorPalette(modifiedData)
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

  const handleMoveVariationToQueue = useCallback(
    (sourceElementType: string, targetElementType: string, variationId: string) => {
      const sourceEid = sourceElementType as ElementId;
      const targetEid = targetElementType as ElementId;
      if (!IMAGE_ELEMENT_IDS.has(sourceEid) || !IMAGE_ELEMENT_IDS.has(targetEid)) {
        return;
      }
      if (sourceEid === targetEid) {
        return;
      }

      setProject((prev) => {
        const sourceSlot = prev.elements[sourceEid];
        const targetSlot = prev.elements[targetEid];
        const variation = sourceSlot.variations.find((v) => v.id === variationId);
        if (!variation) {
          return prev;
        }

        const sourceRemaining = sourceSlot.variations.filter((v) => v.id !== variationId);
        const wasActive = sourceSlot.activeVariationId === variationId;
        const wasChecked = sourceSlot.checkedVariationId === variationId;

        const nextProject = {
          ...prev,
          selectedSnapshotId: null,
          elements: {
            ...prev.elements,
            [sourceEid]: {
              ...sourceSlot,
              variations: sourceRemaining,
              activeVariationId: wasActive ? sourceRemaining[0]?.id ?? null : sourceSlot.activeVariationId,
              checkedVariationId: wasChecked ? null : sourceSlot.checkedVariationId,
            },
            [targetEid]: {
              ...targetSlot,
              variations: [...targetSlot.variations, variation],
              activeVariationId: targetSlot.activeVariationId ?? variation.id,
            },
          },
        };
        return nextProject;
      });
    },
    [setProject],
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

      uploadingVariationIdsRef?.current.add(varId);
      setUploadingVariationIds((prev) => new Set(prev).add(varId));

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
        } catch (err) {
          console.error("Image upload failed:", err);
          toast.error("图片上传失败，请重试");
          setProject((prev) => {
            const slot = prev.elements[eid];
            return {
              ...prev,
              elements: {
                ...prev.elements,
                [eid]: {
                  ...slot,
                  variations: slot.variations.filter((v) => v.id !== varId),
                },
              },
            };
          });
        } finally {
          URL.revokeObjectURL(blobUrl);
          uploadingVariationIdsRef?.current.delete(varId);
          setUploadingVariationIds((prev) => {
            const n = new Set(prev);
            n.delete(varId);
            return n;
          });
        }
      };
      reader.readAsDataURL(file);
    },
    [generationCounterRef, setProject, uploadingVariationIdsRef],
  );

  return {
    isBrandGenerating,
    setIsBrandGenerating,
    isAutoCompleting,
    generatedBriefFields,
    setGeneratedBriefFields,
    loadingElements,
    setLoadingElements,
    mergingElementIds,
    setMergingElementIds,
    pipelineStage: displayPhase,
    setPipelineStage: setDisplayPhase,
    handleBrandSummarySubmit,
    handleSuggestionClick,
    handleAutoComplete,
    handleFieldAutoFill,
    autoFillingFieldKey,
    handleAddVariation,
    handleMerge,
    handleMoveVariationToQueue,
    handleCommentModify,
    handleUploadVariation,
    uploadingVariationIds,
  };
}

// Construct a minimal brand context shape for the merge/comment API call
function buildMergeContext(p: ProjectData): MergeBrandContext {
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
    application: getActiveElementData(p.elements, "application"),
  };
}

function extractMergeData(elementId: ElementId, patch: Partial<MergeBrandContext>): unknown {
  const map: Record<ElementId, keyof MergeBrandContext> = {
    "visual-concept": "visualConcept",
    "art-style": "artStyle",
    "color-palette": "colorPalette",
    "font": "font",
    "logo": "logoInspiration",
    "application": "application",
  };
  return patch[map[elementId]] ?? null;
}
