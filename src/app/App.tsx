import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Pencil, FileText, GalleryVerticalEnd, Images } from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "./components/ui/sonner";
import { CurationBoard } from "./components/curation-board";
import { DirectionPage } from "./components/direction-page";
import { DirectionVersionsPanel } from "./components/DirectionVersionsPanel";
import type { BrandSummaryFields, BriefGeneratedKey } from "./components/brand-summary";
import { BrandSummaryPanel } from "./components/brand-summary";
import { ProjectSwitcher } from "./components/project-switcher";
import { SUGGESTIONS } from "./constants/suggestions";
import type {
  ProjectData,
  ElementId,
  AppRoute,
  Variation,
  BrandSummaryData,
} from "./types/project";
import {
  createEmptyProject,
  ALL_ELEMENT_IDS,
  ELEMENT_LABELS,
  getActiveElementData,
  getActiveVariation,
  resolveSnapshotData,
} from "./types/project";
import { generateDirection } from "./utils/generate-brand";
import { TIMING } from "./utils/design-tokens";
import { useVariations } from "./hooks/useVariations";
import { useSnapshotHistory } from "./hooks/useSnapshotHistory";
import { useProjectPersistence } from "./hooks/useProjectPersistence";
import { useBrandGeneration } from "./hooks/useBrandGeneration";

function isBrandSummaryComplete(summary: BrandSummaryData): boolean {
  return !!(summary.name?.trim() && summary.tagline?.trim() && summary.description?.trim());
}

