import { useRef, useState } from "react";
import type { KeyboardEvent, ClipboardEvent } from "react";
import { X } from "lucide-react";

interface CapsuleTagInputProps {
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Extra classes applied to the outer wrapper (border, ring, rounded, etc.). */
  className?: string;
  /** When true, renders chips with a blue tint to signal AI-generated content. */
  generated?: boolean;
}

export function CapsuleTagInput({
  tags,
  onTagsChange,
  placeholder = "Type and press Enter or comma",
  disabled = false,
  className = "",
  generated = false,
}: CapsuleTagInputProps) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const commitDraft = (value: string) => {
    const trimmed = value.trim().replace(/,$/, "").trim();
    if (trimmed) {
      onTagsChange([...tags, trimmed]);
    }
    setDraft("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commitDraft(draft);
    } else if (e.key === "Backspace" && draft === "") {
      if (tags.length > 0) {
        onTagsChange(tags.slice(0, -1));
      }
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    if (text.includes(",")) {
      e.preventDefault();
      const pasted = text
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const next = [...tags];
      for (const p of pasted) {
        if (!next.includes(p)) next.push(p);
      }
      onTagsChange(next);
      setDraft("");
    }
  };

  const removeTag = (idx: number) => {
    onTagsChange(tags.filter((_, i) => i !== idx));
  };

  return (
    <div
      role="group"
      aria-label="Tag input"
      className={`flex flex-wrap items-center gap-1.5 px-2.5 py-2 min-h-[38px] cursor-text transition-all ${className}`}
      onClick={() => inputRef.current?.focus()}
    >
      {tags.map((tag, idx) => (
        <span
          key={idx}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] font-medium border select-none transition-colors ${
            generated
              ? "bg-blue-50 text-blue-600 border-blue-200"
              : "bg-muted/60 text-foreground/80 border-border/40"
          }`}
        >
          {tag}
          {!disabled && (
            <button
              type="button"
              aria-label={`Remove ${tag}`}
              onMouseDown={(e) => {
                e.preventDefault();
                removeTag(idx);
              }}
              className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full hover:bg-black/10 transition-colors shrink-0"
              tabIndex={-1}
            >
              <X size={9} />
            </button>
          )}
        </span>
      ))}
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onBlur={() => {
          if (draft.trim()) commitDraft(draft);
        }}
        placeholder={tags.length === 0 ? placeholder : ""}
        disabled={disabled}
        aria-label={tags.length === 0 ? placeholder : "Add another tag"}
        className="flex-1 min-w-[100px] bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground/40 outline-none border-none p-0 disabled:cursor-not-allowed"
      />
    </div>
  );
}
