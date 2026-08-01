import type { AiResponse, WebResearchResult } from "@reader/domain";

export function selectionEvidenceContext(exact: string, context: string, limit = 3_800): string {
  const cleanExact = exact.replace(/\s+/g, " ").trim();
  const cleanContext = context.replace(/\s+/g, " ").trim();
  if (cleanContext.length <= limit) return cleanContext;
  const foundAt = cleanContext.indexOf(cleanExact);
  if (foundAt < 0) return cleanContext.slice(0, limit);
  const available = Math.max(0, limit - cleanExact.length);
  const before = Math.min(foundAt, Math.floor(available / 2));
  const after = Math.min(cleanContext.length - foundAt - cleanExact.length, available - before);
  const unused = available - before - after;
  const start = Math.max(0, foundAt - before - unused);
  return cleanContext.slice(start, start + limit);
}

export function responseDepth(response: AiResponse, responses: AiResponse[]): number {
  const byId = new Map(responses.map((item) => [item.id, item]));
  let depth = 0;
  let cursor = response.parentResponseId;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor) && depth < 8) {
    seen.add(cursor);
    depth += 1;
    cursor = byId.get(cursor)?.parentResponseId;
  }
  return depth;
}

export function distillAnswerToAnnotation(answerMarkdown: string, sources: WebResearchResult[] = []): string {
  const plain = answerMarkdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`~\[\]]/g, "")
    .replace(/\((https?:\/\/[^)]+)\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const summary = plain.length > 420 ? `${plain.slice(0, 417).trimEnd()}…` : plain;
  if (!sources.length) return summary;
  return `${summary}\n\n参考资料：\n${sources.slice(0, 3).map((source) => `- ${source.title}：${source.url}`).join("\n")}`;
}
