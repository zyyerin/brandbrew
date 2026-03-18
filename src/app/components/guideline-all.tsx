import { ArrowLeft, Trash2 } from "lucide-react";
import type { SnapshotBvi } from "../types/app";
import { formatDateTime } from "../utils/helpers";

// ── Types ──────────────────────────────────────────────────────────────────────
export interface GuidelineVersion {
  id: string;
  label: string;
  createdAt: Date;
  /** Optional snapshot linkage so each guideline version can preview its own visual snapshot. */
  snapshotId?: string;
  snapshotImageUrl?: string;
   /** Optional frozen BVI associated with the bound snapshot. */
  snapshotBvi?: SnapshotBvi;
  /** Optional cached AI-generated guideline content to avoid refetching on reload. */
  guidelineCache?: {
    rationales: {
      logo: string;
      color: string;
      typography: string;
      artStyle: string;
    };
    colorNames: { hex: string; name: string }[];
    brandInContextDescription: string;
    contextImageUrls?: string[];
    synthesizedVisualConcept?: { conceptName: string; points: string[] };
  };
}

interface GuidelineAllProps {
  onBack: () => void;
  versions?: GuidelineVersion[];
  visualSnapshotUrl?: string;
  /** When a version card is clicked, navigate to that guideline (parent should switch to guideline phase with this version selected). */
  onSelectVersion?: (version: GuidelineVersion) => void;
  /** When provided, shows a delete button per card and calls this when the user deletes a version. */
  onDeleteVersion?: (version: GuidelineVersion) => void;
}

// ── Fallback placeholder when no snapshot is available ─────────────────────────
function SnapshotPlaceholder({ label }: { label: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-[#e2e8f0] to-[#cbd5e1] gap-2">
      <div className="w-8 h-8 rounded-full bg-white/40 flex items-center justify-center">
        <span className="text-[16px]">☕️</span>
      </div>
      <span
        className="text-[10px] text-[#64748b] text-center px-3"
        style={{ fontFamily: "'Inter', sans-serif", fontWeight: 500 }}
      >
        {label}
      </span>
    </div>
  );
}

export function GuidelineAll({ onBack, versions = [], visualSnapshotUrl, onSelectVersion, onDeleteVersion }: GuidelineAllProps) {
  return (
    <div className="h-screen w-screen flex flex-col bg-[#f7f7f7] overflow-hidden">
      {/* ── Navbar ── */}
      <nav className="shrink-0 h-14 bg-white border-b border-[#e5e5e5] flex items-center justify-between px-6 z-50">
        {/* Left: Back */}
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-[#0f172a] hover:text-[#374151] transition-colors cursor-pointer"
        >
          <ArrowLeft size={18} strokeWidth={2.5} />
        </button>

      </nav>

      {/* ── Gallery ── */}
      <div className="flex-1 overflow-y-auto flex flex-col">
        <div className="flex flex-wrap gap-8 justify-center content-start flex-1 p-20">
          {versions.length === 0 ? (
            // ── Empty state ────────────────────────────────────────────────────
            <div className="flex flex-col items-center gap-3 py-20 text-center">
              <span className="text-[32px]">☕️</span>
              <p
                className="text-[14px] text-[#64748b]"
                style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}
              >
                No saved guidelines yet.
                <br />
                Generate a guideline from a visual snapshot to create one automatically.
              </p>
            </div>
          ) : (
            versions.map((version) => (
              <div
                key={version.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectVersion?.(version)}
                onKeyDown={(e) => e.key === "Enter" && onSelectVersion?.(version)}
                className="group bg-white flex flex-col gap-1 h-[240px] w-[368px] p-2 rounded shadow-[0px_0.5px_1px_0px_rgba(0,0,0,0.05)] shrink-0 cursor-pointer hover:shadow-md transition-shadow relative"
              >
                {/* Version label + date + delete */}
                <div className="shrink-0 flex items-center justify-between w-full">
                  <span
                    className="text-[#0f172a] text-[9px] leading-[14px]"
                    style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
                  >
                    {version.label}
                  </span>
                  <div className="flex items-center gap-1">
                    {onDeleteVersion && versions.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteVersion(version);
                        }}
                        className="p-1 rounded text-[#94a3b8] hover:text-[#dc2626] hover:bg-[#fef2f2] transition-all opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto cursor-pointer"
                        title="Delete version"
                        aria-label={`Delete ${version.label}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                    <span
                      className="text-[#94a3b8] text-[9px] leading-[14px]"
                      style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}
                    >
                      {formatDateTime(version.createdAt instanceof Date ? version.createdAt : new Date(version.createdAt))}
                    </span>
                  </div>
                </div>
                {/* Preview image — visual snapshot (per-version if available, otherwise shared fallback) */}
                <div className="flex-1 min-h-0 rounded-[2px] overflow-hidden relative">
                  {version.snapshotImageUrl ? (
                    <img
                      alt={version.label}
                      className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                      src={version.snapshotImageUrl}
                    />
                  ) : visualSnapshotUrl ? (
                    <img
                      alt={version.label}
                      className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                      src={visualSnapshotUrl}
                    />
                  ) : (
                    <SnapshotPlaceholder label={version.label} />
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* ── Footer ── */}
        <footer className="w-full border-t border-[#e2e8f0] flex flex-col items-center py-8 mt-auto">
          <p className="text-[14px] text-[#0f172a]" style={{ fontFamily: "'Inter', sans-serif" }}>
            <span style={{ fontWeight: 400 }}>Created with </span>
            <span style={{ fontWeight: 900 }}>Brand Brew</span>
            <span style={{ fontWeight: 900 }}> ☕️</span>
          </p>
        </footer>
      </div>
    </div>
  );
}