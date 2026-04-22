import React, { useRef, useState, useMemo, useCallback, useEffect } from "react";
import { Pencil, Trash2, Check, X, DiamondPlus } from "lucide-react";
import { TYPE, CARD, LAYOUT, VISUAL_CONCEPT_PANEL, ACTION_CHROME } from "../../utils/design-tokens";
import type { VisualConceptData, ElementsState, ElementId } from "../../types/project";
import type { SlotPosition } from "../curation-board";

interface VariationItem {
  id: string;
  label: string;
  type: string;
  data: any;
  isOriginal?: boolean;
  createdAt: Date;
  meta?: import("../../types/project").VariationMeta;
}

interface VisualConceptPanelProps {
  containerSize: { w: number; h: number };
  containerRef: React.RefObject<HTMLDivElement | null>;
  conceptVariations: VariationItem[];
  activeConceptId: string | null;
  onSelectConcept: (variationId: string | null) => void;
  onAddConcept: () => void;
  onEditConcept: (data: VisualConceptData) => void;
  onDeleteConcept: (variationId: string) => void;
  isGenerating: boolean;
  isBrewing: boolean;
  isAddingVariation: boolean;
  zoom: number;
  pan: { x: number; y: number };
  slotPositionMapRef: React.RefObject<Map<string, SlotPosition>>;
  filmstripScrollMapRef: React.RefObject<Map<string, number>>;
  visibleQueueTypes: string[];
  elements: ElementsState;
  scrollTick: number;
  filmstripScrollTick: number;
  layoutTick: number;
}

