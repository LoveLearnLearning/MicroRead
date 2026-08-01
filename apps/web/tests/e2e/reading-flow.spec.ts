import { expect, test } from "@playwright/test";

async function selectLeadingText(locator: import("@playwright/test").Locator, length = 18) {
  await locator.evaluate((node, selectionLength) => {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    const textNode = walker.nextNode();
    if (!textNode) throw new Error("missing text node");
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, Math.min(selectionLength, textNode.textContent?.length || 0));
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    node.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  }, length);
}

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

test("annotations can be edited and deleted from the notes panel", async ({ page }) => {
  await page.goto("/library");
  await page.getByRole("link", { name: /为什么阅读需要证据链/ }).click();

  await selectLeadingText(page.locator("[data-block-index='1']"));
  await page.locator(".selection-toolbar").getByRole("button", { name: /笔记/ }).click();
  await page.getByPlaceholder("写下你的理解、疑问或连接…").fill("初始批注");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("初始批注", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "编辑批注" }).click();
  await page.getByRole("textbox", { name: "编辑批注内容" }).fill("修改后的批注");
  await page.getByRole("button", { name: "保存修改" }).click();
  await expect(page.getByText("修改后的批注", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "删除批注" }).click();
  await page.getByRole("button", { name: "确认删除" }).click();
  await expect(page.getByText("修改后的批注", { exact: true })).toHaveCount(0);
  await expect(page.locator("mark.annotation-mark")).toHaveCount(0);
});

test("PDF import opens progressively and extracts searchable text", async ({ page, context }) => {
  await page.route("**/api/translate", async (route) => {
    const body = route.request().postDataJSON() as { chunks: Array<{ id: string; text: string }> };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        translations: body.chunks.map((chunk) => ({ id: chunk.id, text: `原位中文：${chunk.text.slice(0, 28)}` })),
        usage: { inputTokens: 20, outputTokens: 20, estimatedCostUsd: 0.00001, model: "deepseek-v4-flash" },
      }),
    });
  });
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
  await selectLeadingText(titleText, "Evidence First Reading".length);

  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString().trim() ?? "")).toContain("Evidence First Reading");
  await expect(page.locator(".selection-toolbar").getByRole("button", { name: /解释/ })).toBeVisible();
  await page.locator(".selection-toolbar").getByRole("button", { name: /高亮/ }).click();
  await expect(page.locator("#pdf-page-0 .pdf-annotation-highlight")).toHaveCount(1);

  const bodyText = page.locator("#pdf-page-0 .textLayer span").filter({ hasText: "A citation should always lead back" });
  await selectLeadingText(bodyText, 30);
  await page.locator(".selection-toolbar").getByRole("button", { name: /笔记/ }).click();
  await page.getByPlaceholder("写下你的理解、疑问或连接…").fill("PDF 页面笔记");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.locator("#pdf-page-0 .pdf-annotation-note-marker")).toHaveCount(1);

  await page.reload();
  await expect(page.locator("#pdf-page-0")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("#pdf-page-0 .pdf-annotation-highlight")).toHaveCount(2);
  await expect(page.locator("#pdf-page-0 .pdf-annotation-note-marker")).toHaveCount(1);

  await page.getByRole("button", { name: /笔记/ }).click();
  const pdfNote = page.locator(".annotation-list-item").filter({ hasText: "PDF 页面笔记" });
  await pdfNote.getByRole("button", { name: "删除批注" }).click();
  await pdfNote.getByRole("button", { name: "确认删除" }).click();
  await expect(page.locator("#pdf-page-0 .pdf-annotation-note-marker")).toHaveCount(0);
  await expect(page.locator("#pdf-page-0 .pdf-annotation-highlight")).toHaveCount(1);

  await page.getByRole("button", { name: "打开全文翻译" }).click();
  await expect(page.locator("section[aria-label='PDF 原位翻译控制']")).toBeVisible();
  await page.getByRole("button", { name: "开始翻译" }).click();
  const inlineTranslation = page.locator("#pdf-page-0 .pdf-inline-translation").first();
  await expect(inlineTranslation).toBeVisible({ timeout: 20_000 });
  const translatedChunkId = await inlineTranslation.getAttribute("data-inline-translation-id");
  await inlineTranslation.click();
  await expect(page.locator(`[data-inline-translation-id='${translatedChunkId}']`)).toHaveCount(0);
  await page.getByRole("button", { name: /恢复译文/ }).click();
  await expect(page.locator(`[data-inline-translation-id='${translatedChunkId}']`)).toBeVisible();
});

