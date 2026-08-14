import { useState, useCallback } from "react";
import { toast } from "sonner";
import type { ProjectData, ElementId, Variation, VariationMeta, PipelineStage, VisualConceptData, ColorPaletteData, FontData } from "../types/project";
import { generateVisualConcept } from "../utils/generate-brand";
import { designPaletteAndFonts, designLogo, designArtStyle } from "../utils/generate-image";
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

/**
 * Runs tasks concurrently, or one after another when `sequential` is set. The
 * debug panel gates a single paused stage at a time, so stepping through the
 * pipeline has to serialize stages that would otherwise overlap.
 */
async function allSettledMaybeSequential(
  tasks: (() => Promise<void>)[],
  sequential: boolean,
): Promise<PromiseSettledResult<void>[]> {
  if (!sequential) return await Promise.allSettled(tasks.map((run) => run()));
  const results: PromiseSettledResult<void>[] = [];
  for (const run of tasks) {
    results.push(...(await Promise.allSettled([run()])));
  }
  return results;
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

      // Auto-select the generated visual set only once every snapshot-required
      // element exists, preventing noodles from mixing old and new cards. The
      // drawing stage calls this per image, so whichever arrives last commits
      // the selection.
      const requiredSelectionIds: ElementId[] = ["color-palette", "font", "logo", "art-style"];
      const selectGeneratedSetWhenComplete = (project: ProjectData): ProjectData => {
        const isComplete = requiredSelectionIds.every((eid) =>
          project.elements[eid].variations.some((v) => v.id === `${eid}-${genTs}`),
        );
        if (!isComplete) return project;

        const nextElements = { ...project.elements };
        for (const eid of requiredSelectionIds) {
          const varId = `${eid}-${genTs}`;
          (nextElements as Record<string, unknown>)[eid] = {
            ...nextElements[eid],
            activeVariationId: varId,
            checkedVariationId: varId,
          };
        }
        return { ...project, elements: nextElements };
      };

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

        // Step 2: Art Director → Logo + Art Style, as two independent requests
        // so the logo (fast) is not held back by the art style (slow).
        setDisplayPhase("drawing");
        const lsRequest = {
          ...designCtx,
          colorPalette: pfResult.colorPalette,
          font: pfResult.font,
          logoComposition: pfResult.logoComposition,
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
        const commitDrawnCard = (
          elementId: "logo" | "art-style",
          imageUrl: string,
          meta: VariationMeta,
        ) => {
          setProject((prev) =>
            selectGeneratedSetWhenComplete(
              addVariationToProject(prev, elementId, makeVar(elementId, { imageUrl }, meta), false),
            ),
          );
        };

        const runLogoTask = () => withPipelineStage(
          debugInterceptor,
          {
            id: `stage-${genTs}-2`,
            stage: "drawing",
            agent: "art-director",
            endpoint: "art-director/design-logo",
            request: lsRequest,
          },
          async (finalReq) => {
            const result = await designLogo(finalReq as typeof lsRequest, { signal });
            if (!result.logoImageUrl) throw new Error("Drawing stage did not return a logo");
            return result;
          },
        ).then((result) => {
          throwIfAborted();
          const model = result.logoModel ?? result._meta?.model;
          commitDrawnCard("logo", result.logoImageUrl!, {
            ...(result._meta ?? {}),
            ...(model ? { model } : {}),
            sourceConceptVariationId: vcVariationId,
            logoComposition: result.logoComposition ?? pfResult.logoComposition,
          });
        });

        const runArtStyleTask = () => withPipelineStage(
          debugInterceptor,
          {
            id: `stage-${genTs}-3`,
            stage: "drawing",
            agent: "art-director",
            endpoint: "art-director/design-art-style",
            request: lsRequest,
          },
          async (finalReq) => {
            const result = await designArtStyle(finalReq as typeof lsRequest, { signal });
            if (!result.artStyleImageUrl) throw new Error("Drawing stage did not return an art style");
            return result;
          },
        ).then((result) => {
          throwIfAborted();
          const model = result.artStyleModel ?? result._meta?.model;
          commitDrawnCard("art-style", result.artStyleImageUrl!, {
            ...(result._meta ?? {}),
            ...(model ? { model } : {}),
            sourceConceptVariationId: vcVariationId,
          });
        });

        const drawnCards = await allSettledMaybeSequential(
          [runLogoTask, runArtStyleTask],
          Boolean(debugInterceptor?.enabled),
        );
        throwIfAborted();

        const drawingFailures = drawnCards
          .filter((r): r is PromiseRejectedResult => r.status === "rejected")
          .map((r) => r.reason);

        // One image failing no longer discards the other: it is already on the
        // board, and the missing one leaves the set unselected on purpose.
        if (drawingFailures.length === drawnCards.length) throw drawingFailures[0];
        if (drawingFailures.length > 0) {
          console.error("Drawing stage partially failed:", drawingFailures[0]);
          toast.error(getUserFacingApiErrorMessage(drawingFailures[0]));
        }

        setProject((prev) => ({ ...prev, phase: "curating" }));
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
