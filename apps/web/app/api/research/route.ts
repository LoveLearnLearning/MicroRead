import type { WebResearchResult } from "@reader/domain";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let query = "";
  try {
    const body = await request.json() as { query?: unknown };
    query = typeof body.query === "string" ? body.query.trim() : "";
  } catch {
    return error("请求格式无效。", 400);
  }
  if (query.length < 2 || query.length > 300) return error("检索词需要在 2 到 300 个字符之间。", 400);

  try {
    const [wikipedia, crossref] = await Promise.allSettled([
      searchWikipedia(query),
      searchCrossref(query),
    ]);
    const results = [
      ...(wikipedia.status === "fulfilled" ? wikipedia.value : []),
      ...(crossref.status === "fulfilled" ? crossref.value : []),
    ];
    if (!results.length && wikipedia.status === "rejected" && crossref.status === "rejected") {
      return error("资料源暂时不可用，请稍后重试。", 502);
    }
    return NextResponse.json({ results });
  } catch {
    return error("资料检索失败，请稍后重试。", 502);
  }
}

async function searchWikipedia(query: string): Promise<WebResearchResult[]> {
  const language = /[\u3400-\u9fff]/.test(query) ? "zh" : "en";
  const url = new URL(`https://${language}.wikipedia.org/w/api.php`);
  url.search = new URLSearchParams({ action: "query", list: "search", srsearch: query, srlimit: "3", format: "json", origin: "*" }).toString();
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000), headers: { "User-Agent": "MicroRead/0.2 (local research reader)" } });
  if (!response.ok) throw new Error("Wikipedia unavailable");
  const payload = await response.json() as { query?: { search?: Array<{ pageid: number; title: string; snippet: string }> } };
  return (payload.query?.search ?? []).map((item) => ({
    id: `wikipedia:${item.pageid}`,
    title: item.title,
    url: `https://${language}.wikipedia.org/?curid=${item.pageid}`,
    snippet: stripMarkup(item.snippet).slice(0, 700),
    provider: "Wikipedia",
  }));
}

async function searchCrossref(query: string): Promise<WebResearchResult[]> {
  const url = new URL("https://api.crossref.org/works");
  url.search = new URLSearchParams({ query, rows: "3", select: "DOI,title,abstract,URL,published" }).toString();
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000), headers: { "User-Agent": "MicroRead/0.2 (mailto:local@localhost)" } });
  if (!response.ok) throw new Error("Crossref unavailable");
  const payload = await response.json() as { message?: { items?: Array<{ DOI?: string; title?: string[]; abstract?: string; URL?: string }> } };
  return (payload.message?.items ?? []).flatMap((item, index) => {
    const title = item.title?.[0]?.trim();
    const target = item.URL || (item.DOI ? `https://doi.org/${item.DOI}` : "");
    if (!title || !target) return [];
    return [{ id: `crossref:${item.DOI || index}`, title, url: target, snippet: stripMarkup(item.abstract || title).slice(0, 700), provider: "Crossref" as const }];
  });
}

function stripMarkup(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/&(?:nbsp|amp|lt|gt|quot|#39);/g, " ").replace(/\s+/g, " ").trim();
}

function error(message: string, status: number) {
  return NextResponse.json({ error: { message } }, { status });
}
