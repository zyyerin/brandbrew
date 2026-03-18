import { useState, useEffect, useRef, type RefObject } from "react";

interface PopupPositionConfig {
  width: number;
  maxHeight: number;
  padding: number;
}

export function usePopupPosition(
  triggerRef: RefObject<HTMLElement | null>,
  isOpen: boolean,
  onClose: () => void,
  config: PopupPositionConfig,
) {
  const { width, maxHeight, padding } = config;
  const containerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    if (!isOpen || !triggerRef.current) {
      setPos(null);
      return;
    }
    const rect = triggerRef.current.getBoundingClientRect();
    let top = rect.top - 8;
    let left = rect.right - width;
    top = Math.max(top, padding + maxHeight);
    top = Math.min(top, window.innerHeight - padding);
    left = Math.max(padding, Math.min(left, window.innerWidth - width - padding));
    setPos({ top, left, width });
  }, [isOpen, width, maxHeight, padding]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current && !containerRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen, onClose]);

  return { pos, containerRef };
}
