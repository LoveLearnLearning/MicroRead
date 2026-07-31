import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db, ensureSeedData } from "@/lib/db";

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
});
