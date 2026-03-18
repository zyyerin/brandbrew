import { X, Layers } from "lucide-react";
import type { CardMeta } from "../types/project";
import { LAYOUT } from "../utils/design-tokens";
import { formatTimestamp } from "../utils/helpers";

export interface VariationItem {
  id: string;
  label: string;
  type: string;
  data: any;
  isOriginal?: boolean;
  createdAt: Date;
  meta?: CardMeta;
}

interface VariationsPanelProps {
  open: boolean;
  onClose: () => void;
  variations: VariationItem[];
  activeCardId: string | null;
  onSelectVariation: (id: string) => void;
}

export function VariationsPanel({
  open,
  onClose,
  variations,
  activeCardId,
  onSelectVariation,
}: VariationsPanelProps) {
  return (
    <div
      className="h-full border-l border-border/60 bg-white flex flex-col overflow-hidden shadow-xl"
      style={{ width: LAYOUT.VARIATIONS_PANEL_WIDTH }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 shrink-0 bg-muted/10">
        <div className="flex items-center gap-2 min-w-0">
          <Layers size={14} className="text-muted-foreground/50 shrink-0" />
          <div className="min-w-0">
            <p className="text-[13px] text-foreground truncate" style={{ fontWeight: 600 }}>
              History
            </p>
            <p className="text-[11px] text-muted-foreground/50">
              {variations.length} variation{variations.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-muted-foreground/40 hover:text-foreground transition-colors rounded-md hover:bg-muted/50"
        >
          <X size={14} />
        </button>
      </div>

      {/* Variations list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {variations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-2 py-12">
            <Layers size={18} className="text-muted-foreground/30" />
            <p className="text-[12px] text-muted-foreground/40">
              No variations yet. Generate some!
            </p>
          </div>
        ) : (
          [...variations]
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .map((v) => {
              const isActive = v.id === activeCardId;
              return (
                <div key={v.id} className="relative">
                  <div
                    onClick={() => onSelectVariation(v.id)}
                    className={`rounded-xl border-2 transition-all cursor-pointer overflow-hidden ${
                      isActive
                        ? "border-blue-400 ring-2 ring-blue-200/50 shadow-md shadow-blue-100/40"
                        : "border-transparent hover:border-border/60"
                    }`}
                  >
                    {/* Timestamp badge */}
                    <div className="flex items-center justify-between px-3 py-2 bg-muted/20">
                      <span className="text-[10px] font-mono text-muted-foreground/55 tracking-tight">
                        {formatTimestamp(v.createdAt)}
                      </span>
                      {isActive && (
                        <div className="flex items-center justify-center shrink-0 px-1.5 py-0.5 bg-blue-500 rounded-full">
                          <span className="text-[9px] text-white font-semibold tracking-wide leading-none">Active</span>
                        </div>
                      )}
                    </div>

                    {/* Card preview */}
                    <div className="px-3 pb-3">
                      <VariationPreview variation={v} />
                    </div>
                  </div>
                </div>
              );
            })
        )}
      </div>
    </div>
  );
}


function VariationPreview({ variation }: { variation: VariationItem }) {
  const { type, data } = variation;

  if (type === "brand-brief") {
    return (
      <div>
        <h4 className="text-[16px] text-foreground mb-0.5" style={{ fontWeight: 400, lineHeight: 1.2 }}>
          {data.name}
        </h4>
        <p className="text-[11px] text-muted-foreground italic mb-1.5">{data.tagline}</p>
        <p className="text-[11px] text-foreground/55 leading-[1.5] line-clamp-2">{data.description}</p>
      </div>
    );
  }

  if (type === "keywords") {
    return (
      <div className="flex flex-col gap-0.5">
        {data.keywords?.slice(0, 3).map((kw: string, i: number) => (
          <span key={i} className="text-[14px] text-foreground leading-tight" style={{ fontWeight: i === 0 ? 400 : 700 }}>
            {kw}
          </span>
        ))}
        {data.keywords?.length > 3 && (
          <span className="text-[10px] text-muted-foreground/40">+{data.keywords.length - 3} more</span>
        )}
      </div>
    );
  }

  if (type === "visual-concept") {
    return (
      <div>
        <h4 className="text-[14px] text-foreground italic mb-1.5" style={{ fontWeight: 400 }}>
          {data.conceptName}
        </h4>
        <ul className="space-y-1">
          {data.points?.slice(0, 2).map((p: string, i: number) => (
            <li key={i} className="text-[11px] text-foreground/60 leading-[1.5] flex gap-1.5">
              <span className="text-foreground/30 mt-0.5">•</span>
              <span className="line-clamp-2">{p}</span>
            </li>
          ))}
          {data.points?.length > 2 && (
            <li className="text-[10px] text-muted-foreground/40">+{data.points.length - 2} more</li>
          )}
        </ul>
      </div>
    );
  }

  if (type === "font") {
    return (
      <div className="flex flex-col gap-1">
        <div>
          <span className="text-[9px] tracking-[0.1em] uppercase text-muted-foreground/50">Title</span>
          <p className="text-[18px] text-foreground" style={{ fontWeight: 400, lineHeight: 1.2 }}>
            {data.titleFont}
          </p>
        </div>
        <div>
          <span className="text-[9px] tracking-[0.1em] uppercase text-muted-foreground/50">Body</span>
          <p className="text-[14px] text-foreground" style={{ fontWeight: 400, lineHeight: 1.3 }}>
            {data.bodyFont}
          </p>
        </div>
      </div>
    );
  }

  if (type === "color") {
    return (
      <div className="flex h-16 gap-0 rounded-lg overflow-hidden">
        {data.colors?.map((color: string, i: number) => (
          <div key={i} className="flex-1" style={{ backgroundColor: color }} />
        ))}
      </div>
    );
  }

  // art-style, logo, layout, visual-snapshot — image thumbnail
  if (type === "art-style" || type === "logo" || type === "layout" || type === "visual-snapshot") {
    return (
      <div className="rounded-lg overflow-hidden border border-border/40">
        <div className="h-24 bg-muted/20 overflow-hidden">
          <img
            src={data.imageUrl}
            alt={variation.label}
            className="w-full h-full object-cover"
          />
        </div>
        <div className="flex items-center px-2.5 py-1.5 border-t border-border/30 bg-muted/5">
          <span className="text-[9px] tracking-[0.13em] uppercase text-muted-foreground/55">
            {variation.label}
          </span>
        </div>
      </div>
    );
  }

  // style-reference fallback
  if (data.imageUrl) {
    return (
      <div className="rounded-lg overflow-hidden border border-border/40">
        <img
          src={data.imageUrl}
          alt={variation.label}
          className="w-full h-24 object-cover"
        />
      </div>
    );
  }

  return <p className="text-[11px] text-muted-foreground/40">Preview unavailable</p>;
}