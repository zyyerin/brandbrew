import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Pencil, FileText, Image, NotebookPen } from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "./components/ui/sonner";
import { CurationBoard } from "./components/curation-board";
import { GuidelinePage } from "./components/guideline-page";
import { GuidelineAll } from "./components/guideline-all";
import type { BrandSummaryFields, BriefGeneratedKey } from "./components/brand-summary";
import { BrandSummaryPanel } from "./components/brand-summary";
import { ProjectSwitcher } from "./components/project-switcher";
import { SUGGESTIONS } from "./constants/suggestions";
import type {
  ProjectData,
  ElementId,
  AppRoute,
  Variation,
} from "./types/project";
import {
  createEmptyProject,
  ALL_ELEMENT_IDS,
  ELEMENT_LABELS,
  getActiveElementData,
  getActiveVariation,
  resolveSnapshotData,
} from "./types/project";
import { projectDataToLegacy } from "./utils/project-migration";
import { generateGuideline } from "./utils/generate-brand";
import { useVariations } from "./hooks/useVariations";
import { useSnapshotHistory } from "./hooks/useSnapshotHistory";
import { useProjectPersistence } from "./hooks/useProjectPersistence";
import { useBrandGeneration } from "./hooks/useBrandGeneration";
import type { BoardDisplayPhase } from "./hooks/useBrandGeneration";

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
  const [vsPanelExpanded, setVsPanelExpanded] = useState(true);
  const [isPreparingGuideline, setIsPreparingGuideline] = useState(false);
  const [guidelineOverlayLabel, setGuidelineOverlayLabel] = useState("working on the concept...");

  const generationCounter = useRef(0);

  // ── Variations ──────────────────────────────────────────────────────────────
  const {
    boardVariationCounts,
    handleSelectVariationForCard,
    handleToggleVariationChecked: handleToggleVariationCheckedBase,
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
    isEnhancing,
    isAutoCompleting,
    generatedBriefFields,
    setGeneratedBriefFields,
    loadingElements,
    setLoadingElements,
    mergingElementIds,
    displayPhase,
    setDisplayPhase,
    handleBrandSummarySubmit,
    handleSuggestionClick,
    handleEnhanceBrief,
    handleAutoComplete,
    handleFieldAutoFill,
    autoFillingFieldKey,
    handleGenerateRegenerate,
    handleMerge,
    handleCommentModify,
    handleUploadVariation,
  } = useBrandGeneration({
    project,
    setProject,
    projectRef,
    generationCounterRef: generationCounter,
  });

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
      "layout",
    ];

    const missing = requiredIds.filter(
      (id) => !project.elements[id].checkedVariationId,
    );

    if (missing.length > 0) {
      toast.error(
        "Visual Snapshot requirements not met: Logo, Color Palette, Typography, and Layout must each have at least one selected card.",
        { duration: 3000 },
      );
      return;
    }

    generateVisualSnapshot();
  }, [project.elements, generateVisualSnapshot]);

  // ── Toggle checked + clear snapshot selection ──────────────────────────────
  const handleToggleVariationChecked = useCallback(
    (elementId: string, variationId: string) => {
      setProject((prev) => ({ ...prev, selectedSnapshotId: null }));
      handleToggleVariationCheckedBase(elementId, variationId);
    },
    [handleToggleVariationCheckedBase, setProject],
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
    setDisplayPhase("empty");
    setLoadingElements(new Set());
    generationCounter.current = 0;
  }, [setIsBrandGenerating, setGeneratedBriefFields, setDisplayPhase, setLoadingElements]);

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
  });

  // Sync displayPhase from project.phase on load
  useEffect(() => {
    if (!isLoaded) return;
    if (project.phase === "empty") setDisplayPhase("empty");
    else if (project.phase === "curating") setDisplayPhase("visual-complete");
  }, [isLoaded, project.phase, setDisplayPhase]);

  // ── Generate Brand Guideline ──────────────────────────────────────────────
  const handleGenerateGuideline = useCallback(async () => {
    const snapshotId = project.selectedSnapshotId;
    if (!snapshotId) return;

    setIsPreparingGuideline(true);
    const currentProject = projectRef.current;
    const resolvedFromCurrent = resolveSnapshotData(currentProject, snapshotId);
    if (!resolvedFromCurrent) {
      setIsPreparingGuideline(false);
      toast.error("Selected snapshot is no longer available.");
      return;
    }

    const snapshotConcept = resolvedFromCurrent.elementData["visual-concept"] as
      | { conceptName?: string; points?: string[] }
      | undefined;
    const shouldPreGenerateConcept =
      !snapshotConcept?.conceptName?.trim() || !Array.isArray(snapshotConcept.points);
    setGuidelineOverlayLabel(
      shouldPreGenerateConcept ? "working on the concept..." : "writing the rationale...",
    );

    const existingForSnapshot = currentProject.guideline.versions.find(
      (v) => v.boundSnapshotId === snapshotId,
    );
    const nextVersionId = existingForSnapshot?.id ?? `gv-${Date.now()}`;
    const generatedLabel = snapshotConcept?.conceptName?.trim() || "Generated guideline";

    setProject((prev) => {
      const prevExisting = prev.guideline.versions.find((v) => v.boundSnapshotId === snapshotId);
      const targetVersionId = prevExisting?.id ?? nextVersionId;
      const versions = prevExisting
        ? prev.guideline.versions.map((v) =>
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
              cache: undefined,
            },
            ...prev.guideline.versions,
          ];

      return {
        ...prev,
        guideline: {
          ...prev.guideline,
          versions,
          activeVersionId: targetVersionId,
        },
      };
    });

    try {
      if (shouldPreGenerateConcept) {
        const brief = resolvedFromCurrent.brandSummary;
        const keywords = resolvedFromCurrent.brandSummary.keywords ?? [];
        const colorPalette =
          (resolvedFromCurrent.elementData["color-palette"] as string[] | undefined) ?? [];
        const concept = resolvedFromCurrent.elementData["visual-concept"] as
          | { conceptName: string; points: string[] }
          | undefined;
        const artStyle = resolvedFromCurrent.elementData["art-style"] as { imageUrl: string } | undefined;
        const font = resolvedFromCurrent.elementData["font"] as
          | { titleFont: string; bodyFont: string }
          | undefined;
        const logoImageUrl = (
          resolvedFromCurrent.elementData["logo"] as { imageUrl?: string } | undefined
        )?.imageUrl;
        const artStyleImageUrl = artStyle?.imageUrl ?? resolvedFromCurrent.snapshot.imageUrl;

        const data = await generateGuideline({
          brandBrief: brief,
          keywords,
          colorPalette,
          visualConcept: concept,
          artStyle,
          font,
          logoImageUrl,
          artStyleImageUrl,
        });

        setProject((prev) => ({
          ...prev,
          guideline: {
            ...prev.guideline,
            versions: prev.guideline.versions.map((v) =>
              v.id === nextVersionId
                ? {
                    ...v,
                    label: data.synthesizedVisualConcept?.conceptName?.trim() || v.label,
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
                      synthesizedVisualConcept: data.synthesizedVisualConcept,
                    },
                  }
                : v,
            ),
          },
        }));
      } else {
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }

      setPreviousRoute(routeRef.current);
      setRoute("guideline");
    } catch (err) {
      console.error("Guideline pre-generation failed:", err);
      toast.error("Could not prepare the concept. Please try again.");
    } finally {
      setIsPreparingGuideline(false);
    }
  }, [project.selectedSnapshotId, setProject, projectRef, setPreviousRoute, setRoute]);

  const handleBackFromGuideline = useCallback(() => {
    setProject((prev) => ({
      ...prev,
      guideline: { ...prev.guideline, activeVersionId: null },
    }));
    const target = previousRoute ?? "board";
    setPreviousRoute(null);
    setRoute(target);
  }, [setProject, previousRoute]);

  const handleApplicationsChange = useCallback(
    (apps: string[]) => {
      setProject((prev) => ({ ...prev, guidelineApplications: apps }));
    },
    [setProject],
  );

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
          },
        },
      }));
    },
    [setProject],
  );

  // ── Bridge: derive legacy shapes for unmigrated components ────────────────
  const legacy = useMemo(() => projectDataToLegacy(project), [project]);

  const legacyBrandData = legacy.brandData;

  const legacyPhase = useMemo((): string => {
    if (route === "guideline") return "guideline";
    if (route === "guideline-all") return "guideline-all";
    return displayPhase;
  }, [route, displayPhase]);

  const allVariationsByCard = useMemo(() => {
    const typeMap: Record<string, string> = {
      "visual-concept": "visual-concept",
      "art-style": "art-style",
      "color-palette": "color",
      "font": "font",
      "logo": "logo",
      "layout": "layout",
    };
    const map: Record<string, Array<{
      id: string;
      label: string;
      type: string;
      data: any;
      isOriginal?: boolean;
      createdAt: Date;
      meta?: import("./types/project").CardMeta;
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

  const activeVariationByCard = useMemo(() => {
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

  // Convert GuidelineVersion[] for the legacy guideline components
  const legacyGuidelineVersions = useMemo(() => {
    return project.guideline.versions.map((v) => {
      const resolved = v.boundSnapshotId
        ? resolveSnapshotData(project, v.boundSnapshotId)
        : null;

      const snapshotBvi = resolved
        ? {
            brandBrief: {
              name: resolved.brandSummary.name,
              tagline: resolved.brandSummary.tagline,
              description: resolved.brandSummary.description,
            },
            targetAudience: resolved.brandSummary.targetAudience,
            keywords: resolved.brandSummary.keywords,
            colorPalette: resolved.elementData["color-palette"] as string[] | undefined,
            visualConcept: resolved.elementData["visual-concept"] as
              | { conceptName: string; points: string[] }
              | undefined,
            artStyle: resolved.elementData["art-style"] as { imageUrl: string } | undefined,
            font: resolved.elementData["font"] as
              | { titleFont: string; bodyFont: string }
              | undefined,
            logoInspiration: resolved.elementData["logo"] as { imageUrl: string } | undefined,
            layout: resolved.elementData["layout"] as { imageUrl: string } | undefined,
            styleReferences: resolved.snapshot.imageUrl
              ? [{ id: "snap", imageUrl: resolved.snapshot.imageUrl, label: "Visual Snapshot" }]
              : undefined,
            guidelineApplications: project.guidelineApplications,
          }
        : undefined;

      return {
        id: v.id,
        label: v.label,
        createdAt: v.createdAt,
        snapshotId: v.boundSnapshotId ?? undefined,
        snapshotImageUrl: v.boundSnapshotId
          ? project.snapshots.find((s) => s.id === v.boundSnapshotId)?.imageUrl
          : undefined,
        snapshotBvi,
        guidelineCache: v.cache
          ? {
              rationales: v.cache.rationales,
              colorNames: v.cache.colorNames,
              brandInContextDescription: v.cache.brandInContextDescription,
              contextImageUrls: v.cache.contextImageUrls,
              synthesizedVisualConcept: v.cache.synthesizedVisualConcept,
            }
          : undefined,
      };
    });
  }, [
    project.guideline.versions,
    project.snapshots,
    project.elements,
    project.brandSummary,
    project.guidelineApplications,
  ]);

  // ── Render: Guideline pages ───────────────────────────────────────────────
  if (route === "guideline") {
    return (
      <GuidelinePage
        brandData={legacyBrandData as any}
        onBack={handleBackFromGuideline}
        versions={legacyGuidelineVersions}
        onVersionsChange={(updater) => {
          setProject((prev) => {
            const prevLegacyVersions = prev.guideline.versions.map((v) => {
              const resolved = v.boundSnapshotId
                ? resolveSnapshotData(prev, v.boundSnapshotId)
                : null;

              const snapshotBvi = resolved
                ? {
                    brandBrief: {
                      name: resolved.brandSummary.name,
                      tagline: resolved.brandSummary.tagline,
                      description: resolved.brandSummary.description,
                    },
                    targetAudience: resolved.brandSummary.targetAudience,
                    keywords: resolved.brandSummary.keywords,
                    colorPalette: resolved.elementData["color-palette"] as string[] | undefined,
                    visualConcept: resolved.elementData["visual-concept"] as
                      | { conceptName: string; points: string[] }
                      | undefined,
                    artStyle: resolved.elementData["art-style"] as { imageUrl: string } | undefined,
                    font: resolved.elementData["font"] as
                      | { titleFont: string; bodyFont: string }
                      | undefined,
                    logoInspiration: resolved.elementData["logo"] as { imageUrl: string } | undefined,
                    layout: resolved.elementData["layout"] as { imageUrl: string } | undefined,
                    styleReferences: resolved.snapshot.imageUrl
                      ? [{ id: "snap", imageUrl: resolved.snapshot.imageUrl, label: "Visual Snapshot" }]
                      : undefined,
                    guidelineApplications: prev.guidelineApplications,
                  }
                : undefined;

              return {
                id: v.id,
                label: v.label,
                createdAt: v.createdAt,
                snapshotId: v.boundSnapshotId ?? undefined,
                snapshotImageUrl: v.boundSnapshotId
                  ? prev.snapshots.find((s) => s.id === v.boundSnapshotId)?.imageUrl
                  : undefined,
                snapshotBvi,
                guidelineCache: v.cache
                  ? {
                      rationales: v.cache.rationales,
                      colorNames: v.cache.colorNames,
                      brandInContextDescription: v.cache.brandInContextDescription,
                      contextImageUrls: v.cache.contextImageUrls,
                      synthesizedVisualConcept: v.cache.synthesizedVisualConcept,
                    }
                  : undefined,
              };
            });

            const newVersions =
              typeof updater === "function"
                ? updater(prevLegacyVersions)
                : updater;

            return {
              ...prev,
              guideline: {
                ...prev.guideline,
                versions: newVersions.map((v: any) => ({
                  id: v.id,
                  label: v.label,
                  createdAt: v.createdAt,
                  boundSnapshotId: v.snapshotId ?? null,
                  cache: v.guidelineCache
                    ? {
                        rationales: {
                          logo: v.guidelineCache.rationales.logo ?? "",
                          color: v.guidelineCache.rationales.color ?? "",
                          typography: v.guidelineCache.rationales.typography ?? "",
                          artStyle: v.guidelineCache.rationales.artStyle ?? "",
                        },
                        colorNames: (v.guidelineCache.colorNames ?? []).map((c: any) => ({
                          hex: c.hex,
                          name: c.name,
                        })),
                        brandInContextDescription: v.guidelineCache.brandInContextDescription ?? "",
                        contextImageUrls: v.guidelineCache.contextImageUrls
                          ? [...v.guidelineCache.contextImageUrls]
                          : undefined,
                        synthesizedVisualConcept: v.guidelineCache.synthesizedVisualConcept,
                      }
                    : undefined,
                })),
              },
            };
          });
        }}
        initialActiveVersionId={
          project.guideline.activeVersionId ?? undefined
        }
      />
    );
  }

  if (route === "guideline-all") {
    const visualSnapshotUrl = project.snapshots[0]?.imageUrl;
    return (
      <GuidelineAll
        versions={legacyGuidelineVersions}
        onBack={() => {
          const target = previousRoute ?? "board";
          setPreviousRoute(null);
          setRoute(target);
        }}
        visualSnapshotUrl={visualSnapshotUrl}
        onSelectVersion={(version) => {
          setPreviousRoute("guideline-all");
          setProject((prev) => ({
            ...prev,
            guideline: {
              ...prev.guideline,
              activeVersionId: version.id,
            },
          }));
          setRoute("guideline");
        }}
        onDeleteVersion={(version) => {
          if (!window.confirm(`Delete "${version.label}"? This cannot be undone.`)) return;
          setProject((prev) => {
            const remaining = prev.guideline.versions.filter((v) => v.id !== version.id);
            return {
              ...prev,
              guideline: {
                ...prev.guideline,
                versions: remaining,
                activeVersionId:
                  prev.guideline.activeVersionId === version.id
                    ? (remaining[0]?.id ?? null)
                    : prev.guideline.activeVersionId,
              },
            };
          });
        }}
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
            brandData={legacyBrandData as any}
            phase={legacyPhase as any}
            suggestions={project.phase === "empty" ? SUGGESTIONS : undefined}
            onSuggestionClick={handleSuggestionClick}
            variationCounts={boardVariationCounts}
            onEditSave={(componentId: string, patch: any) => {
              const eid = componentId as ElementId;
              const fieldMap: Record<string, string> = {
                "brand-brief": "brandBrief",
                "color-palette": "colorPalette",
                "visual-concept": "visualConcept",
                "art-style": "artStyle",
                "font": "font",
              };
              const field = fieldMap[componentId];
              let data: unknown;
              if (componentId === "color-palette" && patch.colorPalette) {
                data = patch.colorPalette;
              } else if (field && patch[field]) {
                data = patch[field];
              }
              if (data != null && ALL_ELEMENT_IDS.includes(eid as any)) {
                handleEditSave(componentId, data);
              }
            }}
            onRefresh={handleGenerateRegenerate}
            onAddVariation={handleGenerateRegenerate}
            onUploadVariation={handleUploadVariation}
            loadingElementIds={loadingElements}
            onMerge={handleMerge}
            onCommentModify={handleCommentModify}
            mergingCardIds={
              new Set([...mergingElementIds, ...loadingElements])
            }
            allVariationsByCard={allVariationsByCard}
            activeVariationByCard={activeVariationByCard}
            onSelectVariation={handleSelectVariationForCard}
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
            snapshotHistory={project.snapshots.map((s) => ({
              id: s.id,
              imageUrl: s.imageUrl,
              createdAt: s.createdAt,
              sourceVariationIds: Object.values(s.sourceSelections),
              generationMeta: s.generationMeta,
            }))}
            selectedSnapshotId={project.selectedSnapshotId}
            onSelectSnapshot={handleSelectSnapshot}
            onDeleteSnapshot={handleDeleteSnapshot}
            onGenerateSnapshot={handleGenerateSnapshotWithValidation}
            onGenerateBrandGuideline={handleGenerateGuideline}
            snapshotGenerating={loadingElements.has("visual-snapshot")}
            vsPanelExpanded={vsPanelExpanded}
          />

          <div className="absolute top-3 right-3 z-20 flex flex-row items-center gap-2">
            <ProjectSwitcher
              currentProjectId={currentProjectId}
              projects={projectIndex}
              onSwitch={handleSwitchProject}
              onNew={() => {
                setIsPanelOpen(true);
                handleNewProjectBase();
              }}
              onDelete={handleDeleteProject}
              onSaveNow={handleSaveNow}
            />
            {project.guideline.versions.length > 0 && (
              <button
                onClick={() => {
                  setPreviousRoute(route);
                  setRoute("guideline-all");
                }}
                className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-white/90 border border-border/60 shadow-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                title="View all guideline versions"
              >
                <FileText size={16} />
                <span className="text-[13px] font-medium">Brand Guideline</span>
              </button>
            )}
            <button
              onClick={() => setIsPanelOpen((v) => !v)}
              className={`p-2 rounded-lg border shadow-sm transition-colors cursor-pointer ${
                isPanelOpen
                  ? "bg-blue-50 text-blue-400"
                  : "bg-white/90 border-border/60 text-muted-foreground hover:text-foreground"
              }`}
              title={isPanelOpen ? "Close side panel" : "Open side panel"}
            >
              <NotebookPen size={16} />
            </button>
            {project.phase !== "empty" && (
              <button
                onClick={() => setVsPanelExpanded((v) => !v)}
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
                <Image size={16} />
              </button>
            )}
          </div>
        </div>

        {isPanelOpen && (
          <BrandSummaryPanel
            onClose={() => setIsPanelOpen(false)}
            brandData={legacyBrandData as any}
            phase={legacyPhase as any}
            onBrandSummarySubmit={handleBrandSummarySubmit}
            isBrandGenerating={isBrandGenerating}
            onApplicationsChange={handleApplicationsChange}
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
          />
        )}
      </div>
      {isPreparingGuideline && (
        <div className="fixed inset-0 z-[200] bg-black/45 backdrop-blur-[1px] flex items-center justify-center pointer-events-auto">
          <div className="px-5 py-4 rounded-xl bg-white shadow-xl border border-border/60 text-center">
            <div className="mx-auto mb-2 w-6 h-6 border-2 border-muted-foreground/25 border-t-muted-foreground/80 rounded-full animate-spin" />
            <p className="text-[13px] font-medium text-foreground">
              {guidelineOverlayLabel}
            </p>
          </div>
        </div>
      )}
      <Toaster position="top-center" richColors />
    </div>
  );
}
