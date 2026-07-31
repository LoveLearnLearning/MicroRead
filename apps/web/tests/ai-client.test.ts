import { afterEach, describe, expect, it, vi } from "vitest";
import { requestAiResponse } from "@/lib/ai-client";

afterEach(() => vi.restoreAllMocks());

describe("AI SSE client", () => {
  it("assembles structured streaming events", async () => {
    const citation = { id: "c1", passageId: "p1", sourceId: "s1", sourceTitle: "测试", quote: "证据文本", blockIndex: 0 };
    const body = [
      `event: response.started\ndata: {"responseId":"r1"}`,
      `event: answer.delta\ndata: {"text":"直接"}`,
      `event: answer.delta\ndata: {"text":"回答"}`,
      `event: citation.created\ndata: ${JSON.stringify({ citation })}`,
      `event: claim.created\ndata: {"claim":{"text":"结论","type":"SOURCE_FACT","citationIds":["c1"]}}`,
      `event: usage.updated\ndata: {"inputTokens":10,"outputTokens":5,"estimatedCostUsd":0.001,"model":"deepseek-v4-flash"}`,
      `event: response.completed\ndata: {"responseId":"r1"}`,
    ].join("\n\n") + "\n\n";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } }));
    const deltas: string[] = [];
    const result = await requestAiResponse(
      { sourceId: "s1", mode: "DOCUMENT_QA", query: "问题", passages: [{ id: "p1", sourceId: "s1", sourceTitle: "测试", content: "证据文本" }] },
      { onDelta: (text) => deltas.push(text) },
    );
    expect(result.id).toBe("r1");
    expect(result.answerMarkdown).toBe("直接回答");
    expect(result.citations[0]).toEqual(citation);
    expect(result.claims[0]?.type).toBe("SOURCE_FACT");
    expect(result.usage.inputTokens).toBe(10);
    expect(deltas).toEqual(["直接", "回答"]);
  });

  it("surfaces stable server error messages", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: { message: "本小时额度已用完" } }), { status: 429 }));
    await expect(requestAiResponse({ sourceId: "s1", mode: "DOCUMENT_QA", query: "问题", passages: [{ id: "p1", sourceId: "s1", sourceTitle: "测试", content: "证据" }] })).rejects.toThrow("本小时额度已用完");
  });
});
