import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Pencil, GalleryVerticalEnd, GitCompare } from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "./components/ui/sonner";
import { CurationBoard } from "./components/curation-board";
import { DirectionPage } from "./components/direction-page";
import { DirectionVersionsPanel } from "./components/DirectionVersionsPanel";
import type { BrandBriefFields, BriefGeneratedKey } from "./components/brand-brief";
import { BriefContextCard } from "./components/curation-board/BriefContextCard";
import { ProjectSwitcher } from "./components/project-switcher";
import { SUGGESTIONS } from "./constants/suggestions";
import type {
  ProjectData,
  ElementId,
  AppRoute,
  Variation,
  BrandBriefData,
  PipelineStage,
} from "./types/project";
import {
  createEmptyProject,
  ALL_ELEMENT_IDS,
  ELEMENT_LABELS,
  getActiveElementData,
  getActiveVariation,
  resolveSnapshotData,
  resolveVisualConceptForDirection,
} from "./types/project";
import { generateDirection } from "./utils/generate-brand";
import { TIMING, TYPE } from "./utils/design-tokens";
import { parseTagList } from "./utils/parse-tag-list";
import { useVariations } from "./hooks/useVariations";
import { useSnapshotHistory } from "./hooks/useSnapshotHistory";
import { useProjectPersistence } from "./hooks/useProjectPersistence";
import { useBrandGeneration } from "./hooks/useBrandGeneration";
import { usePipelineDebugger } from "./hooks/usePipelineDebugger";
import { PipelineDebugPanel } from "./components/pipeline-debug-panel";

