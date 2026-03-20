import { Trash2, X } from "lucide-react";
import type { DirectionVersion } from "../types/project";
import { LAYOUT, TYPOGRAPHY } from "../utils/design-tokens";
import { formatDateTime } from "../utils/helpers";

interface DirectionVersionsPanelProps {
  versions: DirectionVersion[];
  activeVersionId?: string | null;
  visualSnapshotUrl?: string;
  onSelectVersion: (version: DirectionVersion) => void;
  onDeleteVersion?: (version: DirectionVersion) => void;
  onClose: () => void;
}

function VersionCardPlaceholder() {
  return (
    <div
      className="w-full rounded-lg flex items-center justify-center"
      style={{
        aspectRatio: `${LAYOUT.VS_SNAPSHOT_ASPECT_RATIO}`,
        background: "var(--bb-user-inactive-bg)",
        border: "1px dashed var(--bb-user-inactive-border)",
      }}
    >
      <span style={{ fontSize: TYPOGRAPHY.microLabel.fontSize, color: "var(--bb-user-inactive-accent)", opacity: 0.5 }}>
        No preview
      </span>
    </div>
  );
}

export function DirectionVersionsPanel({
  versions,
  activeVersionId,
  visualSnapshotUrl,
  onSelectVersion,
  onDeleteVersion,
  onClose,
}: DirectionVersionsPanelProps) {
  return (
    <div
      className="absolute right-3 bottom-3 z-30 flex flex-col bg-white rounded-2xl shadow-xl border border-border/60 overflow-hidden"
      style={{ width: LAYOUT.SIDE_PANEL_WIDTH, top: LAYOUT.BOARD_PANEL_TOP }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 shrink-0">
        <h1
          className="text-foreground cursor-default truncate"
          style={{ fontSize: TYPOGRAPHY.panelHeading.fontSize, fontWeight: TYPOGRAPHY.panelHeading.fontWeight }}
        >
          Brand Direction
        </h1>
        <button
          onClick={onClose}
          className="p-1 rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-muted/40 transition-colors cursor-pointer shrink-0"
          aria-label="Close panel"
        >
          <X size={15} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {versions.length === 0 ? (
          <div className="h-full flex items-center justify-center px-6 py-12">
            <div className="flex flex-col items-center gap-3 text-center">
              <span className="text-3xl">☕️</span>
              <p
                className="text-muted-foreground/60 leading-relaxed"
                style={{ fontSize: TYPOGRAPHY.cardBody.fontSize }}
              >
                No saved directions yet.
                <br />
                Generate a direction from a visual snapshot.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 p-3">
            {versions.map((version) => {
              const isActive = version.id === activeVersionId;
              const previewUrl = version.snapshotImageUrl ?? visualSnapshotUrl;
              const createdAt = version.createdAt instanceof Date
                ? version.createdAt
                : new Date(version.createdAt);

              return (
                <div
                  key={version.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectVersion(version)}
                  onKeyDown={(e) => e.key === "Enter" && onSelectVersion(version)}
                  className={`group flex flex-col gap-1.5 p-2 rounded-xl border cursor-pointer transition-all ${
                    isActive
                      ? "border-foreground/20 bg-muted/30 shadow-sm"
                      : "border-border/50 bg-white hover:border-border hover:shadow-sm"
                  }`}
                >
                  {/* Version label row */}
                  <div className="flex items-center justify-between gap-2 px-1 pt-0.5">
                    <span
                      className="text-foreground leading-tight truncate flex-1"
                      style={{ fontSize: TYPOGRAPHY.cardBodySm.fontSize, fontWeight: 600 }}
                    >
                      {version.label}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      {onDeleteVersion && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteVersion(version);
                          }}
                          className="p-1 rounded-md text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-all opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto cursor-pointer"
                          aria-label={`Delete ${version.label}`}
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                      <span
                        className="text-muted-foreground/50"
                        style={{ fontSize: TYPOGRAPHY.queueLabel.fontSize }}
                      >
                        {formatDateTime(createdAt)}
                      </span>
                    </div>
                  </div>

                  {/* Snapshot preview */}
                  {previewUrl ? (
                    <div
                      className="w-full rounded-lg overflow-hidden relative"
                      style={{ aspectRatio: `${LAYOUT.VS_SNAPSHOT_ASPECT_RATIO}` }}
                    >
                      <img
                        alt={version.label}
                        src={previewUrl}
                        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                        draggable={false}
                      />
                      {isActive && (
                        <div
                          className="absolute inset-0 rounded-lg"
                          style={{ boxShadow: "inset 0 0 0 2px var(--bb-user-active-accent)" }}
                        />
                      )}
                    </div>
                  ) : (
                    <VersionCardPlaceholder />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
