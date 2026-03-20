import React, { useState, useCallback } from "react";
import { Upload } from "lucide-react";
import { LAYOUT, TYPOGRAPHY } from "../../utils/design-tokens";
import type { QueueColors } from "./QueueAffordanceSlot";

interface QueueBodyDropBlockProps {
  colors: QueueColors;
  isImageElementType: boolean;
  onUploadFile: (file: File) => void;
}

export function QueueBodyDropBlock({
  colors,
  isImageElementType,
  onUploadFile,
}: QueueBodyDropBlockProps) {
  const [isFileDragOver, setIsFileDragOver] = useState(false);

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (!e.dataTransfer.types.includes("Files")) return;
      if (!isImageElementType) return;
      e.preventDefault();
      e.stopPropagation();
      setIsFileDragOver(true);
    },
    [isImageElementType],
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      const related = e.relatedTarget as Node | null;
      if (related && e.currentTarget.contains(related)) return;
      setIsFileDragOver(false);
    },
    [],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (!e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      e.stopPropagation();
      setIsFileDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file?.type.startsWith("image/")) {
        onUploadFile(file);
      }
    },
    [onUploadFile],
  );

  const showFileHint = isFileDragOver && isImageElementType;

  return (
    <div
      className="flex-shrink-0 rounded-xl flex flex-col items-center justify-center gap-2 transition-all duration-150"
      style={{
        width: LAYOUT.VARIATION_SLOT_SIZE,
        height: LAYOUT.VARIATION_SLOT_SIZE,
        border: `2px dashed ${showFileHint ? colors.accent : `${colors.accent}50`}`,
        background: showFileHint ? `${colors.accent}12` : `${colors.accent}06`,
        cursor: showFileHint ? "copy" : "default",
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {showFileHint && (
        <>
          <Upload size={28} style={{ color: colors.accent }} />
          <span
            className="px-2 py-0.5 rounded-full text-center"
            style={{ fontSize: TYPOGRAPHY.queueLabel.fontSize, fontWeight: TYPOGRAPHY.queueLabel.fontWeight, color: colors.accent }}
          >
            Drop to upload
          </span>
        </>
      )}
    </div>
  );
}
