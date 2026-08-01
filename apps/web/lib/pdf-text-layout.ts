import type { PdfTextBlock } from "@reader/domain";

export interface PdfTextItemLike {
  str: string;
  width: number;
  height: number;
  transform: readonly number[];
}

interface LayoutLine {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

export function buildPdfTextBlocks(
  items: PdfTextItemLike[],
  pageIndex: number,
  pageWidth: number,
  pageHeight: number,
): PdfTextBlock[] {
  if (pageWidth <= 0 || pageHeight <= 0) return [];
  const tokens = items.flatMap((item) => {
    const text = item.str.replace(/\s+/g, " ").trim();
    const [a = 0, b = 0, , d = 0, x = 0, baseline = 0] = item.transform;
    const angle = Math.abs(Math.atan2(b, a) * 180 / Math.PI);
    const rotation = Math.min(angle, Math.abs(360 - angle));
    const height = Math.max(Math.abs(d), item.height || 0);
    if (!text || rotation > 6 || height < pageHeight * .004 || height > pageHeight * .055) return [];
    return [{ text, left: x, top: pageHeight - baseline - height, width: Math.max(1, item.width), height }];
  }).sort((left, right) => left.top - right.top || left.left - right.left);

  const rows: LayoutLine[][] = [];
  for (const token of tokens) {
    const row = rows.find((candidate) => Math.abs(candidate[0]!.top - token.top) <= Math.max(candidate[0]!.height, token.height) * .65);
    if (row) row.push(token);
    else rows.push([token]);
  }

  const lines = rows.flatMap((row) => {
    const ordered = row.sort((left, right) => left.left - right.left);
    const segments: LayoutLine[][] = [];
    for (const token of ordered) {
      const segment = segments.at(-1);
      const previous = segment?.at(-1);
      const gap = previous ? token.left - previous.left - previous.width : 0;
      if (!segment || gap > Math.max(24, token.height * 3)) segments.push([token]);
      else segment.push(token);
    }
    return segments.map((segment) => unionLines(segment));
  }).filter((line) => /[\p{L}\p{N}]/u.test(line.text));

  const blocks: LayoutLine[] = [];
  for (const line of lines.sort((left, right) => left.top - right.top || left.left - right.left)) {
    const candidate = blocks
      .map((block, index) => ({ block, index, gap: line.top - block.top - block.height }))
      .filter(({ block, gap }) => gap >= -Math.max(block.height, line.height) * .4
        && gap <= Math.max(16, line.height * 1.8)
        && horizontalOverlap(block, line) >= .68
        && block.text.length + line.text.length <= 360)
      .sort((left, right) => Math.abs(left.gap) - Math.abs(right.gap))[0];
    if (!candidate) blocks.push(line);
    else blocks[candidate.index] = unionLines([candidate.block, line]);
  }

  return blocks.map((block) => ({
    pageIndex,
    text: block.text,
    rect: {
      left: clamp01(block.left / pageWidth),
      top: clamp01(block.top / pageHeight),
      width: clamp01(block.width / pageWidth),
      height: clamp01(block.height / pageHeight),
    },
  })).filter((block) => block.rect.width * block.rect.height < .24);
}

function unionLines(lines: LayoutLine[]): LayoutLine {
  const left = Math.min(...lines.map((line) => line.left));
  const top = Math.min(...lines.map((line) => line.top));
  const right = Math.max(...lines.map((line) => line.left + line.width));
  const bottom = Math.max(...lines.map((line) => line.top + line.height));
  return { text: lines.map((line) => line.text).join(" "), left, top, width: right - left, height: bottom - top };
}

function horizontalOverlap(left: LayoutLine, right: LayoutLine): number {
  const overlap = Math.max(0, Math.min(left.left + left.width, right.left + right.width) - Math.max(left.left, right.left));
  return overlap / Math.max(1, Math.min(left.width, right.width));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
