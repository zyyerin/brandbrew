/**
 * Project serialization / deserialization.
 * Uses the new ProjectData model with automatic legacy migration.
 */
import type { ProjectData } from "../types/project";
import { serializeProjectData, deserializeProjectData } from "./project-migration";

export function buildProjectSnapshot(project: ProjectData): Record<string, unknown> {
  return serializeProjectData(project);
}

export function hydrateProjectData(raw: Record<string, unknown>): ProjectData {
  return deserializeProjectData(raw);
}
