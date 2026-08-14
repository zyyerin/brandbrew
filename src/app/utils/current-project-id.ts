const CURRENT_PROJECT_ID_KEY = "bb_currentProjectId";

function padDatePart(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatProjectTimestamp(date: Date): string {
  return [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
  ].join("") + "-" + [
    padDatePart(date.getHours()),
    padDatePart(date.getMinutes()),
    padDatePart(date.getSeconds()),
  ].join("");
}

function createProjectSuffix(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  }
  return Math.random().toString(36).slice(2, 10).padEnd(8, "0");
}

export function createProjectId(
  date = new Date(),
  suffix = createProjectSuffix(),
): string {
  const safeSuffix = suffix.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8).padEnd(8, "0");
  return `proj-${formatProjectTimestamp(date)}-${safeSuffix}`;
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
