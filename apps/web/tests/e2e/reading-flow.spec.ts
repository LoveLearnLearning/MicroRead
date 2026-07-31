import { expect, test } from "@playwright/test";

test("local workspace opens directly and highlight persists", async ({ page }) => {
  await page.goto("/library");
  await expect(page.locator("html[data-reader-ready='true']")).toBeAttached();
  await expect(page.getByRole("heading", { name: "资料库", exact: true })).toBeVisible();
  await expect(page.getByText("正在打开你的阅读空间…", { exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: /为什么阅读需要证据链/ }).click();
  await expect(page.getByRole("heading", { name: "为什么阅读需要证据链" })).toBeVisible();

  const paragraph = page.locator("[data-block-index='1']");
  await paragraph.evaluate((node) => {
    const textNode = node.firstChild;
    if (!textNode) throw new Error("missing text node");
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, Math.min(12, textNode.textContent?.length || 0));
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    node.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  await expect(page.getByRole("button", { name: /高亮/ })).toBeVisible();
  await page.getByRole("button", { name: /高亮/ }).click();
  await expect(page.locator("mark.annotation-mark")).toHaveCount(1);

  await page.reload();
  await expect(page.locator("mark.annotation-mark")).toHaveCount(1);
});

test("PDF import opens progressively and extracts searchable text", async ({ page, context }) => {
  const fixturePage = await context.newPage();
  await fixturePage.setContent("<main><h1>Evidence First Reading</h1><p>A citation should always lead back to its source.</p></main>");
  const pdfBuffer = await fixturePage.pdf({ format: "A4" });
  await fixturePage.close();

  await page.goto("/library");
  await expect(page.locator("html[data-reader-ready='true']")).toBeAttached();
  await page.getByRole("button", { name: "添加资料", exact: true }).click();
  await page.locator("input[type='file']").setInputFiles({ name: "evidence-sample.pdf", mimeType: "application/pdf", buffer: pdfBuffer });

  await expect(page.getByText("evidence-sample", { exact: true })).toBeVisible();
  await expect(page.locator("#pdf-page-0")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("可问答", { exact: true })).toBeVisible({ timeout: 20_000 });

  const titleText = page.locator("#pdf-page-0 .textLayer span").filter({ hasText: "Evidence First Reading" });
  await expect(titleText).toBeVisible();
  const titleBounds = await titleText.boundingBox();
  expect(titleBounds).not.toBeNull();
  await page.mouse.move(titleBounds!.x + 2, titleBounds!.y + titleBounds!.height / 2);
  await page.mouse.down();
  await page.mouse.move(titleBounds!.x + titleBounds!.width - 2, titleBounds!.y + titleBounds!.height / 2, { steps: 12 });
  await page.mouse.up();

  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString().trim() ?? "")).toContain("Evidence First Reading");
  await expect(page.locator(".selection-toolbar").getByRole("button", { name: /解释/ })).toBeVisible();
});

test("full translation supports parallel reading, translation-only reveal, and local cache", async ({ page }) => {
  let batchRequests = 0;
  await page.route("**/api/translate", async (route) => {
    batchRequests += 1;
    const body = route.request().postDataJSON() as { chunks: Array<{ id: string; text: string }> };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        translations: body.chunks.map((chunk, index) => ({ id: chunk.id, text: `中文译文 ${batchRequests}-${index + 1}：${chunk.text.slice(0, 24)}` })),
        usage: { inputTokens: 40, outputTokens: 30, estimatedCostUsd: 0.00002, model: "deepseek-v4-flash" },
      }),
    });
  });

  await page.goto("/library");
  await expect(page.locator("html[data-reader-ready='true']")).toBeAttached();
  await page.getByRole("link", { name: /为什么阅读需要证据链/ }).click();
  await page.getByRole("button", { name: "打开全文翻译" }).click();
  await expect(page.getByRole("heading", { name: "生成整篇中文译文" })).toBeVisible();
  await page.getByRole("button", { name: "全文翻译为中文" }).click();
  await expect(page.getByText("翻译完成", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/中文译文 1-1/)).toBeVisible();
  expect(batchRequests).toBeGreaterThan(0);

  await page.locator("#web-block-4").evaluate((element) => element.scrollIntoView());
  await expect.poll(() => page.locator(".translation-scroll").evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await page.waitForTimeout(300);
  await page.locator(".translation-chunk").last().evaluate((element) => element.scrollIntoView());
  await expect.poll(() => page.locator(".reader-document-stage").evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

  await page.getByRole("button", { name: /译文阅读/ }).click();
  const firstChunk = page.locator(".translation-chunk").first();
  await expect(firstChunk).toContainText("点击查看原文");
  await firstChunk.click();
  await expect(firstChunk).toContainText("在数字阅读中");
  await expect(firstChunk).toContainText("点击恢复译文");

  await page.getByRole("button", { name: /显示译文：段落 1/ }).click();
  const translatedParagraph = firstChunk.locator("p");
  const translatedBounds = await translatedParagraph.boundingBox();
  expect(translatedBounds).not.toBeNull();
  await page.mouse.move(translatedBounds!.x + 2, translatedBounds!.y + 10);
  await page.mouse.down();
  await page.mouse.move(translatedBounds!.x + Math.min(180, translatedBounds!.width - 2), translatedBounds!.y + 10, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString().trim().length ?? 0)).toBeGreaterThan(2);
  await expect(page.locator(".selection-toolbar").getByRole("button", { name: /解释/ })).toBeVisible();

  const requestsBeforeReload = batchRequests;
  await page.reload();
  await expect(page.locator("html[data-reader-ready='true']")).toBeAttached();
  await page.getByRole("button", { name: "打开全文翻译" }).click();
  await expect(page.getByText("翻译完成", { exact: true })).toBeVisible();
  await expect(page.getByText(/中文译文 1-1/)).toBeVisible();
  expect(batchRequests).toBe(requestsBeforeReload);
});
