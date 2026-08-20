import { useRef, useState } from "react";
import type { KeyboardEvent, ClipboardEvent, DragEvent } from "react";
import { X, Plus } from "lucide-react";
import { parseTagList } from "../utils/parse-tag-list";

interface CapsuleTagInputProps {
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Extra classes applied to the outer wrapper. */
  className?: string;
  /** When true, renders ALL chips with a violet tint to signal AI-generated content. */
  generated?: boolean;
  /** Per-tag set of values that should render with violet tint; overrides `generated` per chip. */
  generatedTags?: Set<string>;
}

export function CapsuleTagInput({
  tags,
  onTagsChange,
  placeholder = "Add tag…",
  disabled = false,
  className = "",
  generated = false,
  generatedTags,
}: CapsuleTagInputProps) {
  const [draft, setDraft] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Inline editing state ────────────────────────────────────────────────────
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const editRef = useRef<HTMLInputElement>(null);

  // ── Drag reorder state ──────────────────────────────────────────────────────
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropTargetIdx, setDropTargetIdx] = useState<number | null>(null);

  const appendTags = (incoming: string[]) => {
    if (incoming.length === 0) return;
    const next = [...tags];
    for (const tag of incoming) {
      if (!next.includes(tag)) next.push(tag);
    }
    onTagsChange(next);
  };

  const commitDraft = (value: string) => {
    appendTags(parseTagList(value));
    setDraft("");
    setIsAdding(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commitDraft(draft);
    } else if (e.key === "Backspace" && draft === "") {
      if (tags.length > 0) {
        onTagsChange(tags.slice(0, -1));
      }
    } else if (e.key === "Escape") {
      setDraft("");
      setIsAdding(false);
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    const pasted = parseTagList(text);
    if (pasted.length === 0) return;
    const isPlainSingle = pasted.length === 1 && pasted[0] === text.trim();
    if (isPlainSingle) return;
    e.preventDefault();
    appendTags(pasted);
    setDraft("");
    setIsAdding(false);
  };

  const removeTag = (idx: number) => {
    onTagsChange(tags.filter((_, i) => i !== idx));
  };

  const startAdding = () => {
    if (disabled) return;
    setIsAdding(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  // ── Inline editing ──────────────────────────────────────────────────────────

  const startEditing = (idx: number) => {
    if (disabled) return;
    setEditingIdx(idx);
    setEditValue(tags[idx]);
    requestAnimationFrame(() => editRef.current?.select());
  };

  const commitEdit = () => {
    if (editingIdx === null) return;
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== tags[editingIdx]) {
      const next = [...tags];
      next[editingIdx] = trimmed;
      onTagsChange(next);
    } else if (!trimmed) {
      removeTag(editingIdx);
    }
    setEditingIdx(null);
    setEditValue("");
  };

  const cancelEdit = () => {
    setEditingIdx(null);
    setEditValue("");
  };

  const handleEditKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
    else if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
  };

  // ── Drag reorder ────────────────────────────────────────────────────────────

  const handleDragStart = (e: DragEvent, idx: number) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(idx));
  };

  const handleDragOver = (e: DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragIdx !== null && idx !== dragIdx) {
      setDropTargetIdx(idx);
    }
  };

  const handleDragLeave = () => {
    setDropTargetIdx(null);
  };

  const handleDrop = (e: DragEvent, targetIdx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === targetIdx) {
      setDragIdx(null);
      setDropTargetIdx(null);
      return;
    }
    const next = [...tags];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(targetIdx, 0, moved);
    onTagsChange(next);
    setDragIdx(null);
    setDropTargetIdx(null);
  };

  const handleDragEnd = () => {
    setDragIdx(null);
    setDropTargetIdx(null);
  };

  const isGenTag = (tag: string) =>
    generatedTags ? generatedTags.has(tag) : generated;

  return (
    <div
      role="group"
      aria-label="Tag input"
      className={`flex flex-wrap items-center gap-1.5 py-1 ${className}`}
    >
      {tags.map((tag, idx) => (
        <span
          key={idx}
          draggable={!disabled && editingIdx !== idx}
          onDragStart={(e) => handleDragStart(e, idx)}
          onDragOver={(e) => handleDragOver(e, idx)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, idx)}
          onDragEnd={handleDragEnd}
          onDoubleClick={() => startEditing(idx)}
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11.5px] font-medium select-none transition-colors ${
            isGenTag(tag)
              ? "bg-violet-100/70 text-violet-700"
              : "bg-foreground/[0.07] text-foreground/75"
          } ${!disabled && editingIdx !== idx ? "cursor-grab active:cursor-grabbing" : ""} ${
            dragIdx === idx ? "opacity-40" : ""
          } ${dropTargetIdx === idx ? "ring-2 ring-primary/40" : ""}`}
        >
          {editingIdx === idx ? (
            <input
              ref={editRef}
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleEditKeyDown}
              onBlur={commitEdit}
              className="bg-transparent outline-none border-none p-0 text-[11.5px] font-medium w-auto min-w-[2ch]"
              style={{ width: `${Math.max(editValue.length, 2)}ch` }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            tag
          )}
          {!disabled && editingIdx !== idx && (
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

      {/* Inline add input — shown only while actively adding */}
      {isAdding && (
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onBlur={() => commitDraft(draft)}
          placeholder={placeholder}
          disabled={disabled}
          aria-label="Add tag"
          className="text-[11.5px] text-foreground placeholder:text-muted-foreground/40 bg-transparent outline-none border-b border-muted-foreground/25 focus:border-primary/50 px-0.5 pb-0.5 min-w-[80px] max-w-[160px]"
        />
      )}

      {/* + button — shown when not disabled and not already in add mode */}
      {!disabled && !isAdding && (
        <button
          type="button"
          onClick={startAdding}
          className="inline-flex items-center justify-center w-5 h-5 rounded-full text-muted-foreground/50 hover:text-foreground/70 hover:bg-foreground/10 active:bg-foreground/15 transition-colors shrink-0"
          tabIndex={-1}
          aria-label="Add tag"
        >
          <Plus size={11} />
        </button>
      )}
    </div>
  );
}
