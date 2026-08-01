import { beforeEach, describe, expect, it } from "vitest";
import { loadReaderSidebarCollapsed, saveReaderSidebarCollapsed } from "@/lib/reader-layout-preferences";

describe("reader layout preferences", () => {
  beforeEach(() => window.localStorage.clear());

  it("keeps the main navigation expanded by default", () => {
    expect(loadReaderSidebarCollapsed()).toBe(false);
  });

  it("persists a collapsed reader sidebar", () => {
    saveReaderSidebarCollapsed(true);
    expect(loadReaderSidebarCollapsed()).toBe(true);
  });

  it("can restore the expanded reader sidebar", () => {
    saveReaderSidebarCollapsed(true);
    saveReaderSidebarCollapsed(false);
    expect(loadReaderSidebarCollapsed()).toBe(false);
  });
});
