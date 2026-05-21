import React, { useRef, useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { Plus, X, Info, Sparkles, Eye } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "../ui/tooltip";
import { CANVAS, LAYOUT, TYPE, VISUAL_CONCEPT_PANEL, ELEMENT_TYPE_LABELS } from "../../utils/design-tokens";
import { GenerationDetailsPanel } from "../GenerationDetailsPanel";
import { NoodleConnections } from "./NoodleConnections";
import type { SnapshotItem } from "../../types/project";
import type { SlotPosition } from "../curation-board";

/** 对齐缩略图内圆点与 noodle 端口：2×addPadding + 2×portRadius = 14（与原先视觉一致） */
const SNAPSHOT_DOT_CENTER_OFFSET = LAYOUT.slot.addPadding * 2 + LAYOUT.connection.portRadius * 2;
const EMPTY_SET = new Set<string>();

const MERGE_TARGET_OVERLAY_STYLE: React.CSSProperties = {
  background: "var(--bb-ai-active-bg)",
  boxShadow: "var(--bb-ai-ring-shadow)",
};
const SNAPSHOT_REQUIRED_TYPES = [
  { key: "logo", label: ELEMENT_TYPE_LABELS.logo },
  { key: "color-palette", label: ELEMENT_TYPE_LABELS["color-palette"] },
  { key: "font", label: ELEMENT_TYPE_LABELS.font },
  { key: "art-style", label: ELEMENT_TYPE_LABELS["art-style"] },
] as const;

interface VisualSnapshotPanelProps {
  containerSize: { w: number; h: number };
  containerRef: React.RefObject<HTMLDivElement | null>;
  zoom: number;
  pan: { x: number; y: number };
  variationElMapRef: React.RefObject<Map<string, HTMLDivElement>>;
  slotPositionMapRef: React.RefObject<Map<string, SlotPosition>>;
  filmstripScrollMapRef: React.RefObject<Map<string, number>>;
  visibleQueueTypes: string[];
  checkedVariationIds: Set<string>;
  connectionsDisabled?: boolean;
  /** Drives noodle recomputation when variation set changes (same ref map, new ids). */
  allVariationIdsKey?: string;
  snapshotHistory: SnapshotItem[];
  selectedSnapshotId: string | null;
  snapshotGenerating: boolean;
  scrollTick: number;
  filmstripScrollTick: number;
  layoutTick?: number;
  /** Effective left panel width fraction (0–1). */
  vcPanelFraction?: number;
  onSelectSnapshot?: (id: string | null) => void;
  onDeleteSnapshot?: (id: string) => void;
  onGenerateSnapshot?: () => void;
  onGenerateBrandDirection?: (snapshotId: string) => void;
  onViewBrandDirection?: (snapshotId: string) => void;
  snapshotIdsWithDirection?: Set<string>;
  onSnapshotDragOver?: (e: React.DragEvent, snapshotId: string) => void;
  onSnapshotDragLeave?: (e: React.DragEvent, snapshotId: string) => void;
  onSnapshotDrop?: (e: React.DragEvent, snapshotId: string) => void;
  snapshotDropTargetId?: string | null;
}

export function VisualSnapshotPanel({
  containerSize,
  containerRef,
  zoom,
  pan,
  variationElMapRef,
  slotPositionMapRef,
  filmstripScrollMapRef,
  visibleQueueTypes,
  checkedVariationIds,
  connectionsDisabled = false,
  allVariationIdsKey = "",
  snapshotHistory,
  selectedSnapshotId,
  snapshotGenerating,
  scrollTick,
  filmstripScrollTick,
  layoutTick = 0,
  onSelectSnapshot,
  onDeleteSnapshot,
  onGenerateSnapshot,
  onGenerateBrandDirection,
  onViewBrandDirection,
  snapshotIdsWithDirection = EMPTY_SET,
  onSnapshotDragOver,
  onSnapshotDragLeave,
  onSnapshotDrop,
  snapshotDropTargetId,
  vcPanelFraction = 0,
}: VisualSnapshotPanelProps) {
  const selectedSnapshotElRef = useRef<HTMLButtonElement | null>(null);
  const createSnapshotBtnRef = useRef<HTMLButtonElement | null>(null);
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

  const vcPanelW = Math.floor(containerSize.w * vcPanelFraction);
  const vsNodeW = Math.min(Math.floor(containerSize.w * LAYOUT.overlay.rightWidthFraction), vcPanelW);
  const vsRightMargin = LAYOUT.overlay.rightMarginRight;
  const vsTopMargin = LAYOUT.overlay.rightMarginTop;
  const vsBottomMargin = LAYOUT.overlay.rightMarginBottom;
  const vsLeft = containerSize.w - vsNodeW - vsRightMargin;

  const dpr = typeof window !== "undefined" ? Math.max(1, window.devicePixelRatio || 1) : 1;
  const snap = (v: number) => Math.round(v * dpr) / dpr;

  const checkedIdsKey = useMemo(
    () => Array.from(checkedVariationIds).sort().join("|"),
    [checkedVariationIds],
  );

  // Prefer measured card endpoints so noodles follow dynamic image widths,
  // zoom/pan transforms, and filmstrip scroll exactly; keep math as fallback.
  const cardEndpoints = useMemo<Array<{ x: number; y: number }>>(() => {
    if (connectionsDisabled) return [];
    if (checkedVariationIds.size === 0) return [];

    const containerRectForCards = containerRef.current?.getBoundingClientRect();
    const padLeft = LAYOUT.filmstrip.paddingLeft;
    const padTop = LAYOUT.filmstrip.paddingTop;
    const toggleInset = LAYOUT.connection.toggleInset;
    const rowH = LAYOUT.queue.rowHeight;
    const rowGap = LAYOUT.queue.gap;

    const points: Array<{ x: number; y: number }> = [];

    checkedVariationIds.forEach((varId) => {
      if (containerRectForCards) {
        const el = variationElMapRef.current.get(varId);
        if (el) {
          const r = el.getBoundingClientRect();
          const cx = r.right - containerRectForCards.left - toggleInset * zoom;
          const cy = r.top - containerRectForCards.top + toggleInset * zoom;
          if (cx < 0 || cx > containerSize.w || cy < 0 || cy > containerSize.h) return;
          points.push({ x: snap(cx), y: snap(cy) });
          return;
        }
      }

      const slot = slotPositionMapRef.current.get(varId);
      if (!slot) return;

      const queueType = visibleQueueTypes[slot.queueIndex];
      if (!queueType) return;

      const scrollLeft = filmstripScrollMapRef.current.get(queueType) ?? 0;

      const vcPanelScreenW = vcPanelFraction > 0
        ? containerSize.w * vcPanelFraction + LAYOUT.overlay.leftMarginLeft + LAYOUT.popup.offset
        : 0;
      const contentX = padLeft + slot.offsetInFilmstrip + slot.slotWidth - toggleInset;
      const cx = vcPanelScreenW + LAYOUT.popup.offset + (contentX - scrollLeft) * zoom;

      // Y: standard canvas-to-container transform, offset by canvas content top padding
      const queueTop = CANVAS.CONTENT_TOP_PAD + slot.queueIndex * (rowH + rowGap);
      const cy = pan.y + (queueTop + padTop + toggleInset) * zoom;

      if (cx < 0 || cx > containerSize.w || cy < 0 || cy > containerSize.h) return;

      points.push({ x: snap(cx), y: snap(cy) });
    });

    return points;
  }, [
    checkedVariationIds,
    checkedIdsKey,
    connectionsDisabled,
    containerRef,
    variationElMapRef,
    slotPositionMapRef,
    filmstripScrollMapRef,
    visibleQueueTypes,
    dpr,
    pan.y,
    zoom,
    containerSize,
    filmstripScrollTick,
    layoutTick,
    scrollTick,
    vcPanelFraction,
    allVariationIdsKey,
  ]);

  const headerH = LAYOUT.overlay.headerHeight;
  const defaultPortX = vsLeft;
  const defaultPortY = vsTopMargin + headerH / 2;

  // portX/portY: VS panel is outside the canvas transform, so DOM measurement is stable here.
  const containerRect = containerRef.current?.getBoundingClientRect();
  const { portX, portY } = useMemo(() => {
    let x = defaultPortX;
    let y = defaultPortY;
    if (selectedSnapshotId && selectedSnapshotElRef.current && containerRect) {
      const r = selectedSnapshotElRef.current.getBoundingClientRect();
      x = r.left - containerRect.left + SNAPSHOT_DOT_CENTER_OFFSET;
      y = r.top - containerRect.top + SNAPSHOT_DOT_CENTER_OFFSET;
    } else if (!selectedSnapshotId && createSnapshotBtnRef.current && containerRect) {
      const r = createSnapshotBtnRef.current.getBoundingClientRect();
      x = r.left - containerRect.left + SNAPSHOT_DOT_CENTER_OFFSET;
      y = r.top - containerRect.top + SNAPSHOT_DOT_CENTER_OFFSET;
    }
    return { portX: snap(x), portY: snap(y) };
  }, [containerRect, defaultPortX, defaultPortY, dpr, selectedSnapshotId, vsScrollTick, layoutTick]);

  const selectedCount = checkedVariationIds.size;
  const hasChecked = selectedCount > 0;
  const selectedRequiredTypes = useMemo(() => {
    const selected = new Set<string>();
    checkedVariationIds.forEach((varId) => {
      const slot = slotPositionMapRef.current.get(varId);
      if (!slot) return;
      const queueType = visibleQueueTypes[slot.queueIndex];
      if (!queueType) return;
      if (SNAPSHOT_REQUIRED_TYPES.some((item) => item.key === queueType)) selected.add(queueType);
    });
    return selected;
  }, [checkedVariationIds, slotPositionMapRef, visibleQueueTypes, checkedIdsKey, layoutTick, allVariationIdsKey]);
  const hasRequiredSelections = SNAPSHOT_REQUIRED_TYPES.every((item) => selectedRequiredTypes.has(item.key));
  const canGenerateSnapshot = hasRequiredSelections && !snapshotGenerating && !connectionsDisabled && !!onGenerateSnapshot;
  const generateDisabledReason = snapshotGenerating
    ? "Creating snapshot..."
    : connectionsDisabled
      ? "Generation in progress..."
    : hasRequiredSelections
      ? null
      : "Select required elements first";

  return (
    <>
      {!connectionsDisabled && (
        <NoodleConnections
          cardEndpoints={cardEndpoints}
          portX={portX}
          portY={portY}
        />
      )}

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
          className="w-full h-full rounded-l-xl bg-white/95 backdrop-blur-sm flex flex-col overflow-hidden"
          style={{
            boxShadow: `var(--bb-vs-panel-shadow)`,
          }}
        >
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            {/* Create snapshot — fixed at top, does not scroll with history */}
            <div className="shrink-0 px-2 pt-2 pb-2">
              <button
                ref={createSnapshotBtnRef}
                onClick={onGenerateSnapshot}
                disabled={!canGenerateSnapshot}
                title={generateDisabledReason ?? "Create visual snapshot"}
                className="relative w-full rounded-lg flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-55 disabled:pointer-events-none shrink-0"
                style={{
                  aspectRatio: `${LAYOUT.card.snapshotAspectRatio}`,
                  border: canGenerateSnapshot
                    ? "2px solid transparent"
                    : `2px dashed var(--bb-user-inactive-border)`,
                  background: canGenerateSnapshot
                    ? "var(--bb-ai-active-bg)"
                    : "var(--bb-user-inactive-bg)",
                  color: canGenerateSnapshot
                    ? "var(--bb-ai-active-ring)"
                    : "var(--bb-user-inactive-accent)",
                }}
              >
                <Plus size={TYPE.size.xl} />
                <span style={{ fontSize: TYPE.size.xs }}>Create Visual Snapshot</span>
              </button>
            </div>

            {/* Snapshot history list (scrollable) */}
            <div
              ref={vsScrollContainerRef}
              className="flex-1 overflow-y-auto px-2 pb-2 min-h-0 flex flex-col gap-2"
              data-vs-snapshot-scroll
            >
            {snapshotGenerating && (
              <div
                className="w-full rounded-lg flex flex-col items-center justify-center gap-2 shrink-0"
                style={{
                  aspectRatio: `${LAYOUT.card.snapshotAspectRatio}`,
                  background: "var(--bb-user-active-bg)",
                  border: `1px dashed var(--bb-user-active-border)`,
                }}
              >
                <div
                  className="rounded-full animate-spin"
                  style={{
                    width: VISUAL_CONCEPT_PANEL.spinner.block.size,
                    height: VISUAL_CONCEPT_PANEL.spinner.block.size,
                    borderWidth: VISUAL_CONCEPT_PANEL.spinner.block.borderWidth,
                    borderStyle: "solid",
                    borderColor: "var(--bb-user-active-border)",
                    borderTopColor: "var(--bb-user-active-accent)",
                  }}
                />
                <span className="text-muted-foreground/50 select-none" style={{ fontSize: TYPE.size.xs }}>
                  Generating…
                </span>
              </div>
            )}
            {snapshotHistory.map((snap) => {
                  const isSelected = selectedSnapshotId === snap.id;
                  const isMergeTarget = snapshotDropTargetId === snap.id;
                  const meta = snap.generationMeta;
                  return (
                    <div
                      key={snap.id}
                      className="relative group/snap"
                      onDragOver={(e) => onSnapshotDragOver?.(e, snap.id)}
                      onDragLeave={(e) => onSnapshotDragLeave?.(e, snap.id)}
                      onDrop={(e) => onSnapshotDrop?.(e, snap.id)}
                    >
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
                          aspectRatio: `${LAYOUT.card.snapshotAspectRatio}`,
                          outline: isSelected
                            ? "2.5px solid var(--bb-user-active-accent)"
                            : `1px solid var(--bb-vs-snapshot-outline)`,
                          outlineOffset: isSelected ? -1 : 0,
                          boxShadow: isSelected ? `0 0 0 4px var(--bb-vs-snapshot-selected-ring)` : "none",
                        }}
                      >
                        <img
                          src={snap.imageUrl}
                          alt="Snapshot"
                          className="w-full h-full object-cover"
                          draggable={false}
                        />
                        <div
                          className="absolute top-2 left-2 rounded-full border-2 border-white shadow-sm transition-colors"
                          style={{
                            width: TYPE.icon.sm,
                            height: TYPE.icon.sm,
                            background: isSelected
                              ? "var(--bb-user-active-accent)"
                              : "var(--bb-vs-snapshot-radio-inactive)",
                          }}
                        />
                      </button>

                      {isMergeTarget && (
                        <div
                          className="absolute inset-0 z-30 rounded-lg pointer-events-none"
                          style={MERGE_TARGET_OVERLAY_STYLE}
                        />
                      )}

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteSnapshot?.(snap.id);
                        }}
                        title="Delete snapshot"
                        className="absolute top-2 right-2 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center opacity-0 group-hover/snap:opacity-100 focus:opacity-100 transition-opacity"
                        style={{
                          width: VISUAL_CONCEPT_PANEL.spinner.block.size,
                          height: VISUAL_CONCEPT_PANEL.spinner.block.size,
                        }}
                      >
                        <X size={TYPE.icon.sm} className="text-white" />
                      </button>
                      {meta && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenSnapshotInfoId((prev) => (prev === snap.id ? null : snap.id));
                          }}
                          title="Generation details"
                          className="absolute bottom-2 left-2 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center opacity-0 group-hover/snap:opacity-100 focus:opacity-100 transition-opacity"
                          style={{
                            width: VISUAL_CONCEPT_PANEL.spinner.block.size,
                            height: VISUAL_CONCEPT_PANEL.spinner.block.size,
                          }}
                        >
                          <Info size={TYPE.icon.sm} className="text-white" />
                        </button>
                      )}

                      {/* Brand Direction icon */}
                      {(() => {
                        const hasDirection = snapshotIdsWithDirection.has(snap.id);
                        return (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (hasDirection) {
                                    onViewBrandDirection?.(snap.id);
                                  } else {
                                    onGenerateBrandDirection?.(snap.id);
                                  }
                                }}
                                className="absolute bottom-2 right-2 rounded-full flex items-center justify-center transition-all active:scale-90 text-white cursor-pointer"
                                style={{
                                  width: TYPE.size.xxl,
                                  height: TYPE.size.xxl,
                                  background: hasDirection ? "#000000" : "var(--bb-ai-active-ring)",
                                  boxShadow: "var(--bb-hud-shadow)",
                                }}
                              >
                                {hasDirection
                                  ? <Eye size={TYPE.size.base} />
                                  : <Sparkles size={TYPE.size.base} />}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="left">
                              {hasDirection ? "View Brand Direction" : "Generate Brand Direction"}
                            </TooltipContent>
                          </Tooltip>
                        );
                      })()}
                    </div>
                  );
                })}
            </div>
          </div>

        </div>
      </div>

      {/* Generation details floating panel */}
      {openSnapshotInfoId && containerRect && (() => {
        const popupLeft = containerRect.left + vsLeft - LAYOUT.popup.detailsWidth - LAYOUT.popup.detailsGap;
        const popupTop = containerRect.top + vsTopMargin;
        const currentMeta = snapshotHistory.find((s) => s.id === openSnapshotInfoId)?.generationMeta;
        return createPortal(
          <div
            ref={vsDetailsPopupRef}
            className="fixed z-[9999] bg-white rounded-xl border border-border/60 shadow-xl overflow-hidden"
            style={{
              left: popupLeft,
              top: popupTop,
              width: LAYOUT.popup.detailsWidth,
              maxHeight: window.innerHeight - popupTop - LAYOUT.popup.offset,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <GenerationDetailsPanel
              meta={currentMeta}
              onClose={() => setOpenSnapshotInfoId(null)}
            />
          </div>,
          document.body
        );
      })()}
    </>
  );
}
