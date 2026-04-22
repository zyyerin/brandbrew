import { useState, useCallback, useEffect, useRef } from "react";

export interface CommentMergeState {
  commentMode: boolean;
  commentTarget: { elementType: string; variationId: string } | null;
  handleVariationClick: (elementType: string, variationId: string) => void;
  handleCommentSubmit: (comment: string) => void;
  handleCommentCancel: () => void;
  enterCommentMode: () => void;
  toggleCommentMode: () => void;
  clearCommentTarget: () => void;
  exitCommentMode: () => void;
}

export function useCommentMerge(
  onCommentModify?: (targetId: string, comment: string, targetVarId?: string) => void,
): CommentMergeState {
  const [commentMode, setCommentMode] = useState(false);
  const [commentTarget, setCommentTarget] = useState<{ elementType: string; variationId: string } | null>(null);

  const commentTargetRef = useRef(commentTarget);
  commentTargetRef.current = commentTarget;

  const onCommentModifyRef = useRef(onCommentModify);
  onCommentModifyRef.current = onCommentModify;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isEditable = tag === "INPUT" || tag === "TEXTAREA" ||
        (e.target as HTMLElement)?.isContentEditable;
      if (isEditable) return;

      if (e.key === "c" || e.key === "C") {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        setCommentMode((prev) => {
          if (prev) {
            setCommentTarget(null);
            return false;
          }
          return true;
        });
      }

      if (e.key === "Escape") {
        if (commentTargetRef.current) {
          setCommentTarget(null);
        } else {
          setCommentMode(false);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleVariationClick = useCallback((elementType: string, variationId: string) => {
    setCommentTarget({ elementType, variationId });
  }, []);

  const handleCommentSubmit = useCallback((comment: string) => {
    const target = commentTargetRef.current;
    if (!target || !comment.trim()) return;
    onCommentModifyRef.current?.(target.elementType, comment.trim(), target.variationId);
    setCommentTarget(null);
  }, []);

  const handleCommentCancel = useCallback(() => {
    setCommentTarget(null);
  }, []);

  const enterCommentMode = useCallback(() => {
    setCommentMode(true);
  }, []);

  const toggleCommentMode = useCallback(() => {
    setCommentMode((prev) => {
      if (prev) {
        setCommentTarget(null);
        return false;
      }
      return true;
    });
  }, []);

  const clearCommentTarget = useCallback(() => {
    setCommentTarget(null);
  }, []);

  const exitCommentMode = useCallback(() => {
    setCommentMode(false);
    setCommentTarget(null);
  }, []);

  return {
    commentMode,
    commentTarget,
    handleVariationClick,
    handleCommentSubmit,
    handleCommentCancel,
    enterCommentMode,
    toggleCommentMode,
    clearCommentTarget,
    exitCommentMode,
  };
}
