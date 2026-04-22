import { useState, useCallback, useRef } from "react";
import type { ProjectData, BrandBriefData } from "../types/project";
import type { BrandBriefFields, BriefGeneratedKey } from "../components/brand-brief";
import { briefFieldsSaturatedForAutoComplete } from "../components/brand-brief";
import type { AutoCompleteResult, AutoFillInput, AutoFillResult, AutoFillFieldName } from "../utils/generate-brand";
import { callApi } from "../utils/apiClient";
import { withDebugLog } from "../utils/debug-interceptor-utils";
import type { UseGenerationBaseParams } from "../utils/variation-helpers";
import type { PipelineBriefInput } from "./usePipeline";
import { SUGGESTION_PROMPTS } from "../constants/suggestions";

// ── Private helper ───────────────────────────────────────────────────────────

function fieldsToBrief(fields: BrandBriefFields) {
  return {
    name: fields.brandName?.trim() || "",
    tagline: fields.tagline?.trim() || "",
    description: fields.brandDescription?.trim() || "",
    targetAudience: fields.targetAudience?.trim() || "",
    keywords: fields.keywords
      ? fields.keywords.split(",").map((k) => k.trim()).filter(Boolean)
      : [],
    applications: fields.applications
      ? fields.applications.split(",").map((a) => a.trim()).filter(Boolean)
      : [],
  };
}

// Module-level field mappings (used inside useCallback).
const FIELD_TO_API: Record<keyof BrandBriefFields, AutoFillFieldName> = {
  brandName: "name", tagline: "tagline", brandDescription: "description",
  targetAudience: "targetAudience", keywords: "keywords", applications: "applications",
};

const FIELD_TO_BS_REVERT: Record<keyof BrandBriefFields, keyof BrandBriefData> = {
  brandName: "name", tagline: "tagline", brandDescription: "description",
  targetAudience: "targetAudience", keywords: "keywords", applications: "applications",
};

// Array fields: merge (append + deduplicate) on enhance.
const ARRAY_FIELDS = new Set<keyof BrandBriefFields>(["keywords", "applications"]);

// ── Types ────────────────────────────────────────────────────────────────────

