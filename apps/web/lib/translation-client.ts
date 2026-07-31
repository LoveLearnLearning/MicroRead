import type { Usage } from "@reader/domain";
import { platformTranslateBatch, type TranslationBatchResult } from "@/lib/platform";

export async function requestTranslationBatch(request: {
  sourceId: string;
  targetLocale: string;
  chunks: Array<{ id: string; text: string }>;
}): Promise<TranslationBatchResult> {
  const platformResult = await platformTranslateBatch(request);
  if (platformResult) return validateResult(platformResult, request.chunks.map((chunk) => chunk.id));

  const response = await fetch("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  const payload = await response.json().catch(() => null) as (TranslationBatchResult & { error?: { message?: string } }) | null;
  if (!response.ok || !payload) {
    throw new Error(payload?.error?.message || `全文翻译失败（HTTP ${response.status}）`);
  }
  return validateResult(payload, request.chunks.map((chunk) => chunk.id));
}

function validateResult(result: TranslationBatchResult, requestedIds: string[]): TranslationBatchResult {
  if (!Array.isArray(result.translations) || !result.usage) throw new Error("翻译服务返回了无效结果。");
  const translated = new Map(result.translations.map((item) => [item.id, item.text.trim()]));
  if (translated.size !== requestedIds.length || requestedIds.some((id) => !translated.get(id))) {
    throw new Error("部分段落没有获得译文，请重试。");
  }
  return {
    translations: requestedIds.map((id) => ({ id, text: translated.get(id)! })),
    usage: result.usage as Usage,
  };
}
