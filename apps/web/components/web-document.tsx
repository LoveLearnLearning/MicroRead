"use client";

import { ExternalLink } from "lucide-react";
import type { Anchor, Annotation, Source } from "@reader/domain";

export function WebDocument({
  source,
  annotations,
  anchors,
}: {
  source: Source;
  annotations: Annotation[];
  anchors: Anchor[];
}) {
  const paragraphs = (source.textContent || "")
    .split(/\n{2,}/)
    .map((value) => value.trim())
    .filter(Boolean);
  const anchorMap = new Map(anchors.map((anchor) => [anchor.id, anchor]));

  return (
    <article className="web-publication">
      <header className="web-publication-header">
        <span className="publication-type">WEB ARTICLE</span>
        <h1>{source.title}</h1>
        <div className="publication-meta">
          {source.author && <span>{source.author}</span>}
          {source.canonicalUri?.startsWith("http") && (
            <a href={source.canonicalUri} target="_blank" rel="noreferrer">查看原网页 <ExternalLink size={12} /></a>
          )}
        </div>
        {source.summary && <p className="publication-deck">{source.summary}</p>}
      </header>
      <div className="web-publication-body">
        {paragraphs.map((paragraph, blockIndex) => {
          const blockHighlights = annotations
            .filter((annotation) => !annotation.deletedAt && anchorMap.get(annotation.anchorId)?.blockIndex === blockIndex)
            .map((annotation) => ({ annotation, anchor: anchorMap.get(annotation.anchorId)! }));
          return (
            <p key={blockIndex} id={`web-block-${blockIndex}`} data-block-index={blockIndex}>
              {highlightText(paragraph, blockHighlights)}
            </p>
          );
        })}
      </div>
      <footer className="publication-end"><span>END</span></footer>
    </article>
  );
}

function highlightText(
  text: string,
  highlights: Array<{ annotation: Annotation; anchor: Anchor }>,
): React.ReactNode[] {
  const ranges = highlights
    .map(({ annotation, anchor }) => {
      const start = text.indexOf(anchor.quote.exact);
      return { start, end: start + anchor.quote.exact.length, annotation };
    })
    .filter((range) => range.start >= 0 && range.end > range.start)
    .sort((a, b) => a.start - b.start);
  if (!ranges.length) return [text];

  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((range, index) => {
    if (range.start < cursor) return;
    nodes.push(text.slice(cursor, range.start));
    nodes.push(
      <mark key={`${range.annotation.id}:${index}`} className={`annotation-mark ${range.annotation.color}`} title={range.annotation.bodyMarkdown || "高亮"}>
        {text.slice(range.start, range.end)}
      </mark>,
    );
    cursor = range.end;
  });
  nodes.push(text.slice(cursor));
  return nodes;
}
