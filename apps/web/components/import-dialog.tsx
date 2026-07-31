"use client";

import { FileText, Globe2, LoaderCircle, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { DragEvent, FormEvent, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { FeatureFlags } from "@reader/domain";
import { db, importPdf, importWebArticle, type ImportedWebArticle } from "@/lib/db";
import { platformImportWeb } from "@/lib/platform";

export function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<"pdf" | "web">("pdf");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [url, setUrl] = useState("");
  const setting = useLiveQuery(() => db.settings.get("featureFlags"), [], undefined);
  const flags = (setting?.value as FeatureFlags | undefined) || { aiEnabled: true, webImportEnabled: true, pdfImportEnabled: true };

  if (!open) return null;

  function resetFeedback() {
    setError("");
    setMessage("");
  }

  async function handleFile(file?: File) {
    resetFeedback();
    if (!file) return;
    if (!flags.pdfImportEnabled) {
      setError("PDF 导入已在体验版功能开关中关闭。 ");
      return;
    }
    if (file.type !== "application/pdf" && !file.name.toLocaleLowerCase().endsWith(".pdf")) {
      setError("当前 MVP 只支持 PDF 文件。EPUB 和 Office 文档将在后续阶段接入。 ");
      return;
    }
    if (file.size > 150 * 1024 * 1024) {
      setError("文件超过本地体验版 150 MB 的限制。 ");
      return;
    }
    setBusy(true);
    try {
      const result = await importPdf(file);
      if (result.duplicate) {
        setMessage("已找到内容相同的文档，正在打开已有资料…");
      }
      router.push(`/reader/${result.source.id}`);
      onClose();
    } catch {
      setError("PDF 无法写入本地存储。请检查可用磁盘空间或站点存储权限。 ");
    } finally {
      setBusy(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    void handleFile(event.dataTransfer.files[0]);
  }

  async function handleUrlSubmit(event: FormEvent) {
    event.preventDefault();
    resetFeedback();
    if (!flags.webImportEnabled) {
      setError("网页导入已在体验版功能开关中关闭。 ");
      return;
    }
    let parsed: URL;
    try {
      parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
    } catch {
      setError("请输入完整的 http:// 或 https:// 网页地址。 ");
      return;
    }
    setBusy(true);
    try {
      let payload = await platformImportWeb(parsed.toString());
      if (!payload) {
        const response = await fetch("/api/import-web", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: parsed.toString() }),
        });
        const webPayload = await response.json() as ImportedWebArticle & { error?: { message?: string } };
        if (!response.ok) throw new Error(webPayload.error?.message || "网页提取失败");
        payload = webPayload;
      }
      const result = await importWebArticle(payload);
      router.push(`/reader/${result.source.id}`);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "网页提取失败，请稍后再试。 ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="import-title">
      <button className="modal-backdrop" aria-label="关闭导入窗口" onClick={onClose} />
      <section className="modal-panel">
        <header className="modal-header">
          <div>
            <h2 id="import-title">添加到阅读空间</h2>
            <p>原件首先保存到当前设备，AI 解析不会阻塞阅读。</p>
          </div>
          <button className="icon-button" aria-label="关闭" onClick={onClose}><X size={18} /></button>
        </header>
        <div className="modal-tabs" role="tablist">
          <button disabled={!flags.pdfImportEnabled} className={tab === "pdf" ? "active" : ""} onClick={() => { setTab("pdf"); resetFeedback(); }}>
            <FileText size={15} /> PDF 文件
          </button>
          <button disabled={!flags.webImportEnabled} className={tab === "web" ? "active" : ""} onClick={() => { setTab("web"); resetFeedback(); }}>
            <Globe2 size={15} /> 网页链接
          </button>
        </div>
        <div className="modal-body">
          {tab === "pdf" ? (
            <div
              className={`drop-zone ${dragging ? "dragging" : ""}`}
              onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
            >
              <input ref={inputRef} type="file" accept="application/pdf,.pdf" onChange={(event) => void handleFile(event.target.files?.[0])} />
              <span className="drop-zone-icon">{busy ? <LoaderCircle className="spin" size={22} /> : <Upload size={22} />}</span>
              <strong>{busy ? "正在安全保存…" : "拖入一份 PDF"}</strong>
              <p>或 <button className="inline-action" onClick={() => inputRef.current?.click()}>从电脑选择</button></p>
              <small>单个文件不超过 150 MB · 相同内容自动去重</small>
            </div>
          ) : (
            <form className="url-form" onSubmit={handleUrlSubmit}>
              <label className="field-label">
                <span>网页地址</span>
                <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/article" autoFocus />
              </label>
              <p className="form-help">只提取公开网页的标题和正文。内网地址、登录页面与非 HTML 内容会被拒绝。</p>
              <div className="modal-actions">
                <button type="button" className="ghost-button" onClick={onClose}>取消</button>
                <button className="primary-button" disabled={busy || !url.trim()}>
                  {busy ? <LoaderCircle className="spin" size={16} /> : <Globe2 size={16} />}
                  {busy ? "正在提取…" : "保存网页"}
                </button>
              </div>
            </form>
          )}
          {error && <p className="form-error import-feedback" role="alert">{error}</p>}
          {message && <p className="form-success import-feedback">{message}</p>}
        </div>
      </section>
    </div>
  );
}
