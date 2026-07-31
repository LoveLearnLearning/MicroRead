"use client";

import { unzip, zip } from "fflate";
import type {
  AiResponse,
  Anchor,
  Annotation,
  DocumentTranslation,
  KnowledgeCard,
  Source,
  SyncOperation,
  Topic,
  UsageEntry,
} from "@reader/domain";
import { db, type LocalSetting } from "@/lib/db";

const BACKUP_APP_ID = "ai-native-reader";
const BACKUP_SCHEMA_VERSION = 3;
const COMPATIBLE_BACKUP_VERSIONS = new Set([2, 3]);
const MANIFEST_PATH = "manifest.json";

interface BackupFileEntry {
  sourceId: string;
  path: string;
  mimeType: string;
  size: number;
}

export interface FullBackupManifest {
  appId: typeof BACKUP_APP_ID;
  schemaVersion: typeof BACKUP_SCHEMA_VERSION;
  exportedAt: string;
  files: BackupFileEntry[];
  data: {
    sources: Source[];
    anchors: Anchor[];
    annotations: Annotation[];
    knowledgeCards: KnowledgeCard[];
    topics: Topic[];
    aiResponses: AiResponse[];
    translations: DocumentTranslation[];
    usageEntries: UsageEntry[];
    syncOperations: SyncOperation[];
    settings: LocalSetting[];
  };
}

export interface RestoreSummary {
  sources: number;
  pdfFiles: number;
  annotations: number;
  knowledgeCards: number;
}

export function downloadText(fileName: string, content: string, type = "text/plain;charset=utf-8"): void {
  downloadBlob(fileName, new Blob([content], { type }));
}

export function cardsToMarkdown(cards: KnowledgeCard[]): string {
  const body = cards.map((card) => {
    const note = card.userNoteMarkdown ? `\n\n### 我的笔记\n\n${card.userNoteMarkdown}` : "";
    const explanation = card.aiExplanationMarkdown ? `\n\n### AI 解释\n\n${card.aiExplanationMarkdown}` : "";
    const tags = card.tags.length ? `\n\n标签：${card.tags.map((tag) => `#${tag}`).join(" ")}` : "";
    return `## ${card.title}\n\n> ${card.excerpt}\n\n来源：${card.sourceTitle}${note}${explanation}${tags}`;
  }).join("\n\n---\n\n");
  return `# AI Native Reader 知识卡\n\n导出时间：${new Date().toLocaleString("zh-CN")}\n\n${body}\n`;
}

export async function createFullBackup(): Promise<Blob> {
  const [
    sources,
    sourceFiles,
    anchors,
    annotations,
    cards,
    topics,
    aiResponses,
    translations,
    usageEntries,
    syncOperations,
    settings,
  ] = await Promise.all([
    db.sources.toArray(),
    db.sourceFiles.toArray(),
    db.anchors.toArray(),
    db.annotations.toArray(),
    db.cards.toArray(),
    db.topics.toArray(),
    db.aiResponses.toArray(),
    db.translations.toArray(),
    db.usageEntries.toArray(),
    db.syncOperations.toArray(),
    db.settings.toArray(),
  ]);

  const sourceMap = new Map(sources.map((source) => [source.id, source]));
  const fileMap = new Map(sourceFiles.map((file) => [file.sourceId, file]));
  for (const source of sources) {
    if (source.type === "PDF" && !fileMap.has(source.id)) {
      throw new Error(`PDF 原件缺失，无法创建完整备份：${source.title}`);
    }
  }

  const archive: Record<string, Uint8Array> = {};
  const files: BackupFileEntry[] = [];
  for (const sourceFile of sourceFiles) {
    const source = sourceMap.get(sourceFile.sourceId);
    if (!source) throw new Error(`发现没有来源记录的本地文件：${sourceFile.sourceId}`);
    const path = backupFilePath(sourceFile.sourceId);
    const bytes = new Uint8Array(await sourceFile.blob.arrayBuffer());
    archive[path] = bytes;
    files.push({
      sourceId: sourceFile.sourceId,
      path,
      mimeType: source.mimeType || sourceFile.blob.type || "application/octet-stream",
      size: bytes.byteLength,
    });
  }

  const manifest: FullBackupManifest = {
    appId: BACKUP_APP_ID,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    files,
    data: {
      sources,
      anchors,
      annotations,
      knowledgeCards: cards,
      topics,
      aiResponses,
      translations,
      usageEntries,
      syncOperations,
      settings,
    },
  };
  archive[MANIFEST_PATH] = Uint8Array.from(new TextEncoder().encode(JSON.stringify(manifest)));

  const bytes = await zipArchive(archive);
  return new Blob([toArrayBuffer(bytes)], { type: "application/vnd.ai-native-reader.backup+zip" });
}

