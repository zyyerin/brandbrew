import { useState, useEffect, useImperativeHandle, forwardRef, useRef } from "react";
import { Sparkles, Coffee, X, PanelRightClose } from "lucide-react";
import type { BrandData } from "../types/brand";
import { LAYOUT } from "../utils/design-tokens";
import { CapsuleTagInput } from "./capsule-tag-input";

type BriefFieldKey = keyof BrandContextFields;

export interface BrandContextRef {
  getFields: () => BrandContextFields;
}

interface BrandContextProps {
  brandData: BrandData;
  phase:
    | "empty"
    | "generating-concept"
    | "generating-palette-fonts"
    | "generating-logo-style"
    | "generating-layout"
    | "visual-complete"
    | "guideline";
  onSubmit?: (fields: BrandContextFields) => void;
  isGenerating?: boolean;
  onApplicationsChange?: (apps: string[]) => void;
  onAutoComplete?: (fields: BrandContextFields) => void;
  isAutoCompleting?: boolean;
  generatedBriefFields?: Set<BriefFieldKey | "applications">;
  onClearGeneratedField?: (key: BriefFieldKey | "applications") => void;
  fieldSuggestions?: Partial<Record<BriefFieldKey, string[]>>;
  /** Called on every keystroke so the parent can keep its own state in sync. */
  onFieldChange?: (fields: BrandContextFields) => void;
  /** When true, used inside a combined panel; no full height so content stacks. */
  embedded?: boolean;
  /** When true, only render form content (footer rendered by parent for fixed positioning). */
  contentOnly?: boolean;
}

// Brand Summary naming: primary exported types, backed by BrandContext implementation.
export type BrandSummaryPhase = BrandContextProps["phase"];
export type BriefGeneratedKey = BriefFieldKey | "applications";
export interface BrandSummaryFields extends BrandContextFields {}
export interface BrandSummaryRef extends BrandContextRef {}
export interface BrandSummaryProps extends BrandContextProps {}

type ApplicationSuggestionData = Pick<BrandData, "brandBrief" | "keywords">;

/** True when at least one of name, tagline, description, targetAudience, or keywords is non-empty. */
function hasMeaningfulBrandData(brandData: {
  brandBrief?: { name?: string; tagline?: string; description?: string };
  targetAudience?: string;
  keywords?: string[];
}): boolean {
  const n = brandData.brandBrief?.name?.trim();
  const t = brandData.brandBrief?.tagline?.trim();
  const d = brandData.brandBrief?.description?.trim();
  const a = brandData.targetAudience?.trim();
  const kw = brandData.keywords && brandData.keywords.length > 0;
  return !!(n || t || d || a || kw);
}

/**
 * Suggests 4 application mockup ideas based on brand description and keywords.
 */
function suggestApplications(brandData: ApplicationSuggestionData): string[] {
  const desc = (brandData.brandBrief?.description ?? "").toLowerCase();
  const name = (brandData.brandBrief?.name ?? "").toLowerCase();
  const kw = (brandData.keywords ?? []).map((k) => k.toLowerCase());
  const all = `${desc} ${name} ${kw.join(" ")}`;

  if (/cafe|coffee|brew|roast|barista|latte|espresso/.test(all)) {
    return ["Interior", "Coffee Mug", "Togo Cup & Box", "Menu"];
  }
  if (/restaurant|food|dining|kitchen|chef|bistro/.test(all)) {
    return ["Interior", "Menu Card", "Packaging", "Tableware"];
  }
  if (/skincare|beauty|cosmetic|serum|cream|lotion/.test(all)) {
    return ["Product Bottle", "Packaging Box", "Shopping Bag", "Store Display"];
  }
  if (/tech|software|app|digital|saas|platform/.test(all)) {
    return ["App Screen", "Website Hero", "Presentation Deck", "Business Card"];
  }
  if (/fashion|clothing|apparel|wear|boutique/.test(all)) {
    return ["Hang Tag", "Shopping Bag", "Storefront", "Lookbook Spread"];
  }
  if (/fitness|gym|sport|wellness|health/.test(all)) {
    return ["Water Bottle", "Gym Signage", "App Screen", "Merchandise T-Shirt"];
  }
  if (/eco|green|sustain|environment|organic|nature/.test(all)) {
    return ["Eco Packaging", "Tote Bag", "Website Hero", "Sticker Sheet"];
  }

  return ["Business Card", "Letterhead", "Website Hero", "Social Media Post"];
}

