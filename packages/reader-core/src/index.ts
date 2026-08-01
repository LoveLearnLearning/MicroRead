import type { Anchor, Passage, PdfRect, Source, TextQuote, TranslationChunk } from "@reader/domain";
import { createId, nowIso } from "@reader/domain";

const MAX_PASSAGE_LENGTH = 1_200;
const PASSAGE_OVERLAP = 180;
const TRANSLATION_CHUNK_LENGTH = 1_800;

export interface SelectionSnapshot {
  sourceId: string;
  sourceRevisionId?: string;
  exact: string;
  context: string;
  pageIndex?: number;
  blockIndex?: number;
  startOffset?: number;
  endOffset?: number;
  pdfRects?: PdfRect[];
}

export function createTextQuote(exact: string, context: string, startOffset?: number): TextQuote {
  const cleanExact = normalizeWhitespace(exact);
  const cleanContext = normalizeWhitespace(context);
  const foundAt = startOffset ?? cleanContext.indexOf(cleanExact);
  const safeStart = foundAt >= 0 ? foundAt : 0;
  return {
    exact: cleanExact,
    prefix: cleanContext.slice(Math.max(0, safeStart - 80), safeStart),
    suffix: cleanContext.slice(safeStart + cleanExact.length, safeStart + cleanExact.length + 80),
  };
}

export function createAnchor(snapshot: SelectionSnapshot): Anchor {
  return {
    id: createId(),
    sourceId: snapshot.sourceId,
    sourceRevisionId: snapshot.sourceRevisionId ?? `${snapshot.sourceId}:1`,
    pageIndex: snapshot.pageIndex,
    blockIndex: snapshot.blockIndex,
    startOffset: snapshot.startOffset,
    endOffset: snapshot.endOffset,
    quote: createTextQuote(snapshot.exact, snapshot.context, snapshot.startOffset),
    pdfRects: snapshot.pdfRects,
    createdAt: nowIso(),
  };
}

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function createPassages(source: Source): Passage[] {
  const text = normalizeWhitespace(source.textContent ?? "");
  if (!text) return [];

  const paragraphs = (source.textContent ?? "")
    .split(/\n{2,}/)
    .map(normalizeWhitespace)
    .filter(Boolean);

  if (source.type === "PDF") {
    return paragraphs.flatMap((pageText, pageIndex) => {
      const chunks: Passage[] = [];
      for (let offset = 0; offset < pageText.length; offset += MAX_PASSAGE_LENGTH - PASSAGE_OVERLAP) {
        chunks.push({
          id: `${source.id}:page:${pageIndex}:chunk:${chunks.length}`,
          sourceId: source.id,
          sourceTitle: source.title,
          content: pageText.slice(offset, offset + MAX_PASSAGE_LENGTH),
          pageIndex,
          blockIndex: pageIndex,
        });
      }
      return chunks;
    });
  }

  const passages: Passage[] = [];
  let current = "";
  let firstBlock = 0;

  for (const [blockIndex, paragraph] of paragraphs.entries()) {
    if (!current) firstBlock = blockIndex;
    if (current && current.length + paragraph.length + 1 > MAX_PASSAGE_LENGTH) {
      passages.push(toPassage(source, passages.length, current, firstBlock));
      const overlap = current.slice(-PASSAGE_OVERLAP);
      current = overlap ? `${overlap}\n${paragraph}` : paragraph;
      firstBlock = Math.max(0, blockIndex - 1);
    } else {
      current = current ? `${current}\n${paragraph}` : paragraph;
    }
  }

  if (current) passages.push(toPassage(source, passages.length, current, firstBlock));
  return passages;
}

export function createTranslationChunks(source: Source): TranslationChunk[] {
  if (source.type === "PDF") {
    if (!source.pdfTextBlocks?.length) return [];
    return source.pdfTextBlocks.map((block, index) => ({
      id: `${source.id}:translation:${index}`,
      index,
      sourceText: block.text,
      translatedText: "",
      pageIndex: block.pageIndex,
      blockIndex: index,
      pdfRect: block.rect,
    }));
  }
  const blocks = (source.textContent ?? "")
    .split(/\n{2,}/)
    .map(normalizeWhitespace)
    .filter(Boolean);
  const chunks: TranslationChunk[] = [];

  for (const [blockIndex, block] of blocks.entries()) {
    for (const sourceText of splitForTranslation(block, TRANSLATION_CHUNK_LENGTH)) {
      const index = chunks.length;
      chunks.push({
        id: `${source.id}:translation:${index}`,
        index,
        sourceText,
        translatedText: "",
        blockIndex,
      });
    }
  }
  return chunks;
}

