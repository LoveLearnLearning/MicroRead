import type { Anchor } from "@reader/domain";

interface TextBoundary {
  node: Text;
  offset: number;
}

interface NormalizedTextMap {
  text: string;
  starts: TextBoundary[];
  ends: TextBoundary[];
}

export function buildNormalizedTextMap(root: HTMLElement): NormalizedTextMap {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const text: string[] = [];
  const starts: TextBoundary[] = [];
  const ends: TextBoundary[] = [];
  let pendingWhitespace: { start: TextBoundary; end: TextBoundary } | null = null;

  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const value = node.data;
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
  const mapped = buildNormalizedTextMap(root);
  const exact = anchor.quote.exact.replace(/\s+/g, " ").trim();
  if (!exact) return null;

  const candidates: number[] = [];
  let cursor = mapped.text.indexOf(exact);
  while (cursor >= 0) {
    candidates.push(cursor);
    cursor = mapped.text.indexOf(exact, cursor + 1);
  }
  if (!candidates.length) return null;

  const preferredOffset = anchor.startOffset ?? candidates[0]!;
  const prefix = anchor.quote.prefix.replace(/\s+/g, " ").trim();
  const suffix = anchor.quote.suffix.replace(/\s+/g, " ").trim();
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