export default function App() {
  // ── Core project state (single source of truth) ─────────────────────────────
  const [project, setProject] = useState<ProjectData>(createEmptyProject());
  const projectRef = useRef<ProjectData>(project);
  useEffect(() => { projectRef.current = project; }, [project]);

  // ── UI-only state ───────────────────────────────────────────────────────────
  const [route, setRoute] = useState<AppRoute>("board");
  const routeRef = useRef<AppRoute>(route);
  const [previousRoute, setPreviousRoute] = useState<AppRoute | null>(null);
  useEffect(() => { routeRef.current = route; }, [route]);
  const [isEditingName, setIsEditingName] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const [vsPanelExpanded, setVsPanelExpanded] = useState(false);
  const initPanelRef = useRef(false);
  const [isPreparingDirection, setIsPreparingDirection] = useState(false);
  const [directionOverlayLabel, setDirectionOverlayLabel] = useState("working on the concept...");
  const [isDirectionPanelOpen, setIsDirectionPanelOpen] = useState(false);

  const generationCounter = useRef(0);
  const uploadingVariationIdsRef = useRef<Set<string>>(new Set());
  const pipelineStageRef = useRef<import("./types/project").PipelineStage>(null);

  // ── Variations ──────────────────────────────────────────────────────────────
  const {
    boardVariationCounts,
    handleSelectVariation,
    handleDeleteVariation,
    handleEditSave,
  } = useVariations({
    project,
    setProject,
    generationCounterRef: generationCounter,
  });

  // ── Brand generation ────────────────────────────────────────────────────────
  const {
    isBrandGenerating,
    setIsBrandGenerating,
    isAutoCompleting,
    generatedBriefFields,
    setGeneratedBriefFields,
    loadingElements,
    setLoadingElements,
    mergingElementIds,
    pipelineStage,
    setPipelineStage,
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
  } = useBrandGeneration({
    project,
    setProject,
    projectRef,
    generationCounterRef: generationCounter,
    uploadingVariationIdsRef,
  });

  // Keep pipelineStageRef in sync for persistence guard
  useEffect(() => { pipelineStageRef.current = pipelineStage; }, [pipelineStage]);

  // ── Snapshot history ────────────────────────────────────────────────────────
  const {
    generateVisualSnapshot,
    handleSelectSnapshot,
    handleDeleteSnapshot,
  } = useSnapshotHistory({
    project,
    setProject,
    projectRef,
    setLoadingElements,
  });

  // ── Snapshot validation before generation ──────────────────────────────────
  const handleGenerateSnapshotWithValidation = useCallback(() => {
    const requiredIds: ElementId[] = [
      "logo",
      "color-palette",
      "font",
      "application",
    ];

    const missing = requiredIds.filter(
      (id) => !project.elements[id].checkedVariationId,
    );

    if (missing.length > 0) {
      toast.error(
        "Visual Snapshot requirements not met: Logo, Color Palette, Typography, and Application must each have at least one selected card.",
        { duration: TIMING.DIRECTION_GENERATION_DELAY },
      );
      return;
    }

    generateVisualSnapshot();
  }, [project.elements, generateVisualSnapshot]);

  // ── Toggle checked + clear snapshot selection ──────────────────────────────
  const handleToggleVariationChecked = useCallback(
    (elementId: string, variationId: string) => {
      // Merge into a single setProject call to avoid the first non-functional
      // update overwriting the state changes from the second functional update.
      setProject((prev) => {
        const slot = prev.elements[elementId as ElementId];
        if (!slot) return prev;
        const wasChecked = slot.checkedVariationId === variationId;
        return {
          ...prev,
          selectedSnapshotId: null,
          elements: {
            ...prev.elements,
            [elementId]: {
              ...slot,
              checkedVariationId: wasChecked ? null : variationId,
              activeVariationId: wasChecked ? slot.activeVariationId : variationId,
            },
          },
        };
      });
    },
    [setProject],
  );

  // ── Variation order ──────────────────────────────────────────────────────
  const handleUpdateVariationOrder = useCallback(
    (elementType: string, newOrder: string[]) => {
      const id = elementType as ElementId;
      setProject((prev) => ({
        ...prev,
        elements: {
          ...prev.elements,
          [id]: {
            ...prev.elements[id],
            variationOrder: newOrder,
          },
        },
      }));
    },
    [setProject],
  );

  // ── Reset to empty ────────────────────────────────────────────────────────
  const resetToEmpty = useCallback(() => {
    setProject(createEmptyProject());
    setRoute("board");
    setIsEditingName(false);
    setIsPanelOpen(true);
    setVsPanelExpanded(true);
    setIsBrandGenerating(false);
    setGeneratedBriefFields(new Set<BriefGeneratedKey>());
    setPipelineStage(null);
    setLoadingElements(new Set());
    setIsDirectionPanelOpen(false);
    generationCounter.current = 0;
  }, [setIsBrandGenerating, setGeneratedBriefFields, setPipelineStage, setLoadingElements]);

  // ── Project persistence ───────────────────────────────────────────────────
  const {
    currentProjectId,
    projectIndex,
    isLoaded,
    handleSwitchProject,
    handleNewProject: handleNewProjectBase,
    handleDeleteProject,
    handleSaveNow,
  } = useProjectPersistence({
    projectRef,
    setProject,
    resetToEmpty,
    uploadingVariationIdsRef,
    pipelineStageRef,
  });

  // Initial panel state: prefer Snapshot when Brand Summary is complete
  useEffect(() => {
    if (!isLoaded || initPanelRef.current) return;
    initPanelRef.current = true;
    const complete = isBrandSummaryComplete(project.brandSummary.current);
    setIsPanelOpen(!complete);
    setVsPanelExpanded(complete);
  }, [isLoaded, project]);

  // ── Generate Brand Direction ──────────────────────────────────────────────
  const handleGenerateDirection = useCallback(async () => {
    const snapshotId = project.selectedSnapshotId;
    if (!snapshotId) return;

    setIsPreparingDirection(true);
    const currentProject = projectRef.current;
    const resolvedFromCurrent = resolveSnapshotData(currentProject, snapshotId);
    if (!resolvedFromCurrent) {
      setIsPreparingDirection(false);
      toast.error("Selected snapshot is no longer available.");
      return;
    }

    const snapshotConcept = resolvedFromCurrent.elementData["visual-concept"] as
      | string
      | undefined;
    const hasConcept = typeof snapshotConcept === "string" && snapshotConcept.trim().length > 0;
    setDirectionOverlayLabel(
      hasConcept ? "writing the rationale..." : "working on the concept...",
    );

    const existingForSnapshot = currentProject.direction.versions.find(
      (v) => v.boundSnapshotId === snapshotId,
    );
    const nextVersionId = existingForSnapshot?.id ?? `gv-${Date.now()}`;
    const generatedLabel = snapshotConcept?.trim() || "Generated direction";

    setProject((prev) => {
      const prevExisting = prev.direction.versions.find((v) => v.boundSnapshotId === snapshotId);
      const targetVersionId = prevExisting?.id ?? nextVersionId;
      const versions = prevExisting
        ? prev.direction.versions.map((v) =>
            v.id === prevExisting.id
              ? { ...v, label: generatedLabel, cache: undefined }
              : v,
          )
        : [
          {
            id: targetVersionId,
            label: generatedLabel,
            createdAt: new Date(),
            boundSnapshotId: snapshotId,
            snapshotImageUrl: currentProject.snapshots.find((s) => s.id === snapshotId)?.imageUrl,
            cache: undefined,
          },
            ...prev.direction.versions,
          ];

      return {
        ...prev,
        direction: {
          ...prev.direction,
          versions,
          activeVersionId: targetVersionId,
        },
      };
    });

    try {
      {
        const brief = resolvedFromCurrent.brandSummary;
        const keywords = resolvedFromCurrent.brandSummary.keywords ?? [];
        const colorPalette =
          (resolvedFromCurrent.elementData["color-palette"] as string[] | undefined) ?? [];
        const concept = resolvedFromCurrent.elementData["visual-concept"] as string | undefined;
        const artStyle = resolvedFromCurrent.elementData["art-style"] as { imageUrl: string } | undefined;
        const font = resolvedFromCurrent.elementData["font"] as
          | { titleFont: string; bodyFont: string }
          | undefined;
        const logoImageUrl = (
          resolvedFromCurrent.elementData["logo"] as { imageUrl?: string } | undefined
        )?.imageUrl;
        const artStyleImageUrl = artStyle?.imageUrl ?? resolvedFromCurrent.snapshot.imageUrl;

        const data = await generateDirection({
          brandBrief: brief,
          keywords,
          colorPalette,
          visualConcept: concept,
          artStyle,
          font,
          logoImageUrl,
          artStyleImageUrl,
        });

        const finalLabel = concept?.trim()
          || data.synthesizedVisualConcept?.trim()
          || generatedLabel;

        setProject((prev) => ({
          ...prev,
          direction: {
            ...prev.direction,
            versions: prev.direction.versions.map((v) =>
              v.id === nextVersionId
                ? {
                    ...v,
                    label: finalLabel,
                    cache: {
                      rationales: {
                        logo: data.rationales?.logo ?? "",
                        color: data.rationales?.color ?? "",
                        typography: data.rationales?.typography ?? "",
                        artStyle: data.rationales?.artStyle ?? "",
                      },
                      colorNames: data.colorNames ?? [],
                      brandInContextDescription:
                        data.brandInContextDescription ??
                        "Real-world application of the identity system across digital and physical touchpoints.",
                      visualConceptContent: data.visualConceptContent,
                      synthesizedVisualConcept: data.synthesizedVisualConcept,
                    },
                  }
                : v,
            ),
          },
        }));
      }

      setPreviousRoute(routeRef.current);
      setIsDirectionPanelOpen(false);
      setRoute("direction");
    } catch (err) {
      console.error("Direction pre-generation failed:", err);
      toast.error("Could not prepare the concept. Please try again.");
    } finally {
      setIsPreparingDirection(false);
    }
  }, [project.selectedSnapshotId, setProject, projectRef, setPreviousRoute, setRoute]);

  const handleViewBrandDirection = useCallback(() => {
    const snapshotId = project.selectedSnapshotId;
    if (!snapshotId) return;
    const version = project.direction.versions.find((v) => v.boundSnapshotId === snapshotId);
    if (!version) return;
    setProject((prev) => ({
      ...prev,
      direction: { ...prev.direction, activeVersionId: version.id },
    }));
    setPreviousRoute(routeRef.current);
    setIsDirectionPanelOpen(false);
    setRoute("direction");
  }, [project.selectedSnapshotId, project.direction.versions, setProject, setPreviousRoute, setRoute]);

  const handleBackFromDirection = useCallback(() => {
    setProject((prev) => ({
      ...prev,
      direction: { ...prev.direction, activeVersionId: null },
    }));
    setIsDirectionPanelOpen(false);
    const target = previousRoute ?? "board";
    setPreviousRoute(null);
    setRoute(target);
  }, [setProject, previousRoute]);

  const handleFieldChange = useCallback(
    (fields: BrandSummaryFields) => {
      setProject((prev) => ({
        ...prev,
        brandSummary: {
          ...prev.brandSummary,
          current: {
            name: fields.brandName,
            tagline: fields.tagline,
            description: fields.brandDescription,
            targetAudience: fields.targetAudience,
            keywords: fields.keywords
              ? fields.keywords.split(",").map((k) => k.trim()).filter(Boolean)
              : [],
            applications: fields.applications
              ? fields.applications.split(",").map((a) => a.trim()).filter(Boolean)
              : [],
          },
        },
      }));
    },
    [setProject],
  );

  const allVariationsByElementType = useMemo(() => {
    const typeMap: Record<string, string> = {
      "visual-concept": "visual-concept",
      "art-style": "art-style",
      "color-palette": "color",
      "font": "font",
      "logo": "logo",
      "application": "application",
    };
    const map: Record<string, Array<{
      id: string;
      label: string;
      type: string;
      data: any;
      isOriginal?: boolean;
      createdAt: Date;
      meta?: import("./types/project").VariationMeta;
    }>> = {};
    for (const id of ALL_ELEMENT_IDS) {
      map[id] = project.elements[id].variations.map((v) => ({
        id: v.id,
        label: ELEMENT_LABELS[id],
        type: typeMap[id] ?? id,
        data: id === "color-palette" ? { colors: v.data } : v.data,
        isOriginal: v.source === "initial",
        createdAt: v.createdAt,
        meta: v.meta,
      }));
    }
    return map;
  }, [project.elements]);

  const activeVariationByElementType = useMemo(() => {
    const map: Record<string, string> = {};
    for (const id of ALL_ELEMENT_IDS) {
      const slot = project.elements[id];
      if (slot.activeVariationId) map[id] = slot.activeVariationId;
    }
    return map;
  }, [project.elements]);

  const checkedVariationIds = useMemo(() => {
    const set = new Set<string>();
    for (const id of ALL_ELEMENT_IDS) {
      const checked = project.elements[id].checkedVariationId;
      if (checked) set.add(checked);
    }
    return set;
  }, [project.elements]);

  // Enrich direction versions with snapshotImageUrl derived from project.snapshots
  const directionsWithImageUrl = useMemo(() =>
    project.direction.versions.map((v) => ({
      ...v,
      snapshotImageUrl:
        v.snapshotImageUrl ??
        (v.boundSnapshotId
          ? project.snapshots.find((s) => s.id === v.boundSnapshotId)?.imageUrl
          : undefined),
    })),
    [project.direction.versions, project.snapshots],
  );

  if (route === "direction") {
    return (
      <DirectionPage
        project={project}
        onBack={handleBackFromDirection}
        versions={directionsWithImageUrl}
        onVersionsChange={(updater) => {
          setProject((prev) => {
            const newVersions =
              typeof updater === "function"
                ? updater(
                    prev.direction.versions.map((v) => ({
                      ...v,
                      snapshotImageUrl:
                        v.snapshotImageUrl ??
                        (v.boundSnapshotId
                          ? prev.snapshots.find((s) => s.id === v.boundSnapshotId)?.imageUrl
                          : undefined),
                    })),
                  )
                : updater;
            return {
              ...prev,
              direction: { ...prev.direction, versions: newVersions },
            };
          });
        }}
        initialActiveVersionId={
          project.direction.activeVersionId ?? undefined
        }
      />
    );
  }

  // ── Render: Main board ────────────────────────────────────────────────────
  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden">
      <div className="hidden items-center gap-2 px-5 py-3 border-b border-border/60 bg-white shrink-0">
        {isEditingName ? (
          <input
            autoFocus
            value={project.projectName}
            onChange={(e) =>
              setProject((prev) => ({
                ...prev,
                projectName: e.target.value,
              }))
            }
            onBlur={() => setIsEditingName(false)}
            onKeyDown={(e) => e.key === "Enter" && setIsEditingName(false)}
            className="text-[15px] text-foreground bg-transparent outline-none border-b border-foreground/30 py-0.5"
            style={{ fontWeight: 600 }}
          />
        ) : (
          <h1
            className="text-[15px] text-foreground cursor-default"
            style={{ fontWeight: 600 }}
          >
            {project.projectName}
          </h1>
        )}
        <button
          onClick={() => setIsEditingName(true)}
          className="p-1 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
        >
          <Pencil size={14} />
        </button>
        <div className="flex-1" />
      </div>

      <div className="flex flex-1 overflow-hidden relative bg-muted/30">
        <div className="flex-1 relative overflow-hidden">
          <CurationBoard
            brandSummary={project.brandSummary.current}
            elements={project.elements}
            projectPhase={project.phase}
            pipelineStage={pipelineStage}
            suggestions={project.phase === "empty" ? SUGGESTIONS : undefined}
            onSuggestionClick={handleSuggestionClick}
            variationCounts={boardVariationCounts}
            onEditSave={(elementId: string, data: unknown) => {
              if (ALL_ELEMENT_IDS.includes(elementId as ElementId)) {
                handleEditSave(elementId, data);
              }
            }}
            onAddVariation={(elementType, sourceVariationId) => {
              if (sourceVariationId && uploadingVariationIds.has(sourceVariationId)) return;
              handleAddVariation(elementType, sourceVariationId);
            }}
            onUploadVariation={handleUploadVariation}
            loadingElementIds={loadingElements}
            onMerge={(sourceId, targetId, sourceVarId, targetVarId) => {
              if ((sourceVarId && uploadingVariationIds.has(sourceVarId)) || (targetVarId && uploadingVariationIds.has(targetVarId))) return;
              handleMerge(sourceId, targetId, sourceVarId, targetVarId);
            }}
            onMoveVariationToQueue={(sourceId, targetId, variationId) => {
              if (uploadingVariationIds.has(variationId)) return;
              handleMoveVariationToQueue(sourceId, targetId, variationId);
            }}
            onCommentModify={handleCommentModify}
            mergingElementTypes={mergingElementIds}
            allVariationsByElementType={allVariationsByElementType}
            activeVariationByElementType={activeVariationByElementType}
            onSelectVariation={handleSelectVariation}
            checkedVariationIds={checkedVariationIds}
            onToggleVariationChecked={(variationId: string, peerVariationIds: string[]) => {
              for (const id of ALL_ELEMENT_IDS) {
                const slot = project.elements[id];
                if (slot.variations.some((v) => v.id === variationId)) {
                  handleToggleVariationChecked(id, variationId);
                  return;
                }
              }
            }}
            onDeleteVariation={(componentId: string, variationId: string) => {
              handleDeleteVariation(componentId, variationId);
            }}
            snapshotHistory={project.snapshots}
            selectedSnapshotId={project.selectedSnapshotId}
            onSelectSnapshot={handleSelectSnapshot}
            onDeleteSnapshot={handleDeleteSnapshot}
            onGenerateSnapshot={handleGenerateSnapshotWithValidation}
            onGenerateBrandDirection={handleGenerateDirection}
            onViewBrandDirection={handleViewBrandDirection}
            selectedSnapshotHasDirection={
              !!project.selectedSnapshotId &&
              project.direction.versions.some((v) => v.boundSnapshotId === project.selectedSnapshotId)
            }
            snapshotGenerating={loadingElements.has("visual-snapshot")}
            vsPanelExpanded={vsPanelExpanded}
            uploadingVariationIds={uploadingVariationIds}
            onUpdateVariationOrder={handleUpdateVariationOrder}
          />

          <div className="absolute top-3 right-3 z-20 flex flex-row items-center gap-2">
            <ProjectSwitcher
              currentProjectId={currentProjectId}
              projects={projectIndex}
              onSwitch={handleSwitchProject}
              onNew={() => {
                setIsPanelOpen(true);
                setVsPanelExpanded(false);
                handleNewProjectBase();
              }}
              onDelete={handleDeleteProject}
              onSaveNow={handleSaveNow}
            />
            <button
              onClick={() => {
                if (isPanelOpen) {
                  setIsPanelOpen(false);
                } else {
                  setIsPanelOpen(true);
                  setVsPanelExpanded(false);
                  setIsDirectionPanelOpen(false);
                }
              }}
              className={`p-2 rounded-lg border shadow-sm transition-colors cursor-pointer ${
                isPanelOpen
                  ? "bg-blue-50 text-blue-400"
                  : "bg-white/90 border-border/60 text-muted-foreground hover:text-foreground"
              }`}
              title={isPanelOpen ? "Close side panel" : "Open side panel"}
            >
              <FileText size={16} />
            </button>
            {project.phase !== "empty" && (
              <button
                onClick={() => {
                  if (vsPanelExpanded) {
                    setVsPanelExpanded(false);
                  } else {
                    setVsPanelExpanded(true);
                    setIsPanelOpen(false);
                    setIsDirectionPanelOpen(false);
                  }
                }}
                className={`p-2 rounded-lg border shadow-sm transition-colors cursor-pointer ${
                  vsPanelExpanded
                    ? "bg-blue-50 text-blue-400"
                    : "bg-white/90 border-border/60 text-muted-foreground hover:text-foreground"
                }`}
                title={
                  vsPanelExpanded
                    ? "Hide Visual Snapshot panel"
                    : "Show Visual Snapshot panel"
                }
              >
                <Images size={16} />
              </button>
            )}
            {project.direction.versions.length > 0 && (
              <button
                onClick={() => {
                  if (isDirectionPanelOpen) {
                    setIsDirectionPanelOpen(false);
                  } else {
                    setIsDirectionPanelOpen(true);
                    setIsPanelOpen(false);
                    setVsPanelExpanded(false);
                  }
                }}
                className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg border shadow-sm transition-colors cursor-pointer ${
                  isDirectionPanelOpen
                    ? "bg-blue-50 border-blue-200 text-blue-400"
                    : "bg-white/90 border-border/60 text-muted-foreground hover:text-foreground"
                }`}
                title={isDirectionPanelOpen ? "Hide directions panel" : "View brand directions"}
              >
                <GalleryVerticalEnd size={16} />
                <span className="text-[13px] font-medium">Brand Direction</span>
              </button>
            )}
          </div>
        </div>

        {isPanelOpen && (
          <BrandSummaryPanel
            onClose={() => setIsPanelOpen(false)}
            brandSummary={project.brandSummary.current}
            projectPhase={project.phase}
            isGenerating={pipelineStage !== null}
            onBrandSummarySubmit={handleBrandSummarySubmit}
            isBrandGenerating={isBrandGenerating}
            onAutoComplete={handleAutoComplete}
            isAutoCompleting={isAutoCompleting}
            generatedBriefFields={generatedBriefFields}
            onClearGeneratedField={(key) =>
              setGeneratedBriefFields((prev) => {
                const next = new Set(prev);
                next.delete(key);
                return next;
              })
            }
            onFieldChange={handleFieldChange}
            onFieldAutoFill={handleFieldAutoFill}
            autoFillingFieldKey={autoFillingFieldKey}
          />
        )}

        {isDirectionPanelOpen && project.direction.versions.length > 0 && (
          <DirectionVersionsPanel
            versions={directionsWithImageUrl}
            activeVersionId={project.direction.activeVersionId}
            visualSnapshotUrl={project.snapshots[0]?.imageUrl}
            onSelectVersion={(version) => {
              setProject((prev) => ({
                ...prev,
                direction: { ...prev.direction, activeVersionId: version.id },
              }));
              setIsDirectionPanelOpen(false);
              setPreviousRoute(route);
              setRoute("direction");
            }}
            onDeleteVersion={(version) => {
              if (!window.confirm(`Delete "${version.label}"? This cannot be undone.`)) return;
              setProject((prev) => {
                const remaining = prev.direction.versions.filter((v) => v.id !== version.id);
                return {
                  ...prev,
                  direction: {
                    ...prev.direction,
                    versions: remaining,
                    activeVersionId:
                      prev.direction.activeVersionId === version.id
                        ? (remaining[0]?.id ?? null)
                        : prev.direction.activeVersionId,
                  },
                };
              });
            }}
            onClose={() => setIsDirectionPanelOpen(false)}
          />
        )}
      </div>
      {isPreparingDirection && (
        <div className="fixed inset-0 z-[200] bg-black/45 backdrop-blur-[1px] flex items-center justify-center pointer-events-auto">
          <div className="px-5 py-4 rounded-xl bg-white shadow-xl border border-border/60 text-center">
            <div className="mx-auto mb-2 w-6 h-6 border-2 border-muted-foreground/25 border-t-muted-foreground/80 rounded-full animate-spin" />
            <p className="text-[13px] font-medium text-foreground">
              {directionOverlayLabel}
            </p>
          </div>
        </div>
      )}
      <Toaster position="bottom-center" richColors toastOptions={{ style: { zIndex: 99999 } }} />
    </div>
  );
}
