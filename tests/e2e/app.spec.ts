import { test, expect } from "@playwright/test";

test("loads a preset and moves to the next song in immersive mode", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("LyricBook", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: /Immersive|沉浸/ }).click();
  const title = page.locator(".immersive-body h1");
  const before = await title.textContent();
  await page.getByRole("button", { name: /Next|下一首/ }).last().click();
  await expect(title).not.toHaveText(before || "");
});

test("closing overlays restores page scrolling on iPhone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator(".mobile-only").click();
  await page.getByRole("button", { name: /choose preset|选择预设/i }).click();
  await page.getByRole("button", { name: /close|关闭/i }).click();
  const state = await page.evaluate(() => ({ body: document.body.style.overflow, html: document.documentElement.style.overflow }));
  expect(state).toEqual({ body: "", html: "" });
});
