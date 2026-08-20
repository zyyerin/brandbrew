import { useState, useEffect, useImperativeHandle, forwardRef, useRef } from "react";
import { Sparkles, X, PanelRightClose, Undo2, ArrowRight } from "lucide-react";
import type { BrandBriefData, PipelineStage } from "../types/project";
import { LAYOUT, TYPE } from "../utils/design-tokens";
import { parseTagList } from "../utils/parse-tag-list";
import { CapsuleTagInput } from "./capsule-tag-input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";

export type BriefFieldKey = keyof BrandBriefFields;

export interface BrandBriefRef {
  getFields: () => BrandBriefFields;
}

interface BrandBriefProps {
  brandBrief: BrandBriefData;
  projectPhase: "empty" | "curating";
  isGenerating?: boolean;
  onSubmit?: (fields: BrandBriefFields) => void;
  onAutoComplete?: (fields: BrandBriefFields) => void;
  isAutoCompleting?: boolean;
  generatedBriefFields?: Set<BriefFieldKey>;
  onClearGeneratedField?: (key: BriefFieldKey) => void;
  /** Called on every keystroke so the parent can keep its own state in sync. */
  onFieldChange?: (fields: BrandBriefFields) => void;
  /** Called when the user clicks the per-field auto-complete button. */
  onFieldAutoFill?: (key: BriefFieldKey, fields: BrandBriefFields) => void;
  /** The field currently being auto-filled (single-field mode). */
  autoFillingFieldKey?: BriefFieldKey | null;
  /** Pre-enhance snapshots — a key's presence means a revert is available. */
  preEnhanceSnapshot?: Partial<Record<BriefFieldKey, string>>;
  /** Called when the user clicks the undo button next to a field. */
  onRevertField?: (key: BriefFieldKey) => void;
  /** Per-field set of AI-generated tag values for per-capsule colouring (keywords/applications). */
  generatedTagsByField?: Partial<Record<BriefFieldKey, Set<string>>>;
  /** When true, used inside a combined panel; no full height so content stacks. */
  embedded?: boolean;
  /** When true, only render form content (footer rendered by parent for fixed positioning). */
  contentOnly?: boolean;
  /** When set, disables only the batch Auto Complete control in an inline footer. Omit to derive from current fields. */
  autoCompleteDisabled?: boolean;
}

/** BriefGeneratedKey == BriefFieldKey — kept as alias for external consumers. */
export type BriefGeneratedKey = BriefFieldKey;

/** True when at least one of name, tagline, description, targetAudience, or keywords is non-empty. */
function hasMeaningfulBrief(s: BrandBriefData): boolean {
  return !!(
    s.name?.trim() ||
    s.tagline?.trim() ||
    s.description?.trim() ||
    s.targetAudience?.trim() ||
    (s.keywords && s.keywords.length > 0)
  );
}

// ---------------------------------------------------------------------------
// Shared footer — used by BrandBriefForm (standalone) and BrandBriefPanel.
// ---------------------------------------------------------------------------
export interface BriefFooterProps {
  onAutoComplete: () => void;
  onGenerate: () => void;
  isGenerating: boolean;
  isAutoCompleting: boolean;
  /** Extra locked state (e.g. single-field auto-fill in progress). */
  isLocked?: boolean;
  /** When true, the "Auto Complete" button is rendered. */
  showAutoComplete?: boolean;
  /** When true, only the Auto Complete control is disabled (e.g. all fields already filled). */
  autoCompleteDisabled?: boolean;
  /** Current pipeline stage — drives the generate button label. */
  pipelineStage?: PipelineStage;
}

const PIPELINE_STAGE_LABELS: Record<NonNullable<PipelineStage>, string> = {
  conceptualizing: "Conceptualizing…",
  styling: "Styling…",
  drawing: "Drawing…",
  synthesizing: "Synthesizing…",
};

