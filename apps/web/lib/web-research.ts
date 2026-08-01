import type { WebResearchResult } from "@reader/domain";
import { platformResearchWeb } from "@/lib/platform";

export async function researchWeb(query: string): Promise<WebResearchResult[]> {
  const platformResult = await platformResearchWeb(query);
  if (platformResult) return platformResult;
  const response = await fetch("/api/research", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const payload = await response.json() as { results?: WebResearchResult[]; error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message || "联网资料检索失败。");
  return payload.results ?? [];
}
