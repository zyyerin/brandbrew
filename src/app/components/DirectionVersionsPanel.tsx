import { Trash2 } from "lucide-react";
import type { DirectionVersion } from "../types/project";
import { LAYOUT, TYPE } from "../utils/design-tokens";
import { formatDateTime } from "../utils/helpers";

interface DirectionVersionsPanelProps {
  versions: DirectionVersion[];
  activeVersionId?: string | null;
  visualSnapshotUrl?: string;
  onSelectVersion: (version: DirectionVersion) => void;
  onDeleteVersion?: (version: DirectionVersion) => void;
  onClose: () => void;
}

interface VersionPreviewTileProps {
  imageUrl?: string;
  label: string;
  alt: string;
  fit?: "cover" | "contain";
  background?: string;
  /** When set, shown instead of `No {label}` when there is no image */
  emptyText?: string;
}

function VersionPreviewTile({ imageUrl, label, alt, fit = "cover", background, emptyText }: VersionPreviewTileProps) {
  return (
    <div
      className="w-full h-full rounded-lg overflow-hidden relative"
      style={{
        background: background ?? "var(--bb-user-inactive-bg)",
        border: "1px dashed var(--bb-user-inactive-border)",
      }}
    >
      {imageUrl ? (
        <img
          alt={alt}
          src={imageUrl}
          className={`absolute inset-0 w-full h-full pointer-events-none ${
            fit === "contain" ? "object-contain" : "object-cover"
          }`}
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center px-2 text-center">
          <span
            className="leading-tight"
            style={{ fontSize: TYPE.size.xs, color: "var(--bb-user-inactive-accent)", opacity: 0.6 }}
          >
            {emptyText ?? `No ${label}`}
          </span>
        </div>
      )}
    </div>
  );
}

export function DirectionVersionsPanel({
  versions,
  activeVersionId,
  visualSnapshotUrl,
  onSelectVersion,
  onDeleteVersion,
}: DirectionVersionsPanelProps) {
  return (
    <div
      className="absolute z-20 flex flex-col bg-white rounded-2xl shadow-xl border border-border/60 overflow-hidden"
      style={{
        width: LAYOUT.panel.sideWidth,
        top: LAYOUT.overlay.rightMarginTop,
        bottom: LAYOUT.overlay.rightMarginBottom,
        right: LAYOUT.overlay.rightMarginRight,
      }}
    >
      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {versions.length === 0 ? (
          <div className="h-full flex items-center justify-center px-6 py-12">
            <div className="flex flex-col items-center gap-3 text-center">
              <span className="text-3xl">☕️</span>
              <p
                className="text-muted-foreground/60 leading-relaxed"
                style={{ fontSize: TYPE.size.base }}
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
              const logoUrl = version.cache?.logoImageUrl;
              const applicationUrl = version.cache?.contextImageUrls?.[0];
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
                      ? "border-foreground/20 bg-muted/30 shadow-sm ring-2 ring-[var(--bb-user-active-accent)] ring-offset-1 ring-offset-white"
                      : "border-border/50 bg-white hover:border-border hover:shadow-sm"
                  }`}
                >
                  {/* Version label row */}
                  <div className="flex items-center justify-between gap-2 px-1 pt-0.5">
                    <span
                      className="text-foreground leading-tight truncate flex-1"
                      style={{ fontSize: TYPE.size.baseSm, fontWeight: 600 }}
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
                        style={{ fontSize: TYPE.size.sm }}
                      >
                        {formatDateTime(createdAt)}
                      </span>
                    </div>
                  </div>

                  {/* Split preview: left logo (50%), right snapshot + application */}
                  <div
                    className="relative w-full rounded-lg overflow-hidden"
                    style={{ aspectRatio: `${LAYOUT.card.snapshotAspectRatio}` }}
                  >
                    <div className="absolute inset-0 grid grid-cols-2 gap-1">
                      <div className="h-full">
                        <VersionPreviewTile
                          imageUrl={logoUrl}
                          label="logo"
                          alt={`${version.label} logo`}
                          fit="contain"
                          background="#ffffff"
                        />
                      </div>
                      <div className="h-full grid grid-rows-2 gap-1">
                        <VersionPreviewTile
                          imageUrl={previewUrl}
                          label="snapshot"
                          alt={`${version.label} snapshot`}
                        />
                        <VersionPreviewTile
                          imageUrl={applicationUrl}
                          label="application"
                          alt={`${version.label} application`}
                          emptyText="Not Available Yet"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
