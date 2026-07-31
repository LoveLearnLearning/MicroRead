"use client";

import {
  BookOpenText,
  FileText,
  Globe2,
  Grid2X2,
  Inbox,
  List,
  MoreHorizontal,
  Plus,
  Search,
  Sparkles,
  Archive,
  ArchiveRestore,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { LibraryState, Source } from "@reader/domain";
import { AppShell } from "@/components/app-shell";
import { ImportDialog } from "@/components/import-dialog";
import { db, deleteSourcePermanently, updateSource } from "@/lib/db";
import { formatFileSize, formatRelativeTime } from "@/lib/format";

const filterOptions = [
  { key: "ALL", label: "全部" },
  { key: "PDF", label: "PDF" },
  { key: "WEB", label: "网页" },
  { key: "TAGGED", label: "有标签" },
] as const;

function LibraryContent() {
  const params = useSearchParams();
  const stateParam = params.get("state") as LibraryState | null;
  const libraryState: LibraryState = stateParam ?? "LIBRARY";
  const [importOpen, setImportOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof filterOptions)[number]["key"]>("ALL");
  const [view, setView] = useState<"grid" | "list">("grid");

  const sources = useLiveQuery(
    () => db.sources.where("libraryState").equals(libraryState).reverse().sortBy("updatedAt"),
    [libraryState],
  );

  const visibleSources = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return (sources ?? []).filter((source) => {
      const matchesFilter = filter === "ALL" || source.type === filter || (filter === "TAGGED" && source.tags.length > 0);
      const haystack = `${source.title} ${source.author ?? ""} ${source.summary ?? ""} ${source.tags.join(" ")}`.toLocaleLowerCase();
      return matchesFilter && (!normalizedQuery || haystack.includes(normalizedQuery));
    });
  }, [filter, query, sources]);

  const heading = libraryState === "INBOX" ? "收集箱" : libraryState === "ARCHIVED" ? "已归档" : libraryState === "TRASHED" ? "回收站" : "资料库";
  const subheading = libraryState === "INBOX"
      ? "新加入的资料会先停在这里，读完后再整理。"
      : libraryState === "ARCHIVED"
        ? "暂时收起的资料仍保留全部标注和卡片。"
        : libraryState === "TRASHED"
          ? "移除的资料可以恢复；永久删除会同时移除原件、标注和卡片。"
      : "你的资料、阅读进度和知识线索，都从这里继续。";

  return (
    <AppShell>
      <div className="page">
        <div className="page-inner">
          <header className="page-header">
            <div className="page-heading">
              <span className="eyebrow">PERSONAL WORKSPACE</span>
              <h1>{heading}</h1>
              <p>{subheading}</p>
            </div>
            <div className="header-actions">
              <button className="primary-button" onClick={() => setImportOpen(true)}><Plus size={17} /> 添加资料</button>
            </div>
          </header>

          <div className="library-toolbar">
            <label className="search-box">
              <Search size={17} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题、作者或标签" aria-label="搜索资料" />
            </label>
            <div className="view-actions" aria-label="视图方式">
              <button className={view === "grid" ? "active" : ""} onClick={() => setView("grid")} aria-label="网格视图"><Grid2X2 size={15} /></button>
              <button className={view === "list" ? "active" : ""} onClick={() => setView("list")} aria-label="列表视图"><List size={16} /></button>
            </div>
          </div>

          <div className="filter-row">
            {filterOptions.map((option) => (
              <button key={option.key} className={`filter-chip ${filter === option.key ? "active" : ""}`} onClick={() => setFilter(option.key)}>
                {option.label}
              </button>
            ))}
            <span className="result-count">{visibleSources.length} 份资料</span>
          </div>

          {visibleSources.length ? (
            <div className={`source-grid ${view === "list" ? "list-view" : ""}`}>
              {visibleSources.map((source) => <SourceCard key={source.id} source={source} />)}
            </div>
          ) : (
            <section className="empty-state">
              <span className="empty-state-icon">{libraryState === "INBOX" ? <Inbox size={27} /> : <BookOpenText size={27} />}</span>
              <h2>{query || filter !== "ALL" ? "没有匹配的资料" : `${heading}还是空的`}</h2>
              <p>{query || filter !== "ALL" ? "换一个关键词或筛选条件试试。" : "添加 PDF 或公开网页，阅读时的标注、提问和卡片都会与原文一起保存。"}</p>
              {!query && filter === "ALL" && <button className="primary-button" onClick={() => setImportOpen(true)}><Plus size={17} /> 添加第一份资料</button>}
            </section>
          )}
        </div>
      </div>
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </AppShell>
  );
}