test("complex PDF layout excludes rotated background text and preserves exact annotation geometry", async ({ page, context }) => {
  const translatedTexts: string[] = [];
  await page.route("**/api/translate", async (route) => {
    const body = route.request().postDataJSON() as { chunks: Array<{ id: string; text: string }> };
    translatedTexts.push(...body.chunks.map((chunk) => chunk.text));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        translations: body.chunks.map((chunk) => ({ id: chunk.id, text: `译文：${chunk.text}` })),
        usage: { inputTokens: 20, outputTokens: 20, estimatedCostUsd: 0.00001, model: "deepseek-v4-flash" },
      }),
    });
  });
  const fixturePage = await context.newPage();
  await fixturePage.setContent(`
    <style>
      @page { size: A4; margin: 48px; }
      body { font-family: Georgia, serif; position: relative; }
      .watermark { position: fixed; left: -80px; top: 360px; transform: rotate(-90deg); font-size: 64px; color: #aaa; }
      .columns { display: grid; grid-template-columns: 1fr 1fr; gap: 54px; font-size: 14px; line-height: 1.55; }
      h1 { text-align: center; font-size: 24px; }
    </style>
    <div class="watermark">BACKGROUND LABEL 2024</div>
    <h1>Complex Research Layout</h1>
    <div class="columns">
      <section><p>Left column evidence remains precisely selectable and should receive a compact translation overlay.</p><p>Additional left column context continues on a separate line for layout grouping.</p></section>
      <section><p>Right column findings must never merge with the left column translation rectangle.</p><p>Additional right column context verifies independent column grouping.</p></section>
    </div>
  `);
  const pdfBuffer = await fixturePage.pdf({ format: "A4" });
  await fixturePage.close();

  await page.goto("/library");
  await page.getByRole("button", { name: "添加资料", exact: true }).click();
  await page.locator("input[type='file']").setInputFiles({ name: "complex-layout.pdf", mimeType: "application/pdf", buffer: pdfBuffer });
  await expect(page.locator("#pdf-page-0")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("可问答", { exact: true })).toBeVisible({ timeout: 20_000 });

  const selectable = page.locator("#pdf-page-0 .textLayer span").filter({ hasText: "Left column evidence remains" }).first();
  await selectLeadingText(selectable, 26);
  const selectedBounds = await page.evaluate(() => {
    const rect = window.getSelection()!.getRangeAt(0).getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  });
  await page.locator(".selection-toolbar").getByRole("button", { name: /高亮/ }).click();
  const highlightBounds = await page.locator("#pdf-page-0 .pdf-annotation-highlight").first().boundingBox();
  expect(highlightBounds).not.toBeNull();
  expect(Math.abs(highlightBounds!.x - selectedBounds.left)).toBeLessThan(3);
  expect(Math.abs(highlightBounds!.y - selectedBounds.top)).toBeLessThan(3);
  expect(Math.abs(highlightBounds!.width - selectedBounds.width)).toBeLessThan(4);

  const noteText = page.locator("#pdf-page-0 .textLayer span").filter({ hasText: "Right column findings" }).first();
  await selectLeadingText(noteText, 24);
  const noteSelectionTop = await page.evaluate(() => window.getSelection()!.getRangeAt(0).getBoundingClientRect().top);
  await page.locator(".selection-toolbar").getByRole("button", { name: /笔记/ }).click();
  await page.getByPlaceholder("写下你的理解、疑问或连接…").fill("复杂 PDF 定位笔记");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  const noteMarker = page.locator("#pdf-page-0 .pdf-annotation-note-marker");
  await expect(noteMarker).toHaveCount(1);
  expect(Math.abs((await noteMarker.boundingBox())!.y - noteSelectionTop)).toBeLessThan(5);

  await page.reload();
  await expect(page.locator("#pdf-page-0 .pdf-annotation-highlight")).toHaveCount(2, { timeout: 20_000 });
  await expect(page.locator("#pdf-page-0 .pdf-annotation-note-marker")).toHaveCount(1);

  await page.getByRole("button", { name: "打开全文翻译" }).click();
  await page.getByRole("button", { name: "开始翻译" }).click();
  await expect(page.locator("#pdf-page-0 .pdf-inline-translation").first()).toBeVisible({ timeout: 20_000 });
  expect(translatedTexts.join(" ")).not.toContain("BACKGROUND LABEL");
  const pageBounds = await page.locator("#pdf-page-0").boundingBox();
  const overlayBounds = await page.locator("#pdf-page-0 .pdf-inline-translation").evaluateAll((nodes) => nodes.map((node) => {
    const rect = node.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }));
  expect(pageBounds).not.toBeNull();
  expect(overlayBounds.every((rect) => rect.width * rect.height < pageBounds!.width * pageBounds!.height * .2)).toBe(true);
});

