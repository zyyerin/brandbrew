import { useState, useRef, useEffect, useCallback, type MutableRefObject } from "react";
import { saveProject, loadProject } from "../utils/generate-brand";
import type { ProjectEntry } from "../components/project-switcher";
import { buildProjectSnapshot, hydrateProjectData } from "../utils/project-snapshot";
import type { ProjectData, PipelineStage } from "../types/project";
import { createEmptyProject } from "../types/project";
import {
  createNextProjectId,
  getOrCreateCurrentProjectId,
  setStoredCurrentProjectId,
} from "../utils/current-project-id";

const MAX_PROJECTS = 3;

export interface UseProjectPersistenceParams {
  project: ProjectData;
  projectRef: MutableRefObject<ProjectData>;
  setProject: React.Dispatch<React.SetStateAction<ProjectData>>;
  resetToEmpty: () => void;
  uploadingVariationIdsRef?: MutableRefObject<Set<string>>;
  pipelineStageRef: MutableRefObject<PipelineStage>;
}

export function useProjectPersistence({
  project,
  projectRef,
  setProject,
  resetToEmpty,
  uploadingVariationIdsRef,
  pipelineStageRef,
}: UseProjectPersistenceParams) {
  const [currentProjectId, setCurrentProjectId] = useState(
    () => getOrCreateCurrentProjectId(),
  );
  const [isLoaded, setIsLoaded] = useState(false);
  const [projectIndex, setProjectIndex] = useState<ProjectEntry[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("bb_projects") ?? "[]");
    } catch {
      return [];
    }
  });

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const projectIndexRef = useRef(projectIndex);
  const pendingSaveRef = useRef<{
    snapshot: Record<string, unknown>;
    projectId: string;
    name: string;
  } | null>(null);
  const saveLoopRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    setStoredCurrentProjectId(currentProjectId);
  }, [currentProjectId]);

  useEffect(() => {
    projectIndexRef.current = projectIndex;
    localStorage.setItem("bb_projects", JSON.stringify(projectIndex));
  }, [projectIndex]);

  const upsertIndex = useCallback((id: string, name: string) => {
    setProjectIndex((prev) => {
      const now = new Date().toISOString();
      const next = prev.filter((p) => p.id !== id);
      next.unshift({ id, name, savedAt: now });
      return next.slice(0, MAX_PROJECTS);
    });
  }, []);

  const removeFromIndex = useCallback((id: string) => {
    setProjectIndex((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const enqueueSave = useCallback((
    snapshot: Record<string, unknown>,
    projectId: string,
    name: string,
  ): Promise<void> => {
    pendingSaveRef.current = { snapshot, projectId, name };
    if (saveLoopRef.current) return saveLoopRef.current;

    const run = async () => {
      while (pendingSaveRef.current) {
        const next = pendingSaveRef.current;
        pendingSaveRef.current = null;
        await saveProject(next.snapshot, next.projectId);
        upsertIndex(next.projectId, next.name);
      }
    };

    saveLoopRef.current = run().finally(() => {
      saveLoopRef.current = null;
    });
    return saveLoopRef.current;
  }, [upsertIndex]);

  useEffect(() => {
    let cancelled = false;
    setIsLoaded(false);
    (async () => {
      try {
        const result = await loadProject(currentProjectId);
        if (cancelled || !result.found || !result.data) {
          setIsLoaded(true);
          return;
        }
        const restored = hydrateProjectData(result.data);
        setProject(restored);
        console.log("[Brand Brew] Project restored from server");
      } catch (err) {
        console.warn("[Brand Brew] Failed to load saved project:", err);
      } finally {
        if (!cancelled) setIsLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentProjectId, setProject]);

  useEffect(() => {
    if (!isLoaded) return;
    if (pipelineStageRef.current !== null) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (uploadingVariationIdsRef?.current && uploadingVariationIdsRef.current.size > 0) return;
      const p = projectRef.current;
      const snapshot = buildProjectSnapshot(p);
      const name = p.brandBrief.current.name || p.projectName;
      enqueueSave(snapshot, currentProjectId, name)
        .catch((err) => console.warn("[Brand Brew] Auto-save failed:", err));
    }, 2000);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [isLoaded, currentProjectId, upsertIndex, project, uploadingVariationIdsRef]);

  const doSave = useCallback(async () => {
    const p = projectRef.current;
    const snapshot = buildProjectSnapshot(p);
    const name = p.brandBrief.current.name || p.projectName;
    await enqueueSave(snapshot, currentProjectId, name);
  }, [projectRef, currentProjectId, enqueueSave]);

  const updateCurrentProjectId = useCallback((nextProjectId: string) => {
    setStoredCurrentProjectId(nextProjectId);
    setCurrentProjectId(nextProjectId);
  }, []);

  const handleSwitchProject = useCallback(
    async (targetId: string) => {
      if (targetId === currentProjectId) return;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      setIsLoaded(false);
      try {
        await doSave();
      } catch (err) {
        console.warn("[Brand Brew] Save before switch failed:", err);
      }
      resetToEmpty();
      updateCurrentProjectId(targetId);
    },
    [currentProjectId, doSave, resetToEmpty, updateCurrentProjectId],
  );

  const handleNewProject = useCallback(async () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setIsLoaded(false);
    try {
      await doSave();
    } catch (err) {
      console.warn("[Brand Brew] Save before new project failed:", err);
    }
    resetToEmpty();
    updateCurrentProjectId(createNextProjectId());
  }, [doSave, resetToEmpty, updateCurrentProjectId]);

  const handleDeleteProject = useCallback(
    (deletedId: string) => {
      removeFromIndex(deletedId);
      if (deletedId === currentProjectId) {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        setIsLoaded(false);
        resetToEmpty();
        const remaining = projectIndexRef.current.filter(
          (p) => p.id !== deletedId,
        );
        updateCurrentProjectId(
          remaining.length > 0 ? remaining[0].id : createNextProjectId(),
        );
      }
    },
    [currentProjectId, resetToEmpty, removeFromIndex, updateCurrentProjectId],
  );

  const handleSaveNow = useCallback(async () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    try {
      await doSave();
    } catch (err) {
      console.warn("[Brand Brew] Immediate save failed:", err);
      throw err;
    }
  }, [doSave]);

  return {
    currentProjectId,
    projectIndex,
    isLoaded,
    handleSwitchProject,
    handleNewProject,
    handleDeleteProject,
    handleSaveNow,
  };
}
