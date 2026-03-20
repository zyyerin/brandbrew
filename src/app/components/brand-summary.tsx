import { useState, useEffect, useImperativeHandle, forwardRef, useRef } from "react";
import { Sparkles, Coffee, X, PanelRightClose } from "lucide-react";
import type { BrandSummaryData } from "../types/project";
import { LAYOUT, TYPOGRAPHY } from "../utils/design-tokens";
import { CapsuleTagInput } from "./capsule-tag-input";

type BriefFieldKey = keyof BrandContextFields;

export interface BrandContextRef {
  getFields: () => BrandContextFields;
}

interface BrandContextProps {
  brandSummary: BrandSummaryData;
  projectPhase: "empty" | "curating";
  isGenerating?: boolean;
  onSubmit?: (fields: BrandContextFields) => void;
  onAutoComplete?: (fields: BrandContextFields) => void;
  isAutoCompleting?: boolean;
  generatedBriefFields?: Set<BriefFieldKey>;
  onClearGeneratedField?: (key: BriefFieldKey) => void;
  fieldSuggestions?: Partial<Record<BriefFieldKey, string[]>>;
  /** Called on every keystroke so the parent can keep its own state in sync. */
  onFieldChange?: (fields: BrandContextFields) => void;
  /** Called when the user clicks the per-field auto-complete button. */
  onFieldAutoFill?: (key: BriefFieldKey, fields: BrandContextFields) => void;
  /** The field currently being auto-filled (single-field mode). */
  autoFillingFieldKey?: BriefFieldKey | null;
  /** When true, used inside a combined panel; no full height so content stacks. */
  embedded?: boolean;
  /** When true, only render form content (footer rendered by parent for fixed positioning). */
  contentOnly?: boolean;
}

// Brand Summary naming: primary exported types, backed by BrandContext implementation.
/** After merging applications into BrandContextFields, BriefGeneratedKey == BriefFieldKey. Kept as alias for external consumers. */
export type BriefGeneratedKey = BriefFieldKey;
export interface BrandSummaryFields extends BrandContextFields {}
export interface BrandSummaryRef extends BrandContextRef {}
export interface BrandSummaryProps extends BrandContextProps {}

/** True when at least one of name, tagline, description, targetAudience, or keywords is non-empty. */
function hasMeaningfulBrandData(s: BrandSummaryData): boolean {
  return !!(
    s.name?.trim() ||
    s.tagline?.trim() ||
    s.description?.trim() ||
    s.targetAudience?.trim() ||
    (s.keywords && s.keywords.length > 0)
  );
}

// ---------------------------------------------------------------------------
// Shared footer — used by BrandContext (standalone) and BrandSummaryPanel.
// ---------------------------------------------------------------------------
interface BriefFooterProps {
  onAutoComplete: () => void;
  onGenerate: () => void;
  isGenerating: boolean;
  isAutoCompleting: boolean;
  /** Extra locked state (e.g. single-field auto-fill in progress). */
  isLocked?: boolean;
  /** When true, the "Auto Complete" button is rendered. */
  showAutoComplete?: boolean;
}

function BriefFooter({ onAutoComplete, onGenerate, isGenerating, isAutoCompleting, isLocked = false, showAutoComplete = true }: BriefFooterProps) {
  const disabled = isGenerating || isAutoCompleting || isLocked;
  return (
    <div className="shrink-0 border-t border-border/40 bg-white px-4 py-4 flex items-center gap-2">
      {showAutoComplete && (
        <button
          type="button"
          onClick={onAutoComplete}
          disabled={disabled}
          className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold border border-border bg-muted/30 text-foreground hover:bg-muted/50 active:scale-[0.98] transition-all shadow-sm select-none disabled:opacity-50 disabled:pointer-events-none shrink-0"
        style={{ fontSize: TYPOGRAPHY.cardBody.fontSize }}
        >
          {isAutoCompleting ? (
            <>
              <div className="w-4 h-4 border-2 border-foreground/30 border-t-foreground rounded-full animate-spin" />
              Auto completing…
            </>
          ) : (
            <>
              <Coffee size={14} />
              Auto Complete
            </>
          )}
        </button>
      )}
      <button
        type="button"
        onClick={onGenerate}
        disabled={disabled}
        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold bg-foreground text-white hover:bg-foreground/85 active:scale-[0.98] transition-all shadow-sm select-none disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap"
        style={{ fontSize: TYPOGRAPHY.cardBody.fontSize }}
      >
        {isGenerating ? (
          <>
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Generating…
          </>
        ) : (
          <>
            <Sparkles size={14} />
            Create Visual Elements
          </>
        )}
      </button>
    </div>
  );
}

