import { useState, useCallback, useRef } from "react";
import type { ElementId, Variation, VariationMeta } from "../types/project";
import { IMAGE_ELEMENT_IDS, getActiveElementData, getCheckedElementData } from "../types/project";
import { generateBrandImage, generateMergeImage, commentEditImage, designPaletteAndFonts, designLogo, designArtStyle } from "../utils/generate-image";
import type { ImageCardType } from "../utils/generate-image";
import type { LogoComposition } from "@server-shared/logo-prompts.ts";
import { isMergeSupported, resolveMergeHint, formatSourceForHint } from "@server-shared/merge-specs.tsx";
import {
  performMerge,
  performPaletteExtraction,
  performVisionTextMerge,
  performCommentModify,
} from "../utils/generate-image";
import type { MergeBrandContext } from "../utils/variation-helpers";
import { normalizeAndSortColorPalette, paletteToBase64 } from "../utils/helpers";
import {
  addVariationToProject,
  addVariationIfNew,
  buildMergeFullBrandContext,
  buildMergeShortBrandContext,
  buildBriefOnlyContext,
  buildMergeBoardPromptContext,
  extractMergeData,
  createVariation,
} from "../utils/variation-helpers";
import type { UseGenerationBaseParams } from "../utils/variation-helpers";
import { debugAgentForGenerateImage, withDebugLog } from "../utils/debug-interceptor-utils";

// ── Types ────────────────────────────────────────────────────────────────────

