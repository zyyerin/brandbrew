import React from "react";
import type { CardMeta, CardState } from "./types";
import { CardWrapper } from "./CardWrapper";
import { useCardEditing } from "./useCardEditing";

interface VisualConceptProps {
  conceptName: string;
  points: string[];
  state?: CardState;
  onToggleActive?: () => void;
  onChange?: (data: { conceptName: string; points: string[] }) => void;
  onRefresh?: () => void;
  onDelete?: () => void;
  meta?: CardMeta;
}

export function VisualConceptCard({ conceptName, points, state, onToggleActive, onChange, onRefresh, onDelete, meta }: VisualConceptProps) {
  const { isEditing, local, updateField, setLocal, editingProps } = useCardEditing(
    { conceptName, points },
    {
      onChange,
      transformOnSave: (d) => ({ ...d, points: d.points.filter((p) => p.trim() !== "") }),
    },
  );

  return (
    <CardWrapper
      label="Visual Concept"
      state={state}
      editVariant="text"
      {...editingProps}
      onRegenerate={onRefresh}
      onDelete={onDelete}
      onToggleActive={isEditing ? undefined : onToggleActive}
      meta={meta}
    >
      <div onClick={(e) => isEditing && e.stopPropagation()}>
        {isEditing ? (
          <div className="flex flex-col gap-2.5">
            <input
              autoFocus
              value={local.conceptName}
              onChange={(e) => updateField("conceptName", e.target.value)}
              className="text-[18px] text-foreground italic bg-transparent border-b border-blue-300 focus:border-blue-500 outline-none w-full"
              style={{ fontWeight: 400 }}
              placeholder="Concept name"
            />
            <div className="space-y-2 mt-1">
              {local.points.map((pt, i) => (
                <textarea
                  key={i}
                  value={pt}
                  onChange={(e) => {
                    const next = [...local.points];
                    next[i] = e.target.value;
                    setLocal((prev) => ({ ...prev, points: next }));
                  }}
                  rows={2}
                  className="text-[12px] text-foreground/70 leading-[1.6] bg-muted/20 border border-blue-300 focus:border-blue-500 outline-none w-full rounded-lg px-2 py-1 resize-none block"
                  placeholder={`Point ${i + 1}`}
                />
              ))}
            </div>
          </div>
        ) : (
          <div>
            <h3 className="text-[18px] text-foreground italic mb-3" style={{ fontWeight: 400 }}>
              {local.conceptName}
            </h3>
            <ul className="space-y-1.5">
              {local.points.map((point, i) => (
                <li key={i} className="text-[12px] text-foreground/70 leading-[1.6] flex gap-2">
                  <span className="text-foreground/40 mt-0.5">•</span>
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </CardWrapper>
  );
}
