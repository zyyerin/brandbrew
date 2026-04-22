export interface BuildPromptInput {
  /** Omit or leave empty to skip the `[ROLE]` block (e.g. visual-designer text routes). */
  persona?: string;
  taskDescription: string;
  contextBody?: string;
  rules?: string[];
  extraBlocks?: string[];
}

export function buildPrompt({
  persona,
  taskDescription,
  contextBody,
  rules = [],
  extraBlocks = [],
}: BuildPromptInput): string {
  const sections: string[] = [];
  if (persona !== undefined && persona.trim().length > 0) {
    sections.push(`[ROLE]\n${persona.trim()}`);
  }
  sections.push(`[TASK]\n${taskDescription.trim()}`);
  if (rules.length > 0) {
    sections.push(`[RULES]\n${rules.join("\n")}`);
  }
  if (contextBody !== undefined && contextBody.trim().length > 0) {
    sections.push(`[CONTEXT]\n${contextBody.trim()}`);
  }
  for (const block of extraBlocks) {
    if (block?.trim()) sections.push(block.trim());
  }
  return sections.filter((section) => section.trim().length > 0).join("\n\n");
}
