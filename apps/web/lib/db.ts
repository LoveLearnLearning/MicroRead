"use client";

import Dexie, { type EntityTable } from "dexie";
import type {
  AiResponse,
  Anchor,
  Annotation,
  FeatureFlags,
  DocumentTranslation,
  KnowledgeCard,
  Source,
  SourceFile,
  SyncOperation,
  Topic,
  UsageEntry,
  UserProfile,
  Workspace,
} from "@reader/domain";
import { DEFAULT_WORKSPACE_ID, createId, nowIso } from "@reader/domain";

export interface LocalSetting {
  key: string;
  value: unknown;
}

class ReaderDatabase extends Dexie {
  sources!: EntityTable<Source, "id">;
  sourceFiles!: EntityTable<SourceFile, "sourceId">;
  anchors!: EntityTable<Anchor, "id">;
  annotations!: EntityTable<Annotation, "id">;
  cards!: EntityTable<KnowledgeCard, "id">;
  topics!: EntityTable<Topic, "id">;
  aiResponses!: EntityTable<AiResponse, "id">;
  usageEntries!: EntityTable<UsageEntry, "id">;
  syncOperations!: EntityTable<SyncOperation, "id">;
  users!: EntityTable<UserProfile, "id">;
  workspaces!: EntityTable<Workspace, "id">;
  settings!: EntityTable<LocalSetting, "key">;
  translations!: EntityTable<DocumentTranslation, "id">;

  constructor() {
    super("micro-read");
    this.version(1).stores({
      sources: "id, workspaceId, contentHash, libraryState, type, processingState, updatedAt, *tags, *topicIds",
      sourceFiles: "sourceId",
      anchors: "id, sourceId",
      annotations: "id, workspaceId, sourceId, anchorId, updatedAt, *tags",
      cards: "id, workspaceId, sourceId, sourceAnchorId, updatedAt, *tags",
      topics: "id, workspaceId, updatedAt",
      aiResponses: "id, sourceId, createdAt",
      usageEntries: "id, workspaceId, category, occurredAt, referenceId",
      syncOperations: "id, workspaceId, entityType, entityId, status, clientTimestamp",
      users: "id, email, workspaceId",
      workspaces: "id",
      settings: "key",
    });
    this.version(2).stores({
      translations: "id, sourceId, targetLocale, status, updatedAt",
    });
  }
}

export const db = new ReaderDatabase();

const seedArticle = `在数字阅读中，速度很容易被误认为效率。真正有效的阅读，不是更快地滑过页面，而是能在需要时说明：我理解了什么，这个理解依据什么，它如何改变了已有认知。

传统阅读器以页面为中心，聊天机器人以对话为中心。两者简单拼接后，读者仍然要在答案和原文之间来回寻找依据。证据优先的阅读方式把来源锚点作为系统的一等对象。每一个高亮、批注和 AI 结论都能回到具体段落；当文档版本变化时，系统优先使用文字原句和前后文重新定位，而不是只依赖脆弱的屏幕坐标。

AI 在这里不是替代阅读的摘要机器，而是一层按需出现的脚手架。读者选中难点时，它解释当前语境；读者提出文档级问题时，它只在授权资料中检索；证据不足时，它明确保留不确定性。外部知识、模型推断和来源事实应具有不同的视觉标记。

知识沉淀也不应从复制粘贴开始。选区、用户笔记、AI 解释和来源位置共同形成知识卡片。卡片可以继续进入专题、复习和写作，但始终保留回到原文的路径。这样，阅读产生的不是一堆孤立笔记，而是一组能够验证、连接和迁移的知识对象。

本地优先是这一体验的重要前提。文档、阅读进度和用户写入先在设备上成功，联网后再同步。云端故障不应该阻止用户打开已经下载的资料，也不应该让刚写下的长笔记消失。发生冲突时，产品应保存双方版本并让用户决定，而不是静默覆盖。

一个可信的 AI 阅读系统最终需要接受可测量的约束：引用定位是否成功，关键结论是否真的受到证据支持，解析失败是否有回退，成本和延迟是否在预算内。产品价值不是生成了多少文字，而是用户是否完成了一次有证据沉淀的有效阅读。`;

