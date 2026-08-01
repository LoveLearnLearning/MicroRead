"use client";

import { AlertTriangle, LoaderCircle, RotateCcw, StickyNote } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import type { PDFDocumentProxy, TextItem } from "pdfjs-dist/types/src/display/api";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import type { Anchor, Annotation, Source } from "@reader/domain";
import { updateSource } from "@/lib/db";
import { locateAnchorRange } from "@/lib/pdf-annotation-layer";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

interface PageAnnotation {
  annotation: Annotation;
  anchor: Anchor;
}

const EMPTY_PAGE_ANNOTATIONS: PageAnnotation[] = [];

export function PdfDocument({
  source,
  blob,
  zoom,
  annotations,
  anchors,
}: {
  source: Source;
  blob?: Blob;
  zoom: number;
  annotations: Annotation[];
  anchors: Anchor[];
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

  useEffect(() => {
    // React Strict Mode mounts, cleans up, then mounts again in development.
    // Reset the flag on every setup so the verification cycle does not cancel extraction.
    cancelledRef.current = false;
    return () => { cancelledRef.current = true; };
  }, []);

  async function handleLoad(pdf: PDFDocumentProxy) {
    setPageCount(pdf.numPages);
    setError("");
    await updateSource(source.id, {
      pageCount: pdf.numPages,
      processingState: source.textContent ? "READY" : "EXTRACTING",
    });

    if (source.textContent || extractingRef.current) return;
    extractingRef.current = true;
    try {
      const pages: string[] = [];
      for (let index = 1; index <= pdf.numPages; index += 1) {
        if (cancelledRef.current) return;
        const page = await pdf.getPage(index);
        const content = await page.getTextContent();
        const text = content.items
          .filter((item): item is TextItem => "str" in item)
          .map((item) => item.str)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
        pages.push(text);
        if (index % 10 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
      }
      await updateSource(source.id, {
        textContent: pages.join("\n\n"),
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
          <LazyPdfPage key={index} pageNumber={index + 1} zoom={zoom} annotations={annotationsByPage.get(index) ?? EMPTY_PAGE_ANNOTATIONS} />
        ))
      )}
    </Document>
  );
}

interface PositionedAnnotation {
  annotation: Annotation;
  rects: Array<{ left: number; top: number; width: number; height: number }>;
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
}: {
  pageNumber: number;
  zoom: number;
  annotations: PageAnnotation[];
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(pageNumber <= 2);
  const [positionedAnnotations, setPositionedAnnotations] = useState<PositionedAnnotation[]>([]);

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
      const range = locateAnchorRange(textLayer, anchor);
      if (!range) return [];
      const rects = Array.from(range.getClientRects())
        .filter((rect) => rect.width > 0 && rect.height > 0)
        .map((rect) => ({
          left: rect.left - wrapperBounds.left,
          top: rect.top - wrapperBounds.top,
          width: rect.width,
          height: rect.height,
        }));
      return rects.length ? [{ annotation, rects }] : [];
    });
    setPositionedAnnotations((current) => positionsMatch(current, positioned) ? current : positioned);
  }, [annotations]);

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
      <span className="pdf-page-number">{pageNumber}</span>
    </div>
  );
}
