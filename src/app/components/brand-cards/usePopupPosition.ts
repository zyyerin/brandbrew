import { useState, useEffect, useRef, type RefObject } from "react";
import { LAYOUT } from "../../utils/design-tokens";

interface PopupPositionConfig {
  width: number;
  maxHeight: number;
  padding: number;
}

export interface PopupPosition {
  top: number;
  left: number;
  width: number;
  /** When true, popover grows downward; when false, grows upward. */
  growDown: boolean;
  /** Max height for the popover container. */
  maxHeight: number;
  /** CSS transform when growing upward (e.g. "translateY(-100%)"). */
  transform?: string;
}

export function usePopupPosition(
  triggerRef: RefObject<HTMLElement | null>,
  isOpen: boolean,
  onClose: () => void,
  config: PopupPositionConfig,
) {
  const { width, maxHeight, padding } = config;
  const containerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<PopupPosition | null>(null);

  useEffect(() => {
    if (!isOpen || !triggerRef.current) {
      setPos(null);
      return;
    }
    const rect = triggerRef.current.getBoundingClientRect();
    const bottomGap = LAYOUT.popup.offset;
    const spaceAbove = rect.top - padding;
    const spaceBelow = window.innerHeight - rect.bottom - bottomGap;
    const growDown = spaceBelow >= spaceAbove;

    let top: number;
    let popupMaxHeight: number;
    let transform: string | undefined;

    if (growDown) {
      top = rect.bottom + LAYOUT.popup.offset;
      top = Math.min(top, window.innerHeight - padding - LAYOUT.popup.offset);
      popupMaxHeight = Math.max(LAYOUT.popup.minHeight, window.innerHeight - top - LAYOUT.popup.offset);
    } else {
      top = rect.top - LAYOUT.popup.offset;
      top = Math.max(top, padding);
      popupMaxHeight = Math.max(LAYOUT.popup.minHeight, top);
      transform = "translateY(-100%)";
    }

    const left = Math.max(padding, Math.min(rect.right - width, window.innerWidth - width - padding));
    setPos({ top, left, width, growDown, maxHeight: popupMaxHeight, transform });
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
