const CURRENT_PROJECT_ID_KEY = "bb_currentProjectId";

function createProjectId(): string {
  return `proj-${Date.now()}`;
}

export function getStoredCurrentProjectId(): string | null {
  const value = localStorage.getItem(CURRENT_PROJECT_ID_KEY);
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function getOrCreateCurrentProjectId(): string {
  return getStoredCurrentProjectId() ?? createProjectId();
}

export function setStoredCurrentProjectId(projectId: string): void {
  localStorage.setItem(CURRENT_PROJECT_ID_KEY, projectId);
}

export function createNextProjectId(): string {
  return createProjectId();
}

