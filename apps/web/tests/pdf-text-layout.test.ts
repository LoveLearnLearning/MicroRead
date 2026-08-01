import { describe, expect, it } from "vitest";
import { buildPdfTextBlocks } from "@/lib/pdf-text-layout";

describe("PDF text layout blocks", () => {
  it("keeps columns separate and rejects rotated or oversized background text", () => {
    const items = [
      { str: "Left column line one.", width: 190, height: 12, transform: [12, 0, 0, 12, 55, 700] },
      { str: "Right column line one.", width: 190, height: 12, transform: [12, 0, 0, 12, 335, 700] },
      { str: "Left column line two.", width: 190, height: 12, transform: [12, 0, 0, 12, 55, 680] },
      { str: "Right column line two.", width: 190, height: 12, transform: [12, 0, 0, 12, 335, 680] },
      { str: "18 Jun 2024", width: 120, height: 20, transform: [0, 20, -20, 0, 20, 420] },
      { str: "DRAFT BACKGROUND", width: 420, height: 90, transform: [90, 0, 0, 90, 80, 420] },
    ];

    const blocks = buildPdfTextBlocks(items, 0, 600, 800);

    expect(blocks).toHaveLength(2);
    expect(blocks.map((block) => block.text).join(" ")).not.toContain("18 Jun 2024");
    expect(blocks.map((block) => block.text).join(" ")).not.toContain("DRAFT BACKGROUND");
    expect(blocks.every((block) => block.rect.width < 0.5 && block.rect.height < 0.15)).toBe(true);
  });
});
