import { useState, useRef, useCallback, useMemo } from "react";
import type { PipelineStage } from "../types/project";
import { getStagePromptTemplates, type StagePromptTemplate } from "../constants/agent-prompts";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Agents shown in pipeline debug logs (pipeline stages + ad-hoc logCall). */
export type PipelineDebugAgent =
  | "brand-strategist"
  | "art-director"
  | "visual-designer"
  | "visual-designer-visual-snapshot"
  /** Client-only step (e.g. pipeline seed cache); no Edge Function agent. */
  | "local";

export interface PromptOverrides {
  persona?: string;
  taskPrompt?: string;
  fullPrompt?: string;
  /** Image-gen stages: keyed by sub-prompt name (logo, art-style) */
  logoPrompt?: string;
  artStylePrompt?: string;
}

export interface PipelineStageLog {
  id: string;
  stage: PipelineStage;
  agent: PipelineDebugAgent;
  endpoint: string;
  request: Record<string, unknown>;
  response?: unknown;
  error?: string;
  startTime?: number;
  endTime?: number;
  status: "pending" | "paused" | "running" | "completed" | "error" | "skipped" | "aborted";
  /** Default prompt templates for this stage (set at pause time) */
  promptTemplates?: StagePromptTemplate;
  /** User-edited prompt overrides to send with the request */
  promptOverrides?: PromptOverrides;
}

export interface DebugInterceptor {
  enabled: boolean;
  isAborted: () => boolean;
  resetAbort: () => void;
  getAbortSignal: () => AbortSignal;
  beforeStage: (
    info: Omit<PipelineStageLog, "status">,
  ) => Promise<Record<string, unknown>>;
  afterStage: (stageId: string, response: unknown, error?: string) => void;
  /** Fire-and-forget logging for non-pipeline API calls (auto-complete, field fill, etc.) */
  logCall: <T>(
    info: {
      label: string;
      agent: PipelineDebugAgent;
      endpoint: string;
      request: Record<string, unknown>;
    },
    call: () => Promise<T>,
  ) => Promise<T>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface GateRef {
  resolve: (request: Record<string, unknown>) => void;
  reject: (reason?: unknown) => void;
  editedRequest: Record<string, unknown>;
  promptOverrides: PromptOverrides;
}

const ABORT_ERROR_MESSAGE = "Pipeline aborted by user";

export function usePipelineDebugger() {
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [stageLogs, setStageLogs] = useState<PipelineStageLog[]>([]);
  const [activeStageId, setActiveStageId] = useState<string | null>(null);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);

  const skipAllRef = useRef(false);
  const abortAllRef = useRef(false);
  const abortControllerRef = useRef<AbortController>(new AbortController());
  const gateRef = useRef<GateRef | null>(null);

  const clearLogs = useCallback(() => {
    setStageLogs([]);
    setActiveStageId(null);
    setSelectedStageId(null);
    skipAllRef.current = false;
    abortAllRef.current = false;
    abortControllerRef.current = new AbortController();
    gateRef.current = null;
  }, []);

  const editStageRequest = useCallback(
    (stageId: string, newRequest: Record<string, unknown>) => {
      setStageLogs((prev) =>
        prev.map((log) =>
          log.id === stageId ? { ...log, request: newRequest } : log,
        ),
      );
      if (gateRef.current) {
        gateRef.current.editedRequest = newRequest;
      }
    },
    [],
  );

  const editStagePrompts = useCallback(
    (stageId: string, overrides: PromptOverrides) => {
      setStageLogs((prev) =>
        prev.map((log) =>
          log.id === stageId ? { ...log, promptOverrides: overrides } : log,
        ),
      );
      if (gateRef.current) {
        gateRef.current.promptOverrides = overrides;
      }
    },
    [],
  );

  const continueStage = useCallback(() => {
    if (!gateRef.current) return;
    const gate = gateRef.current;
    gateRef.current = null;
    const req = { ...gate.editedRequest };
    // Attach prompt overrides to the request if any were edited
    const po = gate.promptOverrides;
    if (po && Object.values(po).some(Boolean)) {
      req._promptOverride = po;
    }
    gate.resolve(req);
  }, []);

  const skipRemaining = useCallback(() => {
    skipAllRef.current = true;
    if (gateRef.current) {
      const gate = gateRef.current;
      gateRef.current = null;
      const req = { ...gate.editedRequest };
      const po = gate.promptOverrides;
      if (po && Object.values(po).some(Boolean)) {
        req._promptOverride = po;
      }
      gate.resolve(req);
    }
  }, []);