export interface UseMergeGenerationReturn {
  mergingVariationIds: Set<string>;
  setMergingVariationIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  mergingElementTypes: Set<string>;
  handleMerge: (sourceId: string, targetId: string, sourceVarId?: string, targetVarId?: string) => Promise<void>;
  handleCommentModify: (targetId: string, comment: string, targetVarId?: string) => Promise<void>;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useMergeGeneration({
  projectRef,
  setProject,
  generationCounterRef,
  debugInterceptor,
}: UseGenerationBaseParams): UseMergeGenerationReturn {
  const [mergingVariationIds, setMergingVariationIds] = useState<Set<string>>(new Set());
  const [mergingElementTypes, setMergingElementTypes] = useState<Set<string>>(new Set());
  const mergeInFlightRef = useRef<Set<string>>(new Set());
  const commentInFlightRef = useRef<Set<string>>(new Set());

  const handleMerge = useCallback(
    async (sourceId: string, targetId: string, sourceVarId?: string, targetVarId?: string) => {
      if (!isMergeSupported(sourceId, targetId)) return;
      if (mergeInFlightRef.current.has(targetId)) return;
      mergeInFlightRef.current.add(targetId);

      const sourceEid = sourceId as ElementId;
      const targetEid = targetId as ElementId;
      const mergeVarId = targetVarId ?? null;
      if (mergeVarId) {
        setMergingVariationIds((prev) => new Set([...prev, mergeVarId]));
      } else {
        setMergingElementTypes((prev) => new Set([...prev, targetId]));
      }

      const removeMerging = () => {
        if (mergeVarId) {
          setMergingVariationIds((prev) => {
            const n = new Set(prev);
            n.delete(mergeVarId);
            return n;
          });
        } else {
          setMergingElementTypes((prev) => {
            const n = new Set(prev);
            n.delete(targetId);
            return n;
          });
        }
      };

      const getVariationData = (eid: ElementId, varId?: string) => {
        const slot = projectRef.current.elements[eid];
        if (varId) {
          const v = slot.variations.find((v) => v.id === varId);
          if (v) return v.data;
        }
        return getCheckedElementData(projectRef.current.elements, eid);
      };
      const getVariation = (eid: ElementId, varId?: string): Variation | null => {
        const slot = projectRef.current.elements[eid];
        if (varId) return slot.variations.find((v) => v.id === varId) ?? null;
        if (!slot.checkedVariationId) return null;
        return slot.variations.find((v) => v.id === slot.checkedVariationId) ?? null;
      };

      const slotMergeVars = !IMAGE_ELEMENT_IDS.has(sourceEid)
        ? { sourceData: formatSourceForHint(sourceId, getVariationData(sourceEid, sourceVarId)) }
        : undefined;
      const hint = resolveMergeHint("slot", sourceId, targetId, slotMergeVars);

      const ELEMENT_TO_CONTEXT_FIELD: Record<string, keyof MergeBrandContext> = {
        "visual-concept": "visualConcept",
        "color-palette": "colorPalette",
        "font": "font",
        "logo": "logoInspiration",
        "art-style": "artStyle",
      };

      const overrideContextField = (ctx: MergeBrandContext, eid: string, varId?: string) => {
        if (!varId) return;
        const field = ELEMENT_TO_CONTEXT_FIELD[eid];
        if (!field) return;
        const data = getVariationData(eid as ElementId, varId);
        if (data != null) (ctx as Record<string, unknown>)[field] = data;
      };

      const normalizeVisualConcept = (raw: unknown): { concept: string; description: string } | undefined => {
        if (!raw) return undefined;
        if (typeof raw === "object" && "concept" in (raw as object) && "description" in (raw as object)) {
          const concept = (raw as { concept?: unknown }).concept;
          const description = (raw as { description?: unknown }).description;
          if (typeof concept === "string" && typeof description === "string") {
            return { concept, description };
          }
        }
        if (typeof raw === "string" && raw.trim()) {
          return { concept: raw.trim(), description: "" };
        }
        return undefined;
      };

      try {
        const p = projectRef.current;
        const brief = p.brandBrief.current;

        if (IMAGE_ELEMENT_IDS.has(sourceEid) && targetId === "color-palette") {
          const sourceVariation = getVariation(sourceEid, sourceVarId);
          const cachedPalette = !targetVarId && sourceId !== "visual-snapshot"
            ? sourceVariation?.meta?.pipelineSeed?.colorPalette
            : undefined;
          if (cachedPalette?.length) {
            const normalizedPalette = normalizeAndSortColorPalette(cachedPalette);
            if (normalizedPalette == null) return;
            const directMeta = sourceVariation?.meta;
            await withDebugLog(
              debugInterceptor,
              {
                label: `Seed Merge: ${sourceId} -> ${targetId}`,
                agent: "local",
                endpoint: "seed-cache/direct-merge",
                request: {
                  sourceId,
                  targetId,
                  sourceVarId,
                  mode: "pipeline-seed",
                  seededFields: ["colorPalette"],
                },
              },
              async () => ({
                usedSeed: true,
                seededFields: ["colorPalette"],
              }),
            );
            const variation = createVariation({
              prefix: "merge",
              data: normalizedPalette,
              source: "merge",
              meta: directMeta,
              counterRef: generationCounterRef,
            });
            addVariationIfNew(setProject, "color-palette", variation);
            return;
          }
          // image → color-palette: extract palette from source image
          const sourceData = getVariationData(sourceEid, sourceVarId) as { imageUrl: string } | null;
          const sourceImageUrl = sourceData?.imageUrl;
          if (!sourceImageUrl) return;
          const mergeContext = buildMergeFullBrandContext(p);
          // For card-to-card drops, use the specific target card's palette as the
          // current color scheme constraint, not the active variation's palette.
          overrideContextField(mergeContext, targetId, targetVarId);
          const { patch, _meta: extractMeta } = await withDebugLog(
            debugInterceptor,
            { label: `Merge: ${hint}`, agent: "visual-designer", endpoint: "extract-palette", request: { sourceId, sourceImageUrl, brandData: mergeContext } },
            () => performPaletteExtraction(sourceId, sourceImageUrl, mergeContext),
          );
          if (patch) {
            const rawPalette = (patch as Record<string, unknown>).colorPalette;
            const normalized = normalizeAndSortColorPalette(rawPalette);
            if (normalized != null) {
              const variation = createVariation({ prefix: "merge", data: normalized, source: "merge", meta: extractMeta, counterRef: generationCounterRef });
              addVariationIfNew(setProject, "color-palette", variation);
            }
          }
        } else if (IMAGE_ELEMENT_IDS.has(sourceEid) && !IMAGE_ELEMENT_IDS.has(targetEid)) {
          const sourceVariation = getVariation(sourceEid, sourceVarId);
          const cachedSeed = !targetVarId && sourceId !== "visual-snapshot"
            ? sourceVariation?.meta?.pipelineSeed
            : undefined;
          if (cachedSeed) {
            const directData =
              targetEid === "visual-concept" ? cachedSeed.visualConcept :
              targetEid === "font" ? cachedSeed.font :
              targetEid === "color-palette" ? cachedSeed.colorPalette :
              undefined;
            if (directData != null) {
              const normalized = targetEid === "color-palette"
                ? normalizeAndSortColorPalette(directData)
                : directData;
              if (targetEid === "color-palette" && normalized == null) return;
              const directMeta = sourceVariation?.meta;
              const seededField = targetEid === "visual-concept"
                ? "visualConcept"
                : targetEid === "font"
                  ? "font"
                  : "colorPalette";
              await withDebugLog(
                debugInterceptor,
                {
                  label: `Seed Merge: ${sourceId} -> ${targetId}`,
                  agent: "local",
                  endpoint: "seed-cache/direct-merge",
                  request: {
                    sourceId,
                    targetId,
                    sourceVarId,
                    mode: "pipeline-seed",
                    seededFields: [seededField],
                  },
                },
                async () => ({
                  usedSeed: true,
                  seededFields: [seededField],
                }),
              );
              const variation = createVariation({
                prefix: "merge",
                data: normalized,
                source: "merge",
                meta: directMeta,
                counterRef: generationCounterRef,
              });
              addVariationIfNew(setProject, targetEid, variation);
              return;
            }
          }
          // image → text element: vision-text merge
          const sourceData = getVariationData(sourceEid, sourceVarId) as { imageUrl: string } | null;
          const sourceImageUrl = sourceData?.imageUrl;
          if (!sourceImageUrl) return;
          const mergeContext = buildMergeFullBrandContext(p);
          overrideContextField(mergeContext, targetId, targetVarId);
          const { patch, _meta: visionMergeMeta } = await withDebugLog(
            debugInterceptor,
            { label: `Merge: ${hint}`, agent: "visual-designer", endpoint: "visual-designer/vision-merge", request: { sourceId, targetId, sourceImageUrl, brandData: mergeContext } },
            () => performVisionTextMerge(sourceId, targetId, sourceImageUrl, mergeContext),
          );
          if (patch) {
            const mergeData = extractMergeData(targetEid, patch);
            if (mergeData != null) {
              const variationData = targetEid === "color-palette" ? normalizeAndSortColorPalette(mergeData) : mergeData;
              const variation = createVariation({ prefix: "merge", data: variationData, source: "merge", meta: visionMergeMeta, counterRef: generationCounterRef });
              addVariationIfNew(setProject, targetEid, variation);
            }
          }
        } else if (IMAGE_ELEMENT_IDS.has(targetEid)) {
          // * → image element: image generation / img2img
          const isWordmarkMerge = sourceId === "font" && targetId === "logo";
          let mergeResult: { imageUrl: string; _meta?: VariationMeta };
          const sourceVariation = getVariation(sourceEid, sourceVarId);

          if (!targetVarId && !isWordmarkMerge) {
            // Queue-slot drop: visual-concept -> logo/art-style should follow
            // art-director's staged route (palette/font -> style) but only
            // expose the final requested output to the queue.
            if (sourceId === "visual-concept" && (targetId === "art-style" || targetId === "logo")) {
              const sourceData = getVariationData(sourceEid, sourceVarId);
              const visualConcept = normalizeVisualConcept(sourceData);
              if (!visualConcept) return;

              const stage1Req = {
                brandName: brief.name,
                tagline: brief.tagline,
                description: brief.description,
                targetAudience: brief.targetAudience,
                keywords: brief.keywords,
                visualConcept,
              };
              const pfResult = await withDebugLog(
                debugInterceptor,
                {
                  label: `Pipeline Merge: ${sourceId} -> ${targetId} (stage 1/2)`,
                  agent: "art-director",
                  endpoint: "art-director/design-palette-fonts",
                  request: stage1Req as Record<string, unknown>,
                },
                () => designPaletteAndFonts(stage1Req),
              );

              const stage2Req = {
                ...stage1Req,
                colorPalette: pfResult.colorPalette,
                font: pfResult.font,
                logoComposition: pfResult.logoComposition,
              };
              // Only the dropped target is kept, so request that image alone
              // instead of generating both and discarding one.
              const buildStagedMergeResult = (
                imageUrl: string,
                model: string | undefined,
                meta: VariationMeta | undefined,
                logoComposition?: LogoComposition,
              ) => ({
                imageUrl,
                _meta: {
                  ...meta,
                  model,
                  ...(logoComposition ? { logoComposition } : {}),
                  pipelineSeed: {
                    visualConcept,
                    colorPalette: pfResult.colorPalette,
                    font: pfResult.font,
                    ...(logoComposition ? { logoComposition } : {}),
                    application: brief.applications?.[0] ?? "brand application",
                  },
                },
              });
              const stage2Log = {
                label: `Pipeline Merge: ${sourceId} -> ${targetId} (stage 2/2)`,
                agent: "art-director" as const,
                request: stage2Req as Record<string, unknown>,
              };

              if (targetId === "logo") {
                const drawn = await withDebugLog(
                  debugInterceptor,
                  { ...stage2Log, endpoint: "art-director/design-logo" },
                  () => designLogo(stage2Req),
                );
                if (!drawn.logoImageUrl) return;
                mergeResult = buildStagedMergeResult(
                  drawn.logoImageUrl,
                  drawn.logoModel ?? drawn._meta?.model,
                  drawn._meta,
                  drawn.logoComposition ?? pfResult.logoComposition,
                );
              } else {
                const drawn = await withDebugLog(
                  debugInterceptor,
                  { ...stage2Log, endpoint: "art-director/design-art-style" },
                  () => designArtStyle(stage2Req),
                );
                if (!drawn.artStyleImageUrl) return;
                mergeResult = buildStagedMergeResult(
                  drawn.artStyleImageUrl,
                  drawn.artStyleModel ?? drawn._meta?.model,
                  drawn._meta,
                );
              }
            } else {
            // Queue-slot drop → simple merge via visual-designer
            const sourceData = getVariationData(sourceEid, sourceVarId);
            const sourceImageUrl = IMAGE_ELEMENT_IDS.has(sourceEid)
              ? (sourceData as { imageUrl: string } | null)?.imageUrl
              : undefined;
            const sourceTextData = IMAGE_ELEMENT_IDS.has(sourceEid) ? undefined : sourceData;
            let effectiveHint = hint;
            let effectiveSourceTextData = sourceTextData;

            const mergeImgCtx = {
              brandName: brief.name,
              newHint: effectiveHint,
              sourceId,
              sourceImageUrl,
              sourceTextData: effectiveSourceTextData,
              brandContextShort: buildBriefOnlyContext(p),
              mergeBoardContext: buildMergeBoardPromptContext(p, {
                excludeTarget: targetEid,
                excludeSource: sourceEid,
              }),
            };
            mergeResult = await withDebugLog(
              debugInterceptor,
              { label: `Merge: ${hint}`, agent: "visual-designer", endpoint: "visual-designer/merge-generate", request: { cardType: targetId, ...mergeImgCtx } },
              () => generateMergeImage(targetId as ImageCardType, mergeImgCtx),
            );
            }
          } else {
            // Card drop → img2img editing, or wordmark merge
            const targetData = targetVarId
              ? getVariationData(targetEid, targetVarId) as { imageUrl: string } | null
              : null;
            const existingImageUrl = targetData?.imageUrl;
            const draggedPalette = sourceId === "color-palette"
              ? getVariationData(sourceEid, sourceVarId) as string[] | null
              : undefined;
            const paletteImageBase64 = sourceId === "color-palette" && draggedPalette?.length
              ? paletteToBase64(draggedPalette)
              : undefined;
            const isWordmarkSlotDrop = isWordmarkMerge && !targetVarId;
            const fontData = isWordmarkSlotDrop
              ? getVariationData(sourceEid, sourceVarId) as { titleFont: string; bodyFont: string } | null
              : null;

            const cardHint = resolveMergeHint("card", sourceId, targetId, {
              sourceData: formatSourceForHint(sourceId, getVariationData(sourceEid, sourceVarId), targetId),
              brandName: brief.name,
              brandDescription: brief.description,
            });

            const sourceRefUrl = IMAGE_ELEMENT_IDS.has(sourceEid)
              ? (getVariationData(sourceEid, sourceVarId) as { imageUrl: string } | null)?.imageUrl
              : undefined;

            const img2imgCtx = {
              newHint: isWordmarkSlotDrop
                ? resolveMergeHint("slot", sourceId, targetId)
                : cardHint,
              colorPalette: draggedPalette ?? undefined,
              sourceImageUrl: isWordmarkSlotDrop ? undefined : existingImageUrl,
              referenceImageUrl: sourceRefUrl,
              paletteImageBase64,
              titleFont: fontData?.titleFont,
              bodyFont: fontData?.bodyFont,
              brandContextShort: buildBriefOnlyContext(p),
            };
            mergeResult = await withDebugLog(
              debugInterceptor,
              {
                label: `Merge: ${hint}`,
                agent: debugAgentForGenerateImage({ cardType: targetId, ...img2imgCtx }),
                endpoint: "generate-image",
                request: { cardType: targetId, ...img2imgCtx },
              },
              () => generateBrandImage(targetId as ImageCardType, img2imgCtx),
            );
          }

          const imgData = { imageUrl: mergeResult.imageUrl };
          const variation = createVariation({ prefix: "merge", data: imgData, source: "merge", meta: mergeResult._meta, counterRef: generationCounterRef });
          addVariationIfNew(setProject, targetEid, variation);
        } else {
          // text → text: generic merge
          const mergeContext = buildMergeFullBrandContext(p);
          overrideContextField(mergeContext, sourceId, sourceVarId);
          overrideContextField(mergeContext, targetId, targetVarId);
          const { patch, _meta: mergeMeta } = await withDebugLog(
            debugInterceptor,
            { label: `Merge: ${hint}`, agent: "visual-designer", endpoint: "visual-designer/merge", request: { sourceId, targetId, brandData: mergeContext } },
            () => performMerge(sourceId, targetId, mergeContext),
          );
          if (patch) {
            const mergeData = extractMergeData(targetEid, patch);
            if (mergeData != null) {
              const variationData = targetEid === "color-palette" ? normalizeAndSortColorPalette(mergeData) : mergeData;
              const variation = createVariation({ prefix: "merge", data: variationData, source: "merge", meta: mergeMeta, counterRef: generationCounterRef });
              addVariationIfNew(setProject, targetEid, variation);
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
    [projectRef, generationCounterRef, setProject, debugInterceptor],
  );

  const handleCommentModify = useCallback(
    async (targetId: string, comment: string, targetVarId?: string) => {
      const targetEid = targetId as ElementId;
      const commentVarId = targetVarId ?? projectRef.current.elements[targetEid].activeVariationId;

      const lockKey = commentVarId ?? targetId;
      if (commentInFlightRef.current.has(lockKey)) return;
      commentInFlightRef.current.add(lockKey);

      if (commentVarId) {
        setMergingVariationIds((prev) => new Set([...prev, commentVarId]));
      }

      const removeMerging = () => {
        if (commentVarId) {
          setMergingVariationIds((prev) => {
            const n = new Set(prev);
            n.delete(commentVarId);
            return n;
          });
        }
      };

      try {
        const p = projectRef.current;
        const brief = p.brandBrief.current;

        if (IMAGE_ELEMENT_IDS.has(targetEid)) {
          const slot = p.elements[targetEid];
          const targetVariation = targetVarId ? slot.variations.find((v) => v.id === targetVarId) ?? null : null;
          const existingImageUrl = (
            (targetVariation?.data ?? getActiveElementData(p.elements, targetEid)) as { imageUrl: string } | null
          )?.imageUrl;

          if (!existingImageUrl) {
            console.warn("[comment-modify] No existing image for image element, skipping");
            return;
          }

          const shortCtx = buildMergeShortBrandContext(p);
          const result = await withDebugLog(
            debugInterceptor,
            { label: "Comment Modify (image)", agent: "visual-designer", endpoint: "visual-designer/edit", request: { cardType: targetId, sourceImageUrl: existingImageUrl, newHint: comment } },
            () => commentEditImage(targetId as ImageCardType, {
              sourceImageUrl: existingImageUrl,
              comment,
              brandContextShort: shortCtx,
            }),
          );

          const variation = createVariation({ prefix: "comment", data: { imageUrl: result.imageUrl }, source: "comment", meta: result._meta, counterRef: generationCounterRef });
          setProject((prev) => addVariationToProject(prev, targetEid, variation));
        } else {
          const mergeContext = buildMergeFullBrandContext(p);
          const { patch, _meta: commentMeta } = await withDebugLog(
            debugInterceptor,
            { label: "Comment Modify (text)", agent: "visual-designer", endpoint: "comment-modify", request: { targetId, comment, brandData: mergeContext } },
            () => performCommentModify(targetId, comment, mergeContext),
          );
          if (patch) {
            const modifiedData = extractMergeData(targetEid, patch);
            if (modifiedData != null) {
              const data = targetEid === "color-palette" ? normalizeAndSortColorPalette(modifiedData) : modifiedData;
              const variation = createVariation({ prefix: "comment", data, source: "comment", meta: commentMeta, counterRef: generationCounterRef });
              setProject((prev) => addVariationToProject(prev, targetEid, variation));
            }
          }
        }
      } catch (err) {
        console.error("Comment modify error:", err);
      } finally {
        commentInFlightRef.current.delete(lockKey);
        removeMerging();
      }
    },
    [projectRef, generationCounterRef, setProject, debugInterceptor],
  );

  return {
    mergingVariationIds,
    setMergingVariationIds,
    mergingElementTypes,
    handleMerge,
    handleCommentModify,
  };
}
