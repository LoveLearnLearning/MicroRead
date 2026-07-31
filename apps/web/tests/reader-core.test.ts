import { describe, expect, it } from "vitest";
import type { Source } from "@reader/domain";
import { createAnchor, createPassages, createTranslationChunks, locateQuote, retrievePassages, tokenize } from "@reader/reader-core";

const source: Source = {
  id: "source-1",
  workspaceId: "workspace-1",
  type: "WEB",
  title: "证据优先阅读",
  contentHash: "hash",
  libraryState: "LIBRARY",
  processingState: "READY",
  mimeType: "text/html",
  byteSize: 100,
  tags: [],
  topicIds: [],
  progress: 0,
  createdAt: "2026-07-31T00:00:00.000Z",
  updatedAt: "2026-07-31T00:00:00.000Z",
  textContent: "第一段讨论阅读速度。\n\n第二段说明来源锚点让结论能够回到原文。\n\n第三段讨论离线写入与同步。",
};

describe("reader core", () => {
  it("creates an anchor with quote context and offsets", () => {
    const context = "前面的语境 关键结论 后面的语境";
    const anchor = createAnchor({ sourceId: source.id, exact: "关键结论", context, blockIndex: 2 });
    expect(anchor.sourceId).toBe(source.id);
    expect(anchor.quote.exact).toBe("关键结论");
    expect(anchor.quote.prefix).toContain("前面的语境");
    expect(anchor.quote.suffix).toContain("后面的语境");
    expect(anchor.blockIndex).toBe(2);
  });

  it("locates exact quotes and uses prefix fallback", () => {
    const text = "开头 前置语境 真正需要定位的句子 后置语境 结尾";
    expect(locateQuote(text, { exact: "真正需要定位的句子", prefix: "前置语境 ", suffix: " 后置语境" })).toBeGreaterThan(0);
    expect(locateQuote(text, { exact: "真正需要定位的句子（旧版）", prefix: "开头 前置语境 ", suffix: " 后置语境" })).toBeGreaterThan(0);
  });

  it("retrieves Chinese evidence using bigram lexical terms", () => {
    const passages = createPassages(source);
    const result = retrievePassages(passages, "来源锚点有什么作用", 1);
    expect(result[0]?.content).toContain("来源锚点");
    expect(tokenize("来源锚点 evidence")).toEqual(expect.arrayContaining(["来源", "锚点", "evidence"]));
  });

  it("preserves PDF page provenance while chunking", () => {
    const pdfSource = { ...source, type: "PDF" as const, textContent: "第一页内容\n\n第二页内容" };
    const passages = createPassages(pdfSource);
    expect(passages).toHaveLength(2);
    expect(passages[1]?.pageIndex).toBe(1);
    expect(passages[1]?.id).toContain("page:1");
  });

  it("creates non-overlapping translation chunks with source locations", () => {
    const longPage = `${"Academic evidence should remain traceable. ".repeat(70)}Final sentence.`;
    const chunks = createTranslationChunks({ ...source, type: "PDF", textContent: `${longPage}\n\nSecond page.` });
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks[0]?.pageIndex).toBe(0);
    expect(chunks.at(-1)?.pageIndex).toBe(1);
    expect(chunks.filter((chunk) => chunk.pageIndex === 0).map((chunk) => chunk.sourceText).join(" ").replace(/\s+/g, " ").trim())
      .toBe(longPage.replace(/\s+/g, " ").trim());
    expect(chunks.every((chunk) => chunk.sourceText.length <= 1_800)).toBe(true);
  });
});
