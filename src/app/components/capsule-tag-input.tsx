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
      className={`flex flex-wrap items-center gap-2 px-2.5 py-2 min-h-[38px] cursor-text transition-all ${className}`}
      onClick={() => inputRef.current?.focus()}
    >
      {tags.map((tag, idx) => (
        <span
          key={idx}
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11.5px] font-medium select-none transition-colors ${
            generated
              ? "bg-violet-100/70 text-violet-700"
              : "bg-foreground/[0.07] text-foreground/75"
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
              className="inline-flex items-center justify-center w-4 h-4 rounded-full ml-0.5 opacity-40 hover:opacity-100 hover:bg-black/10 transition-all shrink-0"
              tabIndex={-1}
            >
              <X size={10} />
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
