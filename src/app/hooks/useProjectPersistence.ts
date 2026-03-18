import { useState, useRef, useEffect, useCallback, type MutableRefObject } from "react";
import { saveProject, loadProject } from "../utils/generate-brand";
import type { ProjectEntry } from "../components/project-switcher";
import { buildProjectSnapshot, hydrateProjectData } from "../utils/project-snapshot";
import type { ProjectData } from "../types/project";
import { createEmptyProject } from "../types/project";

const MAX_PROJECTS = 3;

export interface UseProjectPersistenceParams {
  projectRef: MutableRefObject<ProjectData>;
  setProject: React.Dispatch<React.SetStateAction<ProjectData>>;
  resetToEmpty: () => void;
}

export function useProjectPersistence({
  projectRef,
  setProject,
  resetToEmpty,
}: UseProjectPersistenceParams) {
  const [currentProjectId, setCurrentProjectId] = useState(
    () => localStorage.getItem("bb_currentProjectId") ?? "default",
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

  useEffect(() => {
    localStorage.setItem("bb_currentProjectId", currentProjectId);
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
    const p = projectRef.current;
    if (p.phase === "generating") return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const p = projectRef.current;
      const snapshot = buildProjectSnapshot(p);
      const name = p.brandSummary.current.name || p.projectName;
      saveProject(snapshot, currentProjectId)
        .then(() => upsertIndex(currentProjectId, name))
        .catch((err) => console.warn("[Brand Brew] Auto-save failed:", err));
    }, 2000);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [isLoaded, currentProjectId, upsertIndex, projectRef.current]);

  const doSave = useCallback(async () => {
    const p = projectRef.current;
    const snapshot = buildProjectSnapshot(p);
    const name = p.brandSummary.current.name || p.projectName;
    await saveProject(snapshot, currentProjectId);
    upsertIndex(currentProjectId, name);
  }, [projectRef, currentProjectId, upsertIndex]);

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
      setCurrentProjectId(targetId);
    },
    [currentProjectId, doSave, resetToEmpty],
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
    setCurrentProjectId(`proj-${Date.now()}`);
  }, [doSave, resetToEmpty]);

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
        setCurrentProjectId(
          remaining.length > 0 ? remaining[0].id : `proj-${Date.now()}`,
        );
      }
    },
    [currentProjectId, resetToEmpty, removeFromIndex],
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
