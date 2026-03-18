import { useState, useCallback, useRef, useEffect } from "react";
import { CANVAS } from "../utils/design-tokens";

const ZOOM_MIN = CANVAS.ZOOM_MIN;
const ZOOM_MAX = CANVAS.ZOOM_MAX;
const INITIAL_PAN = CANVAS.PAN_INITIAL;
const INITIAL_ZOOM = CANVAS.ZOOM_INITIAL;
const MAX_PAN_TOP = CANVAS.MAX_PAN_TOP;
const BOTTOM_MARGIN = CANVAS.BOTTOM_MARGIN;

function clampPanY(y: number, curZoom: number, containerH: number, contentH: number) {
  const maxY = MAX_PAN_TOP;
  const minY = contentH > 0 && containerH > 0
    ? containerH - BOTTOM_MARGIN - contentH * curZoom
    : -Infinity;
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
  const [zoom, setZoom] = useState(INITIAL_ZOOM);
  const [pan, setPan] = useState(INITIAL_PAN);
  const [isPanning, setIsPanning] = useState(false);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [scrollTick, setScrollTick] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const contentHeightRef = useRef(0);

  const stateRef = useRef({ zoom: INITIAL_ZOOM, pan: INITIAL_PAN, containerH: 0, contentH: 0 });
  stateRef.current = { zoom, pan, containerH: containerSize.h, contentH: contentHeightRef.current };

  const panStartRef = useRef({ mouseX: 0, mouseY: 0, panX: 0, panY: 0 });
  const isPanningRef = useRef(false);

  const touchRef = useRef({
    startDist: 0,
    startZoom: INITIAL_ZOOM,
    startPan: INITIAL_PAN,
    startCenter: { x: 0, y: 0 },
    lastCenter: { x: 0, y: 0 },
    isTwoFinger: false,
    isOneFinger: false,
    isFilmstripScroll: false,
    filmstripEl: null as HTMLElement | null,
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

  // Non-passive wheel listener (zoom + pan)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent): void => {
      const vsScroll = (e.target as Element)?.closest("[data-vs-snapshot-scroll]") as HTMLElement | null;
      if (vsScroll) return;

      if (!e.ctrlKey) {
        const isHorizontalDominant = Math.abs(e.deltaX) > Math.abs(e.deltaY);
        if (isHorizontalDominant) {
          const filmstrip = (e.target as Element)?.closest("[data-filmstrip]") as HTMLElement | null;
          if (filmstrip) {
            e.preventDefault();
            filmstrip.scrollLeft += e.deltaX;
            return;
          }
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
        const newPanX = mouseX - (mouseX - curPan.x) * (newZoom / curZoom);
        const newPanY = mouseY - (mouseY - curPan.y) * (newZoom / curZoom);
        setZoom(newZoom);
        setPan({ x: newPanX, y: newPanY });
      } else {
        const dx = e.shiftKey ? -e.deltaX || -e.deltaY : -e.deltaX;
        const dy = e.shiftKey ? 0 : -e.deltaY;
        setPan({ x: curPan.x + dx, y: clampPanY(curPan.y + dy, curZoom, stateRef.current.containerH, stateRef.current.contentH) });
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
    const onCardSlot = !!target.closest("[data-card-slot]");
    const onInteractive = !!target.closest("button, input, textarea, select, a, [contenteditable]");
    if (onInteractive) return;
    if (onCardSlot && e.button === 0) return;

    e.currentTarget.setPointerCapture(e.pointerId);
    isPanningRef.current = true;
    setIsPanning(true);
    panStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      panX: stateRef.current.pan.x,
      panY: stateRef.current.pan.y,
    };
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPanningRef.current) return;
    const dx = e.clientX - panStartRef.current.mouseX;
    const dy = e.clientY - panStartRef.current.mouseY;
    setPan({
      x: panStartRef.current.panX + dx,
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
      const onInteractive = target.closest?.("button, input, textarea, select, a, [contenteditable]");
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
      const panDx = curCenter.x - touchRef.current.startCenter.x;
      const panDy = curCenter.y - touchRef.current.startCenter.y;
      const zoomRatio = newZoom / touchRef.current.startZoom;
      const newPanX = touchRef.current.startCenter.x
        - (touchRef.current.startCenter.x - touchRef.current.startPan.x) * zoomRatio
        + panDx;
      const newPanY = touchRef.current.startCenter.y
        - (touchRef.current.startCenter.y - touchRef.current.startPan.y) * zoomRatio
        + panDy;
      setZoom(newZoom);
      setPan({ x: newPanX, y: newPanY });
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
      const dxClient = touch.clientX - touchRef.current.startOneFingerClient.x;
      const dyClient = touch.clientY - touchRef.current.startOneFingerClient.y;
      setPan({
        x: touchRef.current.startOneFingerPan.x + dxClient,
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
    const rect = containerRef.current.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const { zoom: curZoom, pan: curPan } = stateRef.current;
    const newZoom = Math.min(Math.max(curZoom * factor, ZOOM_MIN), ZOOM_MAX);
    setPan({
      x: cx - (cx - curPan.x) * (newZoom / curZoom),
      y: cy - (cy - curPan.y) * (newZoom / curZoom),
    });
    setZoom(newZoom);
  };

  const handleZoomIn = () => zoomToward(1.25);
  const handleZoomOut = () => zoomToward(1 / 1.25);

  const handleFit = () => {
    if (!containerRef.current || !canvasRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const canvasBCR = canvasRef.current.getBoundingClientRect();
    const naturalW = canvasBCR.width / stateRef.current.zoom;
    const naturalH = canvasBCR.height / stateRef.current.zoom;
    const pad = 48;
    const newZoom = Math.min(
      (containerRect.width - pad * 2) / naturalW,
      (containerRect.height - pad * 2) / naturalH,
      1.0,
    );
    const newPanX = (containerRect.width - naturalW * newZoom) / 2;
    const newPanY = pad;
    setZoom(newZoom);
    setPan({ x: newPanX, y: newPanY });
  };

  const handleResetView = () => {
    setZoom(INITIAL_ZOOM);
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
