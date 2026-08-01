"use client";

import {
  AlignLeft,
  ArrowLeft,
  Bookmark,
  BookOpen,
  Bot,
  Check,
  ChevronRight,
  CircleAlert,
  FileQuestion,
  FileText,
  Focus,
  GitFork,
  Globe2,
  ExternalLink,
  Highlighter,
  Info,
  Library,
  Languages,
  LoaderCircle,
  Maximize2,
  MessageSquareText,
  Minus,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Plus,
  Quote,
  RefreshCw,
  Save,
  Search,
  Send,
  Sparkles,
  StickyNote,
  Trash2,
  Columns2,
  Pause,
  X,
} from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import dynamic from "next/dynamic";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FormEvent, MouseEvent, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type {
  AiMode,
  AiBranchType,
  AiResponse,
  Anchor,
  Annotation,
  AnnotationColor,
  Citation,
  Claim,
  KnowledgeCard,
  Passage,
  Source,
  Usage,
  FeatureFlags,
  DocumentTranslation,
  WebResearchResult,
} from "@reader/domain";
import { DEFAULT_WORKSPACE_ID, createId, nowIso } from "@reader/domain";
import { createAnchor, createPassages, createTranslationChunks, retrievePassages } from "@reader/reader-core";
import { requestAiResponse } from "@/lib/ai-client";
import { db, deleteAnnotation, putAnnotation, putCard, updateAnnotation, updateSource } from "@/lib/db";
import { requestTranslationBatch } from "@/lib/translation-client";
import { clampText, formatFileSize, formatRelativeTime } from "@/lib/format";
import { WebDocument } from "@/components/web-document";
import { distillAnswerToAnnotation, responseDepth, selectionEvidenceContext } from "@/lib/ai-exploration";
import { researchWeb } from "@/lib/web-research";
import { normalizeClientRects } from "@/lib/pdf-annotation-layer";

const PdfDocument = dynamic(
  () => import("@/components/pdf-document").then((module) => module.PdfDocument),
  { ssr: false, loading: () => <div className="document-loading"><LoaderCircle className="spin" size={22} /><span>正在加载 PDF 阅读器…</span></div> },
);

type RightTab = "ai" | "notes" | "info";
type LeftTab = "structure" | "search";
type TranslationViewMode = "inline" | "parallel" | "translation";
const TRANSLATION_LAYOUT_VERSION = 3;
const EMPTY_TRANSLATION_CHUNKS: DocumentTranslation["chunks"] = [];

interface ActiveSelection {
  anchor: Anchor;
  context: string;
  aiContext: string;
  surface: "source" | "translation";
  rect: { left: number; top: number };
}

interface DraftAnswer {
  id: string;
  query: string;
  mode: AiMode;
  answerMarkdown: string;
  claims: Claim[];
  citations: Citation[];
  limitations: string[];
  usage: Usage;
  parentResponseId?: string;
  branchType?: AiBranchType;
  anchorId?: string;
  webSources?: WebResearchResult[];
  createdAt: string;
}