export async function exportFullBackup(): Promise<void> {
  const backup = await createFullBackup();
  downloadBlob(`ai-native-reader-${dateStamp()}.anr-backup`, backup);
}

export async function restoreFullBackup(file: Blob): Promise<RestoreSummary> {
  const archive = await unzipArchive(new Uint8Array(await file.arrayBuffer()));
  const manifestBytes = archive[MANIFEST_PATH];
  if (!manifestBytes) throw new Error("备份中缺少 manifest.json。");

  let rawManifest: unknown;
  try {
    rawManifest = JSON.parse(new TextDecoder().decode(manifestBytes));
  } catch {
    throw new Error("备份清单不是有效 JSON。");
  }
  const manifest = validateManifest(rawManifest, archive);
  const restoredFiles = manifest.files.map((entry) => ({
    sourceId: entry.sourceId,
    blob: new Blob([toArrayBuffer(archive[entry.path]!)], { type: entry.mimeType }),
  }));

  const tables = [
    db.sources,
    db.sourceFiles,
    db.anchors,
    db.annotations,
    db.cards,
    db.topics,
    db.aiResponses,
    db.translations,
    db.usageEntries,
    db.syncOperations,
    db.settings,
  ];
  await db.transaction("rw", tables, async () => {
    for (const table of tables) await table.clear();
    if (manifest.data.sources.length) await db.sources.bulkPut(manifest.data.sources);
    if (restoredFiles.length) await db.sourceFiles.bulkPut(restoredFiles);
    if (manifest.data.anchors.length) await db.anchors.bulkPut(manifest.data.anchors);
    if (manifest.data.annotations.length) await db.annotations.bulkPut(manifest.data.annotations);
    if (manifest.data.knowledgeCards.length) await db.cards.bulkPut(manifest.data.knowledgeCards);
    if (manifest.data.topics.length) await db.topics.bulkPut(manifest.data.topics);
    if (manifest.data.aiResponses.length) await db.aiResponses.bulkPut(manifest.data.aiResponses);
    if (manifest.data.translations.length) await db.translations.bulkPut(manifest.data.translations);
    if (manifest.data.usageEntries.length) await db.usageEntries.bulkPut(manifest.data.usageEntries);
    if (manifest.data.syncOperations.length) await db.syncOperations.bulkPut(manifest.data.syncOperations);
    if (manifest.data.settings.length) await db.settings.bulkPut(manifest.data.settings);
  });

  return {
    sources: manifest.data.sources.length,
    pdfFiles: restoredFiles.length,
    annotations: manifest.data.annotations.length,
    knowledgeCards: manifest.data.knowledgeCards.length,
  };
}

export function exportCardsMarkdown(cards: KnowledgeCard[]): void {
  downloadText(`knowledge-cards-${dateStamp()}.md`, cardsToMarkdown(cards), "text/markdown;charset=utf-8");
}

