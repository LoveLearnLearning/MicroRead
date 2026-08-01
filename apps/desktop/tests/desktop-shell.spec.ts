import { expect, test } from "@playwright/test";

test("desktop static shell opens without a blocking boot screen and preserves hash routing", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html[data-reader-ready='true']")).toBeAttached();

  await expect(page.getByRole("heading", { name: "资料库", exact: true })).toBeVisible();
  await expect(page.getByText("正在打开你的阅读空间…", { exact: true })).toHaveCount(0);
  await expect(page).toHaveURL(/#\/library$/);

  const welcomeSource = page.getByRole("link", { name: /为什么阅读需要证据链/ });
  await expect(welcomeSource).toBeVisible();
  await welcomeSource.click();
  await expect(page.getByRole("heading", { name: "为什么阅读需要证据链" })).toBeVisible();
  await expect(page).toHaveURL(/#\/reader\/019fb7ef-0000-7000-8000-000000000100$/);

  await page.getByRole("button", { name: "收起主导航" }).click();
  await expect(page.getByRole("button", { name: "展开主导航" })).toBeVisible();
  await expect(page.locator(".app-sidebar")).toBeHidden();

  await page.reload();
  await expect(page.getByRole("heading", { name: "为什么阅读需要证据链" })).toBeVisible();
  await expect(page.getByRole("button", { name: "展开主导航" })).toBeVisible();

  await page.getByRole("button", { name: "展开主导航" }).click();
  await expect(page.getByRole("button", { name: "收起主导航" })).toBeVisible();
  await expect(page.locator(".app-sidebar")).toBeVisible();
});
