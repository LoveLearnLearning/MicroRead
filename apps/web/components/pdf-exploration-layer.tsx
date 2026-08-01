"use client";

import { Check, ExternalLink, GitFork, Globe2, LoaderCircle, RefreshCw, Send, Sparkles, StickyNote, X } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AiBranchType, AiResponse, Anchor } from "@reader/domain";

export function PdfExplorationLayer({
  pageIndex,
  anchors,
  responses,
  openAnchorId,
  selectedResponseId,
  asking,
  error,
  savedAnnotationId,
  onOpenAnchor,
  onSelectResponse,
  onAskBranch,
  onDistill,
}: {
  pageIndex: number;
  anchors: Anchor[];
  responses: AiResponse[];
  openAnchorId: string;
  selectedResponseId: string;
  asking: boolean;
  error: string;
  savedAnnotationId: string;
  onOpenAnchor: (anchorId: string) => void;
  onSelectResponse: (responseId: string) => void;
  onAskBranch: (parent: AiResponse, type: AiBranchType, query: string, webResearch: boolean) => void;
  onDistill: (response: AiResponse) => void;
}) {
  const anchorMap = useMemo(() => new Map(anchors.map((anchor) => [anchor.id, anchor])), [anchors]);
  const trees = useMemo(() => {
    const grouped = new Map<string, AiResponse[]>();
    for (const response of responses) {
      if (!response.anchorId) continue;
      const anchor = anchorMap.get(response.anchorId);
      if (anchor?.pageIndex !== pageIndex || !anchor.pdfRects?.length) continue;
      const nodes = grouped.get(response.anchorId) ?? [];
      nodes.push(response);
      grouped.set(response.anchorId, nodes);
    }
    return [...grouped.entries()].map(([anchorId, nodes]) => ({
      anchor: anchorMap.get(anchorId)!,
      nodes: orderTreeNodes(nodes),
    }));
  }, [anchorMap, pageIndex, responses]);

  if (!trees.length) return null;
  return (
    <div className="pdf-exploration-layer">
      {trees.map(({ anchor, nodes }) => (
        <PdfExplorationTree
          key={anchor.id}
          anchor={anchor}
          nodes={nodes}
          open={openAnchorId === anchor.id}
          selectedResponseId={selectedResponseId}
          asking={asking && openAnchorId === anchor.id}
          error={openAnchorId === anchor.id ? error : ""}
          savedAnnotationId={savedAnnotationId}
          onOpen={() => onOpenAnchor(openAnchorId === anchor.id ? "" : anchor.id)}
          onSelectResponse={onSelectResponse}
          onAskBranch={onAskBranch}
          onDistill={onDistill}
        />
      ))}
    </div>
  );
}

