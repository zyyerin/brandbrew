import React from "react";

interface EmptyStateProps {
  suggestions?: string[];
  onSuggestionClick?: (s: string) => void;
}

export function EmptyState({ suggestions, onSuggestionClick }: EmptyStateProps) {
  return (
    <div
      className="flex flex-col justify-center h-full"
      style={{ background: "var(--bb-canvas-bg)" }}
    >
      <div className="max-w-lg text-left px-8 md:px-16 lg:px-24">
        <h1
          className="text-[32px] text-foreground mb-1"
          style={{ fontWeight: 400, lineHeight: 1.3, width: "50vw" }}
        >
          The canvas is yours.<br />
          What shall we create today?
        </h1>
        {suggestions && suggestions.length > 0 && (
          <div className="flex items-center gap-3">
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => onSuggestionClick?.(s)}
                className="px-4 py-2 text-[13px] text-foreground/60 border border-border/60 rounded-full hover:bg-white hover:border-border transition-all cursor-pointer"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
