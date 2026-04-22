import { useState, useCallback, useRef, type MutableRefObject } from "react";
import type { ProjectData, ElementId, Variation, VariationMeta } from "../types/project";
import { IMAGE_ELEMENT_IDS, getActiveElementData, getVariationDataById } from "../types/project";
import { generateCardVariation, generateVisualConcept, uploadImage } from "../utils/generate-brand";
import { generateBrandImage, designPaletteAndFonts, designLogoAndStyle } from "../utils/generate-image";
import type { ImageCardType } from "../utils/generate-image";
import type { DebugInterceptor } from "./usePipelineDebugger";
import { toast } from "sonner";
import { normalizeAndSortColorPalette } from "../utils/helpers";
import {
  addVariationToProject,
  createVariation,
  buildFullBrandContext,
  buildBriefOnlyContext,
} from "../utils/variation-helpers";
import { debugAgentForGenerateImage, withDebugLog } from "../utils/debug-interceptor-utils";
import { usePipeline } from "./usePipeline";
import type { UsePipelineReturn } from "./usePipeline";
import { useBriefCompletion } from "./useBriefCompletion";
import type { UseBriefCompletionReturn } from "./useBriefCompletion";
import { useMergeGeneration } from "./useMergeGeneration";
import type { UseMergeGenerationReturn } from "./useMergeGeneration";
import { performPaletteExtraction } from "../utils/generate-image";

export interface UseBrandGenerationParams {
  project: ProjectData;
  setProject: React.Dispatch<React.SetStateAction<ProjectData>>;
  projectRef: MutableRefObject<ProjectData>;
  generationCounterRef: MutableRefObject<number>;
  uploadingVariationIdsRef?: MutableRefObject<Set<string>>;
  debugInterceptor?: DebugInterceptor;
}

