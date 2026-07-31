"use client";

import { Archive, BookMarked, ChevronRight, Download, FileText, Search, Sparkles, Trash2 } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AppShell } from "@/components/app-shell";
import { db } from "@/lib/db";
import { exportCardsMarkdown } from "@/lib/export";
import { clampText, formatRelativeTime } from "@/lib/format";

function CardsContent() {
  const params = useSearchParams();
  const cards = useLiveQuery(() => db.cards.orderBy("updatedAt").reverse().toArray(), [], []);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(params.get("card"));
  const [editing, setEditing] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");

  const visibleCards = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return cards.filter((card) => card.status === "ACTIVE" && (!normalized || `${card.title} ${card.excerpt} ${card.sourceTitle} ${card.tags.join(" ")}`.toLocaleLowerCase().includes(normalized)));
  }, [cards, query]);
  const selected = cards.find((card) => card.id === selectedId) || visibleCards[0] || null;

  async function saveNote() {
    if (!selected) return;
    await db.cards.update(selected.id, { userNoteMarkdown: noteDraft.trim(), updatedAt: new Date().toISOString() });
    setEditing(false);
  }

  return (
    <AppShell>
      <div className="page cards-page">
        <div className="page-inner">
          <header className="page-header">
            <div className="page-heading"><span className="eyebrow">KNOWLEDGE CARDS</span><h1>知识卡</h1><p>从原文与 AI 解释中留下的可追溯知识单元。</p></div>
            <div className="header-actions"><button className="secondary-button" disabled={!visibleCards.length} onClick={() => exportCardsMarkdown(visibleCards)}><Download size={16} /> 导出 Markdown</button></div>
          </header>
          {!cards.length ? (
            <section className="empty-state"><span className="empty-state-icon"><BookMarked size={27} /></span><h2>还没有知识卡</h2><p>在阅读器中选择文字并提问，或把带引用的 AI 回答保存为知识卡。</p><Link href="/library" className="primary-button">去资料库阅读</Link></section>
          ) : (
            <div className="cards-workspace">
              <aside className="cards-index">
                <label className="search-box"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索知识卡" /></label>
                <div className="cards-list">
                  {visibleCards.map((card) => (
                    <button key={card.id} className={selected?.id === card.id ? "active" : ""} onClick={() => { setSelectedId(card.id); setEditing(false); }}>
                      <span className="card-source-dot" />
                      <span><strong>{card.title}</strong><small>{clampText(card.excerpt, 82)}</small><em>{card.sourceTitle} · {formatRelativeTime(card.updatedAt)}</em></span>
                      <ChevronRight size={14} />
                    </button>
                  ))}
                </div>
              </aside>
              {selected && (
                <article className="card-detail">
                  <div className="card-detail-top">
                    <span className="card-kind"><BookMarked size={14} /> KNOWLEDGE CARD</span>
                    <div>
                      <button className="icon-button" title="归档" onClick={() => void db.cards.update(selected.id, { status: "ARCHIVED", updatedAt: new Date().toISOString() })}><Archive size={16} /></button>
                      <button className="icon-button danger-icon" title="删除" onClick={() => { if (window.confirm("删除这张知识卡？此操作不会删除原文或标注。")) void db.cards.delete(selected.id); }}><Trash2 size={16} /></button>
                    </div>
                  </div>
                  <h2>{selected.title}</h2>
                  <blockquote>{selected.excerpt}</blockquote>
                  <Link href={`/reader/${selected.sourceId}`} className="card-source-link"><FileText size={14} /><span>{selected.sourceTitle}</span><ChevronRight size={14} /></Link>
                  {selected.aiExplanationMarkdown && <section className="card-section"><h3><Sparkles size={14} /> AI 解释</h3><div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{selected.aiExplanationMarkdown}</ReactMarkdown></div></section>}
                  <section className="card-section user-note-section">
                    <div className="card-section-title"><h3>我的笔记</h3>{!editing && <button onClick={() => { setNoteDraft(selected.userNoteMarkdown); setEditing(true); }}>编辑</button>}</div>
                    {editing ? <><textarea value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} placeholder="写下你的理解或与其他知识的连接…" autoFocus /><div className="edit-actions"><button className="ghost-button" onClick={() => setEditing(false)}>取消</button><button className="primary-button" onClick={() => void saveNote()}>保存</button></div></> : selected.userNoteMarkdown ? <div className="markdown-body"><ReactMarkdown>{selected.userNoteMarkdown}</ReactMarkdown></div> : <p className="empty-note">还没有自己的笔记。AI 解释只是起点，你的理解才是这张卡片的核心。</p>}
                  </section>
                </article>
              )}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

export default function CardsPage() { return <Suspense><CardsContent /></Suspense>; }
