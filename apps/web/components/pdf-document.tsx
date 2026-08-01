"use client";

import { AlertTriangle, LoaderCircle, RotateCcw, StickyNote } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import type { PDFDocumentProxy, TextItem } from "pdfjs-dist/types/src/display/api";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import type { AiBranchType, AiResponse, Anchor, Annotation, Source, TranslationChunk } from "@reader/domain";
import { updateSource } from "@/lib/db";
import { locateAnchorRange, locateTextRange } from "@/lib/pdf-annotation-layer";
import { buildPdfTextBlocks } from "@/lib/pdf-text-layout";
import { PdfExplorationLayer } from "@/components/pdf-exploration-layer";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

interface PageAnnotation {
  annotation: Annotation;
  anchor: Anchor;
}

const EMPTY_PAGE_ANNOTATIONS: PageAnnotation[] = [];
const EMPTY_TRANSLATIONS: TranslationChunk[] = [];
const EMPTY_AI_RESPONSES: AiResponse[] = [];
const EMPTY_REVEALED_ORIGINALS = new Set<string>();

export function PdfDocument({
  source,
  blob,
  zoom,
  annotations,
  anchors,
  translationChunks = EMPTY_TRANSLATIONS,
  revealedOriginals = EMPTY_REVEALED_ORIGINALS,
  onToggleOriginal,
  aiResponses = EMPTY_AI_RESPONSES,
  openExplorationAnchorId = "",
  selectedExplorationResponseId = "",
  explorationAsking = false,
  explorationError = "",
  savedExplorationAnnotationId = "",
  onOpenExplorationAnchor,
  onSelectExplorationResponse,
  onAskExplorationBranch,
  onDistillExploration,
}: {
  source: Source;
  blob?: Blob;
  zoom: number;
  annotations: Annotation[];
  anchors: Anchor[];
  translationChunks?: TranslationChunk[];
  revealedOriginals?: Set<string>;
  onToggleOriginal?: (chunkId: string) => void;
  aiResponses?: AiResponse[];
  openExplorationAnchorId?: string;
  selectedExplorationResponseId?: string;
  explorationAsking?: boolean;
  explorationError?: string;
  savedExplorationAnnotationId?: string;
  onOpenExplorationAnchor?: (anchorId: string) => void;
  onSelectExplorationResponse?: (responseId: string) => void;
  onAskExplorationBranch?: (parent: AiResponse, type: AiBranchType, query: string, webResearch: boolean) => void;
  onDistillExploration?: (response: AiResponse) => void;
}) {
  const [pageCount, setPageCount] = useState(source.pageCount ?? 0);
  const [error, setError] = useState("");
  const extractingRef = useRef(false);
  const cancelledRef = useRef(false);
  const annotationsByPage = useMemo(() => {
    const anchorMap = new Map(anchors.map((anchor) => [anchor.id, anchor]));
    const pages = new Map<number, PageAnnotation[]>();
    for (const annotation of annotations) {
      const anchor = anchorMap.get(annotation.anchorId);
      if (annotation.deletedAt || anchor?.pageIndex === undefined || !["HIGHLIGHT", "UNDERLINE", "NOTE"].includes(annotation.type)) continue;
      const pageAnnotations = pages.get(anchor.pageIndex) ?? [];
      pageAnnotations.push({ annotation, anchor });
      pages.set(anchor.pageIndex, pageAnnotations);
    }
    return pages;
  }, [anchors, annotations]);
  const translationsByPage = useMemo(() => {
    const pages = new Map<number, TranslationChunk[]>();
    for (const chunk of translationChunks) {
      if (chunk.pageIndex === undefined || !chunk.translatedText) continue;
      const pageChunks = pages.get(chunk.pageIndex) ?? [];
      pageChunks.push(chunk);
      pages.set(chunk.pageIndex, pageChunks);
    }
    return pages;
  }, [translationChunks]);

  useEffect(() => {
    // React Strict Mode mounts, cleans up, then mounts again in development.
    // Reset the flag on every setup so the verification cycle does not cancel extraction.
    cancelledRef.current = false;
    return () => { cancelledRef.current = true; };
  }, []);

  async function handleLoad(pdf: PDFDocumentProxy) {
    setPageCount(pdf.numPages);
    setError("");
    const hasLayout = Boolean(source.pdfTextBlocks?.length);
    await updateSource(source.id, {
      pageCount: pdf.numPages,
      processingState: source.textContent && hasLayout ? "READY" : "EXTRACTING",
    });

    if (source.textContent && hasLayout || extractingRef.current) return;
    extractingRef.current = true;
    try {
      const pages: string[] = [];
      const pdfTextBlocks = [];
      for (let index = 1; index <= pdf.numPages; index += 1) {
        if (cancelledRef.current) return;
        const page = await pdf.getPage(index);
        const content = await page.getTextContent();
        const textItems = content.items.filter((item): item is TextItem => "str" in item);
        const viewport = page.getViewport({ scale: 1 });
        const blocks = buildPdfTextBlocks(textItems, index - 1, viewport.width, viewport.height);
        pdfTextBlocks.push(...blocks);
        const text = (blocks.length ? blocks.map((block) => block.text) : textItems.map((item) => item.str))
          .join(" ").replace(/\s+/g, " ").trim();
        pages.push(text);
        if (index % 10 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
      }
      await updateSource(source.id, {
        textContent: pages.join("\n\n"),
        pdfTextBlocks,
        processingState: "READY",
        summary: pages.some(Boolean) ? "PDF 文本已在本设备提取，可进行全文搜索和证据问答。" : "这份 PDF 没有可提取文本，仍可阅读；OCR 尚未启用。",
      });
    } catch {
      await updateSource(source.id, { processingState: "FAILED" });
    } finally {
      extractingRef.current = false;
    }
  }

  if (!blob) {
    return (
      <div className="reader-document-error">
        <AlertTriangle size={24} />
        <h2>找不到本地 PDF 原件</h2>
        <p>元数据仍在，但浏览器可能清除了站点文件。请重新导入同一份 PDF。</p>
      </div>
    );
  }

  return (
    <Document
      file={blob}
      onLoadSuccess={(pdf) => void handleLoad(pdf)}
      onLoadError={(reason) => {
        setError(reason.message || "PDF 无法打开");
        void updateSource(source.id, { processingState: "FAILED" });
      }}
      loading={<div className="document-loading"><LoaderCircle className="spin" size={22} /><span>正在打开 PDF…</span></div>}
      error={null}
      className="pdf-document"
    >
      {error ? (
        <div className="reader-document-error">
          <AlertTriangle size={24} />
          <h2>PDF 渲染失败</h2>
          <p>{error}</p>
          <button className="secondary-button" onClick={() => window.location.reload()}><RotateCcw size={16} /> 重试</button>
        </div>
      ) : (
        Array.from({ length: pageCount }, (_, index) => (
          <LazyPdfPage
            key={index}
            pageNumber={index + 1}
            zoom={zoom}
            annotations={annotationsByPage.get(index) ?? EMPTY_PAGE_ANNOTATIONS}
            translations={translationsByPage.get(index) ?? EMPTY_TRANSLATIONS}
            revealedOriginals={revealedOriginals}
            onToggleOriginal={onToggleOriginal}
            anchors={anchors}
            aiResponses={aiResponses}
            openExplorationAnchorId={openExplorationAnchorId}
            selectedExplorationResponseId={selectedExplorationResponseId}
            explorationAsking={explorationAsking}
            explorationError={explorationError}
            savedExplorationAnnotationId={savedExplorationAnnotationId}
            onOpenExplorationAnchor={onOpenExplorationAnchor}
            onSelectExplorationResponse={onSelectExplorationResponse}
            onAskExplorationBranch={onAskExplorationBranch}
            onDistillExploration={onDistillExploration}
          />
        ))
      )}
    </Document>
  );
}

interface PositionedAnnotation {
  annotation: Annotation;
  rects: Array<{ left: number; top: number; width: number; height: number }>;
}

interface PositionedTranslation {
  chunk: TranslationChunk;
  rect: { left: number; top: number; width: number; height: number };
}

function positionsMatch(left: PositionedAnnotation[], right: PositionedAnnotation[]): boolean {
  return left.length === right.length && left.every((item, itemIndex) => {
    const candidate = right[itemIndex];
    return candidate?.annotation.id === item.annotation.id
      && item.rects.length === candidate.rects.length
      && item.rects.every((rect, rectIndex) => {
        const compared = candidate.rects[rectIndex];
        return compared !== undefined
          && Math.abs(rect.left - compared.left) < .1
          && Math.abs(rect.top - compared.top) < .1
          && Math.abs(rect.width - compared.width) < .1
          && Math.abs(rect.height - compared.height) < .1;
      });
  });
}

function LazyPdfPage({
  pageNumber,
  zoom,
  annotations,
  translations,
  revealedOriginals,
  onToggleOriginal,
  anchors,
  aiResponses,
  openExplorationAnchorId,
  selectedExplorationResponseId,
  explorationAsking,
  explorationError,
  savedExplorationAnnotationId,
  onOpenExplorationAnchor,
  onSelectExplorationResponse,
  onAskExplorationBranch,
  onDistillExploration,
}: {
  pageNumber: number;
  zoom: number;
  annotations: PageAnnotation[];
  translations: TranslationChunk[];
  revealedOriginals: Set<string>;
  onToggleOriginal?: (chunkId: string) => void;
  anchors: Anchor[];
  aiResponses: AiResponse[];
  openExplorationAnchorId: string;
  selectedExplorationResponseId: string;
  explorationAsking: boolean;
  explorationError: string;
  savedExplorationAnnotationId: string;
  onOpenExplorationAnchor?: (anchorId: string) => void;
  onSelectExplorationResponse?: (responseId: string) => void;
  onAskExplorationBranch?: (parent: AiResponse, type: AiBranchType, query: string, webResearch: boolean) => void;
  onDistillExploration?: (response: AiResponse) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(pageNumber <= 2);
  const [positionedAnnotations, setPositionedAnnotations] = useState<PositionedAnnotation[]>([]);
  const [positionedTranslations, setPositionedTranslations] = useState<PositionedTranslation[]>([]);

  useEffect(() => {
    const node = wrapperRef.current;
    if (!node || visible) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "1000px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);

  const measureAnnotations = useCallback(() => {
    const wrapper = wrapperRef.current;
    const textLayer = wrapper?.querySelector<HTMLElement>(".textLayer");
    if (!wrapper || !textLayer) return;
    const wrapperBounds = wrapper.getBoundingClientRect();
    const positioned = annotations.flatMap(({ annotation, anchor }) => {
      const rects = anchor.pdfRects?.length
        ? anchor.pdfRects.map((rect) => ({
            left: rect.left * wrapperBounds.width,
            top: rect.top * wrapperBounds.height,
            width: rect.width * wrapperBounds.width,
            height: rect.height * wrapperBounds.height,
          }))
        : (() => {
            const range = locateAnchorRange(textLayer, anchor);
            if (!range) return [];
            return Array.from(range.getClientRects())
              .filter((rect) => rect.width > 0 && rect.height > 0)
              .map((rect) => ({
                left: rect.left - wrapperBounds.left,
                top: rect.top - wrapperBounds.top,
                width: rect.width,
                height: rect.height,
              }));
          })();
      return rects.length ? [{ annotation, rects }] : [];
    });
    setPositionedAnnotations((current) => positionsMatch(current, positioned) ? current : positioned);
    const translationPositions = translations.flatMap((chunk) => {
      if (revealedOriginals.has(chunk.id)) return [];
      if (chunk.pdfRect) {
        return [{ chunk, rect: {
          left: chunk.pdfRect.left * wrapperBounds.width,
          top: chunk.pdfRect.top * wrapperBounds.height,
          width: chunk.pdfRect.width * wrapperBounds.width,
          height: chunk.pdfRect.height * wrapperBounds.height,
        } }];
      }
      const range = locateTextRange(textLayer, chunk.sourceText, 0, "", "", true);
      if (!range) return [];
      const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0);
      if (!rects.length) return [];
      const left = Math.min(...rects.map((rect) => rect.left)) - wrapperBounds.left;
      const top = Math.min(...rects.map((rect) => rect.top)) - wrapperBounds.top;
      const right = Math.max(...rects.map((rect) => rect.right)) - wrapperBounds.left;
      const bottom = Math.max(...rects.map((rect) => rect.bottom)) - wrapperBounds.top;
      const rect = { left: Math.max(0, left - 2), top: Math.max(0, top - 2), width: right - left + 4, height: bottom - top + 4 };
      if (rect.width * rect.height > wrapperBounds.width * wrapperBounds.height * .18 || rect.height > wrapperBounds.height * .32) return [];
      return [{ chunk, rect }];
    });
    setPositionedTranslations(translationPositions);
  }, [annotations, translations, revealedOriginals]);

  useEffect(() => {
    if (!visible) return;
    const frame = window.requestAnimationFrame(measureAnnotations);
    return () => window.cancelAnimationFrame(frame);
  }, [measureAnnotations, visible, zoom]);

  return (
    <div
      ref={wrapperRef}
      id={`pdf-page-${pageNumber - 1}`}
      className="pdf-page-shell"
      data-page-index={pageNumber - 1}
      style={{ width: 760 * zoom, minHeight: 980 * zoom }}
    >
      {visible ? (
        <Page
          pageNumber={pageNumber}
          width={760 * zoom}
          renderAnnotationLayer
          renderTextLayer
          onRenderTextLayerSuccess={measureAnnotations}
          loading={<div className="pdf-page-placeholder"><LoaderCircle className="spin" size={18} /><span>第 {pageNumber} 页</span></div>}
        />
      ) : (
        <div className="pdf-page-placeholder"><span>{pageNumber}</span></div>
      )}
      {!!positionedAnnotations.length && (
        <div className="pdf-annotation-overlay" aria-hidden="true">
          {positionedAnnotations.flatMap(({ annotation, rects }) => [
            ...rects.map((rect, index) => (
              <span
                key={`${annotation.id}:rect:${index}`}
                className={`pdf-annotation-highlight pdf-annotation-${annotation.type.toLocaleLowerCase()} ${annotation.color}`}
                style={rect}
              />
            )),
            annotation.type === "NOTE" && rects[0] ? (
              <span
                key={`${annotation.id}:note`}
                className={`pdf-annotation-note-marker ${annotation.color}`}
                style={{ left: Math.min(rects[0].left + rects[0].width + 4, 760 * zoom - 18), top: rects[0].top - 2 }}
                title={annotation.bodyMarkdown}
              >
                <StickyNote size={10} />
              </span>
            ) : null,
          ])}
        </div>
      )}
      {!!positionedTranslations.length && (
        <div className="pdf-inline-translation-overlay">
          {positionedTranslations.map(({ chunk, rect }) => (
            <button
              type="button"
              key={chunk.id}
              className="pdf-inline-translation"
              data-inline-translation-id={chunk.id}
              style={rect}
              title="点击暂时查看并选择原文"
              onClick={() => onToggleOriginal?.(chunk.id)}
            >
              <span>{chunk.translatedText}</span>
              <small>译</small>
            </button>
          ))}
        </div>
      )}
      {onOpenExplorationAnchor && onSelectExplorationResponse && onAskExplorationBranch && onDistillExploration && (
        <PdfExplorationLayer
          pageIndex={pageNumber - 1}
          anchors={anchors}
          responses={aiResponses}
          openAnchorId={openExplorationAnchorId}
          selectedResponseId={selectedExplorationResponseId}
          asking={explorationAsking}
          error={explorationError}
          savedAnnotationId={savedExplorationAnnotationId}
          onOpenAnchor={onOpenExplorationAnchor}
          onSelectResponse={onSelectExplorationResponse}
          onAskBranch={onAskExplorationBranch}
          onDistill={onDistillExploration}
        />
      )}
      <span className="pdf-page-number">{pageNumber}</span>
    </div>
  );
}