export function ReaderWorkspace({ sourceId }: { sourceId: string }) {
  const source = useLiveQuery(async () => (await db.sources.get(sourceId)) ?? null, [sourceId]);
  const sourceFile = useLiveQuery(() => db.sourceFiles.get(sourceId), [sourceId]);
  const annotations = useLiveQuery(
    async () => (await db.annotations.where("sourceId").equals(sourceId).toArray()).filter((annotation) => !annotation.deletedAt),
    [sourceId],
    [],
  );
  const anchors = useLiveQuery(() => db.anchors.where("sourceId").equals(sourceId).toArray(), [sourceId], []);
  const cards = useLiveQuery(() => db.cards.where("sourceId").equals(sourceId).reverse().sortBy("updatedAt"), [sourceId], []);
  const storedResponses = useLiveQuery(() => db.aiResponses.where("sourceId").equals(sourceId).reverse().sortBy("createdAt"), [sourceId], []);
  const featureSetting = useLiveQuery(() => db.settings.get("featureFlags"), [], undefined);
  const translation = useLiveQuery(() => db.translations.get(`${sourceId}:zh-CN`), [sourceId]);

  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [leftTab, setLeftTab] = useState<LeftTab>("structure");
  const [rightTab, setRightTab] = useState<RightTab>("ai");
  const [focusMode, setFocusMode] = useState(false);
  const [zoom, setZoom] = useState(0.9);
  const [selection, setSelection] = useState<ActiveSelection | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteAnchor, setNoteAnchor] = useState<Anchor | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [aiQuery, setAiQuery] = useState("");
  const [asking, setAsking] = useState(false);
  const [aiError, setAiError] = useState("");
  const [draftAnswer, setDraftAnswer] = useState<DraftAnswer | null>(null);
  const [savedCardId, setSavedCardId] = useState("");
  const [activeResponseId, setActiveResponseId] = useState("");
  const [branchParentId, setBranchParentId] = useState<string | null>(null);
  const [branchType, setBranchType] = useState<AiBranchType>("ROOT");
  const [webResearchEnabled, setWebResearchEnabled] = useState(false);
  const [savedAnnotationId, setSavedAnnotationId] = useState("");
  const [openExplorationAnchorId, setOpenExplorationAnchorId] = useState("");
  const [selectedExplorationResponseId, setSelectedExplorationResponseId] = useState("");
  const [translationVisible, setTranslationVisible] = useState(false);
  const [translationViewMode, setTranslationViewMode] = useState<TranslationViewMode>("parallel");
  const [translationRunning, setTranslationRunning] = useState(false);
  const [revealedOriginals, setRevealedOriginals] = useState<Set<string>>(() => new Set());
  const translationStopRef = useRef(false);
  const documentStageRef = useRef<HTMLElement>(null);
  const translationPaneRef = useRef<HTMLDivElement>(null);
  const syncLockRef = useRef<"original" | "translation" | null>(null);
  const syncReleaseTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!source) return;
    void updateSource(source.id, { lastOpenedAt: nowIso(), libraryState: source.libraryState === "INBOX" ? "LIBRARY" : source.libraryState });
    // Opening time is intentionally written only when the source changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source?.id]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target?.matches("input, textarea, [contenteditable=true]");
      if (typing) return;
      if (event.key.toLocaleLowerCase() === "h" && selection?.surface === "source") {
        event.preventDefault();
        void saveHighlight(selection.anchor, "amber");
      } else if (event.key.toLocaleLowerCase() === "n" && selection?.surface === "source") {
        event.preventDefault();
        openNoteComposer(selection.anchor);
      } else if (event.key.toLocaleLowerCase() === "a" && selection) {
        event.preventDefault();
        void askFromSelection(selection);
      } else if (event.key === "Escape") {
        setSelection(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const searchResults = useMemo(() => {
    if (!source?.textContent || searchQuery.trim().length < 2) return [];
    const query = searchQuery.trim().toLocaleLowerCase();
    return source.textContent.split(/\n{2,}/).map((content, blockIndex) => ({ content, blockIndex }))
      .filter(({ content }) => content.toLocaleLowerCase().includes(query)).slice(0, 40);
  }, [searchQuery, source?.textContent]);

  if (source === undefined) {
    return <div className="reader-boot"><LoaderCircle className="spin" size={24} /><span>正在恢复阅读现场…</span></div>;
  }
  if (source === null) {
    return (
      <div className="reader-missing">
        <FileQuestion size={34} />
        <h1>这份资料不在本设备</h1>
        <p>它可能已被删除，或属于另一个浏览器中的本地空间。</p>
        <Link className="primary-button" href="/library"><Library size={16} /> 返回资料库</Link>
      </div>
    );
  }
  const currentSource: Source = source;

  function handleDocumentMouseUp(event: MouseEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("a, input, textarea, .translation-header, .translation-progress-bar, .pdf-exploration-layer")) return;
    const nativeSelection = window.getSelection();
    const exact = nativeSelection?.toString().replace(/\s+/g, " ").trim() || "";
    if (!nativeSelection || nativeSelection.rangeCount === 0 || exact.length < 2) {
      setSelection(null);
      return;
    }
    const range = nativeSelection.getRangeAt(0);
    const startElement = (range.startContainer.nodeType === Node.ELEMENT_NODE
      ? range.startContainer
      : range.startContainer.parentElement) as HTMLElement | null;
    const translationElement = startElement?.closest<HTMLElement>("[data-translation-index]");
    const contextElement = translationElement ?? startElement?.closest<HTMLElement>("[data-page-index], [data-block-index]");
    if (!contextElement) return;
    const surface = translationElement ? "translation" : "source";
    const textContainer = translationElement?.querySelector<HTMLElement>(".translation-chunk-text") ?? contextElement;
    const context = textContainer.textContent?.replace(/\s+/g, " ").trim() || exact;
    const translationIndex = numberData(translationElement?.dataset.translationIndex);
    const translatedChunk = translationIndex === undefined ? undefined : translation?.chunks[translationIndex];
    const aiContext = translatedChunk
      ? `用户选中的中文译文：${context}\n\n对应英文原文：${translatedChunk.sourceText}`
      : context;
    const preRange = range.cloneRange();
    preRange.selectNodeContents(textContainer);
    preRange.setEnd(range.startContainer, range.startOffset);
    const startOffset = preRange.toString().replace(/\s+/g, " ").length;
    const bounds = range.getBoundingClientRect();
    const pageBounds = contextElement.getBoundingClientRect();
    const pdfRects = currentSource.type === "PDF"
      ? normalizeClientRects(range.getClientRects(), pageBounds)
      : undefined;
    const anchor = createAnchor({
      sourceId: currentSource.id,
      exact,
      context,
      pageIndex: numberData(contextElement.dataset.translationPage ?? contextElement.dataset.pageIndex),
      blockIndex: numberData(contextElement.dataset.translationBlock ?? contextElement.dataset.blockIndex),
      startOffset,
      endOffset: startOffset + exact.length,
      pdfRects,
    });
    setSelection({
      anchor,
      context,
      aiContext,
      surface,
      rect: {
        left: Math.min(window.innerWidth - 310, Math.max(12, bounds.left + bounds.width / 2 - 145)),
        top: Math.max(12, bounds.top - 52),
      },
    });
  }

  async function saveHighlight(anchor: Anchor, color: AnnotationColor) {
    const timestamp = nowIso();
    const annotation: Annotation = {
      id: createId(),
      workspaceId: DEFAULT_WORKSPACE_ID,
      sourceId: currentSource.id,
      anchorId: anchor.id,
      type: "HIGHLIGHT",
      color,
      bodyMarkdown: "",
      tags: [],
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await putAnnotation(anchor, annotation);
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  }

  function openNoteComposer(anchor: Anchor) {
    setNoteAnchor(anchor);
    setNoteDraft("");
    setRightTab("notes");
    setRightOpen(true);
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  }

  async function saveNote(event: FormEvent) {
    event.preventDefault();
    if (!noteAnchor || !noteDraft.trim()) return;
    const timestamp = nowIso();
    await putAnnotation(noteAnchor, {
      id: createId(),
      workspaceId: DEFAULT_WORKSPACE_ID,
      sourceId: currentSource.id,
      anchorId: noteAnchor.id,
      type: "NOTE",
      color: "mint",
      bodyMarkdown: noteDraft.trim(),
      tags: [],
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    setNoteAnchor(null);
    setNoteDraft("");
  }

  async function editAnnotation(annotationId: string, bodyMarkdown: string) {
    if (!bodyMarkdown.trim()) return;
    await updateAnnotation(annotationId, { bodyMarkdown: bodyMarkdown.trim() });
  }

  async function removeAnnotation(annotationId: string) {
    await deleteAnnotation(annotationId);
  }

  async function saveBookmark() {
    const stage = document.querySelector<HTMLElement>(".reader-document-stage");
    const candidates = Array.from(stage?.querySelectorAll<HTMLElement>("[data-page-index], [data-block-index]") || []);
    const target = candidates.find((element) => element.getBoundingClientRect().bottom > 72) || candidates[0];
    const context = target?.textContent?.replace(/\s+/g, " ").trim() || currentSource.title;
    const excerpt = clampText(context, 180);
    const anchor = createAnchor({
      sourceId: currentSource.id,
      exact: excerpt,
      context,
      pageIndex: numberData(target?.dataset.pageIndex),
      blockIndex: numberData(target?.dataset.blockIndex),
      startOffset: 0,
      endOffset: excerpt.length,
    });
    const timestamp = nowIso();
    await putAnnotation(anchor, {
      id: createId(),
      workspaceId: DEFAULT_WORKSPACE_ID,
      sourceId: currentSource.id,
      anchorId: anchor.id,
      type: "BOOKMARK",
      color: "blue",
      bodyMarkdown: "",
      tags: [],
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    setRightTab("notes");
    setRightOpen(true);
  }

  async function askFromSelection(activeSelection: ActiveSelection) {
    setSelection(null);
    window.getSelection()?.removeAllRanges();
    const passage: Passage = {
      id: `${currentSource.id}:selection:${activeSelection.anchor.id}`,
      sourceId: currentSource.id,
      sourceTitle: currentSource.title,
      content: selectionEvidenceContext(activeSelection.anchor.quote.exact, activeSelection.aiContext),
      pageIndex: activeSelection.anchor.pageIndex,
      blockIndex: activeSelection.anchor.blockIndex,
    };
    await askAi("请结合当前语境解释这段文字，并指出它在上下文中的作用。", "SELECTION_EXPLAIN", [passage], activeSelection.anchor, { branchType: "ROOT" });
  }

  async function handleQuestionSubmit(event: FormEvent) {
    event.preventDefault();
    const query = aiQuery.trim();
    if (!query) return;
    const passages = retrievePassages(createPassages(currentSource), query, webResearchEnabled ? 6 : 8);
    const parent = branchParentId ? storedResponses.find((response) => response.id === branchParentId) : undefined;
    let webSources: WebResearchResult[] = [];
    if (webResearchEnabled) {
      try {
        webSources = await researchWeb(query);
      } catch (reason) {
        setAiError(reason instanceof Error ? reason.message : "联网资料检索失败。");
        return;
      }
    }
    const externalPassages: Passage[] = webSources.slice(0, 6).map((result) => ({
      id: `web:${result.id}`,
      sourceId: `web:${result.id}`,
      sourceTitle: result.title,
      content: result.snippet,
      url: result.url,
      provider: result.provider,
    }));
    await askAi(query, "DOCUMENT_QA", [...passages, ...externalPassages], null, {
      parent,
      branchType,
      webSources,
    });
  }

  async function askSuggestion(query: string, mode: AiMode = "DOCUMENT_QA") {
    const passages = retrievePassages(createPassages(currentSource), query, 8);
    setAiQuery(query);
    await askAi(query, mode, passages, null, { branchType: "ROOT" });
  }

  async function askAi(
    query: string,
    mode: AiMode,
    passages: Passage[],
    scopedAnchor: Anchor | null,
    options: { parent?: AiResponse; branchType: AiBranchType; webSources?: WebResearchResult[] },
  ) {
    const anchorId = scopedAnchor?.id ?? options.parent?.anchorId;
    const anchoredToPdf = currentSource.type === "PDF" && Boolean(anchorId);
    setRightOpen(!anchoredToPdf);
    setRightTab("ai");
    setAiError("");
    setSavedCardId("");
    setSavedAnnotationId("");
    const featureFlags = (featureSetting?.value as FeatureFlags | undefined) || { aiEnabled: true };
    if (!featureFlags.aiEnabled) {
      setAiError("AI 阅读辅助已在设置中关闭。阅读、搜索和标注仍可使用。 ");
      return;
    }
    if (!passages.length) {
      setAiError(currentSource.processingState === "EXTRACTING" ? "文本仍在后台提取，完成前可以先选择页面文字进行解释。" : "没有可用于回答的文本证据。扫描件需要 OCR，当前 MVP 尚未启用。 ");
      return;
    }
    if (scopedAnchor) await db.anchors.put(scopedAnchor);
    setAsking(true);
    const emptyUsage = { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0, model: "" };
    const hierarchy = {
      parentResponseId: options.parent?.id,
      branchType: options.branchType,
      anchorId,
      webSources: options.webSources,
    };
    const requestedAt = nowIso();
    setDraftAnswer({ id: "", query, mode, answerMarkdown: "", claims: [], citations: [], limitations: [], usage: emptyUsage, createdAt: requestedAt, ...hierarchy });
    if (anchoredToPdf && anchorId) {
      setOpenExplorationAnchorId(anchorId);
      setSelectedExplorationResponseId("");
    }
    try {
      const result = await requestAiResponse(
        {
          sourceId: currentSource.id,
          mode,
          query,
          passages,
          parentContext: options.parent ? { query: options.parent.query, answerMarkdown: options.parent.answerMarkdown } : undefined,
        },
        {
          onStarted: (id) => setDraftAnswer((value) => value ? { ...value, id } : value),
          onDelta: (text) => setDraftAnswer((value) => value ? { ...value, answerMarkdown: value.answerMarkdown + text } : value),
          onCitation: (citation) => setDraftAnswer((value) => value ? { ...value, citations: [...value.citations, citation] } : value),
          onClaim: (claim) => setDraftAnswer((value) => value ? { ...value, claims: [...value.claims, claim] } : value),
          onWarning: (message) => setDraftAnswer((value) => value ? { ...value, limitations: [...value.limitations, message] } : value),
          onUsage: (usage) => setDraftAnswer((value) => value ? { ...value, usage } : value),
        },
      );
      const response: AiResponse = {
        id: result.id,
        sourceId: currentSource.id,
        query,
        mode,
        answerMarkdown: result.answerMarkdown,
        claims: result.claims,
        citations: result.citations,
        limitations: result.limitations,
        usage: result.usage,
        createdAt: nowIso(),
        ...hierarchy,
      };
      await db.transaction("rw", db.aiResponses, db.usageEntries, db.anchors, async () => {
        await db.aiResponses.put(response);
        await db.usageEntries.bulkAdd([
          { id: createId(), workspaceId: DEFAULT_WORKSPACE_ID, category: "LLM_INPUT", quantity: result.usage.inputTokens, unit: "TOKEN", providerCostUsd: result.usage.inputTokens / 1_000_000 * 0.14, referenceId: result.id, occurredAt: nowIso() },
          { id: createId(), workspaceId: DEFAULT_WORKSPACE_ID, category: "LLM_OUTPUT", quantity: result.usage.outputTokens, unit: "TOKEN", providerCostUsd: result.usage.outputTokens / 1_000_000 * 0.28, referenceId: result.id, occurredAt: nowIso() },
        ]);
        if (scopedAnchor) await db.anchors.put(scopedAnchor);
      });
      setDraftAnswer({ ...result, query, mode, createdAt: response.createdAt, ...hierarchy });
      setActiveResponseId(result.id);
      if (anchoredToPdf && anchorId) {
        setOpenExplorationAnchorId(anchorId);
        setSelectedExplorationResponseId(result.id);
      }
      setBranchParentId(null);
      setBranchType("ROOT");
      setAiQuery("");
    } catch (reason) {
      setAiError(reason instanceof Error ? reason.message : "AI 请求失败。 ");
    } finally {
      setAsking(false);
    }
  }

  function openFullTranslation() {
    setTranslationVisible(true);
    setRightOpen(false);
    setTranslationViewMode(currentSource.type === "PDF" ? "inline" : "parallel");
  }

  async function startFullTranslation(restart = false) {
    openFullTranslation();
    const generatedChunks = createTranslationChunks(currentSource);
    if (!generatedChunks.length) return;
    if (translation?.status === "READY" && translation.sourceContentHash === currentSource.contentHash && translation.layoutVersion === TRANSLATION_LAYOUT_VERSION && !restart) return;

    translationStopRef.current = false;
    setTranslationRunning(true);
    const timestamp = nowIso();
    const reusable = !restart && translation?.sourceContentHash === currentSource.contentHash && translation.layoutVersion === TRANSLATION_LAYOUT_VERSION
      ? new Map(translation.chunks.map((chunk) => [chunk.id, chunk.translatedText]))
      : new Map<string, string>();
    let working: DocumentTranslation = {
      id: `${currentSource.id}:zh-CN`,
      sourceId: currentSource.id,
      sourceContentHash: currentSource.contentHash,
      targetLocale: "zh-CN",
      status: "IN_PROGRESS",
      chunks: generatedChunks.map((chunk) => ({ ...chunk, translatedText: reusable.get(chunk.id) || "" })),
      completedChunks: 0,
      totalChunks: generatedChunks.length,
      inputTokens: restart ? 0 : translation?.inputTokens ?? 0,
      outputTokens: restart ? 0 : translation?.outputTokens ?? 0,
      estimatedCostUsd: restart ? 0 : translation?.estimatedCostUsd ?? 0,
      model: restart ? "" : translation?.model ?? "",
      createdAt: restart ? timestamp : translation?.createdAt ?? timestamp,
      updatedAt: timestamp,
      layoutVersion: TRANSLATION_LAYOUT_VERSION,
    };
    working.completedChunks = working.chunks.filter((chunk) => chunk.translatedText).length;
    await db.translations.put(working);

    try {
      while (!translationStopRef.current) {
        const pending = working.chunks.filter((chunk) => !chunk.translatedText).slice(0, 4);
        if (!pending.length) break;
        const result = await requestTranslationBatch({
          sourceId: currentSource.id,
          targetLocale: "zh-CN",
          chunks: pending.map((chunk) => ({ id: chunk.id, text: chunk.sourceText })),
        });
        const translated = new Map(result.translations.map((item) => [item.id, item.text]));
        const completedAt = nowIso();
        working = {
          ...working,
          chunks: working.chunks.map((chunk) => translated.has(chunk.id)
            ? { ...chunk, translatedText: translated.get(chunk.id)! }
            : chunk),
          completedChunks: working.completedChunks + pending.length,
          inputTokens: working.inputTokens + result.usage.inputTokens,
          outputTokens: working.outputTokens + result.usage.outputTokens,
          estimatedCostUsd: working.estimatedCostUsd + result.usage.estimatedCostUsd,
          model: result.usage.model,
          updatedAt: completedAt,
        };
        await db.transaction("rw", db.translations, db.usageEntries, async () => {
          await db.translations.put(working);
          await db.usageEntries.bulkAdd([
            { id: createId(), workspaceId: DEFAULT_WORKSPACE_ID, category: "LLM_INPUT", quantity: result.usage.inputTokens, unit: "TOKEN", providerCostUsd: result.usage.inputTokens / 1_000_000 * 0.14, referenceId: `${working.id}:${working.completedChunks}`, occurredAt: completedAt },
            { id: createId(), workspaceId: DEFAULT_WORKSPACE_ID, category: "LLM_OUTPUT", quantity: result.usage.outputTokens, unit: "TOKEN", providerCostUsd: result.usage.outputTokens / 1_000_000 * 0.28, referenceId: `${working.id}:${working.completedChunks}`, occurredAt: completedAt },
          ]);
        });
      }
      working = {
        ...working,
        status: working.completedChunks === working.totalChunks ? "READY" : "PAUSED",
        error: undefined,
        updatedAt: nowIso(),
      };
      await db.translations.put(working);
    } catch (reason) {
      await db.translations.put({
        ...working,
        status: "FAILED",
        error: reason instanceof Error ? reason.message : "全文翻译中断，可以从已完成段落继续。",
        updatedAt: nowIso(),
      });
    } finally {
      setTranslationRunning(false);
    }
  }

  function pauseFullTranslation() {
    translationStopRef.current = true;
  }

  function toggleOriginal(chunkId: string) {
    setRevealedOriginals((current) => {
      const next = new Set(current);
      if (next.has(chunkId)) next.delete(chunkId);
      else next.add(chunkId);
      return next;
    });
  }

  function syncFromOriginal() {
    if (!translationVisible || translationViewMode !== "parallel" || syncLockRef.current === "translation") return;
    const stage = documentStageRef.current;
    const pane = translationPaneRef.current;
    if (!stage || !pane) return;
    const selector = currentSource.type === "PDF" ? "[data-page-index]" : "[data-block-index]";
    const current = closestToTop(stage, selector);
    if (!current) return;
    const index = currentSource.type === "PDF" ? current.dataset.pageIndex : current.dataset.blockIndex;
    const attribute = currentSource.type === "PDF" ? "data-translation-page" : "data-translation-block";
    const target = pane.querySelector<HTMLElement>(`[${attribute}='${index}']`);
    if (target) syncScroll("original", pane, target.offsetTop - 70);
  }

  function syncFromTranslation() {
    if (!translationVisible || translationViewMode !== "parallel" || syncLockRef.current === "original") return;
    const stage = documentStageRef.current;
    const pane = translationPaneRef.current;
    if (!stage || !pane) return;
    const current = closestToTop(pane, "[data-translation-index]");
    if (!current) return;
    const index = currentSource.type === "PDF" ? current.dataset.translationPage : current.dataset.translationBlock;
    const target = document.getElementById(currentSource.type === "PDF" ? `pdf-page-${index}` : `web-block-${index}`);
    if (target) syncScroll("translation", stage, target.offsetTop - 24);
  }

  function syncScroll(owner: "original" | "translation", container: HTMLElement, top: number) {
    syncLockRef.current = owner;
    container.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    if (syncReleaseTimerRef.current !== null) window.clearTimeout(syncReleaseTimerRef.current);
    syncReleaseTimerRef.current = window.setTimeout(() => { syncLockRef.current = null; }, 240);
  }

  async function saveAnswerAsCard() {
    if (!activeResponse?.answerMarkdown) return;
    let sourceAnchor = selection?.anchor || null;
    if (!sourceAnchor) {
      const firstCitation = activeResponse.citations[0];
      if (!firstCitation) {
        setAiError("这条回答没有有效引用，不能保存为证据卡片。 ");
        return;
      }
      sourceAnchor = createAnchor({
        sourceId: currentSource.id,
        exact: firstCitation.quote,
        context: firstCitation.quote,
        pageIndex: firstCitation.pageIndex,
        blockIndex: firstCitation.blockIndex,
        startOffset: 0,
        endOffset: firstCitation.quote.length,
      });
    }
    await db.anchors.put(sourceAnchor);
    const timestamp = nowIso();
    const card: KnowledgeCard = {
      id: createId(),
      workspaceId: DEFAULT_WORKSPACE_ID,
      sourceId: currentSource.id,
      sourceTitle: currentSource.title,
      sourceAnchorId: sourceAnchor.id,
      title: clampText(activeResponse.query, 64),
      excerpt: sourceAnchor.quote.exact,
      userNoteMarkdown: "",
      aiExplanationMarkdown: activeResponse.answerMarkdown,
      tags: [],
      status: "ACTIVE",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await putCard(card);
    setSavedCardId(card.id);
  }

  function beginBranch(type: AiBranchType) {
    if (!activeResponse?.id) return;
    setBranchType(type);
    setBranchParentId(type === "DEEPER" ? activeResponse.id : activeResponse.parentResponseId ?? null);
    setAiQuery(type === "DEEPER" ? "请沿这个节点继续深入，解释关键机制和推理链。" : type === "DIVERGENT" ? "从另一个角度分析这个问题，并指出与当前节点的差异。" : activeResponse.query);
  }

  async function distillResponse(response: DraftAnswer | AiResponse) {
    if (!response.anchorId || !response.answerMarkdown) return;
    const anchor = anchors.find((item) => item.id === response.anchorId) ?? await db.anchors.get(response.anchorId);
    if (!anchor) return;
    const timestamp = nowIso();
    const annotationId = createId();
    await putAnnotation(anchor, {
      id: annotationId,
      workspaceId: DEFAULT_WORKSPACE_ID,
      sourceId: currentSource.id,
      anchorId: anchor.id,
      type: "NOTE",
      color: "mint",
      bodyMarkdown: distillAnswerToAnnotation(response.answerMarkdown, response.webSources),
      tags: ["AI提炼"],
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    setSavedAnnotationId(annotationId);
  }

  async function askPdfExplorationBranch(parent: AiResponse, type: AiBranchType, query: string, useWebResearch: boolean) {
    setAiError("");
    const localPassages = retrievePassages(createPassages(currentSource), query, useWebResearch ? 6 : 8);
    let webSources: WebResearchResult[] = [];
    if (useWebResearch) {
      try {
        webSources = await researchWeb(query);
      } catch (reason) {
        setAiError(reason instanceof Error ? reason.message : "联网资料检索失败。");
        return;
      }
    }
    const externalPassages: Passage[] = webSources.slice(0, 6).map((result) => ({
      id: `web:${result.id}`,
      sourceId: `web:${result.id}`,
      sourceTitle: result.title,
      content: result.snippet,
      url: result.url,
      provider: result.provider,
    }));
    await askAi(query, "DOCUMENT_QA", [...localPassages, ...externalPassages], null, {
      parent,
      branchType: type,
      webSources,
    });
  }

  function navigateToLocation(location: { pageIndex?: number; blockIndex?: number }) {
    const id = location.pageIndex !== undefined ? `pdf-page-${location.pageIndex}` : `web-block-${location.blockIndex ?? 0}`;
    const target = document.getElementById(id);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.add("citation-target");
    window.setTimeout(() => target.classList.remove("citation-target"), 1_800);
  }

  const effectiveLeftOpen = leftOpen && !focusMode;
  const effectiveRightOpen = rightOpen && !focusMode;
  const selectedStoredResponse = storedResponses.find((response) => response.id === activeResponseId) ?? storedResponses[0];
  const activeResponse = draftAnswer || (selectedStoredResponse ? fromStored(selectedStoredResponse) : null);
  const inlineDraftResponse: AiResponse | null = draftAnswer?.anchorId ? {
    ...draftAnswer,
    id: draftAnswer.id || `draft:${draftAnswer.anchorId}`,
    sourceId: currentSource.id,
  } : null;
  const pdfExplorationResponses = inlineDraftResponse
    ? [...storedResponses.filter((response) => response.id !== inlineDraftResponse.id), inlineDraftResponse]
    : storedResponses;
  const rightPanelResponses = currentSource.type === "PDF" ? storedResponses.filter((response) => !response.anchorId) : storedResponses;
  const rightPanelAnswer = currentSource.type === "PDF" && activeResponse?.anchorId ? null : activeResponse;

  return (
    <div className={`reader-shell ${effectiveLeftOpen ? "left-open" : ""} ${effectiveRightOpen ? "right-open" : ""} ${translationVisible ? "translation-visible" : ""}`}>
      <header className="reader-toolbar">
        <div className="reader-toolbar-left">
          <Link href="/library" className="icon-button" aria-label="返回资料库"><ArrowLeft size={18} /></Link>
          <button className="icon-button desktop-reader-control" onClick={() => setLeftOpen((value) => !value)} aria-label={leftOpen ? "收起左栏" : "展开左栏"}>
            {leftOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
          </button>
          <div className="reader-title-block">
            <strong>{source.title}</strong>
            <span>{source.type === "PDF" ? `${source.pageCount || "?"} 页 PDF` : source.author || "网页文章"}</span>
          </div>
        </div>
        <div className="reader-toolbar-center">
          <button className="icon-button" onClick={() => setZoom((value) => Math.max(.55, value - .1))} aria-label="缩小"><Minus size={16} /></button>
          <span>{Math.round(zoom * 100)}%</span>
          <button className="icon-button" onClick={() => setZoom((value) => Math.min(1.6, value + .1))} aria-label="放大"><Plus size={16} /></button>
          <span className="toolbar-divider" />
          <button className={`icon-button ${focusMode ? "active" : ""}`} onClick={() => setFocusMode((value) => !value)} aria-label="专注模式"><Focus size={17} /></button>
        </div>
        <div className="reader-toolbar-right">
          <button
            className={`icon-button ${translationVisible ? "active" : ""}`}
            onClick={() => translationVisible ? setTranslationVisible(false) : openFullTranslation()}
            aria-label={translationVisible ? "关闭全文翻译" : "打开全文翻译"}
            title="全文翻译"
          ><Languages size={17} /></button>
          <button className="icon-button" onClick={() => void saveBookmark()} aria-label="为当前位置添加书签" title="添加书签"><Bookmark size={17} /></button>
          <span className={`processing-status ${source.processingState.toLocaleLowerCase()}`}>
            {source.processingState === "READY" ? <Check size={13} /> : source.processingState === "FAILED" ? <CircleAlert size={13} /> : <LoaderCircle className="spin" size={13} />}
            {processingCopy(source.processingState)}
          </span>
          <button className="icon-button" onClick={() => setRightOpen((value) => !value)} aria-label={rightOpen ? "收起右栏" : "展开右栏"}>
            {rightOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
          </button>
        </div>
      </header>

      {effectiveLeftOpen && (
        <aside className="reader-left-panel">
          <div className="reader-panel-tabs two">
            <button className={leftTab === "structure" ? "active" : ""} onClick={() => setLeftTab("structure")}><AlignLeft size={15} /> 结构</button>
            <button className={leftTab === "search" ? "active" : ""} onClick={() => setLeftTab("search")}><Search size={15} /> 搜索</button>
          </div>
          {leftTab === "structure" ? (
            <StructurePanel source={source} onNavigate={navigateToLocation} />
          ) : (
            <div className="reader-search-panel">
              <label className="reader-search-input"><Search size={15} /><input autoFocus value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="搜索当前文档" /></label>
              {searchQuery.length > 0 && searchQuery.length < 2 && <p className="panel-hint">再输入一个字符开始搜索。</p>}
              {searchResults.map((result) => (
                <button key={result.blockIndex} className="search-hit" onClick={() => navigateToLocation(source.type === "PDF" ? { pageIndex: result.blockIndex } : { blockIndex: result.blockIndex })}>
                  <span>{source.type === "PDF" ? `第 ${result.blockIndex + 1} 页` : `段落 ${result.blockIndex + 1}`}</span>
                  <p>{snippetAround(result.content, searchQuery)}</p>
                </button>
              ))}
              {searchQuery.length >= 2 && !searchResults.length && <p className="panel-empty">没有找到“{searchQuery}”</p>}
            </div>
          )}
        </aside>
      )}

      <div className={`reader-reading-area ${translationVisible ? `show-translation ${translationViewMode}` : ""}`}>
        <main ref={documentStageRef} className="reader-document-stage" onMouseUp={handleDocumentMouseUp} onScroll={syncFromOriginal}>
          {source.type === "PDF" ? (
            sourceFile === undefined
              ? <div className="document-loading"><LoaderCircle className="spin" size={22} /><span>正在读取本地原件…</span></div>
              : <PdfDocument
                  source={source}
                  blob={sourceFile?.blob}
                  zoom={zoom}
                  annotations={annotations}
                  anchors={anchors}
                  translationChunks={translationVisible && translationViewMode === "inline" ? translation?.chunks ?? EMPTY_TRANSLATION_CHUNKS : EMPTY_TRANSLATION_CHUNKS}
                  revealedOriginals={revealedOriginals}
                  onToggleOriginal={toggleOriginal}
                  aiResponses={pdfExplorationResponses}
                  openExplorationAnchorId={openExplorationAnchorId}
                  selectedExplorationResponseId={selectedExplorationResponseId}
                  explorationAsking={asking}
                  explorationError={aiError}
                  savedExplorationAnnotationId={savedAnnotationId}
                  onOpenExplorationAnchor={setOpenExplorationAnchorId}
                  onSelectExplorationResponse={(id) => { setDraftAnswer(null); setActiveResponseId(id); setSelectedExplorationResponseId(id); }}
                  onAskExplorationBranch={(parent, type, query, useWebResearch) => void askPdfExplorationBranch(parent, type, query, useWebResearch)}
                  onDistillExploration={(response) => void distillResponse(response)}
                />
          ) : (
            <div style={{ fontSize: `${zoom}em` }}><WebDocument source={source} annotations={annotations} anchors={anchors} /></div>
          )}
        </main>
        {translationVisible && source.type === "PDF" && translationViewMode === "inline" && (
          <InlineTranslationControls
            source={currentSource}
            translation={translation ?? null}
            running={translationRunning}
            revealedCount={revealedOriginals.size}
            onModeChange={setTranslationViewMode}
            onStart={(restart) => void startFullTranslation(restart)}
            onPause={pauseFullTranslation}
            onRestoreTranslations={() => setRevealedOriginals(new Set())}
            onClose={() => setTranslationVisible(false)}
          />
        )}
        {translationVisible && translationViewMode !== "inline" && (
          <TranslationPane
            source={currentSource}
            translation={translation ?? null}
            running={translationRunning}
            mode={translationViewMode}
            revealedOriginals={revealedOriginals}
            paneRef={translationPaneRef}
            onScroll={syncFromTranslation}
            onSelection={handleDocumentMouseUp}
            onModeChange={setTranslationViewMode}
            onStart={(restart) => void startFullTranslation(restart)}
            onPause={pauseFullTranslation}
            onToggleOriginal={toggleOriginal}
            onClose={() => setTranslationVisible(false)}
          />
        )}
      </div>

      {effectiveRightOpen && (
        <aside className="reader-right-panel">
          <div className="reader-panel-tabs three">
            <button className={rightTab === "ai" ? "active" : ""} onClick={() => setRightTab("ai")}><Sparkles size={15} /> AI</button>
            <button className={rightTab === "notes" ? "active" : ""} onClick={() => setRightTab("notes")}><NotebookPen size={15} /> 笔记 <small>{annotations.length}</small></button>
            <button className={rightTab === "info" ? "active" : ""} onClick={() => setRightTab("info")}><Info size={15} /> 信息</button>
          </div>
          {rightTab === "ai" && (
            <AiPanel
              source={source}
              answer={rightPanelAnswer}
              asking={asking}
              error={aiError}
              query={aiQuery}
              onQueryChange={setAiQuery}
              onSubmit={handleQuestionSubmit}
              onSuggestion={(query, mode) => void askSuggestion(query, mode)}
              onNavigate={navigateToLocation}
              onSaveCard={() => void saveAnswerAsCard()}
              savedCardId={savedCardId}
              responses={rightPanelResponses}
              activeResponseId={rightPanelAnswer?.id || activeResponseId}
              onSelectResponse={(id) => { setDraftAnswer(null); setActiveResponseId(id); }}
              onBranch={beginBranch}
              branchType={branchType}
              webResearchEnabled={webResearchEnabled}
              onWebResearchChange={setWebResearchEnabled}
              onDistill={() => { if (activeResponse) void distillResponse(activeResponse); }}
              savedAnnotationId={savedAnnotationId}
            />
          )}
          {rightTab === "notes" && (
            <NotesPanel
              annotations={annotations}
              anchors={anchors}
              cards={cards}
              noteAnchor={noteAnchor}
              noteDraft={noteDraft}
              onNoteChange={setNoteDraft}
              onSaveNote={saveNote}
              onCancelNote={() => setNoteAnchor(null)}
              onNavigate={navigateToLocation}
              onEditAnnotation={editAnnotation}
              onDeleteAnnotation={removeAnnotation}
            />
          )}
          {rightTab === "info" && <InfoPanel source={source} annotationCount={annotations.length} cardCount={cards.length} />}
        </aside>
      )}

      {selection && (
        <div className="selection-toolbar" style={{ left: selection.rect.left, top: selection.rect.top }}>
          <button onClick={() => void askFromSelection(selection)}><Sparkles size={14} /> 解释</button>
          {selection.surface === "source" && <button onClick={() => void saveHighlight(selection.anchor, "amber")}><Highlighter size={14} /> 高亮</button>}
          {selection.surface === "source" && <button onClick={() => openNoteComposer(selection.anchor)}><StickyNote size={14} /> 笔记</button>}
          <span />
          <button className="selection-close" aria-label="关闭" onClick={() => setSelection(null)}><X size={14} /></button>
        </div>
      )}
    </div>
  );
}

function TranslationPane({
  source,
  translation,
  running,
  mode,
  revealedOriginals,
  paneRef,
  onScroll,
  onSelection,
  onModeChange,
  onStart,
  onPause,
  onToggleOriginal,
  onClose,
}: {
  source: Source;
  translation: DocumentTranslation | null;
  running: boolean;
  mode: TranslationViewMode;
  revealedOriginals: Set<string>;
  paneRef: RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  onSelection: (event: MouseEvent<HTMLElement>) => void;
  onModeChange: (mode: TranslationViewMode) => void;
  onStart: (restart: boolean) => void;
  onPause: () => void;
  onToggleOriginal: (chunkId: string) => void;
  onClose: () => void;
}) {
  const current = translation?.sourceContentHash === source.contentHash ? translation : null;
  const progress = current?.totalChunks ? Math.round(current.completedChunks / current.totalChunks * 100) : 0;
  const canTranslate = Boolean(source.textContent?.trim() && (source.type !== "PDF" || source.pdfTextBlocks?.length));

  return (
    <section className="translation-pane" aria-label="全文译文" onMouseUp={onSelection}>
      <header className="translation-header">
        <div>
          <span><Languages size={16} /> 全文翻译</span>
          <small>英文 → 简体中文 · 本地缓存</small>
        </div>
        <div className="translation-view-switch" aria-label="译文显示方式">
          {source.type === "PDF" && <button onClick={() => onModeChange("inline")} title="把译文放到 PDF 原文位置"><Languages size={14} /> 原位译文</button>}
          <button className={mode === "parallel" ? "active" : ""} onClick={() => onModeChange("parallel")} title="原文和译文同步滚动"><Columns2 size={14} /> 双栏对照</button>
          <button className={mode === "translation" ? "active" : ""} onClick={() => onModeChange("translation")} title="只读译文，点击段落切换原文"><BookOpen size={14} /> 译文阅读</button>
        </div>
        <button className="icon-button" aria-label="关闭全文翻译" onClick={onClose}><X size={17} /></button>
      </header>

      {!current ? (
        <div className="translation-empty">
          <span><Languages size={28} /></span>
          <h2>{canTranslate ? "生成整篇中文译文" : "正在等待文档文本"}</h2>
          <p>{canTranslate
            ? "译文会分批生成并保存在当前设备。完成一批就能立即开始阅读，中断后可继续。"
            : source.processingState === "EXTRACTING" ? "PDF 文本提取完成后即可开始全文翻译，原文阅读不受影响。" : "这份文档没有可翻译文本；扫描 PDF 需要先完成 OCR。"}</p>
          <button className="primary-button" disabled={!canTranslate || running} onClick={() => onStart(false)}><Languages size={16} /> 全文翻译为中文</button>
        </div>
      ) : (
        <>
          <div className="translation-progress-bar">
            <div><span>{current.status === "READY" ? "翻译完成" : current.status === "FAILED" ? "翻译中断" : current.status === "PAUSED" ? "已暂停" : "正在翻译"}</span><strong>{current.completedChunks}/{current.totalChunks} 段 · {progress}%</strong></div>
            <span><i style={{ width: `${progress}%` }} /></span>
            <div className="translation-progress-actions">
              {running
                ? <button className="ghost-button" onClick={onPause}><Pause size={14} /> 完成本批后暂停</button>
                : current.status !== "READY"
                  ? <button className="primary-button compact" onClick={() => onStart(false)}><RefreshCw size={14} /> 继续翻译</button>
                  : <button className="ghost-button" onClick={() => { if (window.confirm("重新翻译会覆盖当前缓存并重新消耗 Token，继续吗？")) onStart(true); }}><RefreshCw size={14} /> 重新翻译</button>}
              {current.estimatedCostUsd > 0 && <small>本次约 ${current.estimatedCostUsd.toFixed(4)}</small>}
            </div>
            {current.error && <p className="translation-error">{current.error}</p>}
          </div>
          <div ref={paneRef} className="translation-scroll" onScroll={onScroll}>
            {current.chunks.map((chunk) => {
              const showingOriginal = mode === "translation" && revealedOriginals.has(chunk.id);
              const location = chunk.pageIndex !== undefined ? `第 ${chunk.pageIndex + 1} 页` : `段落 ${Number(chunk.blockIndex ?? chunk.index) + 1}`;
              return (
                <article
                  key={chunk.id}
                  className={`translation-chunk ${showingOriginal ? "showing-original" : ""} ${chunk.translatedText ? "" : "pending"}`}
                  data-translation-index={chunk.index}
                  data-translation-page={chunk.pageIndex}
                  data-translation-block={chunk.blockIndex}
                  role={mode === "translation" && chunk.translatedText ? "button" : undefined}
                  tabIndex={mode === "translation" && chunk.translatedText ? 0 : undefined}
                  onClick={() => {
                    if (mode === "translation" && chunk.translatedText && !window.getSelection()?.toString().trim()) onToggleOriginal(chunk.id);
                  }}
                  onKeyDown={(event) => {
                    if (mode === "translation" && chunk.translatedText && (event.key === "Enter" || event.key === " ")) {
                      event.preventDefault();
                      onToggleOriginal(chunk.id);
                    }
                  }}
                  aria-label={mode === "translation" ? `${showingOriginal ? "显示译文" : "显示原文"}：${location}` : location}
                >
                  <span className="translation-chunk-meta"><strong>{location}</strong><small>{mode === "translation" && chunk.translatedText ? (showingOriginal ? "原文 · 点击恢复译文" : "译文 · 点击查看原文") : "中文译文"}</small></span>
                  <p className="translation-chunk-text">{showingOriginal ? chunk.sourceText : chunk.translatedText || "等待当前批次翻译…"}</p>
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

function InlineTranslationControls({ source, translation, running, revealedCount, onModeChange, onStart, onPause, onRestoreTranslations, onClose }: {
  source: Source;
  translation: DocumentTranslation | null;
  running: boolean;
  revealedCount: number;
  onModeChange: (mode: TranslationViewMode) => void;
  onStart: (restart: boolean) => void;
  onPause: () => void;
  onRestoreTranslations: () => void;
  onClose: () => void;
}) {
  const current = translation?.sourceContentHash === source.contentHash && translation.layoutVersion === TRANSLATION_LAYOUT_VERSION ? translation : null;
  const progress = current?.totalChunks ? Math.round(current.completedChunks / current.totalChunks * 100) : 0;
  return (
    <section className="translation-inline-controls" aria-label="PDF 原位翻译控制">
      <span><Languages size={14} /><strong>原位译文</strong><small>{current ? `${current.completedChunks}/${current.totalChunks} · ${progress}%` : "尚未生成"}</small></span>
      <div className="translation-view-switch">
        <button className="active"><Languages size={13} /> 原位</button>
        <button onClick={() => onModeChange("parallel")}><Columns2 size={13} /> 双栏</button>
        <button onClick={() => onModeChange("translation")}><BookOpen size={13} /> 译文</button>
      </div>
      {!current ? <button className="primary-button compact" disabled={!source.textContent?.trim() || !source.pdfTextBlocks?.length || running} onClick={() => onStart(false)}>开始翻译</button>
        : running ? <button className="ghost-button" onClick={onPause}><Pause size={13} /> 暂停</button>
          : current.status !== "READY" ? <button className="primary-button compact" onClick={() => onStart(false)}><RefreshCw size={13} /> 继续</button>
            : <button className="ghost-button" title="重新翻译" onClick={() => { if (window.confirm("重新翻译会覆盖当前缓存并再次消耗 Token，继续吗？")) onStart(true); }}><RefreshCw size={13} /></button>}
      {revealedCount > 0 && <button className="ghost-button" onClick={onRestoreTranslations}>恢复译文 ({revealedCount})</button>}
      <button className="icon-button" aria-label="关闭原位翻译" onClick={onClose}><X size={15} /></button>
    </section>
  );
}

function closestToTop(container: HTMLElement, selector: string): HTMLElement | null {
  const top = container.getBoundingClientRect().top + 72;
  const candidates = Array.from(container.querySelectorAll<HTMLElement>(selector));
  return candidates.reduce<HTMLElement | null>((closest, candidate) => {
    if (!closest) return candidate;
    return Math.abs(candidate.getBoundingClientRect().top - top) < Math.abs(closest.getBoundingClientRect().top - top)
      ? candidate
      : closest;
  }, null);
}

function StructurePanel({ source, onNavigate }: { source: Source; onNavigate: (value: { pageIndex?: number; blockIndex?: number }) => void }) {
  if (source.type === "PDF") {
    return (
      <div className="structure-list pages">
        <span className="panel-section-label">页面</span>
        {Array.from({ length: source.pageCount || 0 }, (_, index) => (
          <button key={index} onClick={() => onNavigate({ pageIndex: index })}><span>{index + 1}</span><small>第 {index + 1} 页</small></button>
        ))}
        {!source.pageCount && <p className="panel-hint">打开后将读取页面结构。</p>}
      </div>
    );
  }
  const paragraphs = (source.textContent || "").split(/\n{2,}/).filter(Boolean);
  return (
    <div className="structure-list">
      <span className="panel-section-label">阅读地图</span>
      <button className="toc-title" onClick={() => onNavigate({ blockIndex: 0 })}><BookOpen size={15} /><strong>{source.title}</strong></button>
      {paragraphs.map((paragraph, index) => (
        <button key={index} onClick={() => onNavigate({ blockIndex: index })}><span>{String(index + 1).padStart(2, "0")}</span><small>{clampText(paragraph, 44)}</small></button>
      ))}
    </div>
  );
}

function AiPanel({
  source,
  answer,
  asking,
  error,
  query,
  onQueryChange,
  onSubmit,
  onSuggestion,
  onNavigate,
  onSaveCard,
  savedCardId,
  responses,
  activeResponseId,
  onSelectResponse,
  onBranch,
  branchType,
  webResearchEnabled,
  onWebResearchChange,
  onDistill,
  savedAnnotationId,
}: {
  source: Source;
  answer: DraftAnswer | null;
  asking: boolean;
  error: string;
  query: string;
  onQueryChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onSuggestion: (query: string, mode?: AiMode) => void;
  onNavigate: (location: { pageIndex?: number; blockIndex?: number }) => void;
  onSaveCard: () => void;
  savedCardId: string;
  responses: AiResponse[];
  activeResponseId: string;
  onSelectResponse: (id: string) => void;
  onBranch: (type: AiBranchType) => void;
  branchType: AiBranchType;
  webResearchEnabled: boolean;
  onWebResearchChange: (enabled: boolean) => void;
  onDistill: () => void;
  savedAnnotationId: string;
}) {
  return (
    <div className="ai-panel-content">
      <div className="ai-scroll-region">
        {!!responses.length && (
          <nav className="ai-branch-map" aria-label="解释分支">
            <header><GitFork size={13} /><strong>探索树</strong><small>{responses.length} 个节点</small></header>
            {responses.slice().reverse().map((response) => (
              <button
                key={response.id}
                className={response.id === activeResponseId ? "active" : ""}
                style={{ paddingLeft: 9 + responseDepth(response, responses) * 13 }}
                onClick={() => onSelectResponse(response.id)}
                title={response.query}
              >
                <span>{branchLabel(response.branchType)}</span>
                <strong>{clampText(response.query, 42)}</strong>
              </button>
            ))}
          </nav>
        )}
        {!answer && !asking ? (
          <div className="ai-welcome">
            <span className="ai-orb"><Sparkles size={22} /></span>
            <h2>从这份资料出发</h2>
            <p>我只使用当前文档中可定位的文本作答。证据不足时会明确说明。</p>
            <div className="ai-suggestions">
              <button onClick={() => onSuggestion("给我一份简洁的阅读地图：核心问题、主要论点、结论和局限。", "SECTION_OVERVIEW")}><Maximize2 size={15} /><span>生成阅读地图</span><ChevronRight size={14} /></button>
              <button onClick={() => onSuggestion("这份文档最重要的三个观点是什么？每个观点给出原文依据。 ")}><Quote size={15} /><span>提取核心观点</span><ChevronRight size={14} /></button>
              <button onClick={() => onSuggestion("作者的论证有哪些局限或未解决的问题？ ")}><CircleAlert size={15} /><span>寻找局限</span><ChevronRight size={14} /></button>
            </div>
          </div>
        ) : answer ? (
          <article className="ai-answer" aria-live="polite" aria-busy={asking}>
            <div className="ai-query-label"><MessageSquareText size={14} /><span>{answer.query}</span></div>
            <div className="answer-origin"><Bot size={14} /><span>基于当前资料</span>{asking && <LoaderCircle className="spin" size={13} />}</div>
            <div className="markdown-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{answer.answerMarkdown || "正在组织回答…"}</ReactMarkdown>
            </div>
            {!!answer.claims.length && (
              <section className="claims-list">
                <h3>证据与判断边界</h3>
                {answer.claims.map((claim, index) => (
                  <div key={index} className="claim-row">
                    <span className={`claim-type ${claim.type.toLocaleLowerCase()}`}>{claimLabel(claim.type)}</span>
                    <p>{claim.text}</p>
                    <div className="claim-citations">
                      {claim.citationIds.map((citationId) => {
                        const citationIndex = answer.citations.findIndex((citation) => citation.id === citationId);
                        const citation = answer.citations[citationIndex];
                        return citation ? (citation.url
                          ? <a key={citationId} href={citation.url} target="_blank" rel="noreferrer">[{citationIndex + 1}]</a>
                          : <button key={citationId} onClick={() => onNavigate(citation)}>[{citationIndex + 1}]</button>) : null;
                      })}
                    </div>
                  </div>
                ))}
              </section>
            )}
            {!!answer.citations.length && (
              <section className="citation-list">
                <h3><Quote size={14} /> 原文依据</h3>
                {answer.citations.map((citation, index) => {
                  const content = <>
                    <span className="citation-number">{index + 1}</span>
                    <span><strong>{citation.url ? `${citation.provider || "外部资料"} · ${citation.sourceTitle}` : citation.pageIndex !== undefined ? `第 ${citation.pageIndex + 1} 页` : source.title}</strong><small>{clampText(citation.quote, 118)}</small></span>
                    {citation.url ? <ExternalLink size={14} /> : <ChevronRight size={14} />}
                  </>;
                  return citation.url
                    ? <a key={citation.id} href={citation.url} target="_blank" rel="noreferrer">{content}</a>
                    : <button key={citation.id} onClick={() => onNavigate(citation)}>{content}</button>;
                })}
              </section>
            )}
            {!!answer.limitations.length && <div className="answer-limitations"><CircleAlert size={15} /><span>{answer.limitations.join("；")}</span></div>}
            {!asking && answer.answerMarkdown && (
              <>
                <div className="ai-branch-actions">
                  <button onClick={() => onBranch("DEEPER")}><GitFork size={13} /> 深入子节点</button>
                  <button onClick={() => onBranch("DIVERGENT")}><GitFork size={13} /> 同层分叉</button>
                  <button onClick={() => onBranch("RETRY")}><RefreshCw size={13} /> 从此重答</button>
                </div>
                <div className="answer-actions">
                  <button className="secondary-button" onClick={onSaveCard} disabled={Boolean(savedCardId)}>{savedCardId ? <Check size={15} /> : <Save size={15} />}{savedCardId ? "已存为卡片" : "存为知识卡"}</button>
                  {answer.anchorId && <button className="secondary-button" onClick={onDistill} disabled={Boolean(savedAnnotationId)}>{savedAnnotationId ? <Check size={15} /> : <StickyNote size={15} />}{savedAnnotationId ? "已提炼为批注" : "提炼为批注"}</button>}
                  {answer.usage.model && <span>{answer.usage.model} · {(answer.usage.inputTokens + answer.usage.outputTokens).toLocaleString()} tokens</span>}
                </div>
              </>
            )}
          </article>
        ) : null}
        {error && <div className="ai-error" role="alert"><CircleAlert size={16} /><span>{error}</span></div>}
      </div>
      <form className="ai-composer" onSubmit={onSubmit}>
        <div className="ai-composer-options">
          <div className="ai-scope"><FileText size={12} /><span>{branchType === "ROOT" ? "当前文档" : `${branchLabel(branchType)}节点`}</span></div>
          <label className={webResearchEnabled ? "active" : ""}><Globe2 size={12} /><input type="checkbox" checked={webResearchEnabled} onChange={(event) => onWebResearchChange(event.target.checked)} /> 联网查资料</label>
        </div>
        <div className="ai-input-row">
          <textarea value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="向这份资料提问…" rows={1} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
          <button disabled={asking || !query.trim()} aria-label="发送问题">{asking ? <LoaderCircle className="spin" size={17} /> : <Send size={17} />}</button>
        </div>
        <small>{webResearchEnabled ? "将检索 Wikipedia 与 Crossref，并在引用中保留外链。" : "AI 可能出错，请点击引用核验原文。"}</small>
      </form>
    </div>
  );
}

function NotesPanel({ annotations, anchors, cards, noteAnchor, noteDraft, onNoteChange, onSaveNote, onCancelNote, onNavigate, onEditAnnotation, onDeleteAnnotation }: {
  annotations: Annotation[];
  anchors: Anchor[];
  cards: KnowledgeCard[];
  noteAnchor: Anchor | null;
  noteDraft: string;
  onNoteChange: (value: string) => void;
  onSaveNote: (event: FormEvent) => void;
  onCancelNote: () => void;
  onNavigate: (location: { pageIndex?: number; blockIndex?: number }) => void;
  onEditAnnotation: (annotationId: string, bodyMarkdown: string) => Promise<void>;
  onDeleteAnnotation: (annotationId: string) => Promise<void>;
}) {
  const anchorMap = new Map(anchors.map((anchor) => [anchor.id, anchor]));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [deletePendingId, setDeletePendingId] = useState<string | null>(null);

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editingId || !editDraft.trim()) return;
    await onEditAnnotation(editingId, editDraft);
    setEditingId(null);
    setEditDraft("");
  }

  async function confirmDelete(annotationId: string) {
    await onDeleteAnnotation(annotationId);
    if (editingId === annotationId) {
      setEditingId(null);
      setEditDraft("");
    }
    setDeletePendingId(null);
  }

  return (
    <div className="notes-panel-content">
      {noteAnchor && (
        <form className="note-composer" onSubmit={onSaveNote}>
          <span className="panel-section-label">新批注</span>
          <blockquote>{clampText(noteAnchor.quote.exact, 160)}</blockquote>
          <textarea autoFocus value={noteDraft} onChange={(event) => onNoteChange(event.target.value)} placeholder="写下你的理解、疑问或连接…" />
          <div><button type="button" className="ghost-button" onClick={onCancelNote}>取消</button><button className="primary-button" disabled={!noteDraft.trim()}><Save size={14} /> 保存</button></div>
        </form>
      )}
      <div className="panel-list-header"><span>标注与批注</span><small>{annotations.length}</small></div>
      {!annotations.length && !noteAnchor ? (
        <div className="panel-zero"><Highlighter size={23} /><p>选择原文后，可高亮或写下批注。</p><small>快捷键 H 高亮 · N 批注</small></div>
      ) : (
        <div className="annotation-list">
          {annotations.slice().reverse().map((annotation) => {
            const anchor = anchorMap.get(annotation.anchorId);
            if (!anchor) return null;
            return (
              <article className="annotation-list-item" key={annotation.id} data-annotation-id={annotation.id}>
                <button className="annotation-entry" onClick={() => onNavigate(anchor)}>
                  <span className={`annotation-stripe ${annotation.color}`} />
                  <span><small>{annotation.type === "NOTE" ? "批注" : annotation.type === "BOOKMARK" ? "书签" : "高亮"} · {formatRelativeTime(annotation.updatedAt)}</small><strong>{clampText(anchor.quote.exact, 92)}</strong>{annotation.bodyMarkdown && <p>{clampText(annotation.bodyMarkdown, 100)}</p>}</span>
                </button>
                <div className="annotation-item-actions">
                  {annotation.type === "NOTE" && (
                    <button
                      type="button"
                      aria-label="编辑批注"
                      title="编辑批注"
                      onClick={() => { setEditingId(annotation.id); setEditDraft(annotation.bodyMarkdown); setDeletePendingId(null); }}
                    >
                      <Pencil size={12} />
                    </button>
                  )}
                  <button type="button" aria-label="删除批注" title="删除批注" onClick={() => { setDeletePendingId(annotation.id); setEditingId(null); }}>
                    <Trash2 size={12} />
                  </button>
                </div>
                {editingId === annotation.id && (
                  <form className="annotation-inline-editor" onSubmit={(event) => void saveEdit(event)}>
                    <textarea aria-label="编辑批注内容" autoFocus value={editDraft} onChange={(event) => setEditDraft(event.target.value)} />
                    <div>
                      <button type="button" className="ghost-button" onClick={() => setEditingId(null)}>取消</button>
                      <button className="primary-button" disabled={!editDraft.trim()}><Save size={12} /> 保存修改</button>
                    </div>
                  </form>
                )}
                {deletePendingId === annotation.id && (
                  <div className="annotation-delete-confirm" role="alert">
                    <span>删除后将从原文中移除此标记。</span>
                    <div>
                      <button type="button" className="ghost-button" onClick={() => setDeletePendingId(null)}>取消</button>
                      <button type="button" className="danger-button" onClick={() => void confirmDelete(annotation.id)}>确认删除</button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
      {!!cards.length && <div className="panel-list-header secondary"><span>来自本文的知识卡</span><small>{cards.length}</small></div>}
      <div className="reader-card-list">
        {cards.map((card) => <Link key={card.id} href={`/cards?card=${card.id}`}><span><Bookmark size={14} /></span><div><strong>{card.title}</strong><small>{clampText(card.excerpt, 74)}</small></div></Link>)}
      </div>
    </div>
  );
}

function InfoPanel({ source, annotationCount, cardCount }: { source: Source; annotationCount: number; cardCount: number }) {
  const [tagDraft, setTagDraft] = useState("");

  async function addTag(event: FormEvent) {
    event.preventDefault();
    const tag = tagDraft.trim().replace(/^#/, "");
    if (!tag || source.tags.includes(tag)) return;
    await updateSource(source.id, { tags: [...source.tags, tag] });
    setTagDraft("");
  }

  return (
    <div className="info-panel-content">
      <section className="source-info-card">
        <span className="source-type-large"><FileText size={22} /></span>
        <h2>{source.title}</h2>
        <p>{source.author || "作者未知"}</p>
      </section>
      <dl className="source-facts">
        <div><dt>类型</dt><dd>{source.type}</dd></div>
        <div><dt>大小</dt><dd>{formatFileSize(source.byteSize)}</dd></div>
        {source.pageCount && <div><dt>页数</dt><dd>{source.pageCount}</dd></div>}
        <div><dt>加入时间</dt><dd>{new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(new Date(source.createdAt))}</dd></div>
        <div><dt>标注</dt><dd>{annotationCount}</dd></div>
        <div><dt>知识卡</dt><dd>{cardCount}</dd></div>
      </dl>
      <section className="source-tags-editor">
        <h3>标签</h3>
        <div>{source.tags.map((tag) => <button key={tag} title="移除标签" onClick={() => void updateSource(source.id, { tags: source.tags.filter((item) => item !== tag) })}>#{tag} <X size={10} /></button>)}</div>
        <form onSubmit={addTag}><input value={tagDraft} onChange={(event) => setTagDraft(event.target.value)} placeholder="输入标签后回车" /><button disabled={!tagDraft.trim()}><Plus size={13} /></button></form>
      </section>
      <section className="processing-timeline">
        <h3>本地处理状态</h3>
        {["原件已保存", "文本已提取", "可搜索与问答"].map((label, index) => {
          const complete = index === 0 || source.processingState === "READY" || (index === 1 && source.processingState === "INDEXING");
          return <div key={label} className={complete ? "complete" : ""}><span>{complete ? <Check size={12} /> : index + 1}</span><p>{label}</p></div>;
        })}
      </section>
      <p className="info-privacy"><Info size={14} /> 原件和提取文本保存在当前浏览器。只有发起 AI 请求时，检索到的少量文本片段会发送到 DeepSeek。</p>
    </div>
  );
}

function numberData(value?: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function processingCopy(state: Source["processingState"]): string {
  if (state === "UPLOADED") return "原件已保存";
  if (state === "EXTRACTING") return "正在提取文本";
  if (state === "INDEXING") return "正在建立索引";
  if (state === "FAILED") return "解析失败 · 可阅读";
  return "可问答";
}

function snippetAround(content: string, query: string): string {
  const index = content.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
  if (index < 0) return clampText(content, 110);
  return `${index > 35 ? "…" : ""}${content.slice(Math.max(0, index - 35), index + query.length + 70)}${index + query.length + 70 < content.length ? "…" : ""}`;
}

function claimLabel(type: Claim["type"]): string {
  return ({
    SOURCE_FACT: "来源事实",
    SOURCE_SUMMARY: "归纳",
    MODEL_INFERENCE: "推断",
    EXTERNAL_KNOWLEDGE: "外部补充",
    UNCERTAIN: "不确定",
  })[type];
}

function branchLabel(type?: AiBranchType): string {
  return ({ ROOT: "起点", DEEPER: "深入", DIVERGENT: "分叉", RETRY: "重答" } as const)[type ?? "ROOT"];
}

function fromStored(response: AiResponse): DraftAnswer {
  return { ...response };
}