test("PDF explanations expand beside the source as a clickable tree", async ({ page, context }) => {
  let requestCount = 0;
  await page.route("**/api/ai/responses", async (route) => {
    requestCount += 1;
    const request = route.request().postDataJSON() as { parentContext?: { answerMarkdown: string } };
    if (requestCount === 2) expect(request.parentContext?.answerMarkdown).toBe("这是原文处的根节点解释。");
    const id = `pdf-tree-${requestCount}`;
    const answer = requestCount === 1 ? "这是原文处的根节点解释。" : "这是可点击展开的深入子节点。";
    const events = [
      `event: response.started\ndata: ${JSON.stringify({ responseId: id })}`,
      `event: answer.delta\ndata: ${JSON.stringify({ text: answer })}`,
      `event: usage.updated\ndata: ${JSON.stringify({ inputTokens: 10, outputTokens: 8, estimatedCostUsd: 0.00001, model: "deepseek-v4-flash" })}`,
      `event: response.completed\ndata: ${JSON.stringify({ responseId: id })}`,
    ].join("\n\n") + "\n\n";
    await route.fulfill({ status: 200, contentType: "text/event-stream; charset=utf-8", body: events });
  });

  const fixturePage = await context.newPage();
  await fixturePage.setContent("<main><h1>Inline Exploration Tree</h1><p>Each explanation stays connected to the exact source passage.</p></main>");
  const pdfBuffer = await fixturePage.pdf({ format: "A4" });
  await fixturePage.close();

  await page.goto("/library");
  await page.getByRole("button", { name: "添加资料", exact: true }).click();
  await page.locator("input[type='file']").setInputFiles({ name: "inline-exploration.pdf", mimeType: "application/pdf", buffer: pdfBuffer });
  await expect(page.locator("#pdf-page-0")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("可问答", { exact: true })).toBeVisible({ timeout: 20_000 });

  const sourceText = page.locator("#pdf-page-0 .textLayer span").filter({ hasText: "Each explanation stays connected" });
  await selectLeadingText(sourceText, 28);
  await page.locator(".selection-toolbar").getByRole("button", { name: /解释/ }).click();

  await expect(page.locator(".reader-right-panel")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "收起原文探索树" })).toBeVisible();
  const tree = page.getByRole("region", { name: "原文探索树" });
  await expect(tree.getByText("这是原文处的根节点解释。", { exact: true })).toBeVisible();
  await expect(tree.locator(".pdf-exploration-node-rail > button")).toHaveCount(1);

  await tree.getByRole("button", { name: /深入/ }).click();
  await tree.locator(".pdf-exploration-composer textarea").fill("继续解释这个机制");
  await tree.getByRole("button", { name: "发送探索分支" }).click();
  await expect(tree.getByText("这是可点击展开的深入子节点。", { exact: true })).toBeVisible();
  await expect(tree.locator(".pdf-exploration-node-rail > button")).toHaveCount(2);

  await tree.locator(".pdf-exploration-node-rail > button").first().click();
  await expect(tree.getByText("这是原文处的根节点解释。", { exact: true })).toBeVisible();
  await tree.locator(".pdf-exploration-node-rail > button").last().click();
  await expect(tree.getByText("这是可点击展开的深入子节点。", { exact: true })).toBeVisible();

  await tree.getByRole("button", { name: /提炼批注/ }).click();
  await expect(page.locator("#pdf-page-0 .pdf-annotation-note-marker")).toHaveCount(1);
});

