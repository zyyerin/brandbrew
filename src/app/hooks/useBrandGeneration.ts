import { useState, useCallback, useRef, type MutableRefObject } from "react";
import type { ProjectData, ElementId, Variation, VariationMeta } from "../types/project";
import { IMAGE_ELEMENT_IDS, getActiveElementData } from "../types/project";
import { generateCardVariation, generateVisualConcept, uploadImage } from "../utils/generate-brand";
import { generateBrandImage, designPaletteAndFonts, performImg2Txt } from "../utils/generate-image";
import type { ImageCardType } from "../utils/generate-image";
import { collectExcludedLogoCompositions, type LogoComposition } from "@server-shared/logo-prompts.ts";
import { omitTaglineForLogo } from "@server-shared/brand-context.ts";
import type { DebugInterceptor } from "./usePipelineDebugger";
import { toast } from "sonner";
import { getUserFacingApiErrorMessage } from "../utils/apiClient";
import { normalizeAndSortColorPalette } from "../utils/helpers";
import {
  addVariationToProject,
  createVariation,
  buildFullBrandContext,
} from "../utils/variation-helpers";
import { debugAgentForGenerateImage, withDebugLog } from "../utils/debug-interceptor-utils";
import { usePipeline } from "./usePipeline";
import type { UsePipelineReturn } from "./usePipeline";
import { useBriefCompletion } from "./useBriefCompletion";
import type { UseBriefCompletionReturn } from "./useBriefCompletion";
import { useMergeGeneration } from "./useMergeGeneration";
import type { UseMergeGenerationReturn } from "./useMergeGeneration";

const MAX_UPLOAD_SIZE = 5 * 1024 * 1024;
const SUPPORTED_UPLOAD_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function normalizeUploadMimeType(mimeType: string): string {
  const normalized = mimeType.split(";")[0].trim().toLowerCase();
  return normalized === "image/jpg" ? "image/jpeg" : normalized;
}

function validateImageUpload(file: File): { mimeType: string; error?: string } {
  const mimeType = normalizeUploadMimeType(file.type);
  if (!SUPPORTED_UPLOAD_MIME_TYPES.has(mimeType)) {
    return { mimeType, error: "Only JPG, PNG, or WebP images are supported." };
  }
  if (file.size > MAX_UPLOAD_SIZE) {
    return { mimeType, error: "Image is too large. Maximum size is 5 MB." };
  }
  return { mimeType };
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the image file."));
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Could not read the image file."));
        return;
      }
      const commaIndex = reader.result.indexOf(",");
      if (commaIndex < 0 || commaIndex === reader.result.length - 1) {
        reject(new Error("The image data is invalid."));
        return;
      }
      resolve(reader.result.slice(commaIndex + 1));
    };
    reader.readAsDataURL(file);
  });
}

