import { describe, expect, it } from "vitest";
import type { Anchor } from "@reader/domain";
import { buildNormalizedTextMap, locateAnchorRange, locateTextRange, normalizeClientRects } from "@/lib/pdf-annotation-layer";

function anchor(exact: string, startOffset?: number): Anchor {
  return {
    id: "anchor-1",
    sourceId: "source-1",
    sourceRevisionId: "source-1:1",
    pageIndex: 0,
    startOffset,
    endOffset: startOffset === undefined ? undefined : startOffset + exact.length,
    quote: { exact, prefix: "Evidence First ", suffix: " across spans." },
    createdAt: "2026-08-01T00:00:00.000Z",
  };
}

describe("PDF annotation text mapping", () => {
  it("normalizes whitespace while retaining DOM boundaries across text spans", () => {
    const root = document.createElement("div");
    root.innerHTML = "<span>Evidence First </span><span>Reading\n  works</span><span> across spans.</span>";

    const mapped = buildNormalizedTextMap(root);

    expect(mapped.text).toBe("Evidence First Reading works across spans.");
  });

  it("rebuilds a range for a quote split across react-pdf text spans", () => {
    const root = document.createElement("div");
    root.innerHTML = "<span>Evidence First </span><span>Reading</span><span> across spans.</span>";

    const range = locateAnchorRange(root, anchor("Reading", 15));

    expect(range?.toString()).toBe("Reading");
  });

  it("locates a translation chunk without creating an annotation anchor", () => {
    const root = document.createElement("div");
    root.innerHTML = "<span>One translated</span><span>fragment stays selectable.</span>";

    expect(locateTextRange(root, "translated fragment", 0, "", "", true)?.toString()).toBe("translatedfragment");
  });

  it("normalizes selected PDF line rectangles against the page", () => {
    const rects = normalizeClientRects(
      [{ left: 120, top: 220, right: 320, bottom: 240, width: 200, height: 20 }],
      { left: 100, top: 200, right: 700, bottom: 1000, width: 600, height: 800 },
    );
    expect(rects[0]).toEqual({ left: 1 / 30, top: 0.025, width: 1 / 3, height: 0.025 });
  });
});
