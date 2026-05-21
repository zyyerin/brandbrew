import { useState, useCallback } from "react";
import { toast } from "sonner";
import type { ProjectData, ElementId, Variation, VariationMeta, PipelineStage, VisualConceptData, ColorPaletteData, FontData } from "../types/project";
import { generateVisualConcept } from "../utils/generate-brand";
import { designPaletteAndFonts, designLogoAndStyle } from "../utils/generate-image";
import { sortColorPaletteForHarmony } from "../utils/helpers";
import { addVariationToProject } from "../utils/variation-helpers";
import type { UseGenerationBaseParams } from "../utils/variation-helpers";
import { withPipelineStage } from "../utils/debug-interceptor-utils";
import { getUserFacingApiErrorMessage } from "../utils/apiClient";

// ── Public input type for the pipeline entry point ───────────────────────────
// Distinct from PipelineContext (the art-director's internal accumulated context).

export interface PipelineBriefInput {
  brandName: string;
  tagline: string;
  description: string;
  targetAudience: string;
  keywords: string[];
  applications?: string[];
}

export interface UsePipelineReturn {
  pipelineStage: PipelineStage;
  setPipelineStage: React.Dispatch<React.SetStateAction<PipelineStage>>;
  runVisualGeneration: (briefContext: PipelineBriefInput) => Promise<void>;
}