test("AI explanations fork into a research-backed tree and distill to an annotation", async ({ page }) => {
  let aiRequestCount = 0;
  let researchRequestCount = 0;
  await page.route("**/api/research", async (route) => {
    researchRequestCount += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ results: [{ id: "wikipedia:1", title: "Evidence", url: "https://example.com/evidence", snippet: "External evidence summary.", provider: "Wikipedia" }] }),
    });
  });
  await page.route("**/api/ai/responses", async (route) => {
    aiRequestCount += 1;
    const requestBody = route.request().postDataJSON() as { passages: Array<{ content: string }> };
    expect(requestBody.passages.every((passage) => passage.content.length <= 4_000)).toBe(true);
    const id = `response-${aiRequestCount}`;
    const citation = { id: `citation-${aiRequestCount}`, passageId: "web:wikipedia:1", sourceId: "web:wikipedia:1", sourceTitle: "Evidence", quote: "External evidence summary.", url: "https://example.com/evidence", provider: "Wikipedia" };
    const events = [
      `event: response.started\ndata: ${JSON.stringify({ responseId: id })}`,
      `event: answer.delta\ndata: ${JSON.stringify({ text: aiRequestCount === 1 ? "这是根节点解释。" : "这是联网后的深入解释。" })}`,
      ...(aiRequestCount > 1 ? [
        `event: citation.created\ndata: ${JSON.stringify({ citation })}`,
        `event: claim.created\ndata: ${JSON.stringify({ claim: { text: "外部证据", type: "EXTERNAL_KNOWLEDGE", citationIds: [citation.id] } })}`,
      ] : []),
      `event: usage.updated\ndata: ${JSON.stringify({ inputTokens: 10, outputTokens: 8, estimatedCostUsd: 0.00001, model: "deepseek-v4-flash" })}`,
      `event: response.completed\ndata: ${JSON.stringify({ responseId: id })}`,
    ].join("\n\n") + "\n\n";
    await route.fulfill({ status: 200, contentType: "text/event-stream; charset=utf-8", body: events });
  });

  await page.goto("/library");
  await page.getByRole("link", { name: /为什么阅读需要证据链/ }).click();
  await page.locator("[data-block-index='1']").evaluate((node) => {
    node.textContent = `selected evidence ${"very long surrounding context ".repeat(240)}`;
  });
  await selectLeadingText(page.locator("[data-block-index='1']"));
  await page.locator(".selection-toolbar").getByRole("button", { name: /解释/ }).click();
  await expect(page.getByText("这是根节点解释。", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /深入子节点/ }).click();
  await page.getByText("联网查资料", { exact: true }).click();
  await page.locator(".ai-input-row textarea").fill("继续查证这个机制");
  await page.locator(".ai-input-row button").click();

  await expect(page.getByText("这是联网后的深入解释。", { exact: true })).toBeVisible();
  await expect(page.locator(".ai-branch-map > button")).toHaveCount(2);
  await expect(page.getByRole("link", { name: /Wikipedia · Evidence/ })).toHaveAttribute("href", "https://example.com/evidence");
  expect(researchRequestCount).toBe(1);
  await page.getByRole("button", { name: /提炼为批注/ }).click();
  await expect(page.getByRole("button", { name: /已提炼为批注/ })).toBeVisible();
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
