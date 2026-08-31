import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await expect(page.getByText("LyricBook", { exact: true }).first()).toBeVisible();
});

test("loads a preset and renders the modern React application", async ({ page }) => {
  await expect(page.locator(".reader-card").first()).toBeVisible();
  await expect(page.locator("script[src*='react.production.min.js']")).toHaveCount(0);
  await expect(page.locator("script[src*='vendor']")).toHaveCount(0);
});

test("keeps exactly one print portal as a direct body child", async ({ page }) => {
  await expect(page.locator("#print-portal")).toHaveCount(1);
  await expect(page.locator("body > #print-portal")).toHaveCount(1);
  await expect(page.locator("#root #print-portal")).toHaveCount(0);
});

test("switches language and keeps a user-selectable UI locale", async ({ page }) => {
  await page
    .getByRole("button", { name: /Language|语言/i })
    .last()
    .click();
  await expect(page.getByText("曲库", { exact: true })).toBeVisible();
});

test("immersive next-song navigation scrolls the next song to the top", async ({ page }) => {
  const immersive = page.getByRole("button", { name: /Immersive mode|沉浸模式/i }).first();
  await immersive.click();
  const shell = page.locator(".immersive-shell");
  await expect(shell).toBeVisible();
  await shell.evaluate((element) => element.scrollTo(0, element.scrollHeight));
  const next = page.locator(".immersive-shell .next-song-card");
  if (await next.count()) {
    await next.click();
    await expect.poll(() => shell.evaluate((element) => element.scrollTop)).toBeLessThan(10);
  }
});

test("mobile sidebar and setlist dialog release document scrolling", async ({ page, isMobile }) => {
  test.skip(!isMobile, "mobile-only regression");

  await page.getByRole("button", { name: /Open menu|打开菜单/i }).click();
  await expect(page.locator(".mobile-sidebar.open")).toBeVisible();

  // Reproduce the historic overlay handoff: close the sidebar, then open and close a Radix dialog.
  await page.getByRole("button", { name: /Close menu|关闭菜单/i }).click();
  await expect(page.locator(".mobile-sidebar.open")).toHaveCount(0);
  await page
    .getByRole("button", { name: /Setlist editor|演出歌单/i })
    .first()
    .click();
  await expect(page.locator("[role='dialog']")).toBeVisible();
  await page
    .getByRole("button", { name: /Close|关闭/i })
    .first()
    .click();
  await expect(page.locator("[role='dialog']")).toHaveCount(0);

  await expect
    .poll(() =>
      page.evaluate(() => ({
        bodyOverflow: document.body.style.overflow,
        bodyPosition: document.body.style.position,
        htmlOverflow: document.documentElement.style.overflow,
        locked: document.documentElement.dataset.scrollLocked ?? "",
      })),
    )
    .toEqual({ bodyOverflow: "", bodyPosition: "", htmlOverflow: "", locked: "" });

  await page.evaluate(() => window.scrollTo(0, 180));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
});

test("print studio creates measurable A4 pages without marked overflow", async ({ page }) => {
  await page
    .getByRole("button", { name: /Print|打印/i })
    .first()
    .click();
  await page.getByRole("button", { name: /Build preview|生成预览/i }).click();
  await expect(page.locator(".print-page.a4").first()).toBeVisible();
  await expect(page.locator("body > #print-portal .print-page.a4").first()).toBeAttached();

  const metrics = await page
    .locator("body > #print-portal .print-page-content")
    .evaluateAll((elements) =>
      elements.map((element) => ({
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        overflow: element.getAttribute("data-overflow"),
      })),
    );
  expect(metrics.length).toBeGreaterThan(0);
  expect(metrics.every((metric) => metric.clientHeight > 0)).toBe(true);
  expect(metrics.every((metric) => metric.overflow !== "true")).toBe(true);
});

test("has no serious accessibility violations", async ({ page }) => {
  const results = await new AxeBuilder({ page }).exclude("#print-portal").analyze();
  expect(
    results.violations.filter((violation) =>
      ["serious", "critical"].includes(violation.impact ?? ""),
    ),
  ).toEqual([]);
});