  const abortPipeline = useCallback(() => {
    abortAllRef.current = true;
    skipAllRef.current = true;
    abortControllerRef.current.abort();

    const now = Date.now();
    setStageLogs((prev) =>
      prev.map((l) =>
        l.status === "paused" || l.status === "running" || l.status === "pending"
          ? { ...l, status: "aborted", endTime: l.endTime ?? now }
          : l,
      ),
    );
    setActiveStageId(null);

    if (gateRef.current) {
      const gate = gateRef.current;
      gateRef.current = null;
      gate.reject(new Error(ABORT_ERROR_MESSAGE));
    }
  }, []);

  const beforeStage = useCallback(
    (info: Omit<PipelineStageLog, "status">): Promise<Record<string, unknown>> => {
      const promptTemplates = info.stage
        ? getStagePromptTemplates(info.stage, info.request)
        : undefined;
      const log: PipelineStageLog = { ...info, status: "paused", promptTemplates };
      setStageLogs((prev) => [...prev, log]);
      setActiveStageId(info.id);
      setSelectedStageId(info.id);

      if (abortAllRef.current) {
        const endTime = Date.now();
        setStageLogs((prev) =>
          prev.map((l) => (l.id === info.id ? { ...l, status: "aborted", endTime } : l)),
        );
        return Promise.reject(new Error(ABORT_ERROR_MESSAGE));
      }

      if (skipAllRef.current) {
        setStageLogs((prev) =>
          prev.map((l) => (l.id === info.id ? { ...l, status: "running", startTime: Date.now() } : l)),
        );
        return Promise.resolve(info.request);
      }

      return new Promise<Record<string, unknown>>((resolve, reject) => {
        gateRef.current = {
          resolve,
          reject,
          editedRequest: { ...info.request },
          promptOverrides: {},
        };
      }).then((finalRequest) => {
        setStageLogs((prev) =>
          prev.map((l) =>
            l.id === info.id
              ? { ...l, status: "running", startTime: Date.now(), request: finalRequest }
              : l,
          ),
        );
        return finalRequest;
      });
    },
    [],
  );

  const afterStage = useCallback(
    (stageId: string, response: unknown, error?: string) => {
      const endTime = Date.now();
      setStageLogs((prev) =>
        prev.map((l) => {
          if (l.id !== stageId) return l;
          return {
            ...l,
            status: error ? "error" : "completed",
            response,
            error,
            endTime,
          };
        }),
      );
      setActiveStageId(null);
    },
    [],
  );

  const logCall = useCallback(
    async <T>(
      info: {
        label: string;
        agent: PipelineDebugAgent;
        endpoint: string;
        request: Record<string, unknown>;
      },
      call: () => Promise<T>,
    ): Promise<T> => {
      const id = `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const startTime = Date.now();
      const log: PipelineStageLog = {
        id,
        stage: null,
        agent: info.agent,
        endpoint: info.endpoint,
        request: info.request,
        status: "running",
        startTime,
        // Store label in endpoint display via a custom field-safe prefix
      };
      // Embed label into endpoint string for display (prefixed, stripped in panel)
      const logWithLabel: PipelineStageLog = { ...log, endpoint: `[${info.label}] ${info.endpoint}` };
      setStageLogs((prev) => [...prev, logWithLabel]);
      setSelectedStageId(id);

      try {
        const result = await call();
        setStageLogs((prev) =>
          prev.map((l) =>
            l.id === id
              ? { ...l, status: "completed", response: result, endTime: Date.now() }
              : l,
          ),
        );
        return result;
      } catch (err) {
        setStageLogs((prev) =>
          prev.map((l) =>
            l.id === id
              ? { ...l, status: "error", error: String(err), endTime: Date.now() }
              : l,
          ),
        );
        throw err;
      }
    },
    [],
  );

  const interceptor = useMemo<DebugInterceptor>(() => ({
    enabled: debugEnabled,
    isAborted: () => abortAllRef.current,
    resetAbort: () => {
      abortAllRef.current = false;
      skipAllRef.current = false;
      abortControllerRef.current = new AbortController();
    },
    getAbortSignal: () => abortControllerRef.current.signal,
    beforeStage,
    afterStage,
    logCall,
  }), [debugEnabled, beforeStage, afterStage, logCall]);

  return {
    debugEnabled,
    setDebugEnabled,
    stageLogs,
    activeStageId,
    selectedStageId,
    setSelectedStageId,
    continueStage,
    skipRemaining,
    abortPipeline,
    editStageRequest,
    editStagePrompts,
    clearLogs,
    interceptor,
  };
}