export function BriefFooter({ onAutoComplete, onGenerate, isGenerating, isAutoCompleting, isLocked = false, showAutoComplete = true, autoCompleteDisabled = false, pipelineStage }: BriefFooterProps) {
  const disabled = isGenerating || isAutoCompleting || isLocked;
  const autoCompleteBtnDisabled = disabled || autoCompleteDisabled;
  const generatingLabel = pipelineStage ? (PIPELINE_STAGE_LABELS[pipelineStage] ?? "Generating…") : "Generating…";
  const autoCompleteTooltip = isAutoCompleting
    ? "Auto completing…"
    : autoCompleteDisabled
      ? "All fields are filled"
      : "Auto Complete";
  return (
    <div className="shrink-0 border-t border-border/40 bg-white px-3 py-3 flex items-center gap-2">
      {showAutoComplete && (
        <TooltipProvider delayDuration={400}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onAutoComplete}
                disabled={autoCompleteBtnDisabled}
                className="shrink-0 flex items-center justify-center w-10 h-10 rounded-xl border border-border bg-muted/30 text-foreground hover:bg-muted/50 active:scale-[0.98] transition-all shadow-sm select-none disabled:opacity-50 disabled:pointer-events-none"
              >
                {isAutoCompleting ? (
                  <div className="w-3.5 h-3.5 border-2 border-foreground/30 border-t-foreground rounded-full animate-spin" />
                ) : (
                  <Sparkles size={13} />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">
              {autoCompleteTooltip}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      <button
        type="button"
        onClick={onGenerate}
        disabled={disabled}
        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl font-semibold bg-foreground text-white hover:bg-foreground/85 active:scale-[0.98] transition-all shadow-sm select-none disabled:opacity-50 disabled:pointer-events-none"
        style={{ fontSize: TYPE.size.base }}
      >
        {isGenerating ? (
          <>
            <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            {generatingLabel}
          </>
        ) : (
          <>
            <ArrowRight size={15} />
            Generate Visual Concept
          </>
        )}
      </button>
    </div>
  );
}

// Form projection of the Brand Brief fields used by the side panel.
export interface BrandBriefFields {
  brandName: string;
  brandDescription: string;
  tagline: string;
  targetAudience: string;
  keywords: string;
  /** Comma- or list-separated brand touchpoint mockup ideas. */
  applications: string;
}

/** True when every brief area has content — batch Auto Complete would not fill any empty slot. */
export function isBriefSaturatedForAutoComplete(b: BrandBriefData): boolean {
  return !!(
    b.name?.trim() &&
    b.tagline?.trim() &&
    b.targetAudience?.trim() &&
    b.description?.trim() &&
    (b.keywords?.length ?? 0) > 0 &&
    (b.applications?.length ?? 0) > 0
  );
}

export function briefFieldsSaturatedForAutoComplete(f: BrandBriefFields): boolean {
  const kw = parseTagList(f.keywords);
  const apps = parseTagList(f.applications);
  return isBriefSaturatedForAutoComplete({
    name: f.brandName?.trim() ?? "",
    tagline: f.tagline?.trim() ?? "",
    description: f.brandDescription?.trim() ?? "",
    targetAudience: f.targetAudience?.trim() ?? "",
    keywords: kw,
    applications: apps,
  });
}

export const BrandBriefForm = forwardRef<BrandBriefRef, BrandBriefProps>(function BrandBriefForm(
  {
    brandBrief,
    projectPhase,
    onSubmit,
    isGenerating = false,
    onAutoComplete,
    isAutoCompleting = false,
    generatedBriefFields = new Set(),
    onClearGeneratedField,
    onFieldChange,
    onFieldAutoFill,
    autoFillingFieldKey = null,
    preEnhanceSnapshot,
    onRevertField,
    generatedTagsByField,
    embedded = false,
    contentOnly = false,
    autoCompleteDisabled: autoCompleteDisabledProp,
  },
  ref,
) {
  const [fields, setFields] = useState<BrandBriefFields>({
    brandName: "",
    brandDescription: "",
    tagline: "",
    targetAudience: "",
    keywords: "",
    applications: "",
  });

  // Internal tracking of which fields were changed by Auto Complete.
  // Merges with the external generatedBriefFields prop so the component works
  // correctly even when the parent doesn't pass generatedBriefFields.
  const [internalGeneratedFields, setInternalGeneratedFields] = useState<Set<BriefFieldKey>>(new Set());

  // Fields that are empty when batch Auto Complete starts — shown with loading highlight.
  const [fieldsBeingCompleted, setFieldsBeingCompleted] = useState<Set<BriefFieldKey>>(new Set());

  // Snapshot taken when isAutoCompleting becomes true, used to diff on completion.
  const autoCompleteSnapshotRef = useRef<BrandBriefFields | null>(null);

  useEffect(() => {
    if (isAutoCompleting) {
      // Capture state at the moment Auto Complete starts.
      autoCompleteSnapshotRef.current = fields;

      // Determine which fields are empty — these are the ones that will be filled.
      const toComplete = new Set<BriefFieldKey>();
      (Object.keys(fields) as BriefFieldKey[]).forEach((key) => {
        if (!fields[key]?.trim()) toComplete.add(key);
      });
      setFieldsBeingCompleted(toComplete);
    } else if (autoCompleteSnapshotRef.current) {
      // Auto Complete just finished — diff against snapshot to find changed fields.
      const snapshot = autoCompleteSnapshotRef.current;
      autoCompleteSnapshotRef.current = null;
      setFieldsBeingCompleted(new Set());

      const changed = new Set<BriefFieldKey>();
      (Object.keys(fields) as BriefFieldKey[]).forEach((key) => {
        if (fields[key] !== snapshot[key]) changed.add(key);
      });

      if (changed.size > 0) setInternalGeneratedFields(changed);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAutoCompleting]);

  // Sync from brandBrief when it changes externally (e.g. after AI generation
  // or when switching / creating projects).
  useEffect(() => {
    // When entering a brand-new empty project (no meaningful brief data and phase is "empty"),
    // clear all fields so the user starts from a blank state.
    if (projectPhase === "empty" && !hasMeaningfulBrief(brandBrief)) {
      setFields({
        brandName: "",
        brandDescription: "",
        tagline: "",
        targetAudience: "",
        keywords: "",
        applications: "",
      });
      return;
    }

    setFields((prev) => ({
      brandName: brandBrief.name ?? prev.brandName,
      tagline: brandBrief.tagline ?? prev.tagline,
      targetAudience: brandBrief.targetAudience ?? prev.targetAudience,
      keywords: brandBrief.keywords?.join(", ") ?? prev.keywords,
      brandDescription: brandBrief.description ?? prev.brandDescription,
      applications: brandBrief.applications?.join(", ") ?? prev.applications,
    }));
  }, [brandBrief.name, brandBrief.tagline, brandBrief.description, brandBrief.targetAudience, brandBrief.keywords, brandBrief.applications, projectPhase]);

  const updateField = (key: BriefFieldKey, value: string) => {
    clearGenerated(key);
    const newFields = { ...fields, [key]: value };
    setFields(newFields);
    onFieldChange?.(newFields);
  };

  const isGenerated = (key: BriefFieldKey) =>
    internalGeneratedFields.has(key) || generatedBriefFields.has(key);

  const clearGenerated = (key: BriefFieldKey) => {
    onClearGeneratedField?.(key);
    setInternalGeneratedFields((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  const handleAutoComplete = () => {
    onSubmit?.(fields);
  };

  const handleClearField = (key: BriefFieldKey) => {
    updateField(key, "");
  };

  useImperativeHandle(ref, () => ({ getFields: () => fields }), [fields]);

  const inputBase =
    "w-full bg-transparent text-foreground placeholder:text-muted-foreground/55 outline-none resize-none border rounded-xl px-3.5 py-2.5 leading-relaxed transition-all";

  const fieldBorderClass = "border-border/50 focus:border-primary/40 focus:ring-1 focus:ring-primary/20";
  const fieldBorderGeneratedClass = "border-bb-ai-affordance-border focus:border-bb-ai-active-ring focus:ring-1 focus:ring-bb-ai-active-ring-outer bg-bb-ai-affordance-bg";

  // Per-field border: during batch auto-complete highlight only empty fields (fieldsBeingCompleted);
  // during single-field auto-fill highlight only that field; after completion highlight changed fields.
  const getFieldBorder = (key: BriefFieldKey) => {
    if (autoFillingFieldKey === key) return fieldBorderGeneratedClass;
    if (isAutoCompleting && fieldsBeingCompleted.has(key)) return fieldBorderGeneratedClass;
    if (isGenerated(key)) return fieldBorderGeneratedClass;
    return fieldBorderClass;
  };

  const iconButtonBase =
    "inline-flex items-center justify-center w-5 h-5 rounded text-muted-foreground/70 hover:text-foreground hover:bg-muted/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors";

  const labelRowClass = "flex justify-between items-center mb-1.5";
  const labelClass = "font-semibold text-foreground/65 uppercase tracking-wider";
  const labelActionsClass = "flex items-center gap-0.5 shrink-0";

  // Whether any field-level loading is in flight (prevents triggering another).
  const anyFieldAutoFilling = autoFillingFieldKey !== null;
  const isLocked = isGenerating || isAutoCompleting || anyFieldAutoFilling;

  return (
    <div className={`flex flex-col bg-white overflow-hidden ${embedded ? "" : "h-full"}`}>
      <div className={embedded ? "" : "flex-1 overflow-y-auto"}>
        <div className="px-4 pt-4 pb-3 space-y-3">
          {/* Brand Name */}
          <div>
            <div className={labelRowClass}>
              <label className={labelClass} style={{ fontSize: TYPE.size.sm }}>Brand Name</label>
              <div className={labelActionsClass}>
                {onRevertField && preEnhanceSnapshot?.brandName !== undefined && (
                  <button type="button" onClick={() => onRevertField("brandName")} disabled={isLocked} className={iconButtonBase} title="Revert to original">
                    <Undo2 size={TYPE.icon.sm} />
                  </button>
                )}
                {onFieldAutoFill && (
                  <button type="button" onClick={() => onFieldAutoFill("brandName", fields)} disabled={isGenerating || isAutoCompleting || anyFieldAutoFilling}
                    className={`${iconButtonBase} ${autoFillingFieldKey === "brandName" ? "text-bb-ai-active-ring" : ""}`} title="Auto-fill this field">
                    {autoFillingFieldKey === "brandName" ? <div className="w-3 h-3 border-[1.5px] border-bb-ai-affordance-border border-t-bb-ai-active-ring rounded-full animate-spin" /> : <Sparkles size={TYPE.icon.sm} />}
                  </button>
                )}
                <button type="button" onClick={() => handleClearField("brandName")} disabled={isLocked} className={iconButtonBase} title="Clear">
                  <X size={TYPE.icon.sm} />
                </button>
              </div>
            </div>
            <input
              type="text"
              value={fields.brandName}
              onChange={(e) => updateField("brandName", e.target.value)}
              placeholder="Enter your brand name"
              className={`${inputBase} ${getFieldBorder("brandName")} ${isGenerated("brandName") ? "text-bb-ai-active-ring" : ""}`}
              style={{ fontSize: TYPE.size.baseLg }}
              disabled={isLocked}
            />
          </div>

          {/* Brand Description */}
          <div>
            <div className={labelRowClass}>
              <label className={labelClass} style={{ fontSize: TYPE.size.sm }}>Brand Description</label>
              <div className={labelActionsClass}>
                {onRevertField && preEnhanceSnapshot?.brandDescription !== undefined && (
                  <button type="button" onClick={() => onRevertField("brandDescription")} disabled={isLocked} className={iconButtonBase} title="Revert to original">
                    <Undo2 size={TYPE.icon.sm} />
                  </button>
                )}
                {onFieldAutoFill && (
                  <button type="button" onClick={() => onFieldAutoFill("brandDescription", fields)} disabled={isGenerating || isAutoCompleting || anyFieldAutoFilling}
                    className={`${iconButtonBase} ${autoFillingFieldKey === "brandDescription" ? "text-bb-ai-active-ring" : ""}`} title="Auto-fill this field">
                    {autoFillingFieldKey === "brandDescription" ? <div className="w-3 h-3 border-[1.5px] border-bb-ai-affordance-border border-t-bb-ai-active-ring rounded-full animate-spin" /> : <Sparkles size={TYPE.icon.sm} />}
                  </button>
                )}
                <button type="button" onClick={() => handleClearField("brandDescription")} disabled={isLocked} className={iconButtonBase} title="Clear">
                  <X size={TYPE.icon.sm} />
                </button>
              </div>
            </div>
            <textarea
              value={fields.brandDescription}
              onChange={(e) => updateField("brandDescription", e.target.value)}
              placeholder="Describe your brand's vision, values, products, stories, anything you want to share about your brand"
              rows={4}
              className={`${inputBase} ${getFieldBorder("brandDescription")} ${isGenerated("brandDescription") ? "text-bb-ai-active-ring" : ""}`}
              style={{ fontSize: TYPE.size.baseLg }}
              disabled={isLocked}
            />
          </div>

          {/* Tagline */}
          <div>
            <div className={labelRowClass}>
              <label className={labelClass} style={{ fontSize: TYPE.size.sm }}>Tagline / Slogan</label>
              <div className={labelActionsClass}>
                {onRevertField && preEnhanceSnapshot?.tagline !== undefined && (
                  <button type="button" onClick={() => onRevertField("tagline")} disabled={isLocked} className={iconButtonBase} title="Revert to original">
                    <Undo2 size={TYPE.icon.sm} />
                  </button>
                )}
                {onFieldAutoFill && (
                  <button type="button" onClick={() => onFieldAutoFill("tagline", fields)} disabled={isGenerating || isAutoCompleting || anyFieldAutoFilling}
                    className={`${iconButtonBase} ${autoFillingFieldKey === "tagline" ? "text-bb-ai-active-ring" : ""}`} title="Auto-fill this field">
                    {autoFillingFieldKey === "tagline" ? <div className="w-3 h-3 border-[1.5px] border-bb-ai-affordance-border border-t-bb-ai-active-ring rounded-full animate-spin" /> : <Sparkles size={TYPE.icon.sm} />}
                  </button>
                )}
                <button type="button" onClick={() => handleClearField("tagline")} disabled={isLocked} className={iconButtonBase} title="Clear">
                  <X size={TYPE.icon.sm} />
                </button>
              </div>
            </div>
            <input
              type="text"
              value={fields.tagline}
              onChange={(e) => updateField("tagline", e.target.value)}
              placeholder="Enter a brand tagline"
              className={`${inputBase} ${getFieldBorder("tagline")} ${isGenerated("tagline") ? "text-bb-ai-active-ring" : ""}`}
              style={{ fontSize: TYPE.size.baseLg }}
              disabled={isLocked}
            />
          </div>

          {/* Target Audience */}
          <div>
            <div className={labelRowClass}>
              <label className={labelClass} style={{ fontSize: TYPE.size.sm }}>Target Audience</label>
              <div className={labelActionsClass}>
                {onRevertField && preEnhanceSnapshot?.targetAudience !== undefined && (
                  <button type="button" onClick={() => onRevertField("targetAudience")} disabled={isLocked} className={iconButtonBase} title="Revert to original">
                    <Undo2 size={TYPE.icon.sm} />
                  </button>
                )}
                {onFieldAutoFill && (
                  <button type="button" onClick={() => onFieldAutoFill("targetAudience", fields)} disabled={isGenerating || isAutoCompleting || anyFieldAutoFilling}
                    className={`${iconButtonBase} ${autoFillingFieldKey === "targetAudience" ? "text-bb-ai-active-ring" : ""}`} title="Auto-fill this field">
                    {autoFillingFieldKey === "targetAudience" ? <div className="w-3 h-3 border-[1.5px] border-bb-ai-affordance-border border-t-bb-ai-active-ring rounded-full animate-spin" /> : <Sparkles size={TYPE.icon.sm} />}
                  </button>
                )}
                <button type="button" onClick={() => handleClearField("targetAudience")} disabled={isLocked} className={iconButtonBase} title="Clear">
                  <X size={TYPE.icon.sm} />
                </button>
              </div>
            </div>
            <textarea
              value={fields.targetAudience}
              onChange={(e) => updateField("targetAudience", e.target.value)}
              placeholder="Describe who your brand is for"
              rows={3}
              className={`${inputBase} ${getFieldBorder("targetAudience")} ${isGenerated("targetAudience") ? "text-bb-ai-active-ring" : ""}`}
              style={{ fontSize: TYPE.size.baseLg }}
              disabled={isLocked}
            />
          </div>

          {/* Keywords */}
          <div>
            <div className={labelRowClass}>
              <label className={labelClass} style={{ fontSize: TYPE.size.sm }}>Brand Keywords</label>
              <div className={labelActionsClass}>
                {onRevertField && preEnhanceSnapshot?.keywords !== undefined && (
                  <button type="button" onClick={() => onRevertField("keywords")} disabled={isLocked} className={iconButtonBase} title="Revert to original">
                    <Undo2 size={TYPE.icon.sm} />
                  </button>
                )}
                {onFieldAutoFill && (
                  <button type="button" onClick={() => onFieldAutoFill("keywords", fields)} disabled={isGenerating || isAutoCompleting || anyFieldAutoFilling}
                    className={`${iconButtonBase} ${autoFillingFieldKey === "keywords" ? "text-bb-ai-active-ring" : ""}`} title="Auto-fill this field">
                    {autoFillingFieldKey === "keywords" ? <div className="w-3 h-3 border-[1.5px] border-bb-ai-affordance-border border-t-bb-ai-active-ring rounded-full animate-spin" /> : <Sparkles size={TYPE.icon.sm} />}
                  </button>
                )}
                <button type="button" onClick={() => handleClearField("keywords")} disabled={isLocked} className={iconButtonBase} title="Clear all">
                  <X size={TYPE.icon.sm} />
                </button>
              </div>
            </div>
            <CapsuleTagInput
              tags={parseTagList(fields.keywords)}
              onTagsChange={(tags) => updateField("keywords", tags.join(", "))}
              placeholder="Type a keyword and press Enter"
              disabled={isLocked}
              generated={isGenerated("keywords")}
              generatedTags={generatedTagsByField?.keywords}
            />
          </div>

          {/* Applications */}
          <div>
            <div className={labelRowClass}>
              <label className={labelClass} style={{ fontSize: TYPE.size.sm }}>Applications / Brand Touchpoints</label>
              <div className={labelActionsClass}>
                {onRevertField && preEnhanceSnapshot?.applications !== undefined && (
                  <button type="button" onClick={() => onRevertField("applications")} disabled={isLocked} className={iconButtonBase} title="Revert to original">
                    <Undo2 size={TYPE.icon.sm} />
                  </button>
                )}
                {onFieldAutoFill && (
                  <button type="button" onClick={() => onFieldAutoFill("applications", fields)} disabled={isLocked}
                    className={`${iconButtonBase} ${autoFillingFieldKey === "applications" ? "text-bb-ai-active-ring" : ""}`} title="Auto-fill this field">
                    {autoFillingFieldKey === "applications" ? <div className="w-3 h-3 border-[1.5px] border-bb-ai-affordance-border border-t-bb-ai-active-ring rounded-full animate-spin" /> : <Sparkles size={TYPE.icon.sm} />}
                  </button>
                )}
                <button type="button" onClick={() => handleClearField("applications")} disabled={isLocked} className={iconButtonBase} title="Clear all">
                  <X size={TYPE.icon.sm} />
                </button>
              </div>
            </div>
            <CapsuleTagInput
              tags={parseTagList(fields.applications)}
              onTagsChange={(tags) => updateField("applications", tags.join(", "))}
              placeholder="Type an application and press Enter"
              disabled={isLocked}
              generated={isGenerated("applications")}
              generatedTags={generatedTagsByField?.applications}
            />
          </div>
        </div>
      </div>

      {/* Footer: only render when not contentOnly (parent renders fixed footer) */}
      {!contentOnly && (
        <BriefFooter
          onAutoComplete={() => onAutoComplete?.(fields)}
          onGenerate={handleAutoComplete}
          isGenerating={isGenerating}
          isAutoCompleting={isAutoCompleting}
          isLocked={anyFieldAutoFilling}
          showAutoComplete={!!onAutoComplete}
          autoCompleteDisabled={
            autoCompleteDisabledProp !== undefined
              ? autoCompleteDisabledProp
              : briefFieldsSaturatedForAutoComplete(fields)
          }
        />
      )}
    </div>
  );
});

export interface BrandBriefPanelProps {
  onClose: () => void;

  brandBrief: BrandBriefData;
  projectPhase: "empty" | "curating";
  isGenerating: boolean;
  onBriefSubmit: (fields: BrandBriefFields) => void;
  isBrandGenerating: boolean;
  onAutoComplete: (fields: BrandBriefFields) => void;
  isAutoCompleting: boolean;
  generatedBriefFields: Set<BriefGeneratedKey>;
  onClearGeneratedField: (key: BriefGeneratedKey) => void;
  onFieldChange?: (fields: BrandBriefFields) => void;
  onFieldAutoFill?: (key: BriefFieldKey, fields: BrandBriefFields) => void;
  autoFillingFieldKey?: BriefFieldKey | null;
  preEnhanceSnapshot?: Partial<Record<BriefFieldKey, string>>;
  onRevertField?: (key: BriefFieldKey) => void;
  generatedTagsByField?: Partial<Record<BriefFieldKey, Set<string>>>;
  pipelineStage?: PipelineStage;
  /** When set, overrides whether batch Auto Complete is disabled; otherwise derived from `brandBrief`. */
  autoCompleteDisabled?: boolean;
}

export function BrandBriefPanel({
  onClose,

  brandBrief,
  projectPhase,
  isGenerating,
  onBriefSubmit,
  isBrandGenerating,
  onAutoComplete,
  isAutoCompleting,
  generatedBriefFields,
  onClearGeneratedField,
  onFieldChange,
  onFieldAutoFill,
  autoFillingFieldKey,
  preEnhanceSnapshot,
  onRevertField,
  generatedTagsByField,
  pipelineStage,
  autoCompleteDisabled: autoCompleteDisabledProp,
}: BrandBriefPanelProps) {
  const briefRef = useRef<BrandBriefRef | null>(null);
  const autoCompleteDisabled =
    autoCompleteDisabledProp !== undefined
      ? autoCompleteDisabledProp
      : isBriefSaturatedForAutoComplete(brandBrief);

  return (
    <div
      className={`absolute right-3 bottom-3 z-20 flex flex-col bg-white rounded-2xl shadow-xl border border-border/60 overflow-hidden`}
      style={{ width: LAYOUT.panel.sideWidth, top: LAYOUT.panel.boardTop }}
    >
      {/* Header: fixed Brand Brief title */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40 shrink-0 cursor-pointer">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <h1
            className="text-foreground truncate"
            style={{ fontSize: TYPE.size.md, fontWeight: TYPE.weight.semibold }}
          >
            Brand Brief
          </h1>
        </div>
      </div>

      {/* Content: scrollable Brand Brief form */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <BrandBriefForm
          ref={briefRef}
          brandBrief={brandBrief}
          projectPhase={projectPhase}
          onSubmit={onBriefSubmit}
          isGenerating={isGenerating || isBrandGenerating}
          onAutoComplete={onAutoComplete}
          isAutoCompleting={isAutoCompleting}
          generatedBriefFields={generatedBriefFields}
          onClearGeneratedField={onClearGeneratedField}
          onFieldChange={onFieldChange}
          onFieldAutoFill={onFieldAutoFill}
          autoFillingFieldKey={autoFillingFieldKey}
          preEnhanceSnapshot={preEnhanceSnapshot}
          onRevertField={onRevertField}
          generatedTagsByField={generatedTagsByField}
          embedded
          contentOnly
        />
      </div>

      {/* Fixed footer: buttons always visible at bottom of panel */}
      <BriefFooter
        onAutoComplete={() => {
          const fields = briefRef.current?.getFields();
          if (!fields) {
            console.warn("BrandBriefPanel: ref not ready, ignoring auto complete action");
            return;
          }
          onAutoComplete(fields);
        }}
        onGenerate={() => {
          const fields = briefRef.current?.getFields();
          if (!fields) {
            console.warn("BrandBriefPanel: ref not ready, ignoring generate action");
            return;
          }
          onBriefSubmit(fields);
        }}
        isGenerating={isGenerating || isBrandGenerating}
        isAutoCompleting={isAutoCompleting}
        isLocked={autoFillingFieldKey !== null}
        pipelineStage={pipelineStage}
        autoCompleteDisabled={autoCompleteDisabled}
      />
    </div>
  );
}