export function useBrandGeneration({
  project,
  setProject,
  projectRef,
  generationCounterRef,
  uploadingVariationIdsRef,
  debugInterceptor,
}: UseBrandGenerationParams): UsePipelineReturn & UseBriefCompletionReturn & UseMergeGenerationReturn & {
  loadingElements: Set<string>;
  setLoadingElements: React.Dispatch<React.SetStateAction<Set<string>>>;
  handleAddVariation: (elementId: string | null, sourceVariationId?: string | null) => Promise<void>;
  handleAddConceptWithPipeline: () => Promise<void>;
  handleMoveVariationToQueue: (sourceElementType: string, targetElementType: string, variationId: string) => void;
  handleUploadVariation: (elementId: string, file: File) => void;
  handleExtractPaletteFromImage: (file: File) => void;
  uploadingVariationIds: Set<string>;
} {
  const baseParams = { projectRef, setProject, generationCounterRef, debugInterceptor };

  const [loadingElements, setLoadingElements] = useState<Set<string>>(new Set());
  const [uploadingVariationIds, setUploadingVariationIds] = useState<Set<string>>(new Set());
  const addVariationInFlightRef = useRef<Set<string>>(new Set());

  const pipeline = usePipeline(baseParams);
  const brief = useBriefCompletion({ ...baseParams, onRunPipeline: pipeline.runVisualGeneration });
  const merge = useMergeGeneration(baseParams);

  const handleAddConceptWithPipeline = useCallback(async () => {
    if (pipeline.pipelineStage) return;
    const currentProject = projectRef.current;
    const currentBrief = currentProject.brandBrief.current;
    await pipeline.runVisualGeneration({
      brandName: currentBrief.name ?? "",
      tagline: currentBrief.tagline ?? "",
      description: currentBrief.description ?? "",
      targetAudience: currentBrief.targetAudience ?? "",
      keywords: currentBrief.keywords ?? [],
      applications: currentBrief.applications ?? [],
    });
  }, [projectRef, pipeline]);

  // ── handleAddVariation ────────────────────────────────────────────────────

  const handleAddVariation = useCallback(
    async (elementId: string | null, sourceVariationId?: string | null) => {
      if (!elementId) return;
      if (addVariationInFlightRef.current.has(elementId)) return;
      addVariationInFlightRef.current.add(elementId);
      const eid = elementId as ElementId;
      setLoadingElements((prev) => new Set([...prev, elementId]));

      try {
        const p = projectRef.current;
        const brief = p.brandBrief.current;
        const vc = getActiveElementData(p.elements, "visual-concept");
        const activeConceptVarId = eid !== "visual-concept" ? p.elements["visual-concept"].activeVariationId ?? undefined : undefined;
        const sourceData = sourceVariationId ? getVariationDataById(p.elements, eid, sourceVariationId) : null;
        const addVariationSource = sourceVariationId ? "from-variation" as const : "original-brand" as const;

        let data: unknown;
        let resultMeta: VariationMeta | undefined;

        const vcObj = vc && typeof vc === "object" && "concept" in vc
          ? vc as { concept: string; description: string }
          : null;

        if (IMAGE_ELEMENT_IDS.has(eid)) {
          if ((eid === "art-style" || eid === "logo") && !sourceVariationId) {
            if (vcObj) {
              // Active visual concept exists — skip pipeline, redraw directly from current context
              const activePalette = getActiveElementData(p.elements, "color-palette") as string[] | null;
              const activeFont = getActiveElementData(p.elements, "font") as { titleFont: string; bodyFont: string } | null;

              const styleRequest = {
                brandName: brief.name,
                tagline: brief.tagline,
                description: brief.description,
                targetAudience: brief.targetAudience,
                keywords: brief.keywords,
                visualConcept: vcObj,
                colorPalette: activePalette ?? undefined,
                font: activeFont ?? undefined,
              };
              const styleResult = await withDebugLog(
                debugInterceptor,
                {
                  label: `Add Variation: ${eid} (concept active, 1/1)`,
                  agent: "art-director",
                  endpoint: "art-director/design-logo-style",
                  request: styleRequest as Record<string, unknown>,
                },
                () => designLogoAndStyle(styleRequest),
              );

              let finalImageUrl: string | null = null;
              let finalMeta: VariationMeta | undefined;
              if (eid === "logo") {
                finalImageUrl = styleResult.logoImageUrl ?? null;
                finalMeta = styleResult._meta
                  ? { ...styleResult._meta, model: styleResult.logoModel ?? styleResult._meta.model }
                  : styleResult.logoModel
                    ? { model: styleResult.logoModel }
                    : undefined;
              } else {
                finalImageUrl = styleResult.artStyleImageUrl ?? null;
                finalMeta = styleResult._meta
                  ? { ...styleResult._meta, model: styleResult.artStyleModel ?? styleResult._meta.model }
                  : styleResult.artStyleModel
                    ? { model: styleResult.artStyleModel }
                    : undefined;
              }
              if (!finalImageUrl) {
                throw new Error(`No ${eid} image generated`);
              }
              data = { imageUrl: finalImageUrl };
              resultMeta = finalMeta;
            } else {
              // No active visual concept — run full 3-stage pipeline
              const totalStages = "3";
              const vcRequest = {
                brandName: brief.name,
                tagline: brief.tagline,
                description: brief.description,
                targetAudience: brief.targetAudience,
                keywords: brief.keywords,
              };
              const vcResult = await withDebugLog(
                debugInterceptor,
                {
                  label: `Pipeline Add Variation: ${eid} (stage 1/${totalStages})`,
                  agent: "brand-strategist",
                  endpoint: "strategist/generate-visual-concept",
                  request: vcRequest as Record<string, unknown>,
                },
                () => generateVisualConcept(vcRequest),
              );

              const pfRequest = {
                ...vcRequest,
                visualConcept: vcResult.visualConcept,
              };
              const pfResult = await withDebugLog(
                debugInterceptor,
                {
                  label: `Pipeline Add Variation: ${eid} (stage 2/${totalStages})`,
                  agent: "art-director",
                  endpoint: "art-director/design-palette-fonts",
                  request: pfRequest as Record<string, unknown>,
                },
                () => designPaletteAndFonts(pfRequest),
              );

              const styleRequest = {
                ...pfRequest,
                colorPalette: pfResult.colorPalette,
                font: pfResult.font,
              };
              const styleResult = await withDebugLog(
                debugInterceptor,
                {
                  label: `Pipeline Add Variation: ${eid} (stage 3/${totalStages})`,
                  agent: "art-director",
                  endpoint: "art-director/design-logo-style",
                  request: styleRequest as Record<string, unknown>,
                },
                () => designLogoAndStyle(styleRequest),
              );

              let finalImageUrl: string | null = null;
              let finalMeta: VariationMeta | undefined;
              if (eid === "logo") {
                finalImageUrl = styleResult.logoImageUrl ?? null;
                finalMeta = styleResult._meta
                  ? { ...styleResult._meta, model: styleResult.logoModel ?? styleResult._meta.model }
                  : styleResult.logoModel
                    ? { model: styleResult.logoModel }
                    : undefined;
              } else {
                finalImageUrl = styleResult.artStyleImageUrl ?? null;
                finalMeta = styleResult._meta
                  ? { ...styleResult._meta, model: styleResult.artStyleModel ?? styleResult._meta.model }
                  : styleResult.artStyleModel
                    ? { model: styleResult.artStyleModel }
                    : undefined;
              }
              if (!finalImageUrl) {
                throw new Error(`No ${eid} image generated in pipeline add variation`);
              }
              data = { imageUrl: finalImageUrl };
              resultMeta = {
                ...finalMeta,
                pipelineSeed: {
                  visualConcept: vcResult.visualConcept,
                  colorPalette: pfResult.colorPalette,
                  font: pfResult.font,
                  application: brief.applications?.[0] ?? "brand application",
                },
              };
            }
          } else {
          const imgCtx = {
            brandContextShort: buildBriefOnlyContext(p),
            sourceImageUrl: (sourceData as { imageUrl?: string } | null)?.imageUrl,
          };
          const result = await withDebugLog(
            debugInterceptor,
            {
              label: "Add Variation (image)",
              agent: debugAgentForGenerateImage({ cardType: elementId, ...imgCtx }),
              endpoint: "generate-image",
              request: imgCtx as Record<string, unknown>,
            },
            () => generateBrandImage(elementId as ImageCardType, imgCtx),
          );
          data = { imageUrl: result.imageUrl };
          resultMeta = result._meta;
          }
        } else {
          const usedFontNames: string[] = [];
          if (eid === "font") {
            for (const v of p.elements["font"].variations) {
              const d = v.data as { titleFont?: string; bodyFont?: string };
              if (d.titleFont) usedFontNames.push(d.titleFont);
              if (d.bodyFont) usedFontNames.push(d.bodyFont);
            }
          }

          const cardCtx = {
            brandName: brief.name,
            tagline: brief.tagline,
            description: brief.description,
            targetAudience: brief.targetAudience,
            keywords: brief.keywords,
            visualConcept: eid !== "visual-concept" ? (vcObj ?? undefined) : undefined,
            existingContent: sourceData ?? undefined,
            excludedFonts: usedFontNames.length > 0 ? [...new Set(usedFontNames)] : undefined,
          };
          const textVariationAgent =
            elementId === "color-palette" || elementId === "font" ? "art-director" : "brand-strategist";
          const result = await withDebugLog(
            debugInterceptor,
            {
              label: "Add Variation (text)",
              agent: textVariationAgent,
              endpoint: "generate-card-variation",
              request: { cardType: elementId, brandBrief: cardCtx },
            },
            () => generateCardVariation(elementId, cardCtx),
          );
          resultMeta = result._meta;
          data = eid === "color-palette"
            ? normalizeAndSortColorPalette(result.data)
            : eid === "visual-concept"
              ? ((result.data as any)?.visualConcept ?? result.data)
              : result.data;
        }

        const meta: VariationMeta = { ...resultMeta, addVariationSource, sourceVariationId: sourceVariationId ?? undefined, sourceConceptVariationId: activeConceptVarId };
        const variation = createVariation({ prefix: "add-variation", data, source: "add-variation", meta, counterRef: generationCounterRef });
        setProject((prev) => addVariationToProject(prev, eid, variation));
      } catch (err) {
        console.error("Add variation error:", err);
      } finally {
        addVariationInFlightRef.current.delete(elementId);
        setLoadingElements((prev) => { const n = new Set(prev); n.delete(elementId); return n; });
      }
    },
    [projectRef, generationCounterRef, setProject, debugInterceptor],
  );

  // ── handleMoveVariationToQueue ────────────────────────────────────────────

  const handleMoveVariationToQueue = useCallback(
    (sourceElementType: string, targetElementType: string, variationId: string) => {
      const sourceEid = sourceElementType as ElementId;
      const targetEid = targetElementType as ElementId;
      if (!IMAGE_ELEMENT_IDS.has(sourceEid) || !IMAGE_ELEMENT_IDS.has(targetEid) || sourceEid === targetEid) return;
      setProject((prev) => {
        const sourceSlot = prev.elements[sourceEid];
        const targetSlot = prev.elements[targetEid];
        const variation = sourceSlot.variations.find((v) => v.id === variationId);
        if (!variation) return prev;
        const sourceRemaining = sourceSlot.variations.filter((v) => v.id !== variationId);
        return {
          ...prev,
          selectedSnapshotId: null,
          elements: {
            ...prev.elements,
            [sourceEid]: {
              ...sourceSlot,
              variations: sourceRemaining,
              activeVariationId: sourceSlot.activeVariationId === variationId ? sourceRemaining[0]?.id ?? null : sourceSlot.activeVariationId,
              checkedVariationId: sourceSlot.checkedVariationId === variationId ? null : sourceSlot.checkedVariationId,
            },
            [targetEid]: {
              ...targetSlot,
              variations: [variation, ...targetSlot.variations],
              activeVariationId: targetSlot.activeVariationId ?? variation.id,
            },
          },
        };
      });
    },
    [setProject],
  );

  // ── handleUploadVariation ─────────────────────────────────────────────────

  const MAX_UPLOAD_SIZE = 5 * 1024 * 1024;

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
      const variation: Variation = { id: varId, data: { imageUrl: blobUrl }, source: "user-upload", createdAt: new Date(), meta: { source: "user-upload" } };

      setProject((prev) => addVariationToProject(prev, eid, variation));
      uploadingVariationIdsRef?.current.add(varId);
      setUploadingVariationIds((prev) => new Set(prev).add(varId));

      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const dataUrl = reader.result as string;
          const { imageUrl: signedUrl } = await uploadImage(dataUrl.split(",")[1], file.type, elementId);
          setProject((prev) => {
            const slot = prev.elements[eid];
            return { ...prev, elements: { ...prev.elements, [eid]: { ...slot, variations: slot.variations.map((v) => v.id === varId ? { ...v, data: { imageUrl: signedUrl } } : v) } } };
          });
        } catch (err) {
          console.error("Image upload failed:", err);
          toast.error("图片上传失败，请重试");
          setProject((prev) => {
            const slot = prev.elements[eid];
            return { ...prev, elements: { ...prev.elements, [eid]: { ...slot, variations: slot.variations.filter((v) => v.id !== varId) } } };
          });
        } finally {
          URL.revokeObjectURL(blobUrl);
          uploadingVariationIdsRef?.current.delete(varId);
          setUploadingVariationIds((prev) => { const n = new Set(prev); n.delete(varId); return n; });
        }
      };
      reader.readAsDataURL(file);
    },
    [generationCounterRef, setProject, uploadingVariationIdsRef],
  );

  // ── handleExtractPaletteFromImage ────────────────────────────────────────

  const handleExtractPaletteFromImage = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) return;
      if (file.size > MAX_UPLOAD_SIZE) {
        toast.error("图片太大，最大支持 5MB");
        return;
      }

      setLoadingElements((prev) => new Set([...prev, "color-palette"]));

      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const dataUrl = reader.result as string;
          const { imageUrl: signedUrl } = await uploadImage(dataUrl.split(",")[1], file.type, "color-palette");
          const mergeContext = buildFullBrandContext(projectRef.current);
          // Use "logo" as the source key — it has requiresSourceImage=true and works for generic image uploads.
          const { patch, _meta } = await performPaletteExtraction("logo", signedUrl, mergeContext);
          if (patch) {
            const normalized = normalizeAndSortColorPalette((patch as Record<string, unknown>).colorPalette);
            if (normalized != null) {
              const variation = createVariation({ prefix: "upload-palette", data: normalized, source: "add-variation", meta: _meta, counterRef: generationCounterRef });
              setProject((prev) => addVariationToProject(prev, "color-palette", variation));
            }
          } else {
            toast.error("未能从图片中提取到色板，请重试");
          }
        } catch (err) {
          console.error("Palette extraction from image failed:", err);
          toast.error("无法从图片提取色板，请重试");
        } finally {
          setLoadingElements((prev) => { const n = new Set(prev); n.delete("color-palette"); return n; });
        }
      };
      reader.readAsDataURL(file);
    },
    [projectRef, generationCounterRef, setProject, setLoadingElements],
  );

  // ── Composed return ───────────────────────────────────────────────────────

  return {
    ...brief,
    ...pipeline,
    ...merge,
    loadingElements,
    setLoadingElements,
    handleAddVariation,
    handleAddConceptWithPipeline,
    handleMoveVariationToQueue,
    handleUploadVariation,
    handleExtractPaletteFromImage,
    uploadingVariationIds,
  };
}