// ---------------------------------------------------------------------------
// Shared footer — used by BrandContext (standalone) and BrandSummaryPanel.
// ---------------------------------------------------------------------------
interface BriefFooterProps {
  onAutoComplete: () => void;
  onGenerate: () => void;
  isGenerating: boolean;
  isAutoCompleting: boolean;
  /** When true, the "Auto Complete" button is rendered. */
  showAutoComplete?: boolean;
}

function BriefFooter({ onAutoComplete, onGenerate, isGenerating, isAutoCompleting, showAutoComplete = true }: BriefFooterProps) {
  return (
    <div className="shrink-0 border-t border-border/40 bg-white px-4 py-4 flex items-center gap-2">
      {showAutoComplete && (
        <button
          type="button"
          onClick={onAutoComplete}
          disabled={isGenerating || isAutoCompleting}
          className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[13px] font-semibold border border-border bg-muted/30 text-foreground hover:bg-muted/50 active:scale-[0.98] transition-all shadow-sm select-none disabled:opacity-50 disabled:pointer-events-none shrink-0"
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
        disabled={isGenerating || isAutoCompleting}
        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[13px] font-semibold bg-foreground text-white hover:bg-foreground/85 active:scale-[0.98] transition-all shadow-sm select-none disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap"
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
}

export const BrandContext = forwardRef<BrandContextRef, BrandContextProps>(function BrandContext(
  {
    brandData,
    phase,
    onSubmit,
    isGenerating = false,
    onApplicationsChange,
    onAutoComplete,
    isAutoCompleting = false,
    generatedBriefFields = new Set(),
    onClearGeneratedField,
    fieldSuggestions,
    onFieldChange,
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
  });

  const [applications, setApplications] = useState<string[]>(() => {
    if (brandData.guidelineApplications?.length) {
      return brandData.guidelineApplications;
    }
    // For a fresh / empty project, start with a blank Applications field.
    if (!hasMeaningfulBrandData(brandData)) {
      return [];
    }
    return suggestApplications(brandData);
  });

  // Track whether the user has manually edited Applications so we don't overwrite it on every brandData change.
  const userHasEditedApplicationsRef = useRef(false);

  // Internal tracking of which fields were changed by Auto Complete.
  // Merges with the external generatedBriefFields prop so the component works
  // correctly even when the parent doesn't pass generatedBriefFields.
  const [internalGeneratedFields, setInternalGeneratedFields] = useState<Set<BriefGeneratedKey>>(new Set());

  // Snapshot taken when isAutoCompleting becomes true, used to diff on completion.
  const autoCompleteSnapshotRef = useRef<{ fields: BrandContextFields; applications: string[] } | null>(null);

  useEffect(() => {
    if (isAutoCompleting) {
      // Capture state at the moment Auto Complete starts.
      autoCompleteSnapshotRef.current = { fields, applications };
    } else if (autoCompleteSnapshotRef.current) {
      // Auto Complete just finished — diff against snapshot to find changed fields.
      const snapshot = autoCompleteSnapshotRef.current;
      autoCompleteSnapshotRef.current = null;

      const changed = new Set<BriefGeneratedKey>();
      (Object.keys(fields) as BriefFieldKey[]).forEach((key) => {
        if (fields[key] !== snapshot.fields[key]) changed.add(key);
      });
      if (JSON.stringify(applications) !== JSON.stringify(snapshot.applications)) changed.add("applications");

      if (changed.size > 0) setInternalGeneratedFields(changed);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAutoCompleting]);

  // Sync from brandData when it changes externally (e.g. after AI generation
  // or when switching / creating projects).
  useEffect(() => {
    // When entering a brand-new empty project (no meaningful brand data and phase is "empty"),
    // clear all fields so the user starts from a blank state.
    if (phase === "empty" && !hasMeaningfulBrandData(brandData)) {
      setFields({
        brandName: "",
        tagline: "",
        targetAudience: "",
        keywords: "",
        brandDescription: "",
      });
      return;
    }

    setFields((prev) => ({
      brandName: brandData.brandBrief?.name ?? prev.brandName,
      tagline: brandData.brandBrief?.tagline ?? prev.tagline,
      targetAudience: brandData.targetAudience ?? prev.targetAudience,
      keywords: brandData.keywords?.join(", ") ?? prev.keywords,
      brandDescription: brandData.brandBrief?.description ?? prev.brandDescription,
    }));
  }, [brandData.brandBrief, brandData.targetAudience, brandData.keywords, phase]);

  useEffect(() => {
    // Skip auto-sync if user has manually edited the Applications field.
    if (userHasEditedApplicationsRef.current) return;

    // For a new empty project (no meaningful brand data), keep Applications blank.
    if (phase === "empty" && !hasMeaningfulBrandData(brandData) && !brandData.guidelineApplications?.length) {
      userHasEditedApplicationsRef.current = false;
      setApplications([]);
      return;
    }

    if (brandData.guidelineApplications?.length) {
      setApplications(brandData.guidelineApplications);
      return;
    }
    if (hasMeaningfulBrandData(brandData)) {
      setApplications(suggestApplications(brandData));
    }
  }, [
    brandData.brandBrief?.name,
    brandData.brandBrief?.tagline,
    brandData.brandBrief?.description,
    brandData.targetAudience,
    brandData.keywords,
    brandData.guidelineApplications,
    phase,
  ]);

  const updateField = (key: BriefFieldKey, value: string) => {
    clearGenerated(key);
    const newFields = { ...fields, [key]: value };
    setFields(newFields);
    onFieldChange?.(newFields);
  };

  const isGenerated = (key: BriefGeneratedKey) =>
    internalGeneratedFields.has(key) || generatedBriefFields.has(key);

  const clearGenerated = (key: BriefGeneratedKey) => {
    onClearGeneratedField?.(key);
    setInternalGeneratedFields((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  const updateApplications = (apps: string[]) => {
    // Once the user edits Applications, we stop auto-overwriting it from brandData.
    userHasEditedApplicationsRef.current = true;
    clearGenerated("applications");
    setApplications(apps);
    onApplicationsChange?.(apps);
  };

  const handleAutoComplete = () => {
    onSubmit?.(fields);
  };

  const handleClearField = (key: BriefFieldKey) => {
    updateField(key, "");
  };

  const handleClearApplications = () => {
    // Clearing counts as explicit user intent; stop auto-sync from brandData.
    userHasEditedApplicationsRef.current = true;
    clearGenerated("applications");
    setApplications([]);
    onApplicationsChange?.([]);
  };

  useImperativeHandle(ref, () => ({ getFields: () => fields }), [fields]);

  const inputBase =
    "w-full bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground/40 outline-none resize-none border rounded-lg px-3 py-2 transition-all";

  // Border color shifts to a soft violet while Auto Complete is running.
  const fieldBorderClass = isAutoCompleting
    ? "border-violet-300 focus:border-violet-400 focus:ring-1 focus:ring-violet-200"
    : "border-border/50 focus:border-primary/40 focus:ring-1 focus:ring-primary/20";

  const fieldShell = "relative group";

  const fieldControlsBase =
    "absolute inset-y-0 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity";

  const iconButtonBase =
    "inline-flex items-center justify-center w-6 h-6 rounded-md border border-border/40 bg-white text-muted-foreground/60 hover:text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed shadow-xs";

  return (
    <div className={`flex flex-col bg-white overflow-hidden ${embedded ? "" : "h-full"}`}>
      <div className={embedded ? "" : "flex-1 overflow-y-auto"}>
        <div className="px-4 pt-4 pb-3 space-y-3">
          {/* Brand Name */}
          <div>
            <label className="block text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider mb-1.5">
              Brand Name
            </label>
            <div className={fieldShell}>
              <input
                type="text"
                value={fields.brandName}
                onChange={(e) => updateField("brandName", e.target.value)}
                placeholder="Enter you brand name"
                className={`${inputBase} ${fieldBorderClass} ${isGenerated("brandName") ? "text-blue-600" : ""}`}
                disabled={isGenerating || isAutoCompleting}
              />
              <div className={fieldControlsBase}>
                <button
                  type="button"
                  onClick={() => handleClearField("brandName")}
                  disabled={isGenerating || isAutoCompleting}
                  className={iconButtonBase}
                  title="Clear"
                >
                  <X size={11} />
                </button>
              </div>
            </div>
            {fieldSuggestions?.brandName && fieldSuggestions.brandName.length > 0 && (
              <div className="mt-1.5 rounded-md border border-border/50 bg-white shadow-sm max-h-32 overflow-y-auto">
                {fieldSuggestions.brandName.map((s, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => updateField("brandName", s)}
                    className="w-full text-left px-2.5 py-1.5 text-[12px] hover:bg-muted/40 text-foreground/80"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Tagline */}
          <div>
            <label className="block text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider mb-1.5">
              Tagline
            </label>
            <div className={fieldShell}>
              <input
                type="text"
                value={fields.tagline}
                onChange={(e) => updateField("tagline", e.target.value)}
                placeholder="Concise, memorable, and unique"
                className={`${inputBase} ${fieldBorderClass} ${isGenerated("tagline") ? "text-blue-600" : ""}`}
                disabled={isGenerating || isAutoCompleting}
              />
              <div className={fieldControlsBase}>
                <button
                  type="button"
                  onClick={() => handleClearField("tagline")}
                  disabled={isGenerating || isAutoCompleting}
                  className={iconButtonBase}
                  title="Clear"
                >
                  <X size={11} />
                </button>
              </div>
            </div>
            {fieldSuggestions?.tagline && fieldSuggestions.tagline.length > 0 && (
              <div className="mt-1.5 rounded-md border border-border/50 bg-white shadow-sm max-h-32 overflow-y-auto">
                {fieldSuggestions.tagline.map((s, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => updateField("tagline", s)}
                    className="w-full text-left px-2.5 py-1.5 text-[12px] hover:bg-muted/40 text-foreground/80"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Target Audience */}
          <div>
            <label className="block text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider mb-1.5">
              Target Audience
            </label>
            <div className={fieldShell}>
              <input
                type="text"
                value={fields.targetAudience}
                onChange={(e) => updateField("targetAudience", e.target.value)}
                placeholder="Describe your target audience"
                className={`${inputBase} ${fieldBorderClass} ${isGenerated("targetAudience") ? "text-blue-600" : ""}`}
                disabled={isGenerating || isAutoCompleting}
              />
              <div className={fieldControlsBase}>
                <button
                  type="button"
                  onClick={() => handleClearField("targetAudience")}
                  disabled={isGenerating || isAutoCompleting}
                  className={iconButtonBase}
                  title="Clear"
                >
                  <X size={11} />
                </button>
              </div>
            </div>
            {fieldSuggestions?.targetAudience && fieldSuggestions.targetAudience.length > 0 && (
              <div className="mt-1.5 rounded-md border border-border/50 bg-white shadow-sm max-h-32 overflow-y-auto">
                {fieldSuggestions.targetAudience.map((s, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => updateField("targetAudience", s)}
                    className="w-full text-left px-2.5 py-1.5 text-[12px] hover:bg-muted/40 text-foreground/80"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Keywords */}
          <div>
            <label className="block text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider mb-1.5">
              Keywords
            </label>
            <div className={fieldShell}>
              <CapsuleTagInput
                tags={fields.keywords ? fields.keywords.split(",").map((k) => k.trim()).filter(Boolean) : []}
                onTagsChange={(tags) => updateField("keywords", tags.join(", "))}
                placeholder="Artisan, cozy, community, sustainable"
                disabled={isGenerating || isAutoCompleting}
                generated={isGenerated("keywords")}
                className={`border rounded-lg pr-8 ${isGenerated("keywords") ? "border-blue-200" : fieldBorderClass}`}
              />
              <div className={fieldControlsBase}>
                <button
                  type="button"
                  onClick={() => handleClearField("keywords")}
                  disabled={isGenerating || isAutoCompleting}
                  className={iconButtonBase}
                  title="Clear all"
                >
                  <X size={11} />
                </button>
              </div>
            </div>
            {fieldSuggestions?.keywords && fieldSuggestions.keywords.length > 0 && (
              <div className="mt-1.5 rounded-md border border-border/50 bg-white shadow-sm max-h-32 overflow-y-auto">
                {fieldSuggestions.keywords.map((s, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => updateField("keywords", s)}
                    className="w-full text-left px-2.5 py-1.5 text-[12px] hover:bg-muted/40 text-foreground/80"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Brand Description */}
          <div>
            <label className="block text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider mb-1.5">
              Brand Description
            </label>
            <div className={fieldShell}>
              <textarea
                value={fields.brandDescription}
                onChange={(e) => updateField("brandDescription", e.target.value)}
                placeholder="Describe your brand's mission, values, and what makes it unique..."
                rows={4}
                className={`${inputBase} ${fieldBorderClass} ${isGenerated("brandDescription") ? "text-blue-600" : ""}`}
                disabled={isGenerating || isAutoCompleting}
              />
              <div className={`${fieldControlsBase} items-start pt-2`}>
                <button
                  type="button"
                  onClick={() => handleClearField("brandDescription")}
                  disabled={isGenerating || isAutoCompleting}
                  className={iconButtonBase}
                  title="Clear"
                >
                  <X size={11} />
                </button>
              </div>
            </div>
            {fieldSuggestions?.brandDescription && fieldSuggestions.brandDescription.length > 0 && (
              <div className="mt-1.5 rounded-md border border-border/50 bg-white shadow-sm max-h-32 overflow-y-auto">
                {fieldSuggestions.brandDescription.map((s, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => updateField("brandDescription", s)}
                    className="w-full text-left px-2.5 py-1.5 text-[12px] hover:bg-muted/40 text-foreground/80"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Applications */}
          <div>
            <label className="block text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider mb-1.5">
              Applications
            </label>
            <div className={fieldShell}>
              <CapsuleTagInput
                tags={applications}
                onTagsChange={updateApplications}
                placeholder="Business Card, Packaging, Website, Signage"
                disabled={isGenerating || isAutoCompleting}
                generated={isGenerated("applications")}
                className={`border rounded-lg pr-8 ${isGenerated("applications") ? "border-blue-200" : fieldBorderClass}`}
              />
              <div className={fieldControlsBase}>
                <button
                  type="button"
                  onClick={handleClearApplications}
                  disabled={isGenerating || isAutoCompleting}
                  className={iconButtonBase}
                  title="Clear all"
                >
                  <X size={11} />
                </button>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground/50 mt-1.5 leading-relaxed">
              Press Enter or comma to add. Any number of mockups allowed.
            </p>
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

  brandData: BrandData;
  phase: BrandSummaryPhase;
  onBrandSummarySubmit: (fields: BrandSummaryFields) => void;
  isBrandGenerating: boolean;
  onApplicationsChange: (apps: string[]) => void;
  onAutoComplete: (fields: BrandSummaryFields) => void;
  isAutoCompleting: boolean;
  generatedBriefFields: Set<BriefGeneratedKey>;
  onClearGeneratedField: (key: BriefGeneratedKey) => void;
  onFieldChange?: (fields: BrandSummaryFields) => void;
}

export function BrandSummaryPanel({
  onClose,

  brandData,
  phase,
  onBrandSummarySubmit,
  isBrandGenerating,
  onApplicationsChange,
  onAutoComplete,
  isAutoCompleting,
  generatedBriefFields,
  onClearGeneratedField,
  onFieldChange,
}: BrandSummaryPanelProps) {
  const brandSummaryRef = useRef<BrandSummaryRef | null>(null);

  return (
    <div
      className="absolute right-3 top-[60px] bottom-20 z-20 flex flex-col bg-white rounded-2xl shadow-xl border border-border/60 overflow-hidden"
      style={{ width: LAYOUT.SIDE_PANEL_WIDTH }}
    >
      {/* Header: fixed Brand Summary title */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40 shrink-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <h1
            className="text-[15px] text-foreground cursor-default truncate"
            style={{ fontWeight: 600 }}
          >
            Brand Summary
          </h1>
          {(isBrandGenerating || isAutoCompleting) && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-[11px] text-muted-foreground shrink-0">
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
          brandData={brandData}
          phase={phase}
          onSubmit={onBrandSummarySubmit}
          isGenerating={isBrandGenerating}
          onApplicationsChange={onApplicationsChange}
          onAutoComplete={onAutoComplete}
          isAutoCompleting={isAutoCompleting}
          generatedBriefFields={generatedBriefFields}
          onClearGeneratedField={onClearGeneratedField}
          onFieldChange={onFieldChange}
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
      />
    </div>
  );
}