function validateManifest(raw: unknown, archive: Record<string, Uint8Array>): FullBackupManifest {
  if (!isRecord(raw) || raw.appId !== BACKUP_APP_ID) throw new Error("这不是 AI Native Reader 备份。");
  if (typeof raw.schemaVersion !== "number" || !COMPATIBLE_BACKUP_VERSIONS.has(raw.schemaVersion)) {
    throw new Error(`暂不支持此备份版本：${String(raw.schemaVersion)}`);
  }
  if (typeof raw.exportedAt !== "string" || !Array.isArray(raw.files) || !isRecord(raw.data)) {
    throw new Error("备份清单结构不完整。");
  }

  const data = raw.data;
  if (raw.schemaVersion === 2 && !Array.isArray(data.translations)) data.translations = [];
  raw.schemaVersion = BACKUP_SCHEMA_VERSION;
  const requiredArrays = [
    "sources",
    "anchors",
    "annotations",
    "knowledgeCards",
    "topics",
    "aiResponses",
    "translations",
    "usageEntries",
    "syncOperations",
    "settings",
  ] as const;
  for (const key of requiredArrays) {
    if (!Array.isArray(data[key])) throw new Error(`备份数据缺少 ${key}。`);
  }

  const sources = data.sources as unknown[];
  assertUniqueIds(sources, "sources");
  const sourceIds = new Set(sources.map((source) => (source as { id: string }).id));
  const anchors = data.anchors as unknown[];
  assertUniqueIds(anchors, "anchors");
  const anchorIds = new Set(anchors.map((anchor) => (anchor as { id: string }).id));
  const topicIds = new Set((data.topics as unknown[]).map((topic) => readId(topic, "topics")));

  for (const source of sources) {
    if (!isRecord(source) || !Array.isArray(source.topicIds)) throw new Error("sources 中存在无效记录。");
    for (const topicId of source.topicIds) {
      if (typeof topicId !== "string" || !topicIds.has(topicId)) throw new Error("资料引用了不存在的专题。");
    }
  }
  for (const anchor of anchors) assertSourceReference(anchor, sourceIds, "anchors");
  for (const annotation of data.annotations as unknown[]) {
    assertSourceReference(annotation, sourceIds, "annotations");
    if (!isRecord(annotation) || typeof annotation.anchorId !== "string" || !anchorIds.has(annotation.anchorId)) {
      throw new Error("标注引用了不存在的锚点。");
    }
  }
  for (const card of data.knowledgeCards as unknown[]) {
    assertSourceReference(card, sourceIds, "knowledgeCards");
    if (!isRecord(card) || typeof card.sourceAnchorId !== "string" || !anchorIds.has(card.sourceAnchorId)) {
      throw new Error("知识卡引用了不存在的锚点。");
    }
  }
  for (const response of data.aiResponses as unknown[]) assertSourceReference(response, sourceIds, "aiResponses");
  for (const translation of data.translations as unknown[]) assertSourceReference(translation, sourceIds, "translations");

  const seenFileSources = new Set<string>();
  for (const entry of raw.files) {
    if (!isRecord(entry) || typeof entry.sourceId !== "string" || typeof entry.path !== "string" ||
      typeof entry.mimeType !== "string" || typeof entry.size !== "number") {
      throw new Error("备份文件清单包含无效记录。");
    }
    if (!sourceIds.has(entry.sourceId) || seenFileSources.has(entry.sourceId)) {
      throw new Error("备份文件与资料清单不一致。");
    }
    if (entry.path !== backupFilePath(entry.sourceId)) throw new Error("备份文件路径无效。");
    const bytes = archive[entry.path];
    if (!bytes || bytes.byteLength !== entry.size) throw new Error("备份文件缺失或大小不一致。");
    seenFileSources.add(entry.sourceId);
  }
  for (const source of sources) {
    const record = source as { id: string; type?: unknown };
    if (record.type === "PDF" && !seenFileSources.has(record.id)) throw new Error("备份缺少 PDF 原件。");
  }

  return raw as unknown as FullBackupManifest;
}

function assertUniqueIds(records: unknown[], label: string): void {
  const ids = new Set<string>();
  for (const record of records) {
    const id = readId(record, label);
    if (ids.has(id)) throw new Error(`${label} 中存在重复 ID。`);
    ids.add(id);
  }
}

function readId(value: unknown, label: string): string {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id) throw new Error(`${label} 中存在无效记录。`);
  return value.id;
}

function assertSourceReference(value: unknown, sourceIds: Set<string>, label: string): void {
  if (!isRecord(value) || typeof value.sourceId !== "string" || !sourceIds.has(value.sourceId)) {
    throw new Error(`${label} 引用了不存在的资料。`);
  }
}

function backupFilePath(sourceId: string): string {
  return `files/${encodeURIComponent(sourceId)}.bin`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function zipArchive(files: Record<string, Uint8Array>): Promise<Uint8Array> {
  const normalized = Object.fromEntries(
    Object.entries(files).map(([path, bytes]) => [path, Uint8Array.from(bytes)]),
  );
  return new Promise((resolve, reject) => {
    zip(normalized, { level: 0 }, (error, bytes) => error ? reject(error) : resolve(bytes));
  });
}

function unzipArchive(bytes: Uint8Array): Promise<Record<string, Uint8Array>> {
  return new Promise((resolve, reject) => {
    unzip(Uint8Array.from(bytes), (error, files) => error ? reject(error) : resolve(files));
  });
}

function downloadBlob(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}
