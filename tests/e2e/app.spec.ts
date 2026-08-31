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

test("keeps exactly one static print portal as a direct body child", async ({ page }) => {
  const portal = page.locator("body > #print-portal");
  await expect(portal).toHaveCount(1);
  await expect(portal).toHaveAttribute("data-print-portal", "true");
  await expect(page.locator("#root #print-portal")).toHaveCount(0);
});

test("switches language and persists the user-selected UI locale", async ({ page }) => {
  const html = page.locator("html");
  const initialLanguage = await html.getAttribute("lang");
  const expectedLanguage = initialLanguage === "zh-CN" ? "en" : "zh-CN";
  const expectedStoredLocale = expectedLanguage === "zh-CN" ? "zh-CN" : "en-US";

  await page
    .getByRole("button", { name: /Language|语言/i })
    .last()
    .click();

  await expect(html).toHaveAttribute("lang", expectedLanguage);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("lyricbook-ui-locale")))
    .toBe(expectedStoredLocale);

  await page.reload();
  await expect(page.getByText("LyricBook", { exact: true }).first()).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", expectedLanguage);
});

test("immersive next-song navigation resets the next song to the top", async ({ page }) => {
  await page.addStyleTag({ content: ".immersive-content { min-height: 220vh; }" });
  await page
    .getByRole("button", { name: /Immersive mode|沉浸模式/i })
    .first()
    .click();

  const shell = page.locator(".immersive-shell");
  await expect(shell).toBeVisible();

  const next = shell.locator(".next-song-card");
  await expect(next).toBeVisible();
  const nextTitle = (await next.locator("strong").innerText()).trim();

  await shell.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect.poll(() => shell.evaluate((element) => element.scrollTop)).toBeGreaterThan(100);
  await next.click();

  await expect(shell.locator(".reader-title")).toHaveText(nextTitle);
  await expect.poll(() => shell.evaluate((element) => element.scrollTop)).toBeLessThanOrEqual(1);
});

test("mobile sidebar and setlist dialog release document scrolling", async ({ page, isMobile }) => {
  test.skip(!isMobile, "mobile-only regression");

  await expect(page.locator(".mobile-sidebar")).toHaveCount(0);
  await page.getByRole("button", { name: /Open menu|打开菜单/i }).click();

  const sidebar = page.locator(".mobile-sidebar.open");
  await expect(sidebar).toBeVisible();
  await sidebar.getByRole("button", { name: /Close menu|关闭菜单/i }).click();
  await expect(page.locator(".mobile-sidebar")).toHaveCount(0);

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

  const visiblePreview = page.locator(".print-preview-shell .print-page.a4").first();
  const printPortalPage = page.locator("body > #print-portal .print-page.a4").first();
  await expect(visiblePreview).toBeVisible();
  await expect(printPortalPage).toBeAttached();

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
  await expect(page.locator(".mobile-sidebar")).toHaveCount(0);
  const results = await new AxeBuilder({ page }).exclude("#print-portal").analyze();
  expect(
    results.violations.filter((violation) =>
      ["serious", "critical"].includes(violation.impact ?? ""),
    ),
  ).toEqual([]);
});
