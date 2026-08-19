import { useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import type { ElementId, Variation, VariationMeta } from "../types/project";
import { IMAGE_ELEMENT_IDS, getActiveElementData, getCheckedElementData } from "../types/project";
import {
  generateTxt2Img,
  generateImg2Img,
  commentEditImage,
  performTxt2Txt,
  performImg2Txt,
  performCommentModify,
} from "../utils/generate-image";
import type { ImageCardType } from "../utils/generate-image";
import { resolveMergeKind } from "@server-shared/merge-routes.ts";
import { resolveMergeHint, formatSourceForHint } from "@server-shared/merge-specs.tsx";
import { omitTaglineForLogo } from "@server-shared/brand-context.ts";
import { omitsCurrentPaletteInSlotExtract } from "@server-shared/merge-text.ts";
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
import { withDebugLog } from "../utils/debug-interceptor-utils";

export interface UseMergeGenerationReturn {
  mergingVariationIds: Set<string>;
  setMergingVariationIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  mergingElementTypes: Set<string>;
  handleMergeSlot: (sourceId: string, targetId: string, sourceVarId?: string) => Promise<void>;
  handleMergeCard: (
    sourceId: string,
    targetId: string,
    sourceVarId: string | undefined,
    targetVarId: string,
  ) => Promise<void>;
  handleCommentModify: (targetId: string, comment: string, targetVarId?: string) => Promise<void>;
}

const ELEMENT_TO_CONTEXT_FIELD: Record<string, keyof MergeBrandContext> = {
  "color-palette": "colorPalette",
  font: "font",
  logo: "logoInspiration",
  "art-style": "artStyle",
};

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

  const runMerge = useCallback(
    async (sourceId: string, targetId: string, sourceVarId?: string, targetVarId?: string) => {
      const kind = resolveMergeKind(sourceId, targetId, targetVarId);
      if (!kind) return;
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
          const v = slot.variations.find((found) => found.id === varId);
          if (v) return v.data;
        }
        return getCheckedElementData(projectRef.current.elements, eid);
      };
      const getVariation = (eid: ElementId, varId?: string): Variation | null => {
        const slot = projectRef.current.elements[eid];
        if (varId) return slot.variations.find((found) => found.id === varId) ?? null;
        if (!slot.checkedVariationId) return null;
        return slot.variations.find((found) => found.id === slot.checkedVariationId) ?? null;
      };

      const overrideContextField = (ctx: MergeBrandContext, eid: string, varId?: string) => {
        if (!varId) return;
        const field = ELEMENT_TO_CONTEXT_FIELD[eid];
        if (!field) return;
        const data = getVariationData(eid as ElementId, varId);
        if (data != null) (ctx as Record<string, unknown>)[field] = data;
      };

      const addMergeVariation = (data: unknown, meta?: VariationMeta) => {
        const variation = createVariation({
          prefix: "merge",
          data,
          source: "merge",
          meta,
          counterRef: generationCounterRef,
        });
        const outcome = addVariationIfNew(setProject, targetEid, variation);
        if (outcome === "duplicate") {
          toast("A matching card is already in the queue");
        }
      };

      const slotHint = resolveMergeHint(
        "slot",
        sourceId,
        targetId,
        !IMAGE_ELEMENT_IDS.has(sourceEid)
          ? { sourceData: formatSourceForHint(sourceId, getVariationData(sourceEid, sourceVarId)) }
          : undefined,
      );

      const runTxt2Txt = async () => {
        const p = projectRef.current;
        const mergeContext = buildMergeFullBrandContext(p);
        overrideContextField(mergeContext, sourceId, sourceVarId);
        overrideContextField(mergeContext, targetId, targetVarId);
        const { patch, _meta: mergeMeta } = await withDebugLog(
          debugInterceptor,
          {
            label: `Merge: ${slotHint}`,
            agent: "visual-designer",
            endpoint: "visual-designer/txt2txt",
            request: { sourceId, targetId, brandData: mergeContext },
          },
          () => performTxt2Txt(sourceId, targetId, mergeContext),
        );
        if (!patch) return;
        const mergeData = extractMergeData(targetEid, patch);
        if (mergeData == null) return;
        const variationData = targetEid === "color-palette"
          ? normalizeAndSortColorPalette(mergeData)
          : mergeData;
        addMergeVariation(variationData, mergeMeta);
      };

      const runImg2Txt = async () => {
        const p = projectRef.current;
        const sourceVariation = getVariation(sourceEid, sourceVarId);
        const canSeed = !targetVarId && sourceId !== "visual-snapshot";

        if (targetEid === "color-palette") {
          const cachedPalette = canSeed ? sourceVariation?.meta?.pipelineSeed?.colorPalette : undefined;
          if (cachedPalette?.length) {
            const normalizedPalette = normalizeAndSortColorPalette(cachedPalette);
            if (normalizedPalette == null) return;
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
              async () => ({ usedSeed: true, seededFields: ["colorPalette"] }),
            );
            addMergeVariation(normalizedPalette, sourceVariation?.meta);
            return;
          }
        } else {
          const seededFont = canSeed ? sourceVariation?.meta?.pipelineSeed?.font : undefined;
          if (seededFont != null) {
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
                  seededFields: ["font"],
                },
              },
              async () => ({ usedSeed: true, seededFields: ["font"] }),
            );
            addMergeVariation(seededFont, sourceVariation?.meta);
            return;
          }
        }

        const sourceImageUrl = (getVariationData(sourceEid, sourceVarId) as { imageUrl: string } | null)?.imageUrl;
        if (!sourceImageUrl) return;
        const mergeContext = buildMergeFullBrandContext(p);
        overrideContextField(mergeContext, targetId, targetVarId);
        if (omitsCurrentPaletteInSlotExtract(targetId, targetVarId)) {
          mergeContext.colorPalette = null;
        }
        const { patch, _meta: img2txtMeta } = await withDebugLog(
          debugInterceptor,
          {
            label: `Merge: ${slotHint}`,
            agent: "visual-designer",
            endpoint: "visual-designer/img2txt",
            request: { sourceId, targetId, sourceImageUrl, brandData: mergeContext },
          },
          () => performImg2Txt(sourceId, targetId, sourceImageUrl, mergeContext),
        );
        if (!patch) return;
        const mergeData = extractMergeData(targetEid, patch);
        if (mergeData == null) return;
        const variationData = targetEid === "color-palette"
          ? normalizeAndSortColorPalette(mergeData)
          : mergeData;
        if (variationData != null) addMergeVariation(variationData, img2txtMeta);
      };

      const runTxt2Img = async () => {
        const p = projectRef.current;
        const brief = p.brandBrief.current;
        const sourceData = getVariationData(sourceEid, sourceVarId);
        const mergeImgCtx = {
          brandName: brief.name,
          newHint: slotHint,
          sourceId,
          targetId,
          sourceTextData: sourceData,
          brandContextShort: omitTaglineForLogo(targetId, buildBriefOnlyContext(p)),
          mergeBoardContext: buildMergeBoardPromptContext(p, {
            excludeTarget: targetEid,
            excludeSource: sourceEid,
          }),
        };
        const result = await withDebugLog(
          debugInterceptor,
          {
            label: `Merge: ${slotHint}`,
            agent: "visual-designer",
            endpoint: "visual-designer/txt2img",
            request: mergeImgCtx,
          },
          () => generateTxt2Img(mergeImgCtx),
        );
        addMergeVariation({ imageUrl: result.imageUrl }, result._meta);
      };

      const runImg2Img = async () => {
        const p = projectRef.current;
        const brief = p.brandBrief.current;
        const sourceData = getVariationData(sourceEid, sourceVarId);
        const boardContext = buildMergeBoardPromptContext(p, {
          excludeTarget: targetEid,
          excludeSource: sourceEid,
        });

        if (!targetVarId) {
          const sourceImageUrl = (sourceData as { imageUrl: string } | null)?.imageUrl;
          if (!sourceImageUrl) return;
          const mergeImgCtx = {
            brandName: brief.name,
            newHint: slotHint,
            sourceId,
            targetId,
            sourceImageUrl,
            brandContextShort: omitTaglineForLogo(targetId, buildBriefOnlyContext(p)),
            mergeBoardContext: boardContext,
          };
          const result = await withDebugLog(
            debugInterceptor,
            {
              label: `Merge: ${slotHint}`,
              agent: "visual-designer",
              endpoint: "visual-designer/img2img",
              request: mergeImgCtx,
            },
            () => generateImg2Img(mergeImgCtx),
          );
          addMergeVariation({ imageUrl: result.imageUrl }, result._meta);
          return;
        }

        const existingImageUrl = (
          getVariationData(targetEid, targetVarId) as { imageUrl: string } | null
        )?.imageUrl;
        if (!existingImageUrl) return;

        const draggedPalette = sourceId === "color-palette"
          ? getVariationData(sourceEid, sourceVarId) as string[] | null
          : undefined;
        const paletteImageBase64 = sourceId === "color-palette" && draggedPalette?.length
          ? paletteToBase64(draggedPalette)
          : undefined;
        const cardHint = resolveMergeHint("card", sourceId, targetId, {
          sourceData: formatSourceForHint(sourceId, getVariationData(sourceEid, sourceVarId), targetId),
          brandName: brief.name,
          brandDescription: brief.description,
        });
        const sourceRefUrl = IMAGE_ELEMENT_IDS.has(sourceEid)
          ? (sourceData as { imageUrl: string } | null)?.imageUrl
          : undefined;

        const editCtx = {
          brandName: brief.name,
          newHint: cardHint,
          sourceId,
          targetId,
          targetImageUrl: existingImageUrl,
          referenceImageUrl: sourceRefUrl,
          paletteImageBase64,
          colorPalette: draggedPalette ?? undefined,
          sourceTextData: sourceData,
          brandContextShort: omitTaglineForLogo(targetId, buildBriefOnlyContext(p)),
          mergeBoardContext: boardContext,
        };
        const result = await withDebugLog(
          debugInterceptor,
          {
            label: `Merge: ${slotHint}`,
            agent: "visual-designer",
            endpoint: "visual-designer/img2img",
            request: editCtx,
          },
          () => generateImg2Img(editCtx),
        );
        addMergeVariation({ imageUrl: result.imageUrl }, result._meta);
      };

      try {
        switch (kind) {
          case "txt2txt":
            await runTxt2Txt();
            break;
          case "img2txt":
            await runImg2Txt();
            break;
          case "txt2img":
            await runTxt2Img();
            break;
          case "img2img":
            await runImg2Img();
            break;
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

  const handleMergeSlot = useCallback(
    (sourceId: string, targetId: string, sourceVarId?: string) =>
      runMerge(sourceId, targetId, sourceVarId),
    [runMerge],
  );

  const handleMergeCard = useCallback(
    (sourceId: string, targetId: string, sourceVarId: string | undefined, targetVarId: string) =>
      runMerge(sourceId, targetId, sourceVarId, targetVarId),
    [runMerge],
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

          const shortCtx = omitTaglineForLogo(targetId, buildMergeShortBrandContext(p));
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
    handleMergeSlot,
    handleMergeCard,
    handleCommentModify,
  };
}