export function usePipeline({
  projectRef,
  setProject,
  debugInterceptor,
}: UseGenerationBaseParams): UsePipelineReturn {
  const [displayPhase, setDisplayPhase] = useState<PipelineStage>(null);

  const runVisualGeneration = useCallback(
    async (briefContext: PipelineBriefInput) => {
      const throwIfAborted = () => {
        if (debugInterceptor?.isAborted?.()) {
          throw new Error("Pipeline aborted by user");
        }
      };
      debugInterceptor?.resetAbort?.();
      throwIfAborted();
      const signal = debugInterceptor?.getAbortSignal?.();

      const genTs = Date.now();
      const vcVariationId = `visual-concept-${genTs}`;
      const makeVar = (id: string, data: unknown, meta?: VariationMeta): Variation => ({
        id: `${id}-${genTs}`,
        data,
        source: "initial",
        createdAt: new Date(),
        meta,
      });

      try {
        // Step 0: Strategist → Visual Concept
        setDisplayPhase("conceptualizing");
        const existingConcepts = (projectRef.current.elements["visual-concept"]?.variations ?? [])
          .map(v => v.data as VisualConceptData)
          .filter(vc => vc?.concept);

        const vcRequest = {
          brandName: briefContext.brandName,
          tagline: briefContext.tagline,
          description: briefContext.description,
          targetAudience: briefContext.targetAudience,
          keywords: briefContext.keywords,
          existingConcepts: existingConcepts.length > 0 ? existingConcepts : undefined,
          brandContext: {
            brandBrief: {
              core: {
                name: briefContext.brandName,
                tagline: briefContext.tagline,
                keywords: briefContext.keywords,
              },
              detail: {
                description: briefContext.description,
                targetAudience: briefContext.targetAudience,
              },
              ...(briefContext.applications?.length
                ? { applications: briefContext.applications }
                : {}),
            },
          },
        };
        const vcResult = await withPipelineStage(
          debugInterceptor,
          {
            id: `stage-${genTs}-0`,
            stage: "conceptualizing",
            agent: "brand-strategist",
            endpoint: "strategist/generate-visual-concept",
            request: vcRequest,
          },
          (finalReq) => generateVisualConcept(finalReq as typeof vcRequest, { signal }),
        );
        throwIfAborted();

        setProject((prev) =>
          addVariationToProject(
            prev,
            "visual-concept",
            makeVar("visual-concept", vcResult.visualConcept, vcResult._meta),
            true,
          ),
        );

        const designCtx = {
          brandName: briefContext.brandName,
          tagline: briefContext.tagline,
          description: briefContext.description,
          targetAudience: briefContext.targetAudience,
          keywords: briefContext.keywords,
          visualConcept: vcResult.visualConcept,
          brandContext: {
            brandBrief: {
              core: {
                name: briefContext.brandName,
                tagline: briefContext.tagline,
                keywords: briefContext.keywords,
              },
              detail: {
                description: briefContext.description,
                targetAudience: briefContext.targetAudience,
              },
              ...(briefContext.applications?.length
                ? { applications: briefContext.applications }
                : {}),
            },
            visualConcept: vcResult.visualConcept,
          },
        };

        // Step 1: Art Director → Palette + Fonts
        setDisplayPhase("styling");
        const currentElements = projectRef.current.elements;
        const existingPalettes = (currentElements["color-palette"]?.variations ?? [])
          .map(v => v.data as ColorPaletteData)
          .filter(p => Array.isArray(p) && p.length > 0);
        const existingFontNames = (currentElements["font"]?.variations ?? [])
          .flatMap(v => {
            const d = v.data as FontData;
            return [d?.titleFont, d?.bodyFont].filter(Boolean);
          });

        const pfDesignCtx = {
          ...designCtx,
          excludedPalettes: existingPalettes.length > 0 ? existingPalettes : undefined,
          excludedFonts: existingFontNames.length > 0 ? [...new Set(existingFontNames)] : undefined,
        };
        const pfResult = await withPipelineStage(
          debugInterceptor,
          {
            id: `stage-${genTs}-1`,
            stage: "styling",
            agent: "art-director",
            endpoint: "art-director/design-palette-fonts",
            request: pfDesignCtx,
          },
          (finalReq) => designPaletteAndFonts(finalReq as typeof pfDesignCtx, { signal }),
        );
        throwIfAborted();

        setProject((prev) => {
          let next = addVariationToProject(
            prev,
            "color-palette",
            makeVar("color-palette", sortColorPaletteForHarmony(pfResult.colorPalette), { ...pfResult._meta, sourceConceptVariationId: vcVariationId }),
            false,
          );
          next = addVariationToProject(
            next,
            "font",
            makeVar("font", pfResult.font, { ...pfResult._meta, sourceConceptVariationId: vcVariationId }),
            false,
          );
          return next;
        });

        // Step 2: Art Director → Logo + Art Style
        setDisplayPhase("drawing");
        const lsRequest = {
          ...designCtx,
          colorPalette: pfResult.colorPalette,
          font: pfResult.font,
          brandContext: {
            name: briefContext.brandName,
            tagline: briefContext.tagline,
            description: briefContext.description,
            targetAudience: briefContext.targetAudience,
            keywords: briefContext.keywords,
            visualConcept: vcResult.visualConcept,
            colorPalette: pfResult.colorPalette,
            font: pfResult.font,
            application: briefContext.applications?.[0],
          },
          brandContextShort: {
            name: briefContext.brandName,
            tagline: briefContext.tagline,
            keywords: briefContext.keywords,
            visualConcept: vcResult.visualConcept,
            colorPalette: pfResult.colorPalette,
            application: briefContext.applications?.[0],
          },
        };
        const lsResult = await withPipelineStage(
          debugInterceptor,
          {
            id: `stage-${genTs}-2`,
            stage: "drawing",
            agent: "art-director",
            endpoint: "art-director/design-logo-style",
            request: lsRequest,
          },
          async (finalReq) => {
            const result = await designLogoAndStyle(finalReq as typeof lsRequest, { signal });
            const missingTargets = [
              !result.logoImageUrl && "logo",
              !result.artStyleImageUrl && "art-style",
            ].filter(Boolean);

            if (missingTargets.length > 0) {
              const details = result.errors?.length ? `: ${result.errors.join(" | ")}` : "";
              throw new Error(`Drawing stage did not return ${missingTargets.join(" and ")}${details}`);
            }

            return result as typeof result & {
              logoImageUrl: string;
              artStyleImageUrl: string;
            };
          },
        );
        throwIfAborted();

        setProject((prev) => {
          const logoMeta = lsResult._meta
            ? { ...lsResult._meta, model: lsResult.logoModel ?? lsResult._meta.model, sourceConceptVariationId: vcVariationId }
            : lsResult.logoModel
              ? { model: lsResult.logoModel, sourceConceptVariationId: vcVariationId }
              : { sourceConceptVariationId: vcVariationId };
          const artStyleMeta = lsResult._meta
            ? { ...lsResult._meta, model: lsResult.artStyleModel ?? lsResult._meta.model, sourceConceptVariationId: vcVariationId }
            : lsResult.artStyleModel
              ? { model: lsResult.artStyleModel, sourceConceptVariationId: vcVariationId }
              : { sourceConceptVariationId: vcVariationId };
          let next = addVariationToProject(
            prev,
            "logo",
            makeVar("logo", { imageUrl: lsResult.logoImageUrl }, logoMeta),
            false,
          );
          next = addVariationToProject(
            next,
            "art-style",
            makeVar("art-style", { imageUrl: lsResult.artStyleImageUrl }, artStyleMeta),
            false,
          );

          // Auto-select the generated visual set only after all snapshot-required
          // elements exist, preventing noodles from mixing old and new cards.
          const nextElements = { ...next.elements };
          const generatedSelectionIds: Partial<Record<ElementId, string>> = {
            "color-palette": `color-palette-${genTs}`,
            font: `font-${genTs}`,
            logo: `logo-${genTs}`,
            "art-style": `art-style-${genTs}`,
          };
          const requiredSelectionIds: ElementId[] = ["color-palette", "font", "logo", "art-style"];
          const hasFullGeneratedSelection = requiredSelectionIds.every((eid) => {
            const varId = generatedSelectionIds[eid];
            return Boolean(varId && nextElements[eid].variations.some((v) => v.id === varId));
          });

          if (hasFullGeneratedSelection) {
            for (const eid of requiredSelectionIds) {
              const slot = nextElements[eid];
              const varId = generatedSelectionIds[eid]!;
              (nextElements as Record<string, unknown>)[eid] = {
                ...slot,
                activeVariationId: varId,
                checkedVariationId: varId,
              };
            }
          }

          next = { ...next, elements: nextElements, phase: "curating" };
          return next;
        });

        setDisplayPhase("synthesizing");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!message.includes("Pipeline aborted by user") && !message.includes("Request aborted by user")) {
          console.error("Visual generation pipeline failed:", err);
          toast.error(getUserFacingApiErrorMessage(err));
        }
        setProject((prev) => ({ ...prev, phase: "curating" }));
        setDisplayPhase(null);
      }
    },
    [setProject, debugInterceptor],
  );

  return {
    pipelineStage: displayPhase,
    setPipelineStage: setDisplayPhase,
    runVisualGeneration,
  };
}
