import { useState, useCallback, useRef, useEffect } from "react";
import { CANVAS, LAYOUT } from "../utils/design-tokens";
import {
  findFilmstripFromEventTarget,
  getFilmstripWheelDelta,
  isFilmstripOverflowing,
} from "../utils/filmstrip-wheel";

const ZOOM_MIN = CANVAS.ZOOM_MIN;
const ZOOM_MAX = CANVAS.ZOOM_MAX;
const INITIAL_PAN = CANVAS.PAN_INITIAL;
const INITIAL_ZOOM = CANVAS.ZOOM_INITIAL;
const TARGET_VISIBLE_QUEUE_ROWS = CANVAS.TARGET_VISIBLE_QUEUE_ROWS;
const INITIAL_VIEWPORT_VERTICAL_BUFFER = CANVAS.INITIAL_VIEWPORT_VERTICAL_BUFFER;
const MAX_PAN_TOP = CANVAS.MAX_PAN_TOP;
const BOTTOM_MARGIN = CANVAS.BOTTOM_MARGIN;
const TARGET_QUEUE_STACK_HEIGHT =
  LAYOUT.queue.rowHeight * TARGET_VISIBLE_QUEUE_ROWS + LAYOUT.queue.gap * (TARGET_VISIBLE_QUEUE_ROWS - 1);

function getResponsiveInitialZoom(containerH: number): number {
  if (containerH <= 0) return INITIAL_ZOOM;
  const availableH = Math.max(containerH - INITIAL_VIEWPORT_VERTICAL_BUFFER, 1);
  const fitRowsZoom = availableH / TARGET_QUEUE_STACK_HEIGHT;
  return Math.min(Math.max(fitRowsZoom, ZOOM_MIN), INITIAL_ZOOM);
}

type Pan2 = { x: number; y: number };

function clampPanY(y: number, curZoom: number, containerH: number, contentH: number) {
  const maxY = MAX_PAN_TOP;
  if (contentH <= 0 || containerH <= 0) return Math.min(y, maxY);

  const scaledH = contentH * curZoom;
  const minY = containerH - BOTTOM_MARGIN - scaledH;

  if (minY > maxY) {
    return (containerH - scaledH) / 2;
  }

  return Math.max(Math.min(y, maxY), minY);
}

export interface CanvasTransformState {
  zoom: number;
  pan: { x: number; y: number };
  isPanning: boolean;
  containerSize: { w: number; h: number };
  containerRef: React.RefObject<HTMLDivElement | null>;
  canvasRef: React.RefObject<HTMLDivElement | null>;
  scrollTick: number;
  pointerHandlers: {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerUp: () => void;
  };
  touchHandlers: {
    onTouchStart: (e: React.TouchEvent<HTMLDivElement>) => void;
    onTouchMove: (e: React.TouchEvent<HTMLDivElement>) => void;
    onTouchEnd: () => void;
  };
  handleZoomIn: () => void;
  handleZoomOut: () => void;
  handleFit: () => void;
  handleResetView: () => void;
}