function splitForTranslation(text: string, limit: number): string[] {
  const parts: string[] = [];
  let remaining = text.trim();
  while (remaining.length > limit) {
    const window = remaining.slice(0, limit + 1);
    const minimum = Math.floor(limit * 0.55);
    const candidates = ["。", "！", "？", ". ", "! ", "? ", "; ", "；", ", ", "，", " "];
    let boundary = -1;
    for (const separator of candidates) {
      const found = window.lastIndexOf(separator);
      if (found >= minimum) {
        boundary = found + separator.length;
        break;
      }
    }
    if (boundary < minimum) boundary = limit;
    parts.push(remaining.slice(0, boundary).trim());
    remaining = remaining.slice(boundary).trim();
  }
  if (remaining) parts.push(remaining);
  return parts;
}

function toPassage(source: Source, index: number, content: string, blockIndex: number): Passage {
  return {
    id: `${source.id}:passage:${index}`,
    sourceId: source.id,
    sourceTitle: source.title,
    content,
    blockIndex,
  };
}

export function retrievePassages(passages: Passage[], query: string, limit = 8): Passage[] {
  if (passages.length <= limit) return passages;
  const queryTerms = tokenize(query);
  if (!queryTerms.length) return passages.slice(0, limit);

  return passages
    .map((passage, position) => ({
      passage,
      position,
      score: lexicalScore(passage.content, queryTerms),
    }))
    .sort((a, b) => b.score - a.score || a.position - b.position)
    .slice(0, limit)
    .map(({ passage }) => passage);
}

function lexicalScore(content: string, terms: string[]): number {
  const normalized = content.toLocaleLowerCase();
  const contentTerms = tokenize(normalized);
  const frequencies = new Map<string, number>();
  for (const term of contentTerms) frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
  return terms.reduce((score, term) => {
    const frequency = frequencies.get(term) ?? 0;
    const exactBoost = normalized.includes(term) ? 1.5 : 0;
    return score + Math.log1p(frequency) + exactBoost;
  }, 0);
}

export function tokenize(value: string): string[] {
  const normalized = value.toLocaleLowerCase();
  const latin = normalized.match(/[a-z0-9][a-z0-9_-]{1,}/g) ?? [];
  const chineseRuns = normalized.match(/[\u3400-\u9fff]+/g) ?? [];
  const chinese: string[] = [];
  for (const run of chineseRuns) {
    if (run.length === 1) chinese.push(run);
    for (let index = 0; index < run.length - 1; index += 1) {
      chinese.push(run.slice(index, index + 2));
    }
  }
  return [...new Set([...latin, ...chinese])];
}

export function locateQuote(text: string, quote: TextQuote): number {
  const normalized = normalizeWhitespace(text);
  const exactIndex = normalized.indexOf(quote.exact);
  if (exactIndex >= 0) return exactIndex;

  const prefixIndex = quote.prefix ? normalized.indexOf(quote.prefix) : -1;
  if (prefixIndex >= 0) {
    const expectedStart = prefixIndex + quote.prefix.length;
    const suffixIndex = quote.suffix ? normalized.indexOf(quote.suffix, expectedStart) : -1;
    if (suffixIndex >= expectedStart && suffixIndex - expectedStart <= quote.exact.length + 160) {
      return expectedStart;
    }
    const nearby = normalized.slice(expectedStart, expectedStart + quote.exact.length + 160);
    const firstWords = quote.exact.split(" ").slice(0, 5).join(" ");
    const fallbackOffset = nearby.indexOf(firstWords);
    if (fallbackOffset >= 0) return expectedStart + fallbackOffset;
  }
  return -1;
}
