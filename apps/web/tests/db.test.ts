import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Anchor, Annotation } from "@reader/domain";
import { DEFAULT_WORKSPACE_ID } from "@reader/domain";
import { db, deleteAnnotation, ensureSeedData, putAnnotation, updateAnnotation } from "@/lib/db";

describe("database bootstrap", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it("is idempotent when React starts initialization concurrently", async () => {
    await Promise.all(Array.from({ length: 8 }, () => ensureSeedData()));

    await expect(db.sources.count()).resolves.toBe(1);
    await expect(db.topics.count()).resolves.toBe(1);
    await expect(db.settings.get("featureFlags")).resolves.toBeDefined();
  });

  it("updates and soft-deletes annotations with sync operations", async () => {
    const timestamp = "2026-08-01T00:00:00.000Z";
    const anchor: Anchor = {
      id: "anchor-1",
      sourceId: "source-1",
      sourceRevisionId: "source-1:1",
      pageIndex: 0,
      quote: { exact: "Evidence", prefix: "", suffix: " First" },
      createdAt: timestamp,
    };
    const annotation: Annotation = {
      id: "annotation-1",
      workspaceId: DEFAULT_WORKSPACE_ID,
      sourceId: "source-1",
      anchorId: anchor.id,
      type: "NOTE",
      color: "mint",
      bodyMarkdown: "first note",
      tags: [],
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await putAnnotation(anchor, annotation);
    await updateAnnotation(annotation.id, { bodyMarkdown: "edited note" });
    await expect(db.annotations.get(annotation.id)).resolves.toMatchObject({ bodyMarkdown: "edited note", version: 2 });

    await deleteAnnotation(annotation.id);
    const deleted = await db.annotations.get(annotation.id);
    expect(deleted?.deletedAt).toBeTruthy();
    expect(deleted?.version).toBe(3);
    await expect(db.syncOperations.where("entityId").equals(annotation.id).count()).resolves.toBe(3);
  });
});