export function useCanvasTransform(isCanvasPhase: boolean): CanvasTransformState {
  const [zoom, setZoom] = useState<number>(INITIAL_ZOOM);
  const [pan, setPan] = useState<Pan2>(INITIAL_PAN);
  const [isPanning, setIsPanning] = useState(false);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [scrollTick, setScrollTick] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const contentHeightRef = useRef(0);

  const stateRef = useRef<{
    zoom: number;
    pan: Pan2;
    containerH: number;
    contentH: number;
  }>({ zoom: INITIAL_ZOOM, pan: INITIAL_PAN, containerH: 0, contentH: 0 });
  stateRef.current = { zoom, pan, containerH: containerSize.h, contentH: contentHeightRef.current };
  const didInitResponsiveDefaultRef = useRef(false);

  const panStartRef = useRef({ mouseX: 0, mouseY: 0, panX: 0, panY: 0 });
  const isPanningRef = useRef(false);

  const touchRef = useRef<{
    startDist: number;
    startZoom: number;
    startPan: Pan2;
    startCenter: Pan2;
    lastCenter: Pan2;
    isTwoFinger: boolean;
    isOneFinger: boolean;
    isFilmstripScroll: boolean;
    filmstripEl: HTMLElement | null;
    filmstripStartScroll: number;
    startOneFingerPan: Pan2;
    startOneFingerClient: Pan2;
  }>({
    startDist: 0,
    startZoom: INITIAL_ZOOM,
    startPan: { x: INITIAL_PAN.x, y: INITIAL_PAN.y },
    startCenter: { x: 0, y: 0 },
    lastCenter: { x: 0, y: 0 },
    isTwoFinger: false,
    isOneFinger: false,
    isFilmstripScroll: false,
    filmstripEl: null,
    filmstripStartScroll: 0,
    startOneFingerPan: { x: 0, y: 0 },
    startOneFingerClient: { x: 0, y: 0 },
  });

  // Container size tracking
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setContainerSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [isCanvasPhase]);

  // Canvas content height tracking
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      contentHeightRef.current = entry.contentRect.height;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [isCanvasPhase]);

  // Apply a responsive default zoom once after container size is known.
  useEffect(() => {
    if (!isCanvasPhase || didInitResponsiveDefaultRef.current || containerSize.h <= 0) return;
    didInitResponsiveDefaultRef.current = true;
    const defaultZoom = getResponsiveInitialZoom(containerSize.h);
    setZoom(defaultZoom);
    setPan(INITIAL_PAN);
  }, [containerSize.h, isCanvasPhase]);

  // Non-passive wheel listener (zoom + pan)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent): void => {
      const vsScroll = (e.target as Element)?.closest("[data-vs-snapshot-scroll]") as HTMLElement | null;
      if (vsScroll) return;
      const vcScroll = (e.target as Element)?.closest("[data-vc-concept-scroll]") as HTMLElement | null;
      if (vcScroll) return;
      const briefScroll = (e.target as Element)?.closest("[data-brief-scroll]") as HTMLElement | null;
      if (briefScroll) return;

      const filmstrip = findFilmstripFromEventTarget(e.target);
      if (filmstrip && isFilmstripOverflowing(filmstrip)) {
        const delta = getFilmstripWheelDelta(e);
        if (delta !== null) {
          e.preventDefault();
          filmstrip.scrollLeft += delta;
          return;
        }
      }

      e.preventDefault();

      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const { zoom: curZoom, pan: curPan } = stateRef.current;
      const isPinch = e.ctrlKey;

      if (isPinch) {
        const rawDelta = -e.deltaY * 0.015;
        const factor = 1 + rawDelta;
        const newZoom = Math.min(Math.max(curZoom * factor, ZOOM_MIN), ZOOM_MAX);
        const newPanY = mouseY - (mouseY - curPan.y) * (newZoom / curZoom);
        setZoom(newZoom);
        setPan({ x: 0, y: clampPanY(newPanY, newZoom, stateRef.current.containerH, stateRef.current.contentH) });
      } else {
        const dy = e.shiftKey ? 0 : -e.deltaY;
        setPan({ x: 0, y: clampPanY(curPan.y + dy, curZoom, stateRef.current.containerH, stateRef.current.contentH) });
      }
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [isCanvasPhase]);

  // Filmstrip scroll listener (re-measure card positions for noodles)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let raf = 0;
    const handler = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setScrollTick(t => t + 1));
    };
    container.addEventListener("scroll", handler, { passive: true, capture: true });
    return () => {
      container.removeEventListener("scroll", handler, { capture: true });
      cancelAnimationFrame(raf);
    };
  }, [isCanvasPhase]);

  // Pointer pan handlers
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.button !== 1) return;
    const target = e.target as Element;
    const onCardSlot = !!target.closest("[data-variation-slot]");
    const onInteractive = !!target.closest("button, input, textarea, select, a, [contenteditable], [data-no-pan]");
    if (onInteractive) return;
    if (onCardSlot && e.button === 0) return;

    e.currentTarget.setPointerCapture(e.pointerId);
    isPanningRef.current = true;
    setIsPanning(true);
    panStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      panX: 0,
      panY: stateRef.current.pan.y,
    };
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPanningRef.current) return;
    const dy = e.clientY - panStartRef.current.mouseY;
    setPan({
      x: 0,
      y: clampPanY(panStartRef.current.panY + dy, stateRef.current.zoom, stateRef.current.containerH, stateRef.current.contentH),
    });
  }, []);

  const handlePointerUp = useCallback(() => {
    isPanningRef.current = false;
    setIsPanning(false);
  }, []);

  // Touch gesture handlers
  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    const touches = e.touches;
    if (touches.length === 2) {
      touchRef.current.isFilmstripScroll = false;
      const [t1, t2] = [touches[0], touches[1]];
      const dx = t2.clientX - t1.clientX;
      const dy = t2.clientY - t1.clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const { zoom: curZoom, pan: curPan } = stateRef.current;
      touchRef.current.isTwoFinger = true;
      touchRef.current.isOneFinger = false;
      touchRef.current.startDist = dist;
      touchRef.current.startZoom = curZoom;
      touchRef.current.startPan = { ...curPan };
      touchRef.current.startCenter = {
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2,
      };
      touchRef.current.lastCenter = touchRef.current.startCenter;
    } else if (touches.length === 1) {
      const touch = touches[0];
      const target = touch.target as Element;
      const onInteractive = target.closest?.("button, input, textarea, select, a, [contenteditable], [data-no-pan]");
      if (onInteractive) {
        touchRef.current.isOneFinger = false;
        touchRef.current.isFilmstripScroll = false;
        return;
      }
      const filmstrip = target.closest?.("[data-filmstrip]") as HTMLElement | null;
      if (filmstrip) {
        touchRef.current.isOneFinger = false;
        touchRef.current.isTwoFinger = false;
        touchRef.current.isFilmstripScroll = true;
        touchRef.current.filmstripEl = filmstrip;
        touchRef.current.filmstripStartScroll = filmstrip.scrollLeft;
        touchRef.current.startOneFingerClient = { x: touch.clientX, y: touch.clientY };
        return;
      }
      const { pan: curPan } = stateRef.current;
      touchRef.current.isOneFinger = true;
      touchRef.current.isTwoFinger = false;
      touchRef.current.isFilmstripScroll = false;
      touchRef.current.startOneFingerPan = { ...curPan };
      touchRef.current.startOneFingerClient = { x: touch.clientX, y: touch.clientY };
      setIsPanning(true);
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    const touches = e.touches;
    if (touches.length === 2 && touchRef.current.isTwoFinger) {
      e.preventDefault();
      const [t1, t2] = [touches[0], touches[1]];
      const dx = t2.clientX - t1.clientX;
      const dy = t2.clientY - t1.clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const curCenter = {
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2,
      };
      const factor = dist / touchRef.current.startDist;
      const newZoom = Math.min(Math.max(touchRef.current.startZoom * factor, ZOOM_MIN), ZOOM_MAX);
      const panDy = curCenter.y - touchRef.current.startCenter.y;
      const zoomRatio = newZoom / touchRef.current.startZoom;
      const newPanY = touchRef.current.startCenter.y
        - (touchRef.current.startCenter.y - touchRef.current.startPan.y) * zoomRatio
        + panDy;
      setZoom(newZoom);
      setPan({ x: 0, y: clampPanY(newPanY, newZoom, stateRef.current.containerH, stateRef.current.contentH) });
      touchRef.current.lastCenter = curCenter;
    } else if (touches.length === 1 && touchRef.current.isFilmstripScroll) {
      e.preventDefault();
      const touch = touches[0];
      const dxClient = touch.clientX - touchRef.current.startOneFingerClient.x;
      if (touchRef.current.filmstripEl) {
        touchRef.current.filmstripEl.scrollLeft = touchRef.current.filmstripStartScroll - dxClient;
      }
    } else if (touches.length === 1 && touchRef.current.isOneFinger) {
      e.preventDefault();
      const touch = touches[0];
      const dyClient = touch.clientY - touchRef.current.startOneFingerClient.y;
      setPan({
        x: 0,
        y: clampPanY(
          touchRef.current.startOneFingerPan.y + dyClient,
          stateRef.current.zoom,
          stateRef.current.containerH,
          stateRef.current.contentH,
        ),
      });
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    touchRef.current.isOneFinger = false;
    touchRef.current.isTwoFinger = false;
    touchRef.current.isFilmstripScroll = false;
    touchRef.current.filmstripEl = null;
    setIsPanning(false);
  }, []);

  // Zoom controls
  const zoomToward = (factor: number) => {
    if (!containerRef.current) return;
    const { zoom: curZoom, pan: curPan } = stateRef.current;
    const newZoom = Math.min(Math.max(curZoom * factor, ZOOM_MIN), ZOOM_MAX);
    const newPanY = stateRef.current.containerH / 2 - (stateRef.current.containerH / 2 - curPan.y) * (newZoom / curZoom);
    setPan({
      x: 0,
      y: clampPanY(newPanY, newZoom, stateRef.current.containerH, stateRef.current.contentH),
    });
    setZoom(newZoom);
  };

  const handleZoomIn = () => zoomToward(1.25);
  const handleZoomOut = () => zoomToward(1 / 1.25);

  const handleFit = () => {
    if (!containerRef.current || !canvasRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const canvasBCR = canvasRef.current.getBoundingClientRect();
    const naturalH = canvasBCR.height / stateRef.current.zoom;
    // Subtract top and bottom padding of the canvas content wrapper so zoom is
    // based on actual visual content height, not the padded canvas height.
    const naturalContentH = Math.max(naturalH - CANVAS.CONTENT_BOTTOM_PAD - CANVAS.CONTENT_TOP_PAD, 1);
    const pad = CANVAS.FIT_PADDING;
    const newZoom = Math.min(
      (containerRect.height - pad * 2) / naturalContentH,
      1.0,
    );
    // Bypass clampPanY: with naturalContentH * newZoom = containerH - 2*pad,
    // setting y=pad gives perfectly symmetric top/bottom spacing.
    setZoom(newZoom);
    setPan({ x: 0, y: pad });
  };

  const handleResetView = () => {
    setZoom(getResponsiveInitialZoom(stateRef.current.containerH));
    setPan(INITIAL_PAN);
  };

  return {
    zoom,
    pan,
    isPanning,
    containerSize,
    containerRef,
    canvasRef,
    scrollTick,
    pointerHandlers: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
    },
    touchHandlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
    handleZoomIn,
    handleZoomOut,
    handleFit,
    handleResetView,
  };
}
