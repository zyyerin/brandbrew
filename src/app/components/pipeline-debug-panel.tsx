import { useState, useCallback, useRef, useEffect } from "react";
import { ChevronDown, ChevronUp, X, Play, FastForward, Trash2, ChevronRight, MessageSquareCode } from "lucide-react";
import type { PipelineStageLog, PromptOverrides } from "../hooks/usePipelineDebugger";
import type { PipelineStage } from "../types/project";

// ─── Constants ────────────────────────────────────────────────────────────────

const STAGE_LABELS: Record<NonNullable<PipelineStage>, string> = {
  conceptualizing: "Conceptualizing",
  styling: "Styling",
  drawing: "Drawing",
  synthesizing: "Synthesizing",
};

const AGENT_LABELS: Record<string, string> = {
  "brand-strategist": "Brand Strategist",
  "art-director": "Art Director",
  "visual-designer": "Visual Designer",
  "visual-designer-visual-snapshot": "Visual Designer (snapshot)",
  local: "Local",
};

const STATUS_COLORS: Record<PipelineStageLog["status"], string> = {
  pending: "#475569",
  paused: "#f59e0b",
  running: "#38bdf8",
  completed: "#22c55e",
  error: "#ef4444",
  skipped: "#64748b",
  aborted: "#f97316",
};

const STATUS_LABELS: Record<PipelineStageLog["status"], string> = {
  pending: "pending",
  paused: "paused — waiting",
  running: "running…",
  completed: "done",
  error: "error",
  skipped: "skipped",
  aborted: "aborted",
};

const EDITABLE_FIELDS: Record<NonNullable<PipelineStage>, string[]> = {
  conceptualizing: ["description", "keywords", "targetAudience"],
  styling: ["visualConcept"],
  drawing: ["colorPalette", "font"],
  synthesizing: [],
};

/** Non-pipeline log entries have no stage (null) and are identified by their
 *  endpoint string prefix "[Label] ..." injected by logCall */
