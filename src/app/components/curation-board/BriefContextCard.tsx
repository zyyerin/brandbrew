import React, { useRef } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import type { BrandBriefData, PipelineStage } from "../../types/project";
import type {
  BrandBriefFields,
  BriefFieldKey,
  BriefGeneratedKey,
  BrandBriefRef,
} from "../brand-brief";
import { BrandBriefForm, BriefFooter, isBriefSaturatedForAutoComplete } from "../brand-brief";
import { TYPE } from "../../utils/design-tokens";

const MAX_VISIBLE_KEYWORDS = 4;
const MAX_VISIBLE_APPLICATIONS = 3;

interface BriefContextCardProps {
  expanded: boolean;
  onToggleExpanded: () => void;
  projectPhase: "empty" | "curating";
  brandBrief: BrandBriefData;
  isGenerating: boolean;
  isBrandGenerating: boolean;
  onBriefSubmit: (fields: BrandBriefFields) => void;
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
  /** When set, overrides batch Auto Complete disabled state; otherwise derived from `brandBrief`. */
  autoCompleteDisabled?: boolean;
}

export function BriefContextCard({
  expanded,
  onToggleExpanded,
  projectPhase,
  brandBrief,
  isGenerating,
  isBrandGenerating,
  onBriefSubmit,
  onAutoComplete,
  isAutoCompleting,
  generatedBriefFields,
  onClearGeneratedField,
  onFieldChange,
  onFieldAutoFill,
  autoFillingFieldKey = null,
  preEnhanceSnapshot,
  onRevertField,
  generatedTagsByField,
  pipelineStage,
  autoCompleteDisabled: autoCompleteDisabledProp,
}: BriefContextCardProps) {
  const briefRef = useRef<BrandBriefRef | null>(null);
  const autoCompleteDisabled =
    autoCompleteDisabledProp !== undefined
      ? autoCompleteDisabledProp
      : isBriefSaturatedForAutoComplete(brandBrief);

  const keywords = brandBrief.keywords ?? [];
  const visibleKeywords = keywords.slice(0, MAX_VISIBLE_KEYWORDS);
  const extraCount = keywords.length - MAX_VISIBLE_KEYWORDS;
  const applications = brandBrief.applications ?? [];
  const visibleApplications = applications.slice(0, MAX_VISIBLE_APPLICATIONS);
  const applicationExtraCount = applications.length - MAX_VISIBLE_APPLICATIONS;
  // Panel expand/collapse stays available during visual-concept pipeline; only block while
  // batch or per-field auto-complete is mutating the form.
  const briefPanelToggleDisabled = isAutoCompleting || autoFillingFieldKey !== null;

  if (expanded) {
    // The brief always fills the available column height. In App.tsx the VC
    // panel is suppressed whenever the brief is expanded (vcPanelExpanded &&
    // !briefExpanded), so there is nothing below competing for space.
    const wrapperStyle: React.CSSProperties = { flex: 1 };

    return (
      <div
        className="flex flex-col overflow-hidden border-b border-border/25"
        style={wrapperStyle}
        data-no-pan
      >
        {/* Header */}
        {projectPhase === "curating" ? (
          <button
            type="button"
            onClick={onToggleExpanded}
            disabled={briefPanelToggleDisabled}
            className="w-full flex items-center justify-between px-3 py-2.5 shrink-0 border-b border-border/20 text-left transition-colors hover:bg-muted/30 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
            style={{ background: "var(--bb-user-inactive-bg)" }}
            title="Collapse"
          >
            <h2
              className="text-foreground/90 select-none"
              style={{
                fontSize: TYPE.size.md,
                fontWeight: TYPE.weight.semibold,
              }}
            >
              Brand Brief
            </h2>
            <Minimize2 size={14} className="text-muted-foreground/50" />
          </button>
        ) : (
          <div
            className="flex items-center justify-between px-3 py-2.5 shrink-0 border-b border-border/20"
            style={{ background: "var(--bb-user-inactive-bg)" }}
          >
            <h2
              className="text-foreground/90 select-none"
              style={{
                fontSize: TYPE.size.md,
                fontWeight: TYPE.weight.semibold,
              }}
            >
              Brand Brief
            </h2>
          </div>
        )}

        {/* Scrollable form body */}
        <div className="flex-1 min-h-0 overflow-y-auto" data-brief-scroll>
          <BrandBriefForm
            ref={briefRef}
            brandBrief={brandBrief}
            projectPhase={projectPhase}
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

        {/* Fixed footer: generate + auto-complete buttons */}
        <BriefFooter
          onAutoComplete={() => {
            const fields = briefRef.current?.getFields();
            if (fields) onAutoComplete(fields);
          }}
          onGenerate={() => {
            const fields = briefRef.current?.getFields();
            if (fields) onBriefSubmit(fields);
          }}
          isGenerating={isGenerating || isBrandGenerating}
          isAutoCompleting={isAutoCompleting}
          isLocked={autoFillingFieldKey !== null}
          showAutoComplete
          pipelineStage={pipelineStage}
          autoCompleteDisabled={autoCompleteDisabled}
        />
      </div>
    );
  }

  // Compact (read-only summary) mode
  const hasContent = !!(
    brandBrief.name?.trim() ||
    keywords.length > 0 ||
    applications.length > 0
  );

  return (
    <div
      className="shrink-0 border-b border-border/25 select-none"
      data-no-pan
    >
      <button
        type="button"
        onClick={onToggleExpanded}
        className="w-full text-left px-3.5 py-3 hover:bg-muted/30 transition-colors group cursor-pointer"
      >
        {/* Name row */}
        <div className="flex items-start justify-between gap-2 mb-3.5">
          <span
            className="font-semibold text-foreground/90 leading-tight truncate"
            style={{
              fontSize: TYPE.size.lg,
              fontWeight: TYPE.weight.bold,
            }}
          >
            {brandBrief.name?.trim() || (
              <span className="text-muted-foreground/40 font-normal">Brand Brief</span>
            )}
          </span>
          <Maximize2
            size={13}
            className="shrink-0 mt-0.5 text-muted-foreground/40 group-hover:text-muted-foreground/70 transition-colors"
          />
        </div>

        {hasContent && (
          <>
            {/* Keywords */}
            {visibleKeywords.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-1.5">
                {visibleKeywords.map((k) => (
                  <span
                    key={k}
                    className="px-2.5 py-1 rounded-md bg-muted/70 text-foreground/70 leading-none font-medium"
                    style={{ fontSize: TYPE.size.baseSm }}
                  >
                    {k}
                  </span>
                ))}
                {extraCount > 0 && (
                  <span
                    className="px-2.5 py-1 rounded-md bg-muted/50 text-foreground/50 leading-none font-medium"
                    style={{ fontSize: TYPE.size.baseSm }}
                  >
                    +{extraCount}
                  </span>
                )}
              </div>
            )}

            {/* Applications */}
            {visibleApplications.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {visibleApplications.map((application) => (
                  <span
                    key={application}
                    className="px-2.5 py-1 rounded-md bg-primary/10 text-primary/80 leading-none font-medium"
                    style={{ fontSize: TYPE.size.baseSm }}
                  >
                    {application}
                  </span>
                ))}
                {applicationExtraCount > 0 && (
                  <span
                    className="px-2.5 py-1 rounded-md bg-primary/5 text-primary/55 leading-none font-medium"
                    style={{ fontSize: TYPE.size.baseSm }}
                  >
                    +{applicationExtraCount}
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </button>
    </div>
  );
}
