import "fake-indexeddb/auto";

import { Blob as NodeBlob } from "node:buffer";
import { unzipSync } from "fflate";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, deleteAllLocalData } from "@/lib/db";
import { createFullBackup, restoreFullBackup } from "@/lib/export";

const timestamp = "2026-07-31T00:00:00.000Z";
const BrowserBlob = globalThis.Blob;

describe("full local backup", () => {
  beforeAll(() => {
    Object.defineProperty(globalThis, "Blob", { value: NodeBlob, configurable: true });
  });

  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  afterAll(() => {
    Object.defineProperty(globalThis, "Blob", { value: BrowserBlob, configurable: true });
  });

  it("round-trips PDF originals and evidence-linked records", async () => {
    await db.sources.put({
      id: "source-pdf",
      workspaceId: "workspace",
      type: "PDF",
      title: "证据文档",
      contentHash: "fixture-hash",
      libraryState: "LIBRARY",
      processingState: "READY",
      mimeType: "application/pdf",
      byteSize: 5,
      tags: [],
      topicIds: [],
      progress: 0.4,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await db.sourceFiles.put({ sourceId: "source-pdf", blob: new Blob([new Uint8Array([1, 2, 3, 4, 5])], { type: "application/pdf" }) });
    await db.anchors.put({
      id: "anchor-1",
      sourceId: "source-pdf",
      sourceRevisionId: "fixture-hash",
      pageIndex: 0,
      quote: { exact: "证据", prefix: "", suffix: "文档" },
      createdAt: timestamp,
    });
    await db.annotations.put({
      id: "annotation-1",
      workspaceId: "workspace",
      sourceId: "source-pdf",
      anchorId: "anchor-1",
      type: "HIGHLIGHT",
      color: "amber",
      bodyMarkdown: "重点",
      tags: [],
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await db.cards.put({
      id: "card-1",
      workspaceId: "workspace",
      sourceId: "source-pdf",
      sourceTitle: "证据文档",
      sourceAnchorId: "anchor-1",
      title: "证据卡",
      excerpt: "证据",
      userNoteMarkdown: "",
      aiExplanationMarkdown: "",
      tags: [],
      status: "ACTIVE",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await db.translations.put({
      id: "source-pdf:zh-CN",
      sourceId: "source-pdf",
      sourceContentHash: "fixture-hash",
      targetLocale: "zh-CN",
      status: "READY",
      chunks: [{ id: "translation-1", index: 0, sourceText: "Evidence", translatedText: "证据", pageIndex: 0, blockIndex: 0 }],
      completedChunks: 1,
      totalChunks: 1,
      inputTokens: 10,
      outputTokens: 5,
      estimatedCostUsd: 0.001,
      model: "deepseek-v4-flash",
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    const backup = await createFullBackup();
    expect(backup.size).toBeGreaterThan(5);
    const backupKeys = Object.keys(unzipSync(new Uint8Array(await backup.arrayBuffer())));
    expect(backupKeys).toContain("manifest.json");

    await deleteAllLocalData();
    await db.sources.put({
      id: "temporary-source",
      workspaceId: "workspace",
      type: "WEB",
      title: "应被替换",
      contentHash: "temporary",
      libraryState: "LIBRARY",
      processingState: "READY",
      mimeType: "text/html",
      byteSize: 0,
      tags: [],
      topicIds: [],
      progress: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    await expect(restoreFullBackup(backup)).resolves.toEqual({
      sources: 1,
      pdfFiles: 1,
      annotations: 1,
      knowledgeCards: 1,
    });
    await expect(db.sources.get("temporary-source")).resolves.toBeUndefined();
    await expect(db.sources.get("source-pdf")).resolves.toMatchObject({ title: "证据文档", progress: 0.4 });
    await expect(db.annotations.get("annotation-1")).resolves.toMatchObject({ anchorId: "anchor-1" });
    await expect(db.cards.get("card-1")).resolves.toMatchObject({ sourceAnchorId: "anchor-1" });
    await expect(db.translations.get("source-pdf:zh-CN")).resolves.toMatchObject({ status: "READY", completedChunks: 1 });
    const restoredFile = await db.sourceFiles.get("source-pdf");
    expect(Array.from(new Uint8Array(await restoredFile!.blob.arrayBuffer()))).toEqual([1, 2, 3, 4, 5]);
  });

  it("rejects an invalid archive before replacing current data", async () => {
    await db.sources.put({
      id: "kept-source",
      workspaceId: "workspace",
      type: "WEB",
      title: "保留资料",
      contentHash: "kept",
      libraryState: "LIBRARY",
      processingState: "READY",
      mimeType: "text/html",
      byteSize: 0,
      tags: [],
      topicIds: [],
      progress: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    await expect(restoreFullBackup(new Blob(["not a backup"]))).rejects.toBeDefined();
    await expect(db.sources.get("kept-source")).resolves.toMatchObject({ title: "保留资料" });
  });
});