function SourceCard({ source }: { source: Source }) {
  const isPdf = source.type === "PDF";
  const [menuOpen, setMenuOpen] = useState(false);

  async function moveTo(state: Source["libraryState"]) {
    await updateSource(source.id, { libraryState: state });
    setMenuOpen(false);
  }

  async function deleteForever() {
    if (!window.confirm(`永久删除“${source.title}”及其标注、卡片和本地原件？此操作无法撤销。`)) return;
    await deleteSourcePermanently(source.id);
  }

  return (
    <article className="source-card">
      <Link href={`/reader/${source.id}`} className="source-card-main">
        <div className="source-card-top">
          <span className={`source-type-icon ${isPdf ? "pdf" : ""}`}>
            {isPdf ? <FileText size={20} /> : <Globe2 size={20} />}
            <small>{source.type}</small>
          </span>
        </div>
        <h2>{source.title}</h2>
        <p className="source-summary">{source.summary || (source.author ? `${source.author} · ${formatFileSize(source.byteSize)}` : "打开资料开始阅读和建立索引。")}</p>
        <div className="source-tags">
          {source.processingState !== "READY" && <span className="processing-badge"><Sparkles size={10} /> {processingLabel(source.processingState)}</span>}
          {source.tags.slice(0, 3).map((tag) => <span className="tag" key={tag}>#{tag}</span>)}
        </div>
      </Link>
      <footer className="source-card-footer">
        <span>{formatRelativeTime(source.lastOpenedAt || source.createdAt)}</span>
        <span>{source.pageCount ? `${source.pageCount} 页` : source.author || formatFileSize(source.byteSize)}</span>
        <span className="source-progress" title={`阅读进度 ${source.progress}%`}><span style={{ width: `${source.progress}%` }} /></span>
      </footer>
      <button className="card-menu-button source-card-menu-trigger" aria-label={`更多：${source.title}`} onClick={() => setMenuOpen((value) => !value)}><MoreHorizontal size={17} /></button>
      {menuOpen && (
        <div className="source-card-menu">
          {source.libraryState === "ARCHIVED" || source.libraryState === "TRASHED" ? (
            <button onClick={() => void moveTo("LIBRARY")}><ArchiveRestore size={14} /> 恢复到资料库</button>
          ) : (
            <button onClick={() => void moveTo("ARCHIVED")}><Archive size={14} /> 归档</button>
          )}
          {source.libraryState !== "TRASHED" ? (
            <button className="danger" onClick={() => void moveTo("TRASHED")}><Trash2 size={14} /> 移到回收站</button>
          ) : (
            <button className="danger" onClick={() => void deleteForever()}><Trash2 size={14} /> 永久删除</button>
          )}
        </div>
      )}
    </article>
  );
}

function processingLabel(state: Source["processingState"]): string {
  if (state === "UPLOADED") return "等待提取文本";
  if (state === "EXTRACTING") return "正在提取";
  if (state === "INDEXING") return "正在建索引";
  if (state === "FAILED") return "解析失败，仍可阅读";
  return "可问答";
}

export default function LibraryPage() {
  return <Suspense><LibraryContent /></Suspense>;
}
