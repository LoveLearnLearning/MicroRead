import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const requestSchema = z.object({ url: z.url().max(2_048) });
const MAX_HTML_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 4;

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_JSON", "请求格式无效。", 400);
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return errorResponse("INVALID_URL", "请输入有效的网页地址。", 400);

  try {
    const target = new URL(parsed.data.url);
    const response = await fetchPublicHtml(target);
    const html = await readTextWithLimit(response, MAX_HTML_BYTES);
    const dom = new JSDOM(html, { url: response.url || target.toString() });
    const article = new Readability(dom.window.document, { charThreshold: 120 }).parse();
    dom.window.close();

    const textContent = normalizeArticleText(article?.textContent || "");
    if (!article || textContent.length < 120) {
      return errorResponse("ARTICLE_NOT_FOUND", "没有识别到足够的公开正文。登录页、脚本应用或反爬页面暂不支持。", 422);
    }

    return NextResponse.json({
      url: response.url || target.toString(),
      title: article.title?.trim() || target.hostname,
      byline: article.byline?.trim() || undefined,
      textContent: textContent.slice(0, 800_000),
      excerpt: article.excerpt?.trim() || textContent.slice(0, 180),
    });
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "网页提取失败。";
    if (message.startsWith("BLOCKED_ADDRESS")) {
      return errorResponse("BLOCKED_ADDRESS", "为保护本机网络，不能导入内网、本机或保留地址。", 400);
    }
    if (message.startsWith("UNSUPPORTED_CONTENT")) {
      return errorResponse("UNSUPPORTED_CONTENT", "链接返回的不是 HTML 网页。", 415);
    }
    if (message.startsWith("CONTENT_TOO_LARGE")) {
      return errorResponse("CONTENT_TOO_LARGE", "网页内容超过 5 MB，本地体验版未继续下载。", 413);
    }
    return errorResponse("FETCH_FAILED", "网页暂时无法获取。请检查地址是否公开可访问，稍后重试。", 502);
  }
}

async function fetchPublicHtml(initialUrl: URL): Promise<Response> {
  let url = initialUrl;
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    await assertPublicUrl(url);
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "AI-Native-Reader/0.1 (+local reader import)",
      },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirect === MAX_REDIRECTS) throw new Error("REDIRECT_FAILED");
      url = new URL(location, url);
      continue;
    }
    if (!response.ok) throw new Error(`HTTP_${response.status}`);

    const contentType = response.headers.get("content-type")?.toLocaleLowerCase() || "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      throw new Error("UNSUPPORTED_CONTENT");
    }
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > MAX_HTML_BYTES) throw new Error("CONTENT_TOO_LARGE");
    return response;
  }
  throw new Error("REDIRECT_FAILED");
}

async function assertPublicUrl(url: URL): Promise<void> {
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("BLOCKED_ADDRESS");
  }
  if (url.port && !["80", "443"].includes(url.port)) throw new Error("BLOCKED_ADDRESS");
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLocaleLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new Error("BLOCKED_ADDRESS");
  }
  const addresses = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] : await lookup(hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("BLOCKED_ADDRESS");
  }
}

export function isPrivateAddress(address: string): boolean {
  const normalized = address.toLocaleLowerCase();
  if (normalized.includes(":")) {
    return normalized === "::1" || normalized === "::" || normalized.startsWith("fc") ||
      normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") ||
      normalized.startsWith("fea") || normalized.startsWith("feb") || normalized.startsWith("ff") ||
      normalized.startsWith("2001:db8") ||
      normalized.startsWith("::ffff:") && isPrivateAddress(normalized.slice(7));
  }
  const parts = normalized.split(".").map(Number);
  const [a = 0, b = 0] = parts;
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51) || (a === 203 && b === 0);
}

async function readTextWithLimit(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let result = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("CONTENT_TOO_LARGE");
    }
    result += decoder.decode(value, { stream: true });
  }
  return result + decoder.decode();
}

function normalizeArticleText(value: string): string {
  return value
    .replace(/\r/g, "")
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");
}

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}