export interface UseBriefCompletionReturn {
  isBrandGenerating: boolean;
  setIsBrandGenerating: React.Dispatch<React.SetStateAction<boolean>>;
  isAutoCompleting: boolean;
  generatedBriefFields: Set<BriefGeneratedKey>;
  setGeneratedBriefFields: React.Dispatch<React.SetStateAction<Set<BriefGeneratedKey>>>;
  autoFillingFieldKey: keyof BrandBriefFields | null;
  /** Pre-enhance value snapshot — present when a revert is available. */
  preEnhanceSnapshot: Partial<Record<keyof BrandBriefFields, string>>;
  /** Reverts a field to its pre-enhance snapshot and clears the snapshot. */
  revertField: (key: keyof BrandBriefFields) => void;
  /** Per-field set of AI-generated tag values (for keywords/applications colouring). */
  generatedTagsByField: Partial<Record<keyof BrandBriefFields, Set<string>>>;
  handleBriefSubmit: (fields: BrandBriefFields) => Promise<void>;
  handleSuggestionClick: (suggestion: string) => void;
  handleAutoComplete: (fields: BrandBriefFields) => Promise<void>;
  handleFieldAutoFill: (key: keyof BrandBriefFields, fields: BrandBriefFields) => Promise<void>;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useBriefCompletion({
  setProject,
  debugInterceptor,
  onRunPipeline,
}: UseGenerationBaseParams & {
  onRunPipeline: (input: PipelineBriefInput) => Promise<void>;
}): UseBriefCompletionReturn {
  const [isBrandGenerating, setIsBrandGenerating] = useState(false);
  const [isAutoCompleting, setIsAutoCompleting] = useState(false);
  const [generatedBriefFields, setGeneratedBriefFields] = useState<Set<BriefGeneratedKey>>(new Set());
  const generatedBriefFieldsRef = useRef(generatedBriefFields);
  generatedBriefFieldsRef.current = generatedBriefFields;
  const [autoFillingFieldKey, setAutoFillingFieldKey] = useState<keyof BrandBriefFields | null>(null);
  const brandGeneratingRef = useRef(false);
  const autoCompleteInFlightRef = useRef(false);
  const fieldFillInFlightRef = useRef(false);

  // ── Enhance-specific state ─────────────────────────────────────────────────
  const [preEnhanceSnapshot, setPreEnhanceSnapshot] = useState<Partial<Record<keyof BrandBriefFields, string>>>({});
  const [generatedTagsByField, setGeneratedTagsByField] = useState<Partial<Record<keyof BrandBriefFields, Set<string>>>>({});

  const revertField = useCallback((key: keyof BrandBriefFields) => {
    const snapshot = preEnhanceSnapshot[key];
    if (snapshot === undefined) return;
    setProject((prev) => {
      const bsKey = FIELD_TO_BS_REVERT[key];
      if (!bsKey) return prev;
      const brief = { ...prev.brandBrief.current };
      if (ARRAY_FIELDS.has(key)) {
        (brief as Record<string, unknown>)[bsKey] = snapshot
          ? snapshot.split(",").map((s) => s.trim()).filter(Boolean)
          : [];
      } else {
        (brief as Record<string, unknown>)[bsKey] = snapshot;
      }
      return { ...prev, brandBrief: { ...prev.brandBrief, current: brief } };
    });
    setPreEnhanceSnapshot((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    // Clear generated highlight on revert
    setGeneratedBriefFields((prev) => {
      if (!prev.has(key as BriefGeneratedKey)) return prev;
      const next = new Set(prev);
      next.delete(key as BriefGeneratedKey);
      return next;
    });
    // Clear per-tag colour tracking on revert
    setGeneratedTagsByField((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, [preEnhanceSnapshot, setProject]);

  const handleBriefSubmit = useCallback(
    async (fields: BrandBriefFields) => {
      if (brandGeneratingRef.current) return;
      brandGeneratingRef.current = true;
      setIsBrandGenerating(true);

      const briefData = fieldsToBrief(fields);

      setProject((prev) => {
        const briefVersionId = `brief-${Date.now()}`;
        const briefVersion = {
          id: briefVersionId,
          data: { ...briefData },
          createdAt: new Date(),
        };

        return {
          ...prev,
          projectName: fields.brandName?.trim() || prev.projectName,
          phase: "curating" as const,
          brandBrief: {
            current: briefData,
            versions: [...prev.brandBrief.versions, briefVersion],
          },
        };
      });

      try {
        await onRunPipeline({
          brandName: briefData.name,
          tagline: briefData.tagline,
          description: briefData.description,
          targetAudience: briefData.targetAudience,
          keywords: briefData.keywords,
          applications: briefData.applications,
        });
      } catch (err) {
        console.error("Brand generation error:", err);
      } finally {
        brandGeneratingRef.current = false;
        setIsBrandGenerating(false);
      }
    },
    [setProject, onRunPipeline],
  );

  const handleSuggestionClick = useCallback(
    (suggestion: string) => {
      const fields = SUGGESTION_PROMPTS[suggestion];
      if (fields) handleBriefSubmit(fields);
    },
    [handleBriefSubmit],
  );

  const handleAutoComplete = useCallback(
    async (fields: BrandBriefFields) => {
      if (autoCompleteInFlightRef.current) return;
      if (briefFieldsSaturatedForAutoComplete(fields)) return;
      autoCompleteInFlightRef.current = true;
      setIsAutoCompleting(true);
      setGeneratedBriefFields(new Set());
      try {
        const requestPayload = {
          partialBrief: {
            name: fields.brandName?.trim() || undefined,
            tagline: fields.tagline?.trim() || undefined,
            description: fields.brandDescription?.trim() || undefined,
          },
          targetAudience: fields.targetAudience?.trim() || undefined,
          keywords: fields.keywords?.trim() || undefined,
          applications: fields.applications?.trim()
            ? fields.applications.split(",").map((a) => a.trim()).filter(Boolean)
            : undefined,
        };

        const result = await withDebugLog(
          debugInterceptor,
          {
            label: "Auto Complete",
            agent: "brand-strategist",
            endpoint: "strategist/auto-complete",
            request: requestPayload as Record<string, unknown>,
          },
          // Return raw response (with _meta) so logCall can show _meta.prompt
          () => callApi<AutoCompleteResult & { _meta?: unknown }>(
            "auto-complete",
            { body: { partialBrief: requestPayload.partialBrief ?? {}, targetAudience: requestPayload.targetAudience ?? "", keywords: requestPayload.keywords ?? "" } },
          ),
        ).then((raw) => { const { _meta, ...data } = raw as any; return data as AutoCompleteResult; });

        const userKeywords = fields.keywords?.trim()
          ? fields.keywords.split(",").map((k) => k.trim()).filter(Boolean)
          : [];

        const userApplications = fields.applications?.trim()
          ? fields.applications.split(",").map((a) => a.trim()).filter(Boolean)
          : [];

        const merged = {
          name: fields.brandName?.trim() || result.brandBrief.name || "",
          tagline: fields.tagline?.trim() || result.brandBrief.tagline || "",
          description: fields.brandDescription?.trim() || result.brandBrief.description || "",
          targetAudience: fields.targetAudience?.trim() || result.targetAudience || "",
          keywords: userKeywords.length ? userKeywords : result.keywords ?? [],
          applications: userApplications.length ? userApplications : (result.applications ?? []),
        };

        const generated = new Set<BriefGeneratedKey>();
        if (!fields.brandName?.trim() && merged.name) generated.add("brandName");
        if (!fields.tagline?.trim() && merged.tagline) generated.add("tagline");
        if (!fields.brandDescription?.trim() && merged.description) generated.add("brandDescription");
        if (!fields.targetAudience?.trim() && merged.targetAudience) generated.add("targetAudience");
        if (!fields.keywords?.trim() && merged.keywords.length) generated.add("keywords");
        if (merged.applications.length > userApplications.length) generated.add("applications");

        setProject((prev) => ({
          ...prev,
          brandBrief: {
            ...prev.brandBrief,
            current: merged,
          },
        }));

        setGeneratedBriefFields(generated);
      } catch (err) {
        console.error("Auto-complete error:", err);
      } finally {
        autoCompleteInFlightRef.current = false;
        setIsAutoCompleting(false);
      }
    },
    [setProject, debugInterceptor],
  );

  const handleFieldAutoFill = useCallback(
    async (key: keyof BrandBriefFields, fields: BrandBriefFields) => {
      if (fieldFillInFlightRef.current) return;
      fieldFillInFlightRef.current = true;
      setAutoFillingFieldKey(key);
      try {
        const currentValue: string = fields[key]?.trim() ?? "";
        const hasExistingValue = currentValue.length > 0;
        const mode: "fill" | "enhance" = hasExistingValue ? "enhance" : "fill";

        const fillRequest: AutoFillInput = {
          targetField: FIELD_TO_API[key],
          existingValue: hasExistingValue ? currentValue : undefined,
          mode,
          brandBrief: {
            name: fields.brandName?.trim() || undefined,
            tagline: fields.tagline?.trim() || undefined,
            description: fields.brandDescription?.trim() || undefined,
            targetAudience: fields.targetAudience?.trim() || undefined,
            keywords: fields.keywords?.trim() || undefined,
            applications: fields.applications?.trim()
              ? fields.applications.split(",").map((a) => a.trim()).filter(Boolean)
              : undefined,
          },
        };

        const result = await withDebugLog(
          debugInterceptor,
          {
            label: `Auto ${mode === "enhance" ? "Enhance" : "Fill"}: ${key}`,
            agent: "brand-strategist",
            endpoint: "strategist/auto-fill",
            request: fillRequest as unknown as Record<string, unknown>,
          },
          () => callApi<AutoFillResult & { _meta?: unknown }>(
            "strategist/auto-fill",
            { body: fillRequest },
          ),
        ).then((raw) => { const { _meta, ...data } = raw as any; return data as AutoFillResult; });

        const bsKey = FIELD_TO_BS_REVERT[key];
        const nextGenerated = new Set(generatedBriefFieldsRef.current);

        // ── Path 1: Array field enhance → append new items, deduplicate ────
        if (mode === "enhance" && ARRAY_FIELDS.has(key)) {
          const newItems = Array.isArray(result.value) ? (result.value as string[]) : [];
          if (newItems.length > 0) {
            // Snapshot original value for undo
            setPreEnhanceSnapshot((prev) => ({ ...prev, [key]: currentValue }));
            let addedItems: string[] = [];
            setProject((prev) => {
              const brief = { ...prev.brandBrief.current };
              const existingArr: string[] = Array.isArray(brief[bsKey]) ? (brief[bsKey] as string[]) : [];
              const existingLower = new Set(existingArr.map((s) => s.toLowerCase()));
              addedItems = newItems.filter((s) => !existingLower.has(s.toLowerCase()));
              (brief as Record<string, unknown>)[bsKey] = [...existingArr, ...addedItems];
              return { ...prev, brandBrief: { ...prev.brandBrief, current: brief } };
            });
            // Track which tag values are AI-generated for per-tag colouring
            setGeneratedTagsByField((prev) => {
              const existing = prev[key] ?? new Set<string>();
              const merged = new Set([...existing, ...addedItems]);
              return { ...prev, [key]: merged };
            });
            nextGenerated.add(key as BriefGeneratedKey);
            setGeneratedBriefFields(nextGenerated);
          }
          return;
        }

        // ── Path 3: Long-text enhance / any fill → apply directly ──────────
        const val = result.value;
        let resolvedValue: unknown;
        if (bsKey === "keywords") {
          resolvedValue = Array.isArray(val) ? val : (typeof val === "string" ? [val] : undefined);
        } else if (bsKey === "applications") {
          resolvedValue = Array.isArray(val) ? val : undefined;
        } else {
          resolvedValue = typeof val === "string" ? val : undefined;
        }

        if (mode === "enhance") {
          setPreEnhanceSnapshot((prev) => ({ ...prev, [key]: currentValue }));
        }

        setProject((prev) => {
          const brief = { ...prev.brandBrief.current };
          const oldVal = brief[bsKey];
          const newVal = resolvedValue ?? oldVal;
          if (newVal !== oldVal || hasExistingValue) {
            (brief as Record<string, unknown>)[bsKey] = newVal;
            nextGenerated.add(key as BriefGeneratedKey);
          }
          return { ...prev, brandBrief: { ...prev.brandBrief, current: brief } };
        });

        setGeneratedBriefFields(nextGenerated);
      } catch (err) {
        console.error("Field auto-fill error:", err);
      } finally {
        fieldFillInFlightRef.current = false;
        setAutoFillingFieldKey((current) => (current === key ? null : current));
      }
    },
    [setProject, debugInterceptor, setPreEnhanceSnapshot, setGeneratedTagsByField],
  );

  return {
    isBrandGenerating,
    setIsBrandGenerating,
    isAutoCompleting,
    generatedBriefFields,
    setGeneratedBriefFields,
    autoFillingFieldKey,
    preEnhanceSnapshot,
    revertField,
    generatedTagsByField,
    handleBriefSubmit,
    handleSuggestionClick,
    handleAutoComplete,
    handleFieldAutoFill,
  };
}
