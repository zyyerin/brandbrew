import React, { useState, useRef, useEffect, useCallback } from "react";
import { ArrowUp } from "lucide-react";
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
      top: rect.bottom + LAYOUT.POPUP_OFFSET,
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
      className="fixed z-[9999]"
      style={{ left: pos.left, top: pos.top, width: pos.width }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        className="flex items-center gap-2 rounded-full px-4 py-2.5 shadow-xl backdrop-blur-md"
        style={{
          background: "var(--bb-comment-overlay-bg)",
          border: "1px solid var(--bb-comment-overlay-border)",
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add a comment"
          className="flex-1 bg-transparent text-white text-[14px] outline-none placeholder:text-white/40"
          style={{ caretColor: "white" }}
        />
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer"
          style={{
            background: canSubmit ? "var(--bb-comment-btn-active-bg)" : "var(--bb-comment-btn-inactive-bg)",
            color: canSubmit ? "var(--bb-comment-btn-active-color)" : "var(--bb-comment-btn-inactive-color)",
          }}
        >
          <ArrowUp size={15} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}