// Form projection of the Brand Summary + supporting context fields used by SidePanel.
export interface BrandContextFields {
  brandName: string;
  tagline: string;
  targetAudience: string;
  keywords: string;
  brandDescription: string;
  /** Comma-separated list of brand touchpoint mockup ideas. */
  applications: string;
}

export const BrandContext = forwardRef<BrandContextRef, BrandContextProps>(function BrandContext(
  {
    brandSummary,
    projectPhase,
    onSubmit,
    isGenerating = false,
    onAutoComplete,
    isAutoCompleting = false,
    generatedBriefFields = new Set(),
    onClearGeneratedField,
    fieldSuggestions,
    onFieldChange,
    onFieldAutoFill,
    autoFillingFieldKey = null,
    embedded = false,
    contentOnly = false,
  },
  ref,
) {
  const [fields, setFields] = useState<BrandContextFields>({
    brandName: "",
    tagline: "",
    targetAudience: "",
    keywords: "",
    brandDescription: "",
    applications: "",
  });

  // Internal tracking of which fields were changed by Auto Complete.
  // Merges with the external generatedBriefFields prop so the component works
  // correctly even when the parent doesn't pass generatedBriefFields.
  const [internalGeneratedFields, setInternalGeneratedFields] = useState<Set<BriefFieldKey>>(new Set());

  // Fields that are empty when batch Auto Complete starts — shown with loading highlight.
  const [fieldsBeingCompleted, setFieldsBeingCompleted] = useState<Set<BriefFieldKey>>(new Set());

  // Snapshot taken when isAutoCompleting becomes true, used to diff on completion.
  const autoCompleteSnapshotRef = useRef<BrandContextFields | null>(null);

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

  // Sync from brandData when it changes externally (e.g. after AI generation
  // or when switching / creating projects).
  useEffect(() => {
    // When entering a brand-new empty project (no meaningful brand data and phase is "empty"),
    // clear all fields so the user starts from a blank state.
    if (projectPhase === "empty" && !hasMeaningfulBrandData(brandSummary)) {
      setFields({
        brandName: "",
        tagline: "",
        targetAudience: "",
        keywords: "",
        brandDescription: "",
        applications: "",
      });
      return;
    }

    setFields((prev) => ({
      brandName: brandSummary.name ?? prev.brandName,
      tagline: brandSummary.tagline ?? prev.tagline,
      targetAudience: brandSummary.targetAudience ?? prev.targetAudience,
      keywords: brandSummary.keywords?.join(", ") ?? prev.keywords,
      brandDescription: brandSummary.description ?? prev.brandDescription,
      applications: brandSummary.applications?.join(", ") ?? prev.applications,
    }));
  }, [brandSummary.name, brandSummary.tagline, brandSummary.description, brandSummary.targetAudience, brandSummary.keywords, brandSummary.applications, projectPhase]);

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
    "w-full bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground/40 outline-none resize-none border rounded-lg px-3 py-2 transition-all";

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

  // Right padding accounts for the two action buttons (Sparkles + X) shown on hover.
  const fieldShell = "group";

  const iconButtonBase =
    "inline-flex items-center justify-center w-5 h-5 rounded text-muted-foreground/40 hover:text-foreground hover:bg-muted/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors";

  const labelRowClass = "flex justify-between items-center mb-1.5";
  const labelClass = "font-medium text-muted-foreground/60 uppercase tracking-wider";
  const labelActionsClass = "flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity";

  // Whether any field-level loading is in flight (prevents triggering another).
  const anyFieldAutoFilling = autoFillingFieldKey !== null;
  const isLocked = isGenerating || isAutoCompleting || anyFieldAutoFilling;

  return (
    <div className={`flex flex-col bg-white overflow-hidden ${embedded ? "" : "h-full"}`}>
      <div className={embedded ? "" : "flex-1 overflow-y-auto"}>
        <div className="px-4 pt-4 pb-3 space-y-3">
          {/* Brand Name */}
          <div className={fieldShell}>
            <div className={labelRowClass}>
              <label className={labelClass} style={{ fontSize: TYPOGRAPHY.queueLabel.fontSize }}>Brand Name</label>
              <div className={labelActionsClass}>
                {onFieldAutoFill && (
                  <button type="button" onClick={() => onFieldAutoFill("brandName", fields)} disabled={isGenerating || isAutoCompleting || anyFieldAutoFilling}
                    className={`${iconButtonBase} ${autoFillingFieldKey === "brandName" ? "text-bb-ai-active-ring" : ""}`} title="Auto-fill this field">
                    {autoFillingFieldKey === "brandName" ? <div className="w-3 h-3 border-[1.5px] border-bb-ai-affordance-border border-t-bb-ai-active-ring rounded-full animate-spin" /> : <Sparkles size={TYPOGRAPHY.toggleIconSize} />}
                  </button>
                )}
                <button type="button" onClick={() => handleClearField("brandName")} disabled={isLocked} className={iconButtonBase} title="Clear">
                  <X size={TYPOGRAPHY.toggleIconSize} />
                </button>
              </div>
            </div>
            <input
              type="text"
              value={fields.brandName}
              onChange={(e) => updateField("brandName", e.target.value)}
              placeholder="Enter you brand name"
              className={`${inputBase} ${getFieldBorder("brandName")} ${isGenerated("brandName") ? "text-bb-ai-active-ring" : ""}`}
              disabled={isLocked}
            />
            {fieldSuggestions?.brandName && fieldSuggestions.brandName.length > 0 && (
              <div className="mt-1.5 rounded-md border border-border/50 bg-white shadow-sm max-h-32 overflow-y-auto">
                {fieldSuggestions.brandName.map((s, idx) => (
                  <button key={idx} type="button" onClick={() => updateField("brandName", s)}
                    className="w-full text-left px-2.5 py-1.5 text-[12px] hover:bg-muted/40 text-foreground/80">{s}</button>
                ))}
              </div>
            )}
          </div>

          {/* Tagline */}
          <div className={fieldShell}>
            <div className={labelRowClass}>
              <label className={labelClass} style={{ fontSize: TYPOGRAPHY.queueLabel.fontSize }}>Tagline</label>
              <div className={labelActionsClass}>
                {onFieldAutoFill && (
                  <button type="button" onClick={() => onFieldAutoFill("tagline", fields)} disabled={isGenerating || isAutoCompleting || anyFieldAutoFilling}
                    className={`${iconButtonBase} ${autoFillingFieldKey === "tagline" ? "text-bb-ai-active-ring" : ""}`} title="Auto-fill this field">
                    {autoFillingFieldKey === "tagline" ? <div className="w-3 h-3 border-[1.5px] border-bb-ai-affordance-border border-t-bb-ai-active-ring rounded-full animate-spin" /> : <Sparkles size={TYPOGRAPHY.toggleIconSize} />}
                  </button>
                )}
                <button type="button" onClick={() => handleClearField("tagline")} disabled={isLocked} className={iconButtonBase} title="Clear">
                  <X size={TYPOGRAPHY.toggleIconSize} />
                </button>
              </div>
            </div>
            <input
              type="text"
              value={fields.tagline}
              onChange={(e) => updateField("tagline", e.target.value)}
              placeholder="Concise, memorable, and unique"
              className={`${inputBase} ${getFieldBorder("tagline")} ${isGenerated("tagline") ? "text-bb-ai-active-ring" : ""}`}
              disabled={isLocked}
            />
            {fieldSuggestions?.tagline && fieldSuggestions.tagline.length > 0 && (
              <div className="mt-1.5 rounded-md border border-border/50 bg-white shadow-sm max-h-32 overflow-y-auto">
                {fieldSuggestions.tagline.map((s, idx) => (
                  <button key={idx} type="button" onClick={() => updateField("tagline", s)}
                    className="w-full text-left px-2.5 py-1.5 text-[12px] hover:bg-muted/40 text-foreground/80">{s}</button>
                ))}
              </div>
            )}
          </div>

          {/* Target Audience */}
          <div className={fieldShell}>
            <div className={labelRowClass}>
              <label className={labelClass} style={{ fontSize: TYPOGRAPHY.queueLabel.fontSize }}>Target Audience</label>
              <div className={labelActionsClass}>
                {onFieldAutoFill && (
                  <button type="button" onClick={() => onFieldAutoFill("targetAudience", fields)} disabled={isGenerating || isAutoCompleting || anyFieldAutoFilling}
                    className={`${iconButtonBase} ${autoFillingFieldKey === "targetAudience" ? "text-bb-ai-active-ring" : ""}`} title="Auto-fill this field">
                    {autoFillingFieldKey === "targetAudience" ? <div className="w-3 h-3 border-[1.5px] border-bb-ai-affordance-border border-t-bb-ai-active-ring rounded-full animate-spin" /> : <Sparkles size={TYPOGRAPHY.toggleIconSize} />}
                  </button>
                )}
                <button type="button" onClick={() => handleClearField("targetAudience")} disabled={isLocked} className={iconButtonBase} title="Clear">
                  <X size={TYPOGRAPHY.toggleIconSize} />
                </button>
              </div>
            </div>
            <input
              type="text"
              value={fields.targetAudience}
              onChange={(e) => updateField("targetAudience", e.target.value)}
              placeholder="Describe your target audience"
              className={`${inputBase} ${getFieldBorder("targetAudience")} ${isGenerated("targetAudience") ? "text-bb-ai-active-ring" : ""}`}
              disabled={isLocked}
            />
            {fieldSuggestions?.targetAudience && fieldSuggestions.targetAudience.length > 0 && (
              <div className="mt-1.5 rounded-md border border-border/50 bg-white shadow-sm max-h-32 overflow-y-auto">
                {fieldSuggestions.targetAudience.map((s, idx) => (
                  <button key={idx} type="button" onClick={() => updateField("targetAudience", s)}
                    className="w-full text-left px-2.5 py-1.5 text-[12px] hover:bg-muted/40 text-foreground/80">{s}</button>
                ))}
              </div>
            )}
          </div>

          {/* Keywords */}
          <div className={fieldShell}>
            <div className={labelRowClass}>
              <label className={labelClass} style={{ fontSize: TYPOGRAPHY.queueLabel.fontSize }}>Keywords</label>
              <div className={labelActionsClass}>
                {onFieldAutoFill && (
                  <button type="button" onClick={() => onFieldAutoFill("keywords", fields)} disabled={isGenerating || isAutoCompleting || anyFieldAutoFilling}
                    className={`${iconButtonBase} ${autoFillingFieldKey === "keywords" ? "text-bb-ai-active-ring" : ""}`} title="Auto-fill this field">
                    {autoFillingFieldKey === "keywords" ? <div className="w-3 h-3 border-[1.5px] border-bb-ai-affordance-border border-t-bb-ai-active-ring rounded-full animate-spin" /> : <Sparkles size={TYPOGRAPHY.toggleIconSize} />}
                  </button>
                )}
                <button type="button" onClick={() => handleClearField("keywords")} disabled={isLocked} className={iconButtonBase} title="Clear all">
                  <X size={TYPOGRAPHY.toggleIconSize} />
                </button>
              </div>
            </div>
            <CapsuleTagInput
              tags={fields.keywords ? fields.keywords.split(",").map((k) => k.trim()).filter(Boolean) : []}
              onTagsChange={(tags) => updateField("keywords", tags.join(", "))}
              placeholder="Artisan, cozy, community, sustainable"
              disabled={isLocked}
              generated={isGenerated("keywords")}
              className={`border rounded-lg ${isGenerated("keywords") ? "border-bb-ai-affordance-border bg-bb-ai-affordance-bg" : getFieldBorder("keywords")}`}
            />
            {fieldSuggestions?.keywords && fieldSuggestions.keywords.length > 0 && (
              <div className="mt-1.5 rounded-md border border-border/50 bg-white shadow-sm max-h-32 overflow-y-auto">
                {fieldSuggestions.keywords.map((s, idx) => (
                  <button key={idx} type="button" onClick={() => updateField("keywords", s)}
                    className="w-full text-left px-2.5 py-1.5 text-[12px] hover:bg-muted/40 text-foreground/80">{s}</button>
                ))}
              </div>
            )}
          </div>

          {/* Brand Description */}
          <div className={fieldShell}>
            <div className={labelRowClass}>
              <label className={labelClass} style={{ fontSize: TYPOGRAPHY.queueLabel.fontSize }}>Brand Description</label>
              <div className={labelActionsClass}>
                {onFieldAutoFill && (
                  <button type="button" onClick={() => onFieldAutoFill("brandDescription", fields)} disabled={isGenerating || isAutoCompleting || anyFieldAutoFilling}
                    className={`${iconButtonBase} ${autoFillingFieldKey === "brandDescription" ? "text-bb-ai-active-ring" : ""}`} title="Auto-fill this field">
                    {autoFillingFieldKey === "brandDescription" ? <div className="w-3 h-3 border-[1.5px] border-bb-ai-affordance-border border-t-bb-ai-active-ring rounded-full animate-spin" /> : <Sparkles size={TYPOGRAPHY.toggleIconSize} />}
                  </button>
                )}
                <button type="button" onClick={() => handleClearField("brandDescription")} disabled={isLocked} className={iconButtonBase} title="Clear">
                  <X size={TYPOGRAPHY.toggleIconSize} />
                </button>
              </div>
            </div>
            <textarea
              value={fields.brandDescription}
              onChange={(e) => updateField("brandDescription", e.target.value)}
              placeholder="Describe your brand's mission, values, and what makes it unique..."
              rows={4}
              className={`${inputBase} ${getFieldBorder("brandDescription")} ${isGenerated("brandDescription") ? "text-bb-ai-active-ring" : ""}`}
              disabled={isLocked}
            />
            {fieldSuggestions?.brandDescription && fieldSuggestions.brandDescription.length > 0 && (
              <div className="mt-1.5 rounded-md border border-border/50 bg-white shadow-sm max-h-32 overflow-y-auto">
                {fieldSuggestions.brandDescription.map((s, idx) => (
                  <button key={idx} type="button" onClick={() => updateField("brandDescription", s)}
                    className="w-full text-left px-2.5 py-1.5 text-[12px] hover:bg-muted/40 text-foreground/80">{s}</button>
                ))}
              </div>
            )}
          </div>

          {/* Applications */}
          <div className={fieldShell}>
            <div className={labelRowClass}>
              <label className={labelClass} style={{ fontSize: TYPOGRAPHY.queueLabel.fontSize }}>Applications</label>
              <div className={labelActionsClass}>
                {onFieldAutoFill && (
                  <button type="button" onClick={() => onFieldAutoFill("applications", fields)} disabled={isLocked}
                    className={`${iconButtonBase} ${autoFillingFieldKey === "applications" ? "text-bb-ai-active-ring" : ""}`} title="Auto-fill this field">
                    {autoFillingFieldKey === "applications" ? <div className="w-3 h-3 border-[1.5px] border-bb-ai-affordance-border border-t-bb-ai-active-ring rounded-full animate-spin" /> : <Sparkles size={TYPOGRAPHY.toggleIconSize} />}
                  </button>
                )}
                <button type="button" onClick={() => handleClearField("applications")} disabled={isLocked} className={iconButtonBase} title="Clear all">
                  <X size={TYPOGRAPHY.toggleIconSize} />
                </button>
              </div>
            </div>
            <CapsuleTagInput
              tags={fields.applications ? fields.applications.split(",").map((a) => a.trim()).filter(Boolean) : []}
              onTagsChange={(tags) => updateField("applications", tags.join(", "))}
              placeholder="Business Card, Packaging, Website, Signage"
              disabled={isLocked}
              generated={isGenerated("applications")}
              className={`border rounded-lg ${isGenerated("applications") ? "border-bb-ai-affordance-border bg-bb-ai-affordance-bg" : getFieldBorder("applications")}`}
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
        />
      )}
    </div>
  );
});

