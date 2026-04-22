import { useState, useCallback } from "react";
import type { ProjectData, ElementId, Variation, VariationMeta, PipelineStage, VisualConceptData, ColorPaletteData, FontData } from "../types/project";
import { generateVisualConcept } from "../utils/generate-brand";
import { designPaletteAndFonts, designLogoAndStyle } from "../utils/generate-image";
import { sortColorPaletteForHarmony } from "../utils/helpers";
import { addVariationToProject } from "../utils/variation-helpers";
import type { UseGenerationBaseParams } from "../utils/variation-helpers";
import { withPipelineStage } from "../utils/debug-interceptor-utils";

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
          );
          next = addVariationToProject(
            next,
            "font",
            makeVar("font", pfResult.font, { ...pfResult._meta, sourceConceptVariationId: vcVariationId }),
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
            ...(designCtx.brandContext ?? {}),
            colorPalette: pfResult.colorPalette,
            font: pfResult.font,
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
          (finalReq) => designLogoAndStyle(finalReq as typeof lsRequest, { signal }),
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
          );
          next = addVariationToProject(
            next,
            "art-style",
            makeVar("art-style", { imageUrl: lsResult.artStyleImageUrl }, artStyleMeta),
          );

          // Auto-check all generated elements (visual-concept excluded — it is not
          // required for snapshot generation and should not pollute the checked set).
          const nextElements = { ...next.elements };
          const snapshotExcluded = new Set<ElementId>(["visual-concept"]);
          for (const eid of Object.keys(nextElements) as ElementId[]) {
            const slot = nextElements[eid];
            if (slot.variations.length > 0 && !snapshotExcluded.has(eid)) {
              (nextElements as Record<string, unknown>)[eid] = { ...slot, checkedVariationId: slot.activeVariationId };
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