function isBriefComplete(brief: BrandBriefData): boolean {
  return !!(brief.name?.trim() && brief.tagline?.trim() && brief.description?.trim());
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
  const [briefExpanded, setBriefExpanded] = useState(true);
  const [vsPanelExpanded, setVsPanelExpanded] = useState(false);
  const [vcPanelExpanded, setVcPanelExpanded] = useState(false);
  const initPanelRef = useRef(false);
  const [isPreparingDirection, setIsPreparingDirection] = useState(false);
  const [directionOverlayLabel, setDirectionOverlayLabel] = useState("working on the concept...");
  const [isDirectionPanelOpen, setIsDirectionPanelOpen] = useState(false);

  const generationCounter = useRef(0);
  const uploadingVariationIdsRef = useRef<Set<string>>(new Set());
  const pipelineStageRef = useRef<PipelineStage>(null);
  const prevPipelineStageRef = useRef<PipelineStage>(null);

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

  // ── Pipeline debugger (dev-only) ────────────────────────────────────────────
  const {
    debugEnabled,
    setDebugEnabled,
    stageLogs,
    activeStageId,
    selectedStageId,
    setSelectedStageId,
    continueStage,
    skipRemaining,
    abortPipeline,
    editStageRequest,
    editStagePrompts,
    clearLogs,
    interceptor: debugInterceptor,
  } = usePipelineDebugger();

  // ── Brand generation ────────────────────────────────────────────────────────
  const {
    isBrandGenerating,
    setIsBrandGenerating,
    isAutoCompleting,
    generatedBriefFields,
    setGeneratedBriefFields,
    loadingElements,
    setLoadingElements,
    mergingVariationIds,
    mergingElementTypes,
    pipelineStage,
    setPipelineStage,
    handleBriefSubmit,
    handleSuggestionClick,
    handleAutoComplete,
    handleFieldAutoFill,
    autoFillingFieldKey,
    preEnhanceSnapshot,
    revertField,
    generatedTagsByField,
    handleAddConceptWithPipeline,
    handleAddVariation,
    handleMergeSlot,
    handleMergeCard,
    handleMoveVariationToQueue,
    handleCommentModify,
    handleUploadVariation,
    handleExtractPaletteFromImage,
    uploadingVariationIds,
  } = useBrandGeneration({
    project,
    setProject,
    projectRef,
    generationCounterRef: generationCounter,
    uploadingVariationIdsRef,
    debugInterceptor,
  });

  // Keep pipelineStageRef in sync for persistence guard
  useEffect(() => { pipelineStageRef.current = pipelineStage; }, [pipelineStage]);

  // After conceptualizing: collapse brief and show Visual Concept panel (VS opens at pipeline end)
  useEffect(() => {
    const prev = prevPipelineStageRef.current;
    prevPipelineStageRef.current = pipelineStage;
    if (prev === "conceptualizing" && pipelineStage === "styling") {
      setBriefExpanded(false);
      setVcPanelExpanded(true);
    }
  }, [pipelineStage]);

  // ── Snapshot history ────────────────────────────────────────────────────────
  const {
    generateVisualSnapshot,
    regenerateWithOverride,
    handleSelectSnapshot,
    handleDeleteSnapshot,
  } = useSnapshotHistory({
    project,
    setProject,
    projectRef,
    setLoadingElements,
    debugInterceptor,
  });

  // ── Pipeline finish handling (no auto snapshot) ─────────────────────────────
  useEffect(() => {
    if (pipelineStage !== "synthesizing") return;

    setBriefExpanded(false);
    setVsPanelExpanded(true);
    setVcPanelExpanded(true);
    setPipelineStage(null);
  }, [pipelineStage, setPipelineStage]);

  // ── Snapshot validation before generation ──────────────────────────────────
  const handleGenerateSnapshotWithValidation = useCallback(() => {
    const requiredIds: ElementId[] = [
      "logo",
      "color-palette",
      "font",
      "art-style",
    ];

    const missing = requiredIds.filter(
      (id) => !project.elements[id].checkedVariationId,
    );

    if (missing.length > 0) {
      toast.error(
        "Visual Snapshot requirements not met: Logo, Color Palette, Typography, and Art Style must each have at least one selected card.",
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
    setBriefExpanded(true);
    setVsPanelExpanded(true);
    setVcPanelExpanded(true);
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
    project,
    projectRef,
    setProject,
    resetToEmpty,
    uploadingVariationIdsRef,
    pipelineStageRef,
  });

  const toggleBriefExpanded = useCallback(() => {
    setBriefExpanded((prev) => {
      const next = !prev;
      if (next) {
        setVsPanelExpanded(false);
      } else if (project.phase === "curating") {
        setVcPanelExpanded(true);
      }
      return next;
    });
  }, [project.phase]);

  // Initial panel state: expand brief when brief is not yet complete; show VC/VS panels when it is
  useEffect(() => {
    if (!isLoaded || initPanelRef.current) return;
    initPanelRef.current = true;
    const complete = isBriefComplete(project.brandBrief.current);
    setBriefExpanded(!complete);
    setVsPanelExpanded(complete);
    setVcPanelExpanded(complete);
  }, [isLoaded, project]);

  // ── Generate Brand Direction ──────────────────────────────────────────────
  const handleGenerateDirection = useCallback(async (snapshotId: string) => {

    setIsPreparingDirection(true);
    const currentProject = projectRef.current;
    const resolvedFromCurrent = resolveSnapshotData(currentProject, snapshotId);
    if (!resolvedFromCurrent) {
      setIsPreparingDirection(false);
      toast.error("Selected snapshot is no longer available.");
      return;
    }

    const conceptDataForDirection = resolveVisualConceptForDirection(
      currentProject.elements,
      resolvedFromCurrent.elementData["visual-concept"],
    );
    const hasConcept = !!conceptDataForDirection;
    setDirectionOverlayLabel(
      hasConcept ? "writing the rationale..." : "working on the concept...",
    );

    const existingForSnapshot = currentProject.direction.versions.find(
      (v) => v.boundSnapshotId === snapshotId,
    );
    const nextVersionId = existingForSnapshot?.id ?? `gv-${Date.now()}`;
    const generatedLabel = conceptDataForDirection?.concept?.trim() || "Generated direction";

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
        const brief = resolvedFromCurrent.brandBrief;
        const keywords = resolvedFromCurrent.brandBrief.keywords ?? [];
        const colorPalette =
          (resolvedFromCurrent.elementData["color-palette"] as string[] | undefined) ?? [];
        const conceptData = conceptDataForDirection;
        const concept = conceptData?.concept;
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
          visualConcept: conceptData,
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
                      logoImageUrl,
                      brandInContextDescription:
                        data.brandInContextDescription ??
                        "Real-world application of the identity system across digital and physical touchpoints.",
                      visualConceptContent: data.visualConceptContent,
                      visualConceptName: concept?.trim() || data.synthesizedVisualConcept?.trim(),
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
      console.warn("Direction pre-generation skipped; opening Direction Page for retry:", err);
      setPreviousRoute(routeRef.current);
      setIsDirectionPanelOpen(false);
      setRoute("direction");
    } finally {
      setIsPreparingDirection(false);
    }
  }, [setProject, projectRef, setPreviousRoute, setRoute]);

  const handleViewBrandDirection = useCallback((snapshotId: string) => {
    const version = project.direction.versions.find((v) => v.boundSnapshotId === snapshotId);
    if (!version) return;
    setProject((prev) => ({
      ...prev,
      direction: { ...prev.direction, activeVersionId: version.id },
    }));
    setPreviousRoute(routeRef.current);
    setIsDirectionPanelOpen(false);
    setRoute("direction");
  }, [project.direction.versions, setProject, setPreviousRoute, setRoute]);

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
    (fields: BrandBriefFields) => {
      setProject((prev) => ({
        ...prev,
        brandBrief: {
          ...prev.brandBrief,
          current: {
            name: fields.brandName,
            tagline: fields.tagline,
            description: fields.brandDescription,
            targetAudience: fields.targetAudience,
            keywords: parseTagList(fields.keywords),
            applications: parseTagList(fields.applications),
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
      if (id === "visual-concept") continue;
      const checked = project.elements[id].checkedVariationId;
      if (checked) set.add(checked);
    }
    return set;
  }, [project.elements]);

  // Enrich direction versions with snapshotImageUrl derived from project.snapshots
  const snapshotIdsWithDirection = useMemo(
    () => new Set(project.direction.versions.map((v) => v.boundSnapshotId).filter(Boolean) as string[]),
    [project.direction.versions],
  );

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
            brandSummary={project.brandBrief.current}
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
            onAddVariation={handleAddVariation}
            onAddConcept={handleAddConceptWithPipeline}
            onUploadVariation={handleUploadVariation}
            onUploadImageForPalette={(elementType, file) => {
              if (elementType === "color-palette") handleExtractPaletteFromImage(file);
            }}
            loadingElementIds={loadingElements}
            onMergeSlot={(sourceId, targetId, sourceVarId) => {
              if (sourceVarId && uploadingVariationIds.has(sourceVarId)) return;
              handleMergeSlot(sourceId, targetId, sourceVarId);
            }}
            onMergeCard={(sourceId, targetId, sourceVarId, targetVarId) => {
              if ((sourceVarId && uploadingVariationIds.has(sourceVarId)) || uploadingVariationIds.has(targetVarId)) return;
              handleMergeCard(sourceId, targetId, sourceVarId, targetVarId);
            }}
            onMoveVariationToQueue={(sourceId, targetId, variationId) => {
              if (uploadingVariationIds.has(variationId)) return;
              handleMoveVariationToQueue(sourceId, targetId, variationId);
            }}
            onCommentModify={handleCommentModify}
            mergingVariationIds={mergingVariationIds}
            mergingElementTypes={mergingElementTypes}
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
            snapshotIdsWithDirection={snapshotIdsWithDirection}
            snapshotGenerating={loadingElements.has("visual-snapshot")}
            vsPanelExpanded={vsPanelExpanded}
            vcPanelExpanded={vcPanelExpanded && !briefExpanded}
            briefExpanded={briefExpanded}
            leftPanelActive={briefExpanded || vcPanelExpanded}
            uploadingVariationIds={uploadingVariationIds}
            onUpdateVariationOrder={handleUpdateVariationOrder}
            onSnapshotMerge={(sourceElementType, sourceVariationId, targetSnapshotId) => {
              regenerateWithOverride(targetSnapshotId, sourceElementType as ElementId, sourceVariationId);
            }}
            briefContent={
              <BriefContextCard
                expanded={briefExpanded}
                onToggleExpanded={toggleBriefExpanded}
                projectPhase={project.phase}
                brandBrief={project.brandBrief.current}
                isGenerating={pipelineStage !== null}
                isBrandGenerating={isBrandGenerating}
                onBriefSubmit={handleBriefSubmit}
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
                preEnhanceSnapshot={preEnhanceSnapshot}
                onRevertField={revertField}
                generatedTagsByField={generatedTagsByField}
                pipelineStage={pipelineStage}
              />
            }
          />

          <div className="absolute top-3 right-3 z-30 flex flex-row items-center gap-2">
            <ProjectSwitcher
              currentProjectId={currentProjectId}
              projects={projectIndex}
              onSwitch={handleSwitchProject}
              onNew={() => {
                setBriefExpanded(true);
                setVsPanelExpanded(false);
                setVcPanelExpanded(false);
                handleNewProjectBase();
              }}
              onDelete={handleDeleteProject}
            />
            {project.phase !== "empty" && (
              <button
                onClick={() => {
                  if (vsPanelExpanded) {
                    setVsPanelExpanded(false);
                  } else {
                    setVsPanelExpanded(true);
                    setIsDirectionPanelOpen(false);
                  }
                }}
                className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg border shadow-sm transition-colors cursor-pointer ${
                  vsPanelExpanded
                    ? "bg-blue-50 border-blue-200 text-blue-400"
                    : "bg-white/90 border-border/60 text-muted-foreground hover:text-foreground"
                }`}
                title={
                  vsPanelExpanded
                    ? "Hide Visual Snapshot panel"
                    : "Show Visual Snapshot panel"
                }
              >
                <GitCompare size={16} />
                <span className="font-medium" style={{ fontSize: TYPE.size.base }}>
                  Visual Snapshot
                </span>
              </button>
            )}
            {project.direction.versions.length > 0 && (
              <button
                onClick={() => {
                  if (isDirectionPanelOpen) {
                    setIsDirectionPanelOpen(false);
                  } else {
                    setIsDirectionPanelOpen(true);
                    setVsPanelExpanded(false);
                  }
                }}
                className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg border shadow-sm transition-colors cursor-pointer ${
                  isDirectionPanelOpen
                    ? "bg-blue-50 border-blue-200 text-blue-400"
                    : "bg-white/90 border-border/60 text-muted-foreground hover:text-foreground"
                }`}
                title={isDirectionPanelOpen ? "Hide direction panel" : "View brand direction"}
              >
                <GalleryVerticalEnd size={16} />
                <span className="text-[13px] font-medium">Direction</span>
              </button>
            )}
          </div>
        </div>

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
      {import.meta.env.DEV && (
        <PipelineDebugPanel
          debugEnabled={debugEnabled}
          setDebugEnabled={setDebugEnabled}
          stageLogs={stageLogs}
          activeStageId={activeStageId}
          selectedStageId={selectedStageId}
          setSelectedStageId={setSelectedStageId}
          continueStage={continueStage}
          skipRemaining={skipRemaining}
          abortPipeline={abortPipeline}
          editStageRequest={editStageRequest}
          editStagePrompts={editStagePrompts}
          clearLogs={clearLogs}
        />
      )}
    </div>
  );
}