function parseLogLabel(endpoint: string): { label: string; rawEndpoint: string } | null {
  const m = endpoint.match(/^\[(.+?)\] (.+)$/);
  if (!m) return null;
  return { label: m[1], rawEndpoint: m[2] };
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface PipelineDebugPanelProps {
  debugEnabled: boolean;
  setDebugEnabled: (v: boolean) => void;
  stageLogs: PipelineStageLog[];
  activeStageId: string | null;
  selectedStageId: string | null;
  setSelectedStageId: (id: string | null) => void;
  continueStage: () => void;
  skipRemaining: () => void;
  abortPipeline: () => void;
  editStageRequest: (stageId: string, newRequest: Record<string, unknown>) => void;
  editStagePrompts: (stageId: string, overrides: PromptOverrides) => void;
  clearLogs: () => void;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PipelineDebugPanel({
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
}: PipelineDebugPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "h") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.closest("input, textarea, select, [contenteditable='true']")) return;
      e.preventDefault();
      setVisible((v) => !v);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Drag state — initialise to bottom-left corner
  const [pos, setPos] = useState<{ x: number; y: number }>(() => ({
    x: 20,
    y: window.innerHeight - 400,
  }));
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const didDragRef = useRef(false);

  const onHeaderPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button, label")) return;
    didDragRef.current = false;
    dragRef.current = { startX: e.clientX, startY: e.clientY, originX: pos.x, originY: pos.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [pos]);

  const onHeaderPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didDragRef.current = true;
    setPos({
      x: Math.max(0, Math.min(window.innerWidth - 380, dragRef.current.originX + dx)),
      y: Math.max(0, Math.min(window.innerHeight - 40, dragRef.current.originY + dy)),
    });
  }, []);

  const onHeaderPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    if (didDragRef.current) e.stopPropagation();
  }, []);

  const isPaused = activeStageId !== null &&
    stageLogs.find((l) => l.id === activeStageId)?.status === "paused";

  if (!visible) {
    return null;
  }

  return (
    <div
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        zIndex: 9999,
        width: 380,
        maxHeight: "calc(100vh - 40px)",
        background: "rgba(15,15,20,0.97)",
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: 10,
        boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
        fontFamily: "'SF Mono','Fira Code','Fira Mono',monospace",
        fontSize: 11,
        color: "#e2e8f0",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        userSelect: "none",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "7px 10px",
          background: "rgba(255,255,255,0.05)",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          cursor: dragRef.current ? "grabbing" : "grab",
          flexShrink: 0,
        }}
        onClick={() => { if (!didDragRef.current) setExpanded((v) => !v); }}
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            flexShrink: 0,
            background: isPaused ? "#f59e0b" : activeStageId ? "#38bdf8" : "#a78bfa",
            boxShadow: isPaused ? "0 0 6px #f59e0b88" : activeStageId ? "0 0 6px #38bdf888" : undefined,
          }}
        />
        <span style={{ fontWeight: 700, color: "#a78bfa", letterSpacing: "0.05em", fontSize: 10 }}>
          DEV
        </span>
        <span style={{ color: "#64748b", fontSize: 10 }}>· pipeline debugger</span>
        <div style={{ flex: 1 }} />

        <label
          style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}
          onClick={(e) => e.stopPropagation()}
        >
          <span style={{ color: "#64748b", fontSize: 9, letterSpacing: "0.08em" }}>STEP</span>
          <div
            onClick={() => setDebugEnabled(!debugEnabled)}
            style={{
              width: 26,
              height: 14,
              borderRadius: 7,
              background: debugEnabled ? "#a78bfa" : "#334155",
              position: "relative",
              transition: "background 0.15s",
              cursor: "pointer",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 2,
                left: debugEnabled ? 14 : 2,
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: "#fff",
                transition: "left 0.15s",
              }}
            />
          </div>
        </label>

        <button
          onClick={(e) => { e.stopPropagation(); clearLogs(); }}
          title="Clear logs"
          style={iconBtn}
        >
          <Trash2 size={10} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setVisible(false); }}
          title="Hide (H to show again)"
          style={iconBtn}
        >
          <X size={11} />
        </button>
        {expanded ? <ChevronDown size={11} color="#64748b" /> : <ChevronUp size={11} color="#64748b" />}
      </div>

      {expanded && (
        <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column" }}>
          {/* Controls */}
          {(isPaused || activeStageId) && (
            <div
              style={{
                display: "flex",
                gap: 6,
                padding: "8px 10px",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                background: isPaused ? "rgba(245,158,11,0.06)" : "rgba(56,189,248,0.04)",
                flexShrink: 0,
              }}
            >
              {isPaused && (
                <button
                  onClick={continueStage}
                  style={{
                    ...actionBtn,
                    background: "rgba(167,139,250,0.15)",
                    color: "#a78bfa",
                    border: "1px solid rgba(167,139,250,0.3)",
                    flex: 1,
                  }}
                >
                  <Play size={10} />
                  Continue
                </button>
              )}
              <button
                onClick={skipRemaining}
                style={{
                  ...actionBtn,
                  background: "rgba(100,116,139,0.12)",
                  color: "#94a3b8",
                  border: "1px solid rgba(100,116,139,0.2)",
                  flex: isPaused ? undefined : 1,
                }}
              >
                <FastForward size={10} />
                Skip All
              </button>
              <button
                onClick={abortPipeline}
                style={{
                  ...actionBtn,
                  background: "rgba(239,68,68,0.12)",
                  color: "#f87171",
                  border: "1px solid rgba(239,68,68,0.28)",
                }}
              >
                Abort
              </button>
            </div>
          )}

          {/* Stage timeline */}
          {stageLogs.length === 0 ? (
            <div
              style={{
                padding: "16px 12px",
                color: "#334155",
                fontSize: 10,
                textAlign: "center",
                lineHeight: 1.7,
              }}
            >
              {debugEnabled
                ? "STEP mode on. Start brand generation.\nPipeline will pause before each agent call."
                : "No stages logged yet.\nEnable STEP mode to pause before each agent call."}
            </div>
          ) : (
            <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 1 }}>
              {stageLogs.map((log) => {
                const parsed = parseLogLabel(log.endpoint);
                const isApiLog = parsed !== null;
                return isApiLog ? (
                  <ApiLogRow
                    key={log.id}
                    log={log}
                    label={parsed.label}
                    rawEndpoint={parsed.rawEndpoint}
                    isSelected={log.id === selectedStageId}
                    onSelect={() =>
                      setSelectedStageId(log.id === selectedStageId ? null : log.id)
                    }
                  />
                ) : (
                  <StageRow
                    key={log.id}
                    log={log}
                    isActive={log.id === activeStageId}
                    isSelected={log.id === selectedStageId}
                    onSelect={() =>
                      setSelectedStageId(log.id === selectedStageId ? null : log.id)
                    }
                    onEditRequest={(newReq) => editStageRequest(log.id, newReq)}
                    onEditPrompts={(overrides) => editStagePrompts(log.id, overrides)}
                    onContinue={log.id === activeStageId && isPaused ? continueStage : undefined}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes bb-pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  );
}

// ─── API Log Row (non-pipeline, fire-and-forget) ──────────────────────────────

function ApiLogRow({
  log,
  label,
  rawEndpoint,
  isSelected,
  onSelect,
}: {
  log: PipelineStageLog;
  label: string;
  rawEndpoint: string;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const elapsed =
    log.endTime && log.startTime
      ? `${((log.endTime - log.startTime) / 1000).toFixed(1)}s`
      : null;

  const statusColor = STATUS_COLORS[log.status];

  return (
    <div
      style={{
        borderRadius: 6,
        overflow: "hidden",
        border: isSelected
          ? "1px solid rgba(56,189,248,0.3)"
          : "1px solid rgba(56,189,248,0.08)",
        background: isSelected ? "rgba(56,189,248,0.05)" : "rgba(56,189,248,0.02)",
      }}
    >
      {/* Row header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "6px 8px",
          cursor: "pointer",
        }}
        onClick={onSelect}
      >
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: 2,
            flexShrink: 0,
            background: statusColor,
            animation: log.status === "running" ? "bb-pulse 1s ease-in-out infinite" : undefined,
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ color: "#38bdf8", fontWeight: 700, fontSize: 10 }}>
              {label}
            </span>
            <span style={{ color: "#475569", fontSize: 9 }}>
              {AGENT_LABELS[log.agent] ?? log.agent}
            </span>
          </div>
          <div style={{ color: "#334155", fontSize: 9, marginTop: 1 }}>
            {rawEndpoint}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {elapsed && (
            <span style={{ color: "#475569", fontSize: 9 }}>{elapsed}</span>
          )}
          <span style={{ color: statusColor, fontSize: 9 }}>
            {STATUS_LABELS[log.status]}
          </span>
          <ChevronRight
            size={9}
            color="#475569"
            style={{ transform: isSelected ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}
          />
        </div>
      </div>

      {/* Expanded detail */}
      {isSelected && (
        <div
          style={{
            borderTop: "1px solid rgba(255,255,255,0.05)",
            padding: "8px 8px 10px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Request */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={sectionLabel}>REQUEST</span>
            <pre
              style={{
                margin: 0,
                padding: "6px 8px",
                background: "rgba(255,255,255,0.03)",
                borderRadius: 4,
                border: "1px solid rgba(255,255,255,0.06)",
                color: "#94a3b8",
                fontSize: 9,
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                maxHeight: 180,
                overflowY: "auto",
                userSelect: "text",
              }}
            >
              {JSON.stringify(log.request, null, 2)}
            </pre>
          </div>

          {/* Response / error */}
          {(log.response !== undefined || log.error) && (
            <>
              <ActualPromptViewer response={log.response} />
              <ResponseViewer log={log} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Stage Row ────────────────────────────────────────────────────────────────

function StageRow({
  log,
  isActive,
  isSelected,
  onSelect,
  onEditRequest,
  onEditPrompts,
  onContinue,
}: {
  log: PipelineStageLog;
  isActive: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onEditRequest: (r: Record<string, unknown>) => void;
  onEditPrompts: (o: PromptOverrides) => void;
  onContinue?: () => void;
}) {
  const elapsed =
    log.endTime && log.startTime
      ? `${((log.endTime - log.startTime) / 1000).toFixed(1)}s`
      : log.startTime
        ? "running…"
        : null;

  const statusColor = STATUS_COLORS[log.status];
  const hasPromptOverrides = log.promptOverrides && Object.values(log.promptOverrides).some(Boolean);

  return (
    <div
      style={{
        borderRadius: 6,
        overflow: "hidden",
        border: isSelected
          ? "1px solid rgba(167,139,250,0.3)"
          : isActive
            ? "1px solid rgba(245,158,11,0.25)"
            : "1px solid transparent",
        background: isSelected
          ? "rgba(167,139,250,0.06)"
          : isActive
            ? "rgba(245,158,11,0.04)"
            : "transparent",
      }}
    >
      {/* Row header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "6px 8px",
          cursor: "pointer",
        }}
        onClick={onSelect}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            flexShrink: 0,
            background: statusColor,
            animation: log.status === "running" ? "bb-pulse 1s ease-in-out infinite" : undefined,
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 10 }}>
              {log.stage ? STAGE_LABELS[log.stage] : log.stage}
            </span>
            <span style={{ color: "#475569", fontSize: 9 }}>
              {AGENT_LABELS[log.agent] ?? log.agent}
            </span>
            {hasPromptOverrides && (
              <span style={{ color: "#f59e0b", fontSize: 8 }} title="Prompt overrides applied">
                OVERRIDE
              </span>
            )}
          </div>
          <div style={{ color: "#334155", fontSize: 9, marginTop: 1 }}>
            {log.endpoint}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {elapsed && (
            <span style={{ color: "#475569", fontSize: 9 }}>{elapsed}</span>
          )}
          <span style={{ color: statusColor, fontSize: 9 }}>
            {STATUS_LABELS[log.status]}
          </span>
          <ChevronRight
            size={9}
            color="#475569"
            style={{ transform: isSelected ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}
          />
        </div>
      </div>

      {/* Expanded inspector */}
      {isSelected && (
        <div
          style={{
            borderTop: "1px solid rgba(255,255,255,0.05)",
            padding: "8px 8px 10px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Prompt editor (shown when templates are available) */}
          {log.promptTemplates && (
            <PromptEditor
              log={log}
              onEditPrompts={onEditPrompts}
              canEdit={log.status === "paused"}
            />
          )}

          {/* Completed stage: show actual prompt from _meta.prompt in response */}
          {log.status === "completed" && !log.promptTemplates && log.response && (
            <ActualPromptViewer response={log.response} />
          )}

          <RequestEditor
            log={log}
            onEditRequest={onEditRequest}
            onContinue={onContinue}
          />
          {(log.response || log.error) && (
            <ResponseViewer log={log} />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Prompt Editor ────────────────────────────────────────────────────────────

function PromptEditor({
  log,
  onEditPrompts,
  canEdit,
}: {
  log: PipelineStageLog;
  onEditPrompts: (o: PromptOverrides) => void;
  canEdit: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const templates = log.promptTemplates!;
  const overrides = log.promptOverrides ?? {};
  const hasImagePrompts = templates.imagePrompts && Object.keys(templates.imagePrompts).length > 0;
  const isTextStage = !hasImagePrompts;

  const handleChange = useCallback(
    (key: keyof PromptOverrides, value: string) => {
      onEditPrompts({ ...overrides, [key]: value || undefined });
    },
    [overrides, onEditPrompts],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div
        style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}
        onClick={() => setCollapsed((v) => !v)}
      >
        <MessageSquareCode size={10} color="#f59e0b" />
        <span style={{ ...sectionLabel, color: "#f59e0b" }}>PROMPTS</span>
        <ChevronRight
          size={8}
          color="#64748b"
          style={{ transform: collapsed ? "none" : "rotate(90deg)" }}
        />
        {canEdit && (
          <span style={{ color: "#475569", fontSize: 8, marginLeft: "auto" }}>editable</span>
        )}
      </div>

      {!collapsed && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: 4 }}>
          {/* Persona */}
          <PromptField
            label="PERSONA"
            defaultValue={templates.persona}
            overrideValue={overrides.persona}
            onChange={(v) => handleChange("persona", v)}
            canEdit={canEdit}
          />

          {/* Task prompt (text stages only) */}
          {isTextStage && (
            <PromptField
              label="TASK PROMPT"
              defaultValue={templates.taskPrompt}
              overrideValue={overrides.taskPrompt}
              onChange={(v) => handleChange("taskPrompt", v)}
              canEdit={canEdit}
            />
          )}

          {/* Image prompts */}
          {hasImagePrompts && Object.entries(templates.imagePrompts!).map(([key, defaultPrompt]) => {
            const overrideKey = `${key}Prompt` as keyof PromptOverrides;
            return (
              <PromptField
                key={key}
                label={`IMAGE PROMPT — ${key}`}
                defaultValue={defaultPrompt}
                overrideValue={overrides[overrideKey] as string | undefined}
                onChange={(v) => handleChange(overrideKey, v)}
                canEdit={canEdit}
              />
            );
          })}

          {/* Full prompt override (for advanced use) */}
          {isTextStage && (
            <PromptField
              label="FULL PROMPT OVERRIDE"
              hint="If set, replaces the entire assembled prompt (persona + task + context)"
              defaultValue=""
              overrideValue={overrides.fullPrompt}
              onChange={(v) => handleChange("fullPrompt", v)}
              canEdit={canEdit}
              collapsed
            />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Prompt Field ─────────────────────────────────────────────────────────────

function PromptField({
  label,
  hint,
  defaultValue,
  overrideValue,
  onChange,
  canEdit,
  collapsed: startCollapsed = false,
}: {
  label: string;
  hint?: string;
  defaultValue: string;
  overrideValue?: string;
  onChange: (v: string) => void;
  canEdit: boolean;
  collapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(startCollapsed);
  const isOverridden = !!overrideValue;
  const displayValue = overrideValue ?? defaultValue;
  const lineCount = displayValue.split("\n").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          cursor: "pointer",
        }}
        onClick={() => setCollapsed((v) => !v)}
      >
        <span style={{ color: isOverridden ? "#f59e0b" : "#475569", fontSize: 8, letterSpacing: "0.08em", fontWeight: 700 }}>
          {label}
        </span>
        {isOverridden && (
          <span style={{ color: "#f59e0b", fontSize: 7, letterSpacing: "0.06em" }}>MODIFIED</span>
        )}
        <ChevronRight
          size={7}
          color="#475569"
          style={{ transform: collapsed ? "none" : "rotate(90deg)" }}
        />
        {hint && collapsed && (
          <span style={{ color: "#334155", fontSize: 8, fontStyle: "italic" }}>{hint}</span>
        )}
      </div>

      {!collapsed && (
        <>
          <textarea
            value={displayValue}
            onChange={(e) => onChange(e.target.value)}
            readOnly={!canEdit}
            spellCheck={false}
            rows={Math.min(Math.max(lineCount, 3), 10)}
            style={{
              width: "100%",
              background: isOverridden ? "rgba(245,158,11,0.06)" : "rgba(255,255,255,0.03)",
              border: `1px solid ${isOverridden ? "rgba(245,158,11,0.25)" : "rgba(255,255,255,0.08)"}`,
              borderRadius: 4,
              color: isOverridden ? "#fbbf24" : "#94a3b8",
              fontFamily: "inherit",
              fontSize: 9,
              padding: "5px 7px",
              resize: "vertical",
              outline: "none",
              opacity: canEdit ? 1 : 0.7,
              lineHeight: 1.5,
            }}
          />
          {canEdit && isOverridden && (
            <button
              onClick={() => onChange("")}
              style={{
                ...iconBtn,
                fontSize: 8,
                color: "#64748b",
                padding: "1px 4px",
                alignSelf: "flex-end",
              }}
            >
              reset to default
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ─── Actual prompt viewer (from completed response _meta) ─────────────────────

function ActualPromptViewer({ response }: { response: unknown }) {
  const [collapsed, setCollapsed] = useState(true);
  const meta = (response as Record<string, unknown>)?._meta as Record<string, unknown> | undefined;
  const prompt = meta?.prompt as string | undefined;
  if (!prompt) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div
        style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}
        onClick={() => setCollapsed((v) => !v)}
      >
        <MessageSquareCode size={10} color="#22c55e" />
        <span style={{ ...sectionLabel, color: "#22c55e" }}>ACTUAL PROMPT</span>
        <ChevronRight
          size={8}
          color="#475569"
          style={{ transform: collapsed ? "none" : "rotate(90deg)" }}
        />
      </div>
      {!collapsed && (
        <pre
          style={{
            margin: 0,
            padding: "6px 8px",
            background: "rgba(34,197,94,0.04)",
            borderRadius: 4,
            border: "1px solid rgba(34,197,94,0.12)",
            color: "#86efac",
            fontSize: 9,
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
            maxHeight: 200,
            overflowY: "auto",
            userSelect: "text",
          }}
        >
          {prompt}
        </pre>
      )}
    </div>
  );
}

// ─── Request Editor ───────────────────────────────────────────────────────────

function RequestEditor({
  log,
  onEditRequest,
  onContinue,
}: {
  log: PipelineStageLog;
  onEditRequest: (r: Record<string, unknown>) => void;
  onContinue?: () => void;
}) {
  const [rawMode, setRawMode] = useState(false);
  const [rawJson, setRawJson] = useState(() => JSON.stringify(log.request, null, 2));
  const [rawError, setRawError] = useState<string | null>(null);

  const editableFields = log.stage ? EDITABLE_FIELDS[log.stage] ?? [] : [];
  const canEdit = log.status === "paused";

  const handleFieldChange = useCallback(
    (key: string, value: unknown) => {
      const next = { ...log.request, [key]: value };
      onEditRequest(next);
      setRawJson(JSON.stringify(next, null, 2));
    },
    [log.request, onEditRequest],
  );

  const handleRawChange = useCallback(
    (text: string) => {
      setRawJson(text);
      try {
        const parsed = JSON.parse(text);
        onEditRequest(parsed);
        setRawError(null);
      } catch {
        setRawError("invalid JSON");
      }
    },
    [onEditRequest],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={sectionLabel}>REQUEST</span>
        <button
          onClick={() => setRawMode((v) => !v)}
          style={{
            ...iconBtn,
            fontSize: 8,
            letterSpacing: "0.06em",
            padding: "2px 5px",
            borderRadius: 3,
            background: rawMode ? "rgba(167,139,250,0.15)" : "rgba(255,255,255,0.04)",
            color: rawMode ? "#a78bfa" : "#64748b",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          RAW JSON
        </button>
      </div>

      {rawMode ? (
        <div>
          <textarea
            value={rawJson}
            onChange={(e) => handleRawChange(e.target.value)}
            readOnly={!canEdit}
            spellCheck={false}
            style={{
              width: "100%",
              minHeight: 120,
              background: "rgba(255,255,255,0.03)",
              border: `1px solid ${rawError ? "#ef4444" : "rgba(255,255,255,0.08)"}`,
              borderRadius: 4,
              color: rawError ? "#f87171" : "#94a3b8",
              fontFamily: "inherit",
              fontSize: 10,
              padding: "6px 8px",
              resize: "vertical",
              outline: "none",
              opacity: canEdit ? 1 : 0.6,
            }}
          />
          {rawError && (
            <div style={{ color: "#ef4444", fontSize: 9, marginTop: 2 }}>{rawError}</div>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {Object.entries(log.request).map(([key, value]) => {
            const isEditable = canEdit && editableFields.includes(key);
            return (
              <FieldRow
                key={key}
                fieldKey={key}
                value={value}
                editable={isEditable}
                onChange={(v) => handleFieldChange(key, v)}
              />
            );
          })}
        </div>
      )}

      {onContinue && (
        <button
          onClick={onContinue}
          style={{
            ...actionBtn,
            marginTop: 2,
            background: "rgba(167,139,250,0.15)",
            color: "#a78bfa",
            border: "1px solid rgba(167,139,250,0.3)",
            width: "100%",
          }}
        >
          <Play size={10} />
          Continue with this request
        </button>
      )}
    </div>
  );
}

// ─── Field Row ────────────────────────────────────────────────────────────────

function FieldRow({
  fieldKey,
  value,
  editable,
  onChange,
}: {
  fieldKey: string;
  value: unknown;
  editable: boolean;
  onChange: (v: unknown) => void;
}) {
  const isArray = Array.isArray(value);
  const isObject = value !== null && typeof value === "object" && !isArray;
  const [collapsed, setCollapsed] = useState(isObject || isArray);

  const displayValue = isObject || isArray
    ? JSON.stringify(value)
    : String(value ?? "");

  if (!editable || isObject) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <div
          style={{ display: "flex", alignItems: "center", gap: 4, cursor: (isObject || isArray) ? "pointer" : "default" }}
          onClick={() => (isObject || isArray) && setCollapsed((v) => !v)}
        >
          <span style={{ color: "#475569", fontSize: 9, flexShrink: 0, minWidth: 90 }}>{fieldKey}</span>
          {(isObject || isArray) && (
            <ChevronRight
              size={8}
              color="#475569"
              style={{ transform: collapsed ? "none" : "rotate(90deg)", flexShrink: 0 }}
            />
          )}
          {collapsed && (
            <span style={{ color: "#334155", fontSize: 9, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {isArray ? `[${(value as unknown[]).length} items]` : "{…}"}
            </span>
          )}
        </div>
        {!collapsed && (
          <pre
            style={{
              margin: 0,
              padding: "4px 6px",
              background: "rgba(255,255,255,0.02)",
              borderRadius: 3,
              color: "#94a3b8",
              fontSize: 9,
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              border: "1px solid rgba(255,255,255,0.04)",
              userSelect: "text",
            }}
          >
            {JSON.stringify(value, null, 2)}
          </pre>
        )}
        {collapsed && isObject && (
          <pre
            style={{
              margin: 0,
              padding: "4px 6px",
              background: "rgba(255,255,255,0.02)",
              borderRadius: 3,
              color: "#334155",
              fontSize: 9,
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              border: "1px solid rgba(255,255,255,0.04)",
            }}
          >
            {displayValue}
          </pre>
        )}
      </div>
    );
  }

  if (isArray) {
    const arr = value as unknown[];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ color: "#64748b", fontSize: 9 }}>{fieldKey}</span>
        {arr.map((item, i) => (
          <input
            key={i}
            value={String(item)}
            onChange={(e) => {
              const next = [...arr];
              next[i] = e.target.value;
              onChange(next);
            }}
            style={editInput}
          />
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ color: "#64748b", fontSize: 9 }}>{fieldKey}</span>
      <textarea
        value={displayValue}
        onChange={(e) => onChange(e.target.value)}
        rows={displayValue.length > 80 ? 3 : 1}
        spellCheck={false}
        style={{ ...editInput, resize: "vertical", minHeight: 22 }}
      />
    </div>
  );
}

// ─── Response Viewer ──────────────────────────────────────────────────────────

function ResponseViewer({ log }: { log: PipelineStageLog }) {
  const [collapsed, setCollapsed] = useState(true);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div
        style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}
        onClick={() => setCollapsed((v) => !v)}
      >
        <span style={sectionLabel}>{log.error ? "ERROR" : "RESPONSE"}</span>
        <ChevronRight
          size={8}
          color="#475569"
          style={{ transform: collapsed ? "none" : "rotate(90deg)" }}
        />
      </div>
      {!collapsed && (
        <pre
          style={{
            margin: 0,
            padding: "6px 8px",
            background: log.error ? "rgba(239,68,68,0.06)" : "rgba(34,197,94,0.04)",
            borderRadius: 4,
            border: `1px solid ${log.error ? "rgba(239,68,68,0.2)" : "rgba(34,197,94,0.12)"}`,
            color: log.error ? "#f87171" : "#86efac",
            fontSize: 9,
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
            maxHeight: 200,
            overflowY: "auto",
            userSelect: "text",
          }}
        >
          {log.error ?? JSON.stringify(
            (() => {
              if (!log.response || typeof log.response !== "object" || Array.isArray(log.response)) return log.response;
              const { _meta, ...rest } = log.response as Record<string, unknown>;
              return rest;
            })(),
            null, 2,
          )}
        </pre>
      )}
    </div>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const iconBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  color: "#64748b",
  padding: 2,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const actionBtn: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 5,
  borderRadius: 5,
  fontSize: 10,
  fontFamily: "'SF Mono','Fira Code','Fira Mono',monospace",
  fontWeight: 700,
  letterSpacing: "0.04em",
  padding: "5px 10px",
  cursor: "pointer",
  background: "none",
  border: "none",
};

const sectionLabel: React.CSSProperties = {
  color: "#475569",
  fontSize: 9,
  letterSpacing: "0.1em",
  fontWeight: 700,
};

const editInput: React.CSSProperties = {
  width: "100%",
  background: "rgba(167,139,250,0.06)",
  border: "1px solid rgba(167,139,250,0.2)",
  borderRadius: 3,
  color: "#c4b5fd",
  fontFamily: "'SF Mono','Fira Code','Fira Mono',monospace",
  fontSize: 10,
  padding: "4px 6px",
  outline: "none",
};