export function VisualConceptPanel(props: VisualConceptPanelProps) {
  const {
    conceptVariations,
    activeConceptId,
    onSelectConcept,
    onAddConcept,
    onEditConcept,
    onDeleteConcept,
    isGenerating,
    isBrewing,
    isAddingVariation,
    elements,
  } = props;

  const vcPanelRef = useRef<HTMLDivElement>(null);
  const descTextareaRef = useRef<HTMLTextAreaElement>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editDescValue, setEditDescValue] = useState("");

  useEffect(() => {
    const el = descTextareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [editDescValue, editingId]);

  const isConceptGenerating = isAddingVariation || isGenerating || isBrewing;

  const hasVariations = conceptVariations.length > 0;
  const conceptLinkCountMap = useMemo(() => {
    const map = new Map<string, number>();
    const elementIds: ElementId[] = ["color-palette", "font", "logo", "art-style"];
    for (const eid of elementIds) {
      const slot = elements[eid];
      if (!slot) continue;
      for (const variation of slot.variations) {
        const sourceId = variation.meta?.sourceConceptVariationId;
        if (!sourceId) continue;
        map.set(sourceId, (map.get(sourceId) ?? 0) + 1);
      }
    }
    return map;
  }, [elements]);

  const handleStartEdit = useCallback((id: string, currentName: string, currentDesc: string) => {
    setEditingId(id);
    setEditValue(currentName);
    setEditDescValue(currentDesc);
  }, []);

  const handleSaveEdit = useCallback((id: string) => {
    const variation = conceptVariations.find((v) => v.id === id);
    if (variation) {
      const conceptData = variation.data as VisualConceptData;
      onEditConcept({
        ...conceptData,
        concept: editValue.trim() || conceptData.concept,
        description: editDescValue.trim(),
      });
    }
    setEditingId(null);
  }, [conceptVariations, editValue, editDescValue, onEditConcept]);

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
  }, []);

  return (
    <div ref={vcPanelRef} className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {/* Header */}
          <div
            className="px-3 py-2 flex flex-col gap-2 select-none shrink-0"
            style={VISUAL_CONCEPT_PANEL.header}
          >
            <button
              onClick={onAddConcept}
              disabled={isConceptGenerating}
              className="w-full px-3 flex items-center justify-center gap-2 rounded-lg transition-colors cursor-pointer disabled:opacity-55 disabled:pointer-events-none"
              style={{
                ...VISUAL_CONCEPT_PANEL.addConceptButton,
                fontSize: TYPE.size.baseSm,
                fontWeight: TYPE.weight.semibold,
              }}
            >
              {isConceptGenerating ? (
                <>
                  <div
                    className="rounded-full animate-spin shrink-0"
                    style={{
                      width: VISUAL_CONCEPT_PANEL.spinner.button.size,
                      height: VISUAL_CONCEPT_PANEL.spinner.button.size,
                      borderWidth: VISUAL_CONCEPT_PANEL.spinner.button.borderWidth,
                      borderStyle: "solid",
                      borderColor: VISUAL_CONCEPT_PANEL.spinner.buttonTrack,
                      borderTopColor: VISUAL_CONCEPT_PANEL.spinner.buttonCap,
                    }}
                  />
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <DiamondPlus size={TYPE.icon.base} />
                  <span>Visual Concept</span>
                </>
              )}
            </button>
          </div>

          {/* Concept variations list */}
          <div className="flex-1 overflow-y-auto p-2 min-h-0" data-vc-concept-scroll>
            {(isGenerating || isBrewing) && conceptVariations.length === 0 && (
              <div
                className="w-full rounded-lg flex flex-col items-center justify-center gap-2 shrink-0 mb-2 py-6"
                style={VISUAL_CONCEPT_PANEL.conceptualizingPlaceholder}
              >
                <div
                  className="rounded-full animate-spin"
                  style={{
                    width: VISUAL_CONCEPT_PANEL.spinner.block.size,
                    height: VISUAL_CONCEPT_PANEL.spinner.block.size,
                    borderWidth: VISUAL_CONCEPT_PANEL.spinner.block.borderWidth,
                    borderStyle: "solid",
                    borderColor: VISUAL_CONCEPT_PANEL.spinner.blockTrack,
                    borderTopColor: VISUAL_CONCEPT_PANEL.spinner.blockCap,
                  }}
                />
                <span className="text-muted-foreground/50 select-none" style={{ fontSize: TYPE.size.xs }}>
                  Conceptualizing...
                </span>
              </div>
            )}

            {!hasVariations && !isGenerating && !isBrewing && (
              <div className="h-full flex items-center justify-center px-4">
                <div className="flex flex-col items-center gap-2 text-center">
                  <span
                    className="text-muted-foreground/40 leading-relaxed select-none"
                    style={{ fontSize: TYPE.size.sm, maxWidth: VISUAL_CONCEPT_PANEL.emptyStateMaxWidth }}
                  >
                    Generate your brand to create the first visual concept
                  </span>
                </div>
              </div>
            )}

            {conceptVariations.length > 0 && (
              <div className="flex flex-col gap-2">
                {conceptVariations.map((variation) => {
                  const isSelected = activeConceptId === variation.id;
                  const conceptData = variation.data as VisualConceptData;
                  const isEditing = editingId === variation.id;
                  const linkCount = conceptLinkCountMap.get(variation.id) ?? 0;
                  const hasLinks = linkCount > 0;

                  return (
                    <div key={variation.id} className="relative group/concept">
                      {/* Card wrapper: always a div to allow nested interactive elements */}
                      <div
                        data-no-pan
                        role={isEditing ? undefined : "button"}
                        tabIndex={isEditing ? undefined : 0}
                        onClick={isEditing ? undefined : () => onSelectConcept(isSelected ? null : variation.id)}
                        onKeyDown={isEditing ? undefined : (e) => { if (e.key === "Enter" || e.key === " ") onSelectConcept(isSelected ? null : variation.id); }}
                        className={`relative w-full rounded-lg overflow-hidden transition-all block text-left p-3 ${isEditing ? "" : "cursor-pointer"}`}
                        style={{
                          outline: isSelected ? CARD.selectedOutline : "none",
                          outlineOffset: isSelected ? -1 : 0,
                          boxShadow: "none",
                          background: CARD.defaultBg,
                        }}
                      >
                        {isEditing ? (
                          <div className="flex flex-col gap-2">
                            <input
                              autoFocus
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Escape") handleCancelEdit();
                              }}
                              className="w-full bg-transparent border-b border-bb-ai-affordance-border focus:border-bb-ai-active-ring outline-none text-foreground focus:ring-1 focus:ring-bb-ai-active-ring-outer"
                              style={{ fontSize: TYPE.size.baseSm }}
                              placeholder="Concept name"
                            />
                            <textarea
                              ref={descTextareaRef}
                              value={editDescValue}
                              onChange={(e) => setEditDescValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Escape") handleCancelEdit();
                              }}
                              className="w-full bg-transparent border-b outline-none text-muted-foreground resize-none leading-relaxed overflow-hidden focus:ring-1 focus:ring-bb-ai-active-ring-outer"
                              style={{
                                fontSize: TYPE.size.xs,
                                borderBottom: VISUAL_CONCEPT_PANEL.editDescriptionUnderline,
                              }}
                              placeholder="Description (optional)"
                              rows={1}
                            />
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleSaveEdit(variation.id); }}
                                className={`p-1 rounded ${ACTION_CHROME.confirm}`}
                              >
                                <Check size={TYPE.icon.compact} />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleCancelEdit(); }}
                                className={`p-1 rounded ${ACTION_CHROME.dismissCancel}`}
                              >
                                <X size={TYPE.icon.compact} />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex flex-col gap-1 min-w-0">
                              <div className="flex items-center gap-2 min-w-0">
                                {isSelected && (
                                  <span
                                    aria-hidden
                                    className="shrink-0 rounded-full bb-vc-active-dot"
                                    style={{
                                      width: LAYOUT.connection.portRadius * 2,
                                      height: LAYOUT.connection.portRadius * 2,
                                      ...VISUAL_CONCEPT_PANEL.selectedIndicatorDot,
                                    }}
                                  />
                                )}
                                <span
                                  className="text-foreground/80 leading-snug min-w-0"
                                  style={{
                                    fontSize: TYPE.size.baseSm,
                                    lineHeight: TYPE.leading.relaxed,
                                    fontWeight: TYPE.weight.bold,
                                  }}
                                >
                                  {conceptData.concept || "Untitled Concept"}
                                </span>
                              </div>
                              {conceptData.description && (
                                <span
                                  className={`text-muted-foreground/50 leading-relaxed block line-clamp-2 ${isSelected ? "" : "hidden"}`}
                                  style={{ fontSize: TYPE.size.xs }}
                                >
                                  {conceptData.description}
                                </span>
                              )}
                            </div>
                          </>
                        )}
                      </div>

                      {/* Action buttons on hover */}
                      {!isEditing && (
                        <div className="absolute bottom-1.5 right-1.5 flex items-center gap-0.5 opacity-0 group-hover/concept:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleStartEdit(variation.id, conceptData.concept, conceptData.description ?? ""); }}
                            className={`p-1 rounded-md transition-colors ${ACTION_CHROME.rowEdit}`}
                            title="Edit concept name"
                          >
                            <Pencil size={TYPE.icon.sm} />
                          </button>
                          {conceptVariations.length > 1 && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); onDeleteConcept(variation.id); }}
                              className={`p-1 rounded-md transition-colors ${ACTION_CHROME.rowDelete}`}
                              title="Delete concept"
                            >
                              <Trash2 size={TYPE.icon.sm} />
                            </button>
                          )}
                        </div>
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