function imageActionErrorMessage(err: unknown, action: "upload" | "palette"): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/timed out/i.test(message)) {
    return action === "upload"
      ? "Image upload timed out. Please try again."
      : "Palette extraction timed out. Please try again.";
  }
  if (/network error|failed to fetch|networkerror/i.test(message)) {
    return "Network connection failed. Check your connection and try again.";
  }
  return action === "upload"
    ? "Image upload failed. Please try again."
    : "Could not extract a color palette from this image. Please try again.";
}

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
  handleAddVariation: (elementId: string) => Promise<void>;
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
    async (elementId: string) => {
      if (addVariationInFlightRef.current.has(elementId)) return;
      addVariationInFlightRef.current.add(elementId);
      const eid = elementId as ElementId;
      setLoadingElements((prev) => new Set([...prev, elementId]));

      try {
        const p = projectRef.current;
        const brief = p.brandBrief.current;
        const vc = getActiveElementData(p.elements, "visual-concept");
        const activeConceptVarId = eid !== "visual-concept" ? p.elements["visual-concept"].activeVariationId ?? undefined : undefined;

        let data: unknown;
        let resultMeta: VariationMeta | undefined;

        const vcObj = vc && typeof vc === "object" && "concept" in vc
          ? vc as { concept: string; description: string }
          : null;

        if (IMAGE_ELEMENT_IDS.has(eid)) {
          const activePalette = getActiveElementData(p.elements, "color-palette") as string[] | null;
          const activeFont = getActiveElementData(p.elements, "font") as { titleFont: string; bodyFont: string } | null;

          let visualConcept = vcObj ?? undefined;
          let colorPalette = activePalette ?? undefined;
          let font = activeFont ?? undefined;
          let logoComposition: LogoComposition | undefined;
          let pipelineSeed: VariationMeta["pipelineSeed"] | undefined;
          const pipelineStageCount = "3";

          const existingCompositions = collectExcludedLogoCompositions(
            p.elements.logo.variations,
          );
          const excludedCompositions = existingCompositions.length > 0
            ? existingCompositions
            : undefined;

          if (!visualConcept) {
            // No active visual concept — derive the missing strategic seed first,
            // then generate only the requested image target.
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
                label: `Pipeline Add Variation: ${eid} (stage 1/${pipelineStageCount})`,
                agent: "brand-strategist",
                endpoint: "strategist/generate-visual-concept",
                request: vcRequest as Record<string, unknown>,
              },
              () => generateVisualConcept(vcRequest),
            );

            const pfRequest = {
              ...vcRequest,
              visualConcept: vcResult.visualConcept,
              ...(excludedCompositions ? { excludedCompositions } : {}),
            };
            const pfResult = await withDebugLog(
              debugInterceptor,
              {
                label: `Pipeline Add Variation: ${eid} (stage 2/${pipelineStageCount})`,
                agent: "art-director",
                endpoint: "art-director/design-palette-fonts",
                request: pfRequest as Record<string, unknown>,
              },
              () => designPaletteAndFonts(pfRequest),
            );

            visualConcept = vcResult.visualConcept;
            colorPalette = pfResult.colorPalette;
            font = pfResult.font;
            logoComposition = pfResult.logoComposition;
            pipelineSeed = {
              visualConcept: vcResult.visualConcept,
              colorPalette: pfResult.colorPalette,
              font: pfResult.font,
              logoComposition: pfResult.logoComposition,
              application: brief.applications?.[0] ?? "brand application",
            };
          } else if (eid === "logo") {
            // Visual concept already exists on the board, but a logo needs an
            // explicit icon+wordmark composition decision — without it the
            // image prompt falls back to a text-free, icon-only mark.
            const pfRequest = {
              brandName: brief.name,
              tagline: brief.tagline,
              description: brief.description,
              targetAudience: brief.targetAudience,
              keywords: brief.keywords,
              visualConcept,
              ...(excludedCompositions ? { excludedCompositions } : {}),
            };
            const pfResult = await withDebugLog(
              debugInterceptor,
              {
                label: "Add Variation: logo (composition)",
                agent: "art-director",
                endpoint: "art-director/design-palette-fonts",
                request: pfRequest as Record<string, unknown>,
              },
              () => designPaletteAndFonts(pfRequest),
            );
            logoComposition = pfResult.logoComposition;
          }

          const brandContextShort = {
            name: brief.name || undefined,
            tagline: brief.tagline || undefined,
            keywords: brief.keywords,
            visualConcept,
            colorPalette,
            application: brief.applications?.[0],
          };
          const imageCtx = omitTaglineForLogo(eid, {
            brandContext: {
              name: brief.name || undefined,
              tagline: brief.tagline || undefined,
              description: brief.description || undefined,
              targetAudience: brief.targetAudience || undefined,
              keywords: brief.keywords,
              visualConcept,
              colorPalette,
              font,
              application: brief.applications?.[0],
            },
            brandContextShort,
            ...(eid === "logo" && logoComposition ? { logoComposition } : {}),
          });
          const result = await withDebugLog(
            debugInterceptor,
            {
              label: pipelineSeed
                ? `Pipeline Add Variation: ${eid} (stage 3/${pipelineStageCount})`
                : `Add Variation: ${eid} (concept active, 1/1)`,
              agent: debugAgentForGenerateImage({ cardType: elementId, ...imageCtx }),
              endpoint: "generate-image",
              request: imageCtx as Record<string, unknown>,
            },
            () => generateBrandImage(elementId as ImageCardType, imageCtx),
          );

          data = { imageUrl: result.imageUrl };
          resultMeta = pipelineSeed
            ? {
                ...(result._meta ?? {}),
                pipelineSeed,
              }
            : result._meta;
          if (eid === "logo" && logoComposition) {
            resultMeta = { ...(resultMeta ?? {}), logoComposition };
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

        const meta: VariationMeta = { ...resultMeta, addVariationSource: "original-brand", sourceConceptVariationId: activeConceptVarId };
        const variation = createVariation({ prefix: "add-variation", data, source: "add-variation", meta, counterRef: generationCounterRef });
        setProject((prev) => addVariationToProject(prev, eid, variation));
      } catch (err) {
        console.error("Add variation error:", err);
        toast.error(getUserFacingApiErrorMessage(err));
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

  const handleUploadVariation = useCallback(
    (elementId: string, file: File) => {
      const eid = elementId as ElementId;
      if (!IMAGE_ELEMENT_IDS.has(eid)) return;
      const validation = validateImageUpload(file);
      if (validation.error) {
        toast.error(validation.error);
        return;
      }

      const blobUrl = URL.createObjectURL(file);
      const counter = generationCounterRef.current++;
      const varId = `upload-${Date.now()}-${counter}`;
      const variation: Variation = { id: varId, data: { imageUrl: blobUrl }, source: "user-upload", createdAt: new Date(), meta: { source: "user-upload" } };

      setProject((prev) => addVariationToProject(prev, eid, variation));
      uploadingVariationIdsRef?.current.add(varId);
      setUploadingVariationIds((prev) => new Set(prev).add(varId));

      void (async () => {
        try {
          const base64 = await readFileAsBase64(file);
          const { imageUrl: signedUrl } = await uploadImage(base64, validation.mimeType, elementId);
          setProject((prev) => {
            const slot = prev.elements[eid];
            return { ...prev, elements: { ...prev.elements, [eid]: { ...slot, variations: slot.variations.map((v) => v.id === varId ? { ...v, data: { imageUrl: signedUrl } } : v) } } };
          });
          toast.success("Image uploaded successfully.");
        } catch (err) {
          console.error("Image upload failed:", err);
          toast.error(imageActionErrorMessage(err, "upload"));
          setProject((prev) => {
            const slot = prev.elements[eid];
            return { ...prev, elements: { ...prev.elements, [eid]: { ...slot, variations: slot.variations.filter((v) => v.id !== varId) } } };
          });
        } finally {
          URL.revokeObjectURL(blobUrl);
          uploadingVariationIdsRef?.current.delete(varId);
          setUploadingVariationIds((prev) => { const n = new Set(prev); n.delete(varId); return n; });
        }
      })();
    },
    [generationCounterRef, setProject, uploadingVariationIdsRef],
  );

  // ── handleExtractPaletteFromImage ────────────────────────────────────────

  const handleExtractPaletteFromImage = useCallback(
    (file: File) => {
      const validation = validateImageUpload(file);
      if (validation.error) {
        toast.error(validation.error);
        return;
      }

      setLoadingElements((prev) => new Set([...prev, "color-palette"]));

      void (async () => {
        try {
          const base64 = await readFileAsBase64(file);
          const { imageUrl: signedUrl } = await uploadImage(base64, validation.mimeType, "color-palette");
          const mergeContext = buildFullBrandContext(projectRef.current);
          const { patch, _meta } = await performImg2Txt("logo", "color-palette", signedUrl, mergeContext, { throwOnError: true });
          const normalized = normalizeAndSortColorPalette(
            patch ? (patch as Record<string, unknown>).colorPalette : null,
          );
          if (normalized == null) {
            throw new Error("Palette extraction returned no valid colors");
          }
          const variation = createVariation({ prefix: "upload-palette", data: normalized, source: "add-variation", meta: _meta, counterRef: generationCounterRef });
          setProject((prev) => addVariationToProject(prev, "color-palette", variation));
          toast.success("Color palette extracted from image.");
        } catch (err) {
          console.error("Palette extraction from image failed:", err);
          toast.error(imageActionErrorMessage(err, "palette"));
        } finally {
          setLoadingElements((prev) => { const n = new Set(prev); n.delete("color-palette"); return n; });
        }
      })();
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
