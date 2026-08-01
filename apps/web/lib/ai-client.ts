import type { AiMode, Citation, Claim, Passage, Usage } from "@reader/domain";
import { platformRequestAi } from "@/lib/platform";

export interface StreamedAiResult {
  id: string;
  answerMarkdown: string;
  claims: Claim[];
  citations: Citation[];
  limitations: string[];
  usage: Usage;
}

export interface StreamHandlers {
  onStarted?: (responseId: string) => void;
  onDelta?: (text: string) => void;
  onCitation?: (citation: Citation) => void;
  onClaim?: (claim: Claim) => void;
  onWarning?: (message: string) => void;
  onUsage?: (usage: Usage) => void;
}

export async function requestAiResponse(
  request: { sourceId: string; mode: AiMode; query: string; passages: Passage[]; parentContext?: { query: string; answerMarkdown: string } },
  handlers: StreamHandlers = {},
): Promise<StreamedAiResult> {
  const platformResult = await platformRequestAi({ ...request, locale: "zh-CN" });
  if (platformResult) {
    handlers.onStarted?.(platformResult.id);
    for (let index = 0; index < platformResult.answerMarkdown.length; index += 48) {
      handlers.onDelta?.(platformResult.answerMarkdown.slice(index, index + 48));
    }
    for (const citation of platformResult.citations) handlers.onCitation?.(citation);
    for (const claim of platformResult.claims) handlers.onClaim?.(claim);
    for (const limitation of platformResult.limitations) handlers.onWarning?.(limitation);
    handlers.onUsage?.(platformResult.usage);
    return platformResult;
  }

  const response = await fetch("/api/ai/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ ...request, locale: "zh-CN" }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: { message?: string; requestId?: string } } | null;
    throw new Error(payload?.error?.message || `AI 请求失败（HTTP ${response.status}）`);
  }
  if (!response.body) throw new Error("浏览器未收到 AI 响应流。 ");

  const result: StreamedAiResult = {
    id: "",
    answerMarkdown: "",
    claims: [],
    citations: [],
    limitations: [],
    usage: { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0, model: "" },
  };
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() || "";
    for (const block of blocks) handleEventBlock(block, result, handlers);
    if (done) {
      if (buffer.trim()) handleEventBlock(buffer, result, handlers);
      break;
    }
  }
  if (!result.id) throw new Error("AI 响应意外中断，请重试。 ");
  return result;
}

function handleEventBlock(block: string, result: StreamedAiResult, handlers: StreamHandlers): void {
  const event = block.split("\n").find((line) => line.startsWith("event:"))?.slice(6).trim();
  const dataLine = block.split("\n").find((line) => line.startsWith("data:"))?.slice(5).trim();
  if (!event || !dataLine) return;
  const data = JSON.parse(dataLine) as Record<string, unknown>;
  if (event === "response.started") {
    result.id = String(data.responseId || "");
    handlers.onStarted?.(result.id);
  } else if (event === "answer.delta") {
    const text = String(data.text || "");
    result.answerMarkdown += text;
    handlers.onDelta?.(text);
  } else if (event === "citation.created") {
    const citation = data.citation as Citation;
    result.citations.push(citation);
    handlers.onCitation?.(citation);
  } else if (event === "claim.created") {
    const claim = data.claim as Claim;
    result.claims.push(claim);
    handlers.onClaim?.(claim);
  } else if (event === "warning.created") {
    const message = String(data.message || "");
    result.limitations.push(message);
    handlers.onWarning?.(message);
  } else if (event === "usage.updated") {
    result.usage = data as unknown as Usage;
    handlers.onUsage?.(result.usage);
  }
}
