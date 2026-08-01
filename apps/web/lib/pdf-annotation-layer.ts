import type { Anchor, PdfRect } from "@reader/domain";

interface RectLike {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export function normalizeClientRects(rects: Iterable<RectLike>, page: RectLike): PdfRect[] {
  if (page.width <= 0 || page.height <= 0) return [];
  return Array.from(rects).flatMap((rect) => {
    const left = Math.max(rect.left, page.left);
    const top = Math.max(rect.top, page.top);
    const right = Math.min(rect.right, page.right);
    const bottom = Math.min(rect.bottom, page.bottom);
    if (right <= left || bottom <= top) return [];
    return [{
      left: (left - page.left) / page.width,
      top: (top - page.top) / page.height,
      width: (right - left) / page.width,
      height: (bottom - top) / page.height,
    }];
  });
}

interface TextBoundary {
  node: Text;
  offset: number;
}

interface NormalizedTextMap {
  text: string;
  starts: TextBoundary[];
  ends: TextBoundary[];
}

export function buildNormalizedTextMap(root: HTMLElement, insertTextNodeSpaces = false): NormalizedTextMap {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const text: string[] = [];
  const starts: TextBoundary[] = [];
  const ends: TextBoundary[] = [];
  let pendingWhitespace: { start: TextBoundary; end: TextBoundary } | null = null;

  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const value = node.data;
    if (insertTextNodeSpaces && text.length && !pendingWhitespace && value && !/^\s/.test(value)) {
      const boundary = { node, offset: 0 };
      text.push(" ");
      starts.push(boundary);
      ends.push(boundary);
    }
    for (let offset = 0; offset < value.length; offset += 1) {
      const character = value.charAt(offset);
      const start = { node, offset };
      const end = { node, offset: offset + 1 };
      if (/\s/.test(character)) {
        if (text.length && !pendingWhitespace) pendingWhitespace = { start, end };
        else if (pendingWhitespace) pendingWhitespace.end = end;
        continue;
      }

      if (pendingWhitespace) {
        text.push(" ");
        starts.push(pendingWhitespace.start);
        ends.push(pendingWhitespace.end);
        pendingWhitespace = null;
      }
      text.push(character);
      starts.push(start);
      ends.push(end);
    }
  }

  return { text: text.join(""), starts, ends };
}

export function locateAnchorRange(root: HTMLElement, anchor: Anchor): Range | null {
  return locateTextRange(root, anchor.quote.exact, anchor.startOffset, anchor.quote.prefix, anchor.quote.suffix);
}

export function locateTextRange(
  root: HTMLElement,
  rawExact: string,
  preferredOffset = 0,
  rawPrefix = "",
  rawSuffix = "",
  insertTextNodeSpaces = false,
): Range | null {
  const mapped = buildNormalizedTextMap(root, insertTextNodeSpaces);
  const exact = rawExact.replace(/\s+/g, " ").trim();
  if (!exact) return null;

  const candidates: number[] = [];
  let cursor = mapped.text.indexOf(exact);
  while (cursor >= 0) {
    candidates.push(cursor);
    cursor = mapped.text.indexOf(exact, cursor + 1);
  }
  if (!candidates.length) return null;

  const prefix = rawPrefix.replace(/\s+/g, " ").trim();
  const suffix = rawSuffix.replace(/\s+/g, " ").trim();
  const selected = candidates
    .map((candidate) => {
      let score = -Math.abs(candidate - preferredOffset);
      if (prefix && mapped.text.slice(Math.max(0, candidate - prefix.length), candidate) === prefix) score += 10_000;
      if (suffix && mapped.text.slice(candidate + exact.length, candidate + exact.length + suffix.length) === suffix) score += 10_000;
      return { candidate, score };
    })
    .sort((a, b) => b.score - a.score)[0]!.candidate;

  const first = mapped.starts[selected];
  const last = mapped.ends[selected + exact.length - 1];
  if (!first || !last) return null;
  const range = document.createRange();
  range.setStart(first.node, first.offset);
  range.setEnd(last.node, last.offset);
  return range;
}
