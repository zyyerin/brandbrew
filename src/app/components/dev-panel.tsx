import { useState, useEffect, useCallback } from "react";
import { RefreshCw, ChevronDown, ChevronUp, X, Cpu, Image, Wifi, WifiOff, List } from "lucide-react";
import { callApi } from "../utils/apiClient";
import { Skeleton } from "./ui/skeleton";

interface DevInfo {
  textModel: string;
  imageModel: { shortName: string; strategy: string } | null;
  discoveredModels: { shortName: string; strategy: string }[] | null;
  cacheSource: "discovered" | "hardcoded" | "uncached";
  cacheAgeSeconds: number | null;
  cacheTtlSeconds: number;
}

type FetchState = "idle" | "loading" | "ok" | "error";

const STRATEGY_LABELS: Record<string, string> = {
  "imagen-predict":           "Imagen :predict",
  "gemini-generateContent":   "Gemini :generateContent",
};

const CACHE_COLORS: Record<string, string> = {
  discovered: "#22c55e",
  hardcoded:  "#f59e0b",
  uncached:   "#94a3b8",
};

export function DevPanel() {
  const [visible, setVisible] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [info, setInfo] = useState<DevInfo | null>(null);
  const [fetchState, setFetchState] = useState<FetchState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  // All-models list
  const [allModels, setAllModels] = useState<{ name: string; displayName: string; methods: string[] }[] | null>(null);
  const [allModelsState, setAllModelsState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [showAllModels, setShowAllModels] = useState(false);

  const fetchInfo = useCallback(async () => {
    setFetchState("loading");
    setError(null);
    try {
      const data = await callApi<DevInfo>("dev-info", { method: "GET" });
      setInfo(data);
      setLastFetched(new Date());
      setFetchState("ok");
    } catch (err) {
      const msg = String(err);
      setError(msg.includes("Not found") || msg.includes("404") ? "Dev routes disabled" : msg);
      setFetchState("error");
    }
  }, []);

  const fetchAllModels = useCallback(async () => {
    setAllModelsState("loading");
    setShowAllModels(true);
    try {
      const data = await callApi<{ models?: { name: string; displayName: string; methods: string[] }[] }>(
        "list-models",
        { method: "GET" },
      );
      setAllModels(data.models ?? []);
      setAllModelsState("ok");
    } catch {
      setAllModelsState("error");
    }
  }, []);

  // Fetch on mount
  useEffect(() => { fetchInfo(); }, [fetchInfo]);

  if (!visible) return null;

  const cacheColor = info ? CACHE_COLORS[info.cacheSource] : "#94a3b8";
  const cacheLabel =
    info?.cacheSource === "discovered" ? "auto-discovered" :
    info?.cacheSource === "hardcoded"  ? "hardcoded fallback" :
    "not cached";

  return (
    <div
      style={{
        position: "fixed",
        bottom: 20,
        right: 20,
        zIndex: 9999,
        width: 288,
        background: "rgba(15, 15, 20, 0.96)",
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: 10,
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        fontFamily: "'SF Mono', 'Fira Code', 'Fira Mono', monospace",
        fontSize: 11,
        color: "#e2e8f0",
        overflow: "hidden",
        userSelect: "none",
      }}
    >
      {/* Header bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "7px 10px",
          background: "rgba(255,255,255,0.05)",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          cursor: "pointer",
        }}
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Traffic-light dot */}
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: fetchState === "ok" ? "#22c55e" : fetchState === "error" ? "#ef4444" : "#f59e0b",
            flexShrink: 0,
            boxShadow: fetchState === "ok" ? "0 0 6px #22c55e88" : undefined,
          }}
        />
        <span style={{ fontWeight: 700, color: "#a78bfa", letterSpacing: "0.05em", fontSize: 10 }}>
          DEV
        </span>
        <span style={{ color: "#64748b", fontSize: 10 }}>· model inspector</span>
        <div style={{ flex: 1 }} />
        <button
          onClick={(e) => { e.stopPropagation(); fetchInfo(); }}
          title="Refresh"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "#64748b",
            padding: 2,
            display: "flex",
            alignItems: "center",
          }}
        >
          <RefreshCw
            size={11}
            style={{
              animation: fetchState === "loading" ? "spin 0.8s linear infinite" : "none",
            }}
          />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setVisible(false); }}
          title="Close"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "#64748b",
            padding: 2,
            display: "flex",
            alignItems: "center",
          }}
        >
          <X size={11} />
        </button>
        {expanded ? <ChevronDown size={11} color="#64748b" /> : <ChevronUp size={11} color="#64748b" />}
      </div>

      {/* Body */}
      {expanded && (
        <div style={{ padding: "10px 12px 12px", display: "flex", flexDirection: "column", gap: 10 }}>

          {/* Error state */}
          {fetchState === "error" && (
            <div style={{ color: "#f87171", fontSize: 10, lineHeight: 1.5 }}>
              <WifiOff size={10} style={{ display: "inline", marginRight: 4 }} />
              {error}
            </div>
          )}

          {/* Text model */}
          <Section icon={<Cpu size={11} color="#a78bfa" />} label="TEXT MODEL">
            {info ? (
              <Row label="model" value={info.textModel} valueColor="#34d399" />
            ) : (
              <DevSkeleton />
            )}
            <Row label="endpoint" value="generateContent" valueColor="#94a3b8" />
            <Row label="format" value="application/json" valueColor="#94a3b8" />
          </Section>

          {/* Image model */}
          <Section icon={<Image size={11} color="#f59e0b" />} label="IMAGE MODEL">
            {info ? (
              info.imageModel ? (
                <>
                  <Row
                    label="last used"
                    value={info.imageModel.shortName}
                    valueColor="#fbbf24"
                    wrap
                  />
                  <Row
                    label="strategy"
                    value={STRATEGY_LABELS[info.imageModel.strategy] ?? info.imageModel.strategy}
                    valueColor="#94a3b8"
                  />
                </>
              ) : (
                <div style={{ color: "#64748b", fontSize: 10 }}>
                  no image generated yet
                </div>
              )
            ) : (
              <DevSkeleton />
            )}
          </Section>

          {/* Discovery queue */}
          {info?.discoveredModels && info.discoveredModels.length > 0 && (
            <Section icon={<Wifi size={11} color="#38bdf8" />} label="DISCOVERY QUEUE">
              <Row
                label="source"
                value={cacheLabel}
                valueColor={cacheColor}
              />
              {info.cacheAgeSeconds !== null && (
                <Row
                  label="cache age"
                  value={`${info.cacheAgeSeconds}s / ${info.cacheTtlSeconds}s TTL`}
                  valueColor="#94a3b8"
                />
              )}
              <div style={{ marginTop: 5, display: "flex", flexDirection: "column", gap: 2 }}>
                {info.discoveredModels.map((m, i) => (
                  <div
                    key={m.shortName}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      opacity: i === 0 ? 1 : 0.5,
                    }}
                  >
                    <span
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: "50%",
                        background: i === 0 ? "#22c55e" : "#334155",
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        color: i === 0 ? "#e2e8f0" : "#64748b",
                        fontSize: 10,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        flex: 1,
                      }}
                      title={m.shortName}
                    >
                      {m.shortName}
                    </span>
                    <span style={{ color: "#475569", fontSize: 9, flexShrink: 0 }}>
                      {m.strategy === "imagen-predict" ? "img" : "gc"}
                    </span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Footer timestamp */}
          {lastFetched && (
            <div style={{ color: "#334155", fontSize: 9, textAlign: "right" }}>
              fetched {lastFetched.toLocaleTimeString()}
            </div>
          )}

          {/* List all models button */}
          <button
            onClick={fetchAllModels}
            disabled={allModelsState === "loading"}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 5,
              width: "100%",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 5,
              color: "#a78bfa",
              fontSize: 10,
              fontFamily: "inherit",
              fontWeight: 700,
              letterSpacing: "0.06em",
              padding: "5px 8px",
              cursor: allModelsState === "loading" ? "not-allowed" : "pointer",
              opacity: allModelsState === "loading" ? 0.6 : 1,
            }}
          >
            <List size={10} />
            {allModelsState === "loading" ? "FETCHING…" : "LIST ALL MODELS"}
          </button>

          {/* All-models result */}
          {showAllModels && allModels && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                <span style={{ color: "#475569", fontSize: 9, letterSpacing: "0.1em", fontWeight: 700 }}>
                  ALL MODELS ({allModels.length})
                </span>
                <button
                  onClick={() => setShowAllModels(false)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#475569", padding: 0 }}
                >
                  <X size={9} />
                </button>
              </div>
              <div
                style={{
                  maxHeight: 260,
                  overflowY: "auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: 1,
                  paddingRight: 2,
                }}
              >
                {allModels.map((m) => {
                  const short = m.name.replace("models/", "");
                  const isImg = m.methods.includes("predict");
                  const isGen = m.methods.includes("generateContent");
                  const color = isImg ? "#f59e0b" : isGen ? "#34d399" : "#64748b";
                  return (
                    <div
                      key={m.name}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 5,
                        padding: "2px 0",
                        borderBottom: "1px solid rgba(255,255,255,0.03)",
                      }}
                    >
                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: color, marginTop: 3, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: "#e2e8f0", fontSize: 10, wordBreak: "break-all", fontWeight: 600 }}>
                          {short}
                        </div>
                        <div style={{ color: "#475569", fontSize: 9 }}>
                          {m.methods.join(" · ")}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ color: "#334155", fontSize: 9, marginTop: 2 }}>
                <span style={{ color: "#f59e0b" }}>●</span> predict &nbsp;
                <span style={{ color: "#34d399" }}>●</span> generateContent &nbsp;
                <span style={{ color: "#64748b" }}>●</span> other
              </div>
            </div>
          )}
        </div>
      )}

      {/* Spin keyframe injected inline */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Section({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5 }}>
        {icon}
        <span style={{ color: "#475569", fontSize: 9, letterSpacing: "0.1em", fontWeight: 700 }}>
          {label}
        </span>
      </div>
      <div
        style={{
          paddingLeft: 8,
          borderLeft: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          flexDirection: "column",
          gap: 3,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  valueColor = "#e2e8f0",
  wrap = false,
}: {
  label: string;
  value: string;
  valueColor?: string;
  wrap?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: wrap ? "flex-start" : "center",
        gap: 8,
      }}
    >
      <span style={{ color: "#475569", flexShrink: 0 }}>{label}</span>
      <span
        style={{
          color: valueColor,
          textAlign: "right",
          wordBreak: wrap ? "break-all" : "normal",
          fontWeight: 600,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function DevSkeleton() {
  return <Skeleton className="h-2.5 w-[70%] bg-white/[0.06]" />;
}