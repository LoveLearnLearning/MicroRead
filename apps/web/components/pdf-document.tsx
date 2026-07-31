"use client";

import { AlertTriangle, LoaderCircle, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import type { PDFDocumentProxy, TextItem } from "pdfjs-dist/types/src/display/api";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import type { Source } from "@reader/domain";
import { updateSource } from "@/lib/db";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

export function PdfDocument({ source, blob, zoom }: { source: Source; blob?: Blob; zoom: number }) {
  const [pageCount, setPageCount] = useState(source.pageCount ?? 0);
  const [error, setError] = useState("");
  const extractingRef = useRef(false);
  const cancelledRef = useRef(false);

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
          <LazyPdfPage key={index} pageNumber={index + 1} zoom={zoom} />
        ))
      )}
    </Document>
  );
}

function LazyPdfPage({ pageNumber, zoom }: { pageNumber: number; zoom: number }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(pageNumber <= 2);

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
          loading={<div className="pdf-page-placeholder"><LoaderCircle className="spin" size={18} /><span>第 {pageNumber} 页</span></div>}
        />
      ) : (
        <div className="pdf-page-placeholder"><span>{pageNumber}</span></div>
      )}
      <span className="pdf-page-number">{pageNumber}</span>
    </div>
  );
}
