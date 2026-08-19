export interface FilmstripWheelInput {
  deltaX: number;
  deltaY: number;
  shiftKey: boolean;
  ctrlKey: boolean;
}

/**
 * Delta to add to a filmstrip's scrollLeft, or null if the canvas should keep the wheel.
 * Mouse wheels typically only emit deltaY; trackpad vertical-dominant gestures stay on the canvas.
 */
export function getFilmstripWheelDelta(e: FilmstripWheelInput): number | null {
  if (e.ctrlKey) return null;

  if (e.shiftKey) {
    const delta = e.deltaX || e.deltaY;
    return delta === 0 ? null : delta;
  }

  if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return e.deltaX;
  if (e.deltaX === 0 && e.deltaY !== 0) return e.deltaY;
  return null;
}

export function isFilmstripOverflowing(el: Pick<HTMLElement, "scrollWidth" | "clientWidth">): boolean {
  return el.scrollWidth > el.clientWidth + 1;
}

export function findFilmstripFromEventTarget(target: EventTarget | null): HTMLElement | null {
  const el = target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
  if (!el) return null;
  const queue = el.closest("[data-elementqueue]");
  const fromQueue = queue?.querySelector("[data-filmstrip]");
  if (fromQueue instanceof HTMLElement) return fromQueue;
  const direct = el.closest("[data-filmstrip]");
  return direct instanceof HTMLElement ? direct : null;
}
