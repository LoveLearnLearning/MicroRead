import { describe, expect, it } from "vitest";
import { cardsToMarkdown } from "@/lib/export";

describe("knowledge card export", () => {
  it("keeps source, excerpt, notes, AI explanation and tags", () => {
    const markdown = cardsToMarkdown([{
      id: "c1",
      workspaceId: "w1",
      sourceId: "s1",
      sourceTitle: "来源文档",
      sourceAnchorId: "a1",
      title: "关键概念",
      excerpt: "原文摘录",
      userNoteMarkdown: "我的理解",
      aiExplanationMarkdown: "带依据的解释",
      tags: ["方法"],
      status: "ACTIVE",
      createdAt: "2026-07-31T00:00:00.000Z",
      updatedAt: "2026-07-31T00:00:00.000Z",
    }]);
    expect(markdown).toContain("## 关键概念");
    expect(markdown).toContain("> 原文摘录");
    expect(markdown).toContain("来源：来源文档");
    expect(markdown).toContain("我的理解");
    expect(markdown).toContain("带依据的解释");
    expect(markdown).toContain("#方法");
  });
});
