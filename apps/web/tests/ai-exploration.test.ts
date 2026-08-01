import { describe, expect, it } from "vitest";
import type { AiResponse } from "@reader/domain";
import { distillAnswerToAnnotation, responseDepth, selectionEvidenceContext } from "@/lib/ai-exploration";

const usage = { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0, model: "test" };
const node = (id: string, parentResponseId?: string): AiResponse => ({
  id,
  parentResponseId,
  sourceId: "source",
  query: id,
  mode: "DOCUMENT_QA",
  answerMarkdown: id,
  claims: [],
  citations: [],
  limitations: [],
  usage,
  createdAt: "2026-08-01T00:00:00.000Z",
});

describe("AI exploration helpers", () => {
  it("computes nested response depth and stops cyclic parent chains", () => {
    const responses = [node("root"), node("child", "root"), node("grandchild", "child")];
    expect(responseDepth(responses[2]!, responses)).toBe(2);
    expect(responseDepth(node("cycle-a", "cycle-b"), [node("cycle-a", "cycle-b"), node("cycle-b", "cycle-a")])).toBe(2);
  });

  it("distills markdown and preserves external source links", () => {
    const note = distillAnswerToAnnotation("## 结论\n**这个机制** 能解释结果。", [{
      id: "wikipedia:1",
      title: "Example",
      url: "https://example.com",
      snippet: "Example",
      provider: "Wikipedia",
    }]);
    expect(note).toContain("这个机制 能解释结果");
    expect(note).toContain("https://example.com");
    expect(note).not.toContain("##");
  });

  it("limits selected-text evidence while keeping the selection and nearby context", () => {
    const selected = "SELECTED EXPLANATION TARGET";
    const context = `BEGIN_MARKER ${"before ".repeat(700)}${selected}${" after".repeat(700)} END_MARKER`;
    const evidence = selectionEvidenceContext(selected, context);
    expect(evidence.length).toBeLessThanOrEqual(3_800);
    expect(evidence).toContain(selected);
    expect(evidence).not.toContain("BEGIN_MARKER");
    expect(evidence).not.toContain("END_MARKER");
  });
});