// Brand Summary form alias for clearer naming.
export const BrandSummaryForm = BrandContext;

export interface BrandSummaryPanelProps {
  onClose: () => void;

  brandSummary: BrandSummaryData;
  projectPhase: "empty" | "curating";
  isGenerating: boolean;
  onBrandSummarySubmit: (fields: BrandSummaryFields) => void;
  isBrandGenerating: boolean;
  onAutoComplete: (fields: BrandSummaryFields) => void;
  isAutoCompleting: boolean;
  generatedBriefFields: Set<BriefGeneratedKey>;
  onClearGeneratedField: (key: BriefGeneratedKey) => void;
  onFieldChange?: (fields: BrandSummaryFields) => void;
  onFieldAutoFill?: (key: BriefFieldKey, fields: BrandSummaryFields) => void;
  autoFillingFieldKey?: BriefFieldKey | null;
}

export function BrandSummaryPanel({
  onClose,

  brandSummary,
  projectPhase,
  isGenerating,
  onBrandSummarySubmit,
  isBrandGenerating,
  onAutoComplete,
  isAutoCompleting,
  generatedBriefFields,
  onClearGeneratedField,
  onFieldChange,
  onFieldAutoFill,
  autoFillingFieldKey,
}: BrandSummaryPanelProps) {
  const brandSummaryRef = useRef<BrandSummaryRef | null>(null);

  return (
    <div
      className={`absolute right-3 bottom-3 z-30 flex flex-col bg-white rounded-2xl shadow-xl border border-border/60 overflow-hidden`}
      style={{ width: LAYOUT.SIDE_PANEL_WIDTH, top: LAYOUT.BOARD_PANEL_TOP }}
    >
      {/* Header: fixed Brand Summary title */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40 shrink-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <h1
            className="text-foreground cursor-default truncate"
            style={{ fontSize: TYPOGRAPHY.panelHeading.fontSize, fontWeight: TYPOGRAPHY.panelHeading.fontWeight }}
          >
            Brand Summary
          </h1>
          {(isBrandGenerating || isAutoCompleting) && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0" style={{ fontSize: TYPOGRAPHY.queueLabel.fontSize }}>
              <div className="w-3 h-3 border-2 border-muted-foreground/40 border-t-muted-foreground rounded-full animate-spin" />
              <span>
                {isBrandGenerating ? "Generating…" : "Auto completing…"}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Content: scrollable Brand Summary form */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <BrandSummaryForm
          ref={brandSummaryRef}
          brandSummary={brandSummary}
          projectPhase={projectPhase}
          onSubmit={onBrandSummarySubmit}
          isGenerating={isGenerating || isBrandGenerating}
          onAutoComplete={onAutoComplete}
          isAutoCompleting={isAutoCompleting}
          generatedBriefFields={generatedBriefFields}
          onClearGeneratedField={onClearGeneratedField}
          onFieldChange={onFieldChange}
          onFieldAutoFill={onFieldAutoFill}
          autoFillingFieldKey={autoFillingFieldKey}
          embedded
          contentOnly
        />
      </div>

      {/* Fixed footer: buttons always visible at bottom of panel */}
      <BriefFooter
        onAutoComplete={() => {
          const fields = brandSummaryRef.current?.getFields();
          if (!fields) {
            console.warn("BrandSummaryPanel: ref not ready, ignoring auto complete action");
            return;
          }
          onAutoComplete(fields);
        }}
        onGenerate={() => {
          const fields = brandSummaryRef.current?.getFields();
          if (!fields) {
            console.warn("BrandSummaryPanel: ref not ready, ignoring generate action");
            return;
          }
          onBrandSummarySubmit(fields);
        }}
        isGenerating={isBrandGenerating}
        isAutoCompleting={isAutoCompleting}
        isLocked={autoFillingFieldKey !== null}
      />
    </div>
  );
}