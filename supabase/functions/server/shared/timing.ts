// ─────────────────────────────────────────────────────────────────────────────
// shared/timing.ts — Wall-clock instrumentation for generation routes
//
// Spans record their start offset (not just duration) so a reader can tell
// parallel overlap apart from sequential waiting: two spans with overlapping
// [startMs, startMs+ms) ranges ran concurrently, and a gap between the last
// span end and totalMs is unaccounted-for time inside the route.
// ─────────────────────────────────────────────────────────────────────────────

export interface TimingSpan {
  label: string;
  /** Offset from timer creation, in ms. */
  startMs: number;
  ms: number;
  /** Freeform annotation, e.g. model name or "failed". */
  detail?: string;
}

export interface TimingReport {
  name: string;
  totalMs: number;
  spans: TimingSpan[];
}

export interface Timer {
  /** Record an already-measured duration. */
  mark(label: string, ms: number, detail?: string): void;
  /** Time an async operation, recording it even when it throws. */
  measure<T>(label: string, fn: () => Promise<T>): Promise<T>;
  /** Start a manual span; call the returned function to close it. */
  open(label: string): (detail?: string) => void;
  /**
   * Namespaced view writing into the same span list. Use for concurrent
   * branches so their labels stay distinguishable, e.g. timer.child("logo").
   */
  child(prefix: string): Timer;
  elapsed(): number;
  report(): TimingReport;
}

function createTimerInternal(
  name: string,
  origin: number,
  spans: TimingSpan[],
  prefix: string,
): Timer {
  const withPrefix = (label: string) => (prefix ? `${prefix}.${label}` : label);

  const timer: Timer = {
    mark(label, ms, detail) {
      spans.push({
        label: withPrefix(label),
        startMs: Math.round(Date.now() - origin - ms),
        ms: Math.round(ms),
        ...(detail ? { detail } : {}),
      });
    },

    open(label) {
      const startedAt = Date.now();
      let closed = false;
      return (detail?: string) => {
        if (closed) return;
        closed = true;
        spans.push({
          label: withPrefix(label),
          startMs: Math.round(startedAt - origin),
          ms: Math.round(Date.now() - startedAt),
          ...(detail ? { detail } : {}),
        });
      };
    },

    async measure(label, fn) {
      const close = timer.open(label);
      try {
        const result = await fn();
        close();
        return result;
      } catch (err) {
        close("failed");
        throw err;
      }
    },

    child(childPrefix) {
      return createTimerInternal(name, origin, spans, withPrefix(childPrefix));
    },

    elapsed() {
      return Date.now() - origin;
    },

    report() {
      return {
        name,
        totalMs: Math.round(Date.now() - origin),
        spans: [...spans].sort((a, b) => a.startMs - b.startMs),
      };
    },
  };

  return timer;
}

export function createTimer(name: string): Timer {
  return createTimerInternal(name, Date.now(), [], "");
}

/**
 * Emit one grep-able line per route so timings survive even when the HTTP
 * response is lost (client timeout, safety block, 500).
 */
export function logTimingReport(report: TimingReport): void {
  console.log(`[timing] ${JSON.stringify(report)}`);
}
