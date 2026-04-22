import type { DebugInterceptor, PipelineDebugAgent, PipelineStageLog } from "../hooks/usePipelineDebugger";

/**
 * Which Edge agent handles POST /generate-image — must stay in sync with
 * `supabase/functions/server/index.tsx` routing.
 */
export function debugAgentForGenerateImage(body: {
  cardType?: string;
  titleFont?: string;
  sourceImageUrl?: string;
  referenceImageUrls?: unknown;
  paletteImageBase64?: string;
}): Extract<PipelineDebugAgent, "visual-designer" | "art-director"> {
  if (body.cardType === "visual-snapshot") {
    return "visual-designer";
  }
  if (body.titleFont && body.cardType === "logo") {
    return "visual-designer";
  }
  if (body.sourceImageUrl) {
    return "visual-designer";
  }
  return "art-director";
}

/** Non-pipeline API call wrapper (auto-complete, merge, add-variation, etc.) */
export async function withDebugLog<T>(
  interceptor: DebugInterceptor | undefined,
  meta: Parameters<DebugInterceptor["logCall"]>[0],
  fn: () => Promise<T>,
): Promise<T> {
  if (!interceptor?.enabled) return fn();
  return interceptor.logCall(meta, fn);
}

/**
 * Pipeline stage wrapper — handles beforeStage / afterStage bookkeeping.
 * Passes the (possibly debugger-edited) final request to `fn` and returns its result.
 */
export async function withPipelineStage<T>(
  interceptor: DebugInterceptor | undefined,
  stageInfo: Omit<PipelineStageLog, "status">,
  fn: (finalRequest: Record<string, unknown>) => Promise<T>,
): Promise<T> {
  const finalRequest = interceptor?.enabled
    ? await interceptor.beforeStage(stageInfo)
    : stageInfo.request;
  try {
    const result = await fn(finalRequest);
    interceptor?.afterStage(stageInfo.id, result);
    return result;
  } catch (err) {
    interceptor?.afterStage(stageInfo.id, null, String(err));
    throw err;
  }
}
