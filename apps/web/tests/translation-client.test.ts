import { afterEach, describe, expect, it, vi } from "vitest";
import { requestTranslationBatch } from "@/lib/translation-client";

afterEach(() => vi.restoreAllMocks());

describe("translation client", () => {
  it("preserves requested chunk order", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      translations: [{ id: "b", text: "第二段" }, { id: "a", text: "第一段" }],
      usage: { inputTokens: 20, outputTokens: 12, estimatedCostUsd: 0.001, model: "deepseek-v4-flash" },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const result = await requestTranslationBatch({
      sourceId: "source",
      targetLocale: "zh-CN",
      chunks: [{ id: "a", text: "First" }, { id: "b", text: "Second" }],
    });
    expect(result.translations.map((item) => item.id)).toEqual(["a", "b"]);
    expect(result.translations[0]?.text).toBe("第一段");
  });

  it("rejects incomplete translation batches", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      translations: [{ id: "a", text: "第一段" }],
      usage: { inputTokens: 20, outputTokens: 8, estimatedCostUsd: 0.001, model: "deepseek-v4-flash" },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    await expect(requestTranslationBatch({
      sourceId: "source",
      targetLocale: "zh-CN",
      chunks: [{ id: "a", text: "First" }, { id: "b", text: "Second" }],
    })).rejects.toThrow("部分段落没有获得译文");
  });
});