function PdfExplorationTree({ anchor, nodes, open, selectedResponseId, asking, error, savedAnnotationId, onOpen, onSelectResponse, onAskBranch, onDistill }: {
  anchor: Anchor;
  nodes: AiResponse[];
  open: boolean;
  selectedResponseId: string;
  asking: boolean;
  error: string;
  savedAnnotationId: string;
  onOpen: () => void;
  onSelectResponse: (responseId: string) => void;
  onAskBranch: (parent: AiResponse, type: AiBranchType, query: string, webResearch: boolean) => void;
  onDistill: (response: AiResponse) => void;
}) {
  const [branchType, setBranchType] = useState<AiBranchType | null>(null);
  const [query, setQuery] = useState("");
  const [webResearch, setWebResearch] = useState(false);
  const anchorRect = anchor.pdfRects!.at(-1)!;
  const selected = nodes.find((node) => node.id === selectedResponseId) ?? nodes.at(-1)!;
  const cardLeft = Math.min(.54, anchorRect.left + anchorRect.width + .018);
  const cardTop = anchorRect.top > .48 ? Math.max(.02, anchorRect.top - .38) : Math.max(.02, anchorRect.top - .015);

  function begin(type: AiBranchType) {
    setBranchType(type);
    setQuery(type === "DEEPER" ? "继续深入解释这个节点的关键机制。" : type === "DIVERGENT" ? "从另一个角度展开，并说明与当前节点的差异。" : selected.query);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!branchType || !query.trim() || asking) return;
    onAskBranch(selected, branchType, query.trim(), webResearch);
    setBranchType(null);
    setQuery("");
  }

  return (
    <>
      <button
        type="button"
        className={`pdf-exploration-marker ${open ? "active" : ""}`}
        style={{ left: `${Math.min(.96, anchorRect.left + anchorRect.width) * 100}%`, top: `${anchorRect.top * 100}%` }}
        onClick={onOpen}
        aria-label={open ? "收起原文探索树" : "展开原文探索树"}
        title={`${nodes.length} 个探索节点`}
      >
        <Sparkles size={13} /><span>{nodes.length}</span>
      </button>
      {open && (
        <section className="pdf-exploration-card" style={{ left: `${cardLeft * 100}%`, top: `${cardTop * 100}%` }} aria-label="原文探索树">
          <header>
            <span><GitFork size={14} /><strong>原文探索</strong><small>{nodes.length} 个节点</small></span>
            <button type="button" onClick={onOpen} aria-label="关闭原文探索树"><X size={14} /></button>
          </header>
          <div className="pdf-exploration-node-rail" aria-label="探索节点层级">
            {nodes.map((node) => (
              <button
                type="button"
                key={node.id}
                className={node.id === selected.id ? "active" : ""}
                style={{ marginLeft: `${nodeDepth(node, nodes) * 13}px` }}
                onClick={() => onSelectResponse(node.id)}
                title={node.query}
              >
                <i />
                <span>{branchLabel(node.branchType)}</span>
                <strong>{shorten(node.query, 26)}</strong>
              </button>
            ))}
          </div>
          <div className="pdf-exploration-scroll">
            <div className="pdf-exploration-query">{selected.query}</div>
            <div className="pdf-exploration-answer markdown-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{selected.answerMarkdown || "正在组织回答…"}</ReactMarkdown>
              {asking && <span className="pdf-exploration-loading"><LoaderCircle className="spin" size={13} /> 正在生成节点…</span>}
            </div>
            {!!selected.citations.length && (
              <div className="pdf-exploration-sources">
                {selected.citations.map((citation, index) => citation.url
                  ? <a key={citation.id} href={citation.url} target="_blank" rel="noreferrer"><ExternalLink size={10} /> [{index + 1}] {citation.sourceTitle}</a>
                  : <span key={citation.id}>[{index + 1}] {citation.pageIndex === undefined ? citation.sourceTitle : `第 ${citation.pageIndex + 1} 页`}</span>)}
              </div>
            )}
            {error && <div className="pdf-exploration-error">{error}</div>}
          </div>
          {!asking && selected.answerMarkdown && (
            <div className="pdf-exploration-actions">
              <button type="button" onClick={() => begin("DEEPER")}><GitFork size={11} /> 深入</button>
              <button type="button" onClick={() => begin("DIVERGENT")}><GitFork size={11} /> 分叉</button>
              <button type="button" onClick={() => begin("RETRY")}><RefreshCw size={11} /> 重答</button>
              <button type="button" onClick={() => onDistill(selected)} disabled={Boolean(savedAnnotationId)}>{savedAnnotationId ? <Check size={11} /> : <StickyNote size={11} />}{savedAnnotationId ? "已批注" : "提炼批注"}</button>
            </div>
          )}
          {branchType && (
            <form className="pdf-exploration-composer" onSubmit={submit}>
              <textarea autoFocus value={query} onChange={(event) => setQuery(event.target.value)} rows={2} />
              <label className={webResearch ? "active" : ""}><input type="checkbox" checked={webResearch} onChange={(event) => setWebResearch(event.target.checked)} /><Globe2 size={11} /> 联网</label>
              <button disabled={!query.trim() || asking} aria-label="发送探索分支"><Send size={13} /></button>
            </form>
          )}
        </section>
      )}
    </>
  );
}

function nodeDepth(node: AiResponse, nodes: AiResponse[]): number {
  const byId = new Map(nodes.map((candidate) => [candidate.id, candidate]));
  let depth = 0;
  let parentId = node.parentResponseId;
  const visited = new Set<string>();
  while (parentId && !visited.has(parentId) && depth < 6) {
    visited.add(parentId);
    depth += 1;
    parentId = byId.get(parentId)?.parentResponseId;
  }
  return depth;
}

function orderTreeNodes(nodes: AiResponse[]): AiResponse[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const children = new Map<string, AiResponse[]>();
  const roots: AiResponse[] = [];
  for (const node of nodes) {
    if (!node.parentResponseId || !byId.has(node.parentResponseId)) {
      roots.push(node);
      continue;
    }
    const siblings = children.get(node.parentResponseId) ?? [];
    siblings.push(node);
    children.set(node.parentResponseId, siblings);
  }
  const byCreatedAt = (left: AiResponse, right: AiResponse) => left.createdAt.localeCompare(right.createdAt);
  roots.sort(byCreatedAt);
  children.forEach((siblings) => siblings.sort(byCreatedAt));
  const ordered: AiResponse[] = [];
  const visit = (node: AiResponse) => {
    ordered.push(node);
    children.get(node.id)?.forEach(visit);
  };
  roots.forEach(visit);
  return ordered;
}

function branchLabel(type?: AiBranchType): string {
  return ({ ROOT: "起点", DEEPER: "深入", DIVERGENT: "分叉", RETRY: "重答" } as const)[type ?? "ROOT"];
}

function shorten(value: string, length: number): string {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}
