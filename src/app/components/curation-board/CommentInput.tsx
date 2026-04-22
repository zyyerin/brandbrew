import React, { useState, useRef, useEffect, useCallback } from "react";
import { ArrowUp, X } from "lucide-react";
import { LAYOUT } from "../../utils/design-tokens";

const COMMENT_INPUT_MIN_WIDTH = 280;

interface CommentInputProps {
  anchorEl: HTMLElement | null;
  onSubmit: (comment: string) => void;
  onCancel: () => void;
}

export function CommentInput({ anchorEl, onSubmit, onCancel }: CommentInputProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);

  const updatePosition = useCallback(() => {
    if (!anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    setPos({
      left: rect.left,
      top: rect.bottom + LAYOUT.popup.offset,
      width: Math.max(rect.width, COMMENT_INPUT_MIN_WIDTH),
    });
  }, [anchorEl]);

  useEffect(() => {
    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [updatePosition]);

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const handleSubmit = () => {
    if (!value.trim()) return;
    onSubmit(value);
    setValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
    e.stopPropagation();
  };

  if (!pos) return null;

  const canSubmit = value.trim().length > 0;

  return (
    <div
      data-comment-input
      className="fixed z-[9999]"
      style={{ left: pos.left, top: pos.top, width: pos.width }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        className="rounded-full px-2.5 py-1.5 backdrop-blur-sm border flex items-center gap-2"
        style={{ background: "rgba(255,255,255,0.92)", borderColor: "var(--border)", boxShadow: "var(--bb-hud-shadow)" }}
      >
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe what to change"
          className="flex-1 bg-transparent text-[13px] outline-none text-foreground placeholder:text-muted-foreground/70"
          style={{ caretColor: "var(--foreground)" }}
        />

        <button
          onClick={onCancel}
          className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
          title="Cancel comment"
        >
          <X size={14} strokeWidth={2.4} />
        </button>

        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer disabled:cursor-not-allowed"
          style={{
            background: canSubmit ? "var(--bb-ai-active-ring)" : "rgba(0,0,0,0.08)",
            color: canSubmit ? "white" : "rgba(0,0,0,0.35)",
          }}
          title="Submit comment"
        >
          <ArrowUp size={15} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}