export async function ensureSeedData(): Promise<void> {
  const timestamp = nowIso();
  const source: Source = {
    id: "019fb7ef-0000-7000-8000-000000000100",
    workspaceId: DEFAULT_WORKSPACE_ID,
    type: "WEB",
    title: "为什么阅读需要证据链",
    author: "阅微团队",
    canonicalUri: "reader://welcome/evidence-first",
    contentHash: "seed:evidence-first:v1",
    libraryState: "LIBRARY",
    processingState: "READY",
    mimeType: "text/html",
    byteSize: new Blob([seedArticle]).size,
    textContent: seedArticle,
    summary: "从锚点、AI 角色、知识卡片和本地优先四个方面，介绍证据优先的阅读方式。",
    tags: ["入门", "证据优先"],
    topicIds: ["019fb7ef-0000-7000-8000-000000000200"],
    progress: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const topic: Topic = {
    id: "019fb7ef-0000-7000-8000-000000000200",
    workspaceId: DEFAULT_WORKSPACE_ID,
    name: "阅读方法",
    description: "关于深度阅读、证据和知识沉淀的资料。",
    color: "amber",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await db.transaction("rw", db.sources, db.topics, db.settings, async () => {
    const existing = await db.sources.count();
    if (existing > 0) return;

    await db.sources.put(source);
    await db.topics.put(topic);
    await db.settings.put({
      key: "featureFlags",
      value: { aiEnabled: true, webImportEnabled: true, pdfImportEnabled: true } satisfies FeatureFlags,
    });
  });
}

export async function sha256(blob: Blob): Promise<string> {
  const bytes = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function importPdf(file: File): Promise<{ source: Source; duplicate: boolean }> {
  const hash = await sha256(file);
  const duplicate = await db.sources.where("contentHash").equals(hash).first();
  if (duplicate) return { source: duplicate, duplicate: true };

  const timestamp = nowIso();
  const id = createId();
  const source: Source = {
    id,
    workspaceId: DEFAULT_WORKSPACE_ID,
    type: "PDF",
    title: file.name.replace(/\.pdf$/i, ""),
    contentHash: hash,
    libraryState: "INBOX",
    processingState: "UPLOADED",
    mimeType: file.type || "application/pdf",
    byteSize: file.size,
    tags: [],
    topicIds: [],
    progress: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const operation = createOperation("source", id, source as unknown as Record<string, unknown>);
  await db.transaction("rw", db.sources, db.sourceFiles, db.syncOperations, async () => {
    await db.sources.add(source);
    await db.sourceFiles.add({ sourceId: id, blob: file });
    await db.syncOperations.add(operation);
  });
  return { source, duplicate: false };
}

export interface ImportedWebArticle {
  url: string;
  title: string;
  byline?: string;
  textContent: string;
  excerpt?: string;
}

export async function importWebArticle(article: ImportedWebArticle): Promise<{ source: Source; duplicate: boolean }> {
  const blob = new Blob([article.textContent], { type: "text/plain" });
  const hash = await sha256(blob);
  const duplicate = await db.sources.where("contentHash").equals(hash).first();
  if (duplicate) return { source: duplicate, duplicate: true };

  const timestamp = nowIso();
  const source: Source = {
    id: createId(),
    workspaceId: DEFAULT_WORKSPACE_ID,
    type: "WEB",
    title: article.title,
    author: article.byline,
    canonicalUri: article.url,
    contentHash: hash,
    libraryState: "INBOX",
    processingState: "READY",
    mimeType: "text/html",
    byteSize: blob.size,
    textContent: article.textContent,
    summary: article.excerpt,
    tags: [],
    topicIds: [],
    progress: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await db.transaction("rw", db.sources, db.syncOperations, async () => {
    await db.sources.add(source);
    await db.syncOperations.add(createOperation("source", source.id, source as unknown as Record<string, unknown>));
  });
  return { source, duplicate: false };
}

export async function updateSource(id: string, changes: Partial<Source>): Promise<void> {
  await db.sources.update(id, { ...changes, updatedAt: nowIso() });
}

export async function putAnnotation(anchor: Anchor, annotation: Annotation): Promise<void> {
  await db.transaction("rw", db.anchors, db.annotations, db.syncOperations, async () => {
    await db.anchors.put(anchor);
    await db.annotations.put(annotation);
    await db.syncOperations.add(
      createOperation("annotation", annotation.id, annotation as unknown as Record<string, unknown>),
    );
  });
}

export async function updateAnnotation(
  id: string,
  changes: Partial<Pick<Annotation, "bodyMarkdown" | "color" | "tags" | "deletedAt">>,
): Promise<void> {
  await db.transaction("rw", db.annotations, db.syncOperations, async () => {
    const annotation = await db.annotations.get(id);
    if (!annotation) return;
    const updated: Annotation = {
      ...annotation,
      ...changes,
      version: annotation.version + 1,
      updatedAt: nowIso(),
    };
    await db.annotations.put(updated);
    await db.syncOperations.add(
      createOperation("annotation", updated.id, updated as unknown as Record<string, unknown>),
    );
  });
}

export async function deleteAnnotation(id: string): Promise<void> {
  await updateAnnotation(id, { deletedAt: nowIso() });
}

export async function putCard(card: KnowledgeCard): Promise<void> {
  await db.transaction("rw", db.cards, db.syncOperations, async () => {
    await db.cards.put(card);
    await db.syncOperations.add(
      createOperation("knowledgeCard", card.id, card as unknown as Record<string, unknown>),
    );
  });
}

export async function putTopic(topic: Topic): Promise<void> {
  await db.transaction("rw", db.topics, db.syncOperations, async () => {
    await db.topics.put(topic);
    await db.syncOperations.add(createOperation("topic", topic.id, topic as unknown as Record<string, unknown>));
  });
}

function createOperation(
  entityType: SyncOperation["entityType"],
  entityId: string,
  payload: Record<string, unknown>,
): SyncOperation {
  return {
    id: createId(),
    workspaceId: DEFAULT_WORKSPACE_ID,
    entityType,
    entityId,
    action: "UPSERT",
    payload,
    clientTimestamp: nowIso(),
    status: "LOCAL_ONLY",
  };
}

export async function deleteAllLocalData(): Promise<void> {
  await db.transaction("rw", db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
}

export async function deleteSourcePermanently(sourceId: string): Promise<void> {
  const sourceAnchors = await db.anchors.where("sourceId").equals(sourceId).primaryKeys();
  await db.transaction(
    "rw",
    [db.sources, db.sourceFiles, db.anchors, db.annotations, db.cards, db.aiResponses, db.translations, db.syncOperations],
    async () => {
      await db.sources.delete(sourceId);
      await db.sourceFiles.delete(sourceId);
      await db.anchors.where("sourceId").equals(sourceId).delete();
      await db.annotations.where("sourceId").equals(sourceId).delete();
      await db.cards.where("sourceId").equals(sourceId).delete();
      await db.aiResponses.where("sourceId").equals(sourceId).delete();
      await db.translations.where("sourceId").equals(sourceId).delete();
      await db.syncOperations.where("entityId").equals(sourceId).delete();
      if (sourceAnchors.length) {
        await db.syncOperations.filter((operation) => sourceAnchors.includes(operation.entityId)).delete();
      }
    },
  );
}
