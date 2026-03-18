import React, { useRef, useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { Plus, ImageIcon, FileText, X, Info } from "lucide-react";
import { LAYOUT } from "../../utils/design-tokens";
import { GenerationDetailsPanel } from "../GenerationDetailsPanel";
import { NoodleConnections } from "./NoodleConnections";
import type { SnapshotHistoryItem } from "../../types/app";

const CARD_CHECK_CENTER_OFFSET = 20; // In canvas px at zoom=1; matches CardWrapper toggle center.
const SNAPSHOT_DOT_CENTER_OFFSET = 14; // Matches snapshot dot's top-2/left-2 + w-3/h-3 center.

interface VisualSnapshotPanelProps {
  containerSize: { w: number; h: number };
  containerRef: React.RefObject<HTMLDivElement | null>;
  zoom: number;
  pan: { x: number; y: number };
  cardElMapRef: React.RefObject<Map<string, HTMLDivElement>>;
  checkedVariationIds: Set<string>;
  snapshotHistory: SnapshotHistoryItem[];
  selectedSnapshotId: string | null;
  snapshotGenerating: boolean;
  scrollTick: number;
  onSelectSnapshot?: (id: string | null) => void;
  onDeleteSnapshot?: (id: string) => void;
  onGenerateSnapshot?: () => void;
  onGenerateBrandGuideline?: () => void;
}

export function VisualSnapshotPanel({
  containerSize,
  containerRef,
  zoom,
  pan,
  cardElMapRef,
  checkedVariationIds,
  snapshotHistory,
  selectedSnapshotId,
  snapshotGenerating,
  scrollTick,
  onSelectSnapshot,
  onDeleteSnapshot,
  onGenerateSnapshot,
  onGenerateBrandGuideline,
}: VisualSnapshotPanelProps) {
  const selectedSnapshotElRef = useRef<HTMLButtonElement | null>(null);
  const vsScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [vsScrollTick, setVsScrollTick] = useState(0);
  const [openSnapshotInfoId, setOpenSnapshotInfoId] = useState<string | null>(null);
  const vsPanelRef = useRef<HTMLDivElement>(null);
  const vsDetailsPopupRef = useRef<HTMLDivElement>(null);

  // VS snapshot list scroll
  useEffect(() => {
    const el = vsScrollContainerRef.current;
    if (!el) return;
    const onScroll = () => setVsScrollTick((t) => t + 1);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [containerSize.w]);

  // Clear selected snapshot element ref when selection is cleared
  useEffect(() => {
    if (!selectedSnapshotId) selectedSnapshotElRef.current = null;
  }, [selectedSnapshotId]);

  // Re-measure noodle target once the ref is set
  useEffect(() => {
    if (!selectedSnapshotId) return;
    const id = requestAnimationFrame(() => setVsScrollTick((t) => t + 1));
    return () => cancelAnimationFrame(id);
  }, [selectedSnapshotId]);

  // Close generation details popup on outside click
  useEffect(() => {
    if (!openSnapshotInfoId) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (vsDetailsPopupRef.current?.contains(target)) return;
      if (vsPanelRef.current?.contains(target)) return;
      setOpenSnapshotInfoId(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openSnapshotInfoId]);

  // Force re-render dependency for noodle measurements
  void scrollTick;
  void vsScrollTick;

  const vsNodeW = Math.floor(containerSize.w * LAYOUT.VS_NODE_WIDTH_FRACTION);
  const vsRightMargin = LAYOUT.VS_NODE_RIGHT_MARGIN;
  const vsTopMargin = LAYOUT.VS_NODE_TOP_MARGIN;
  const vsBottomMargin = LAYOUT.VS_NODE_BOTTOM_MARGIN;
  const vsLeft = containerSize.w - vsNodeW - vsRightMargin;

  const containerEl = containerRef.current;
  const containerRect = containerEl?.getBoundingClientRect();
  const checkedIdsKey = useMemo(
    () => Array.from(checkedVariationIds).sort().join("|"),
    [checkedVariationIds],
  );
  const dpr = typeof window !== "undefined" ? Math.max(1, window.devicePixelRatio || 1) : 1;
  const snap = (v: number) => Math.round(v * dpr) / dpr;

  // Measure noodle endpoints from checked cards
  const cardEndpoints = useMemo<Array<{ x: number; y: number }>>(() => {
    if (!containerRect || checkedVariationIds.size === 0) return [];
    const points: Array<{ x: number; y: number }> = [];
    cardElMapRef.current.forEach((el, varId) => {
      if (!checkedVariationIds.has(varId)) return;
      const rect = el.getBoundingClientRect();
      if (rect.right < containerRect.left || rect.left > containerRect.right) return;
      if (rect.bottom < containerRect.top || rect.top > containerRect.bottom) return;
      const toggleBtn = el.querySelector("[data-card-toggle]") as HTMLElement | null;
      if (toggleBtn) {
        const toggleRect = toggleBtn.getBoundingClientRect();
        points.push({
          x: snap(toggleRect.left + toggleRect.width / 2 - containerRect.left),
          y: snap(toggleRect.top + toggleRect.height / 2 - containerRect.top),
        });
        return;
      }
      const zoomScale = rect.height / LAYOUT.CARD_SIZE;
      const inset = CARD_CHECK_CENTER_OFFSET * zoomScale;
      points.push({
        x: snap(rect.right - inset - containerRect.left),
        y: snap(rect.top + inset - containerRect.top),
      });
    });
    return points;
  }, [
    cardElMapRef,
    checkedVariationIds,
    checkedIdsKey,
    containerRect,
    dpr,
    pan.x,
    pan.y,
    scrollTick,
    vsScrollTick,
    zoom,
  ]);

  const headerH = 36;
  const defaultPortX = vsLeft;
  const defaultPortY = vsTopMargin + headerH / 2;

  const { portX, portY } = useMemo(() => {
    let x = defaultPortX;
    let y = defaultPortY;
    if (selectedSnapshotId && selectedSnapshotElRef.current && containerRect) {
      const r = selectedSnapshotElRef.current.getBoundingClientRect();
      x = r.left - containerRect.left + SNAPSHOT_DOT_CENTER_OFFSET;
      y = r.top - containerRect.top + SNAPSHOT_DOT_CENTER_OFFSET;
    }
    return { portX: snap(x), portY: snap(y) };
  }, [containerRect, defaultPortX, defaultPortY, dpr, selectedSnapshotId, vsScrollTick]);

  const hasChecked = checkedVariationIds.size > 0;

  return (
    <>
      <NoodleConnections
        cardEndpoints={cardEndpoints}
        portX={portX}
        portY={portY}
      />

      {/* VS Node panel */}
      <div
        ref={vsPanelRef}
        className="absolute pointer-events-auto flex flex-col"
        style={{
          zIndex: 16,
          left: vsLeft,
          top: vsTopMargin,
          width: vsNodeW,
          bottom: vsBottomMargin,
        }}
      >
        <div
          className="w-full h-full rounded-xl bg-white/95 backdrop-blur-sm flex flex-col overflow-hidden"
          style={{
            border: `2px solid ${
              hasChecked ? "var(--bb-user-active-accent)" : "var(--bb-user-inactive-border)"
            }`,
            boxShadow: `0 4px 20px rgba(96,165,250,0.12), 0 0 0 1px rgba(96,165,250,0.06)`,
          }}
        >
          {/* Header */}
          <div
            className="px-3 py-2 flex items-center justify-between select-none shrink-0"
            style={{
              borderBottom: `1px solid ${
                hasChecked ? "var(--bb-user-active-border)" : "var(--bb-user-inactive-border)"
              }`,
              background: hasChecked ? "var(--bb-user-active-bg)" : "var(--bb-user-inactive-bg)",
            }}
          >
            <span
              className="text-[14px] tracking-wide"
              style={{
                fontWeight: 600,
                color: hasChecked ? "var(--bb-user-active-accent)" : "var(--bb-user-inactive-accent)",
              }}
            >
              Visual Snapshot
            </span>
            <button
              onClick={onGenerateSnapshot}
              disabled={!hasChecked || snapshotGenerating}
              title={!hasChecked ? "Select visual elements first" : "Generate new snapshot"}
              className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-blue-50 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
            >
              <Plus size={14} style={{ color: "var(--bb-user-active-accent)" }} />
            </button>
          </div>

          {/* Snapshot history list */}
          <div
            ref={vsScrollContainerRef}
            className="flex-1 overflow-y-auto p-2 min-h-0"
            data-vs-snapshot-scroll
          >
            {snapshotGenerating && (
              <div
                className="w-full rounded-lg flex flex-col items-center justify-center gap-2 shrink-0 mb-2"
                style={{
                  aspectRatio: `${LAYOUT.VS_SNAPSHOT_ASPECT_RATIO}`,
                  background: "var(--bb-user-active-bg)",
                  border: `1px dashed var(--bb-user-active-border)`,
                }}
              >
                <div className="w-6 h-6 border-2 border-muted-foreground/30 border-t-muted-foreground/70 rounded-full animate-spin" />
                <span className="text-[10px] text-muted-foreground/50 select-none">
                  Generating…
                </span>
              </div>
            )}
            {!snapshotGenerating && snapshotHistory.length === 0 ? (
              <div className="h-full flex items-center justify-center px-4">
                <div className="flex flex-col items-center gap-2 text-center">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center"
                    style={{
                      background: "var(--bb-user-inactive-bg)",
                      border: `1px solid var(--bb-user-inactive-border)`,
                    }}
                  >
                    <ImageIcon
                      size={16}
                      style={{ color: "var(--bb-user-inactive-accent)", opacity: 0.5 }}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground/40 leading-relaxed select-none max-w-[180px]">
                    Select visual elements to generate visual snapshot
                  </p>
                </div>
              </div>
            ) : snapshotHistory.length > 0 ? (
              <div className="flex flex-col gap-2">
                {snapshotHistory.map((snap) => {
                  const isSelected = selectedSnapshotId === snap.id;
                  const meta = snap.generationMeta;
                  return (
                    <div key={snap.id} className="relative group/snap">
                      <button
                        ref={isSelected ? (el) => { selectedSnapshotElRef.current = el; } : undefined}
                        onClick={() => onSelectSnapshot?.(isSelected ? null : snap.id)}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          if (snap.imageUrl) {
                            window.open(snap.imageUrl, "_blank", "noopener,noreferrer");
                          }
                        }}
                        className="relative w-full rounded-lg overflow-hidden transition-all block"
                        style={{
                          aspectRatio: `${LAYOUT.VS_SNAPSHOT_ASPECT_RATIO}`,
                          outline: isSelected
                            ? "2.5px solid var(--bb-user-active-accent)"
                            : "1px solid rgba(0,0,0,0.06)",
                          outlineOffset: isSelected ? -1 : 0,
                          boxShadow: isSelected ? `0 0 0 4px rgba(96,165,250,0.15)` : "none",
                        }}
                      >
                        <img
                          src={snap.imageUrl}
                          alt="Snapshot"
                          className="w-full h-full object-cover"
                          draggable={false}
                        />
                        <div
                          className="absolute top-2 left-2 w-3 h-3 rounded-full border-2 border-white shadow-sm transition-colors"
                          style={{
                            background: isSelected
                              ? "var(--bb-user-active-accent)"
                              : "rgba(0,0,0,0.2)",
                          }}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteSnapshot?.(snap.id);
                        }}
                        title="Delete snapshot"
                        className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center opacity-0 group-hover/snap:opacity-100 focus:opacity-100 transition-opacity"
                      >
                        <X size={12} className="text-white" />
                      </button>
                      {meta && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenSnapshotInfoId((prev) => (prev === snap.id ? null : snap.id));
                          }}
                          title="Generation details"
                          className="absolute bottom-2 left-2 w-6 h-6 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center opacity-0 group-hover/snap:opacity-100 focus:opacity-100 transition-opacity"
                        >
                          <Info size={12} className="text-white" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>

          {/* Generate Brand Guideline button */}
          {selectedSnapshotId && (
            <div className="shrink-0 border-t border-border/40 bg-white px-3 py-3">
              <button
                onClick={onGenerateBrandGuideline}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-[12px] font-semibold bg-foreground text-white hover:bg-foreground/85 active:scale-[0.98] transition-all shadow-sm select-none"
              >
                <FileText size={13} />
                Generate Brand Guideline
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Generation details floating panel */}
      {openSnapshotInfoId && containerRect && (() => {
        const VS_DETAILS_POPUP_WIDTH = 254;
        const VS_DETAILS_POPUP_GAP = 12;
        const popupLeft = containerRect.left + vsLeft - VS_DETAILS_POPUP_WIDTH - VS_DETAILS_POPUP_GAP;
        const popupTop = containerRect.top + vsTopMargin;
        const currentMeta = snapshotHistory.find((s) => s.id === openSnapshotInfoId)?.generationMeta;
        return createPortal(
          <div
            ref={vsDetailsPopupRef}
            className="fixed z-[9999] bg-white rounded-xl border border-border/60 shadow-xl overflow-hidden"
            style={{
              left: popupLeft,
              top: popupTop,
              width: VS_DETAILS_POPUP_WIDTH,
              maxHeight: 360,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <GenerationDetailsPanel
              meta={currentMeta}
              onClose={() => setOpenSnapshotInfoId(null)}
              maxBodyHeight={280}
            />
          </div>,
          document.body
        );
      })()}
    </>
  );
}
