import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function waitForApplication(page: Page): Promise<void> {
  await expect(page.locator(".app-shell")).toBeVisible();
  await expect(page.locator("header.app-header")).toBeVisible();
}

async function songRowsForViewport(page: Page, isMobile: boolean) {
  if (!isMobile) {
    const rows = page.locator(".sidebar.desktop .song-row");
    await expect(rows.first()).toBeVisible();
    return rows;
  }

  await page.getByRole("button", { name: /Open menu|打开菜单/i }).click();
  const rows = page.locator(".mobile-sidebar.open .song-row");
  await expect(rows.first()).toBeVisible();
  return rows;
}

test.beforeEach(async ({ page }) => {
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await waitForApplication(page);
});

test("loads a preset and renders the modern React application", async ({ page }) => {
  await expect(page.locator(".reader-card").first()).toBeVisible();
  await expect(page.locator("script[src*='react.production.min.js']")).toHaveCount(0);
  await expect(page.locator("script[src*='vendor']")).toHaveCount(0);
});

test("keeps the project title and tagline vertically separated", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop header spacing");
  const title = page.locator("header.app-header .brand-title");
  const subtitle = page.locator("header.app-header .brand-subtitle");
  await expect(title).toBeVisible();
  await expect(subtitle).toBeVisible();
  const titleBox = await title.boundingBox();
  const subtitleBox = await subtitle.boundingBox();
  expect(titleBox).not.toBeNull();
  expect(subtitleBox).not.toBeNull();
  expect(
    (subtitleBox?.y ?? 0) - ((titleBox?.y ?? 0) + (titleBox?.height ?? 0)),
  ).toBeGreaterThanOrEqual(1);
});

test("keeps exactly one static print portal as a direct body child", async ({ page }) => {
  const portal = page.locator("body > #print-portal");
  await expect(portal).toHaveCount(1);
  await expect(portal).toHaveAttribute("data-print-portal", "true");
  await expect(page.locator("#root #print-portal")).toHaveCount(0);
});

test("switches language and persists the user-selected UI locale", async ({ page }) => {
  const html = page.locator("html");

  // Start from a deterministic locale so browser language and catalog timing
  // cannot make this test race with the initial i18n request.
  await page.evaluate(() => localStorage.setItem("lyricbook-ui-locale", "en-US"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForApplication(page);
  await expect(html).toHaveAttribute("lang", "en");

  await page
    .locator("header.app-header")
    .getByRole("button", { name: /Language|语言/i })
    .click();

  await expect(html).toHaveAttribute("lang", "zh-CN");
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("lyricbook-ui-locale")))
    .toBe("zh-CN");

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForApplication(page);
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("lyricbook-ui-locale")))
    .toBe("zh-CN");
});

test("stacks each song title above its version and tag metadata", async ({ page, isMobile }) => {
  const rows = await songRowsForViewport(page, isMobile);
  const firstRow = rows.first();
  const title = firstRow.locator(".song-title");
  const meta = firstRow.locator(".song-meta");
  const titleBox = await title.boundingBox();
  const metaBox = await meta.boundingBox();
  expect(titleBox).not.toBeNull();
  expect(metaBox).not.toBeNull();
  expect(metaBox?.y ?? 0).toBeGreaterThan((titleBox?.y ?? 0) + (titleBox?.height ?? 0) - 1);
  await expect(meta.locator(".song-meta-tag").first()).toBeVisible();
});

test("cycles system, light, and dark appearance modes and persists the choice", async ({
  page,
}) => {
  await page.evaluate(() => localStorage.removeItem("lyricbook-appearance"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForApplication(page);
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-appearance", "system");

  const button = page
    .locator("header.app-header")
    .getByRole("button", { name: /Appearance|外观/i });
  await button.click();
  await expect(html).toHaveAttribute("data-appearance", "light");
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("lyricbook-appearance")))
    .toBe("light");

  await button.click();
  await expect(html).toHaveAttribute("data-appearance", "dark");
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("lyricbook-appearance")))
    .toBe("dark");
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

test("highlights the selected song without an inset left rail", async ({ page, isMobile }) => {
  let rows = await songRowsForViewport(page, isMobile);
  const secondTitle = (await rows.nth(1).locator(".song-title").innerText()).trim();

  await rows.nth(1).click();

  if (isMobile) {
    await expect(page.locator(".mobile-sidebar")).toHaveCount(0);
    await expect(page.locator(".reader-title").first()).toHaveText(secondTitle);
    rows = await songRowsForViewport(page, isMobile);
  }

  const first = rows.first();
  const second = rows.nth(1);
  await expect(second).toBeVisible();
  await expect(second).toHaveClass(/active/);
  await expect(first).not.toHaveClass(/active/);
  const styles = await second.evaluate((element) => {
    const computed = getComputedStyle(element);
    return { boxShadow: computed.boxShadow, transform: computed.transform };
  });
  expect(styles.boxShadow).not.toContain("inset");
  expect(styles.transform).not.toBe("none");
});

test("keeps breathing room between reader actions and the lyric panel", async ({ page }) => {
  const actions = page.locator(".reader-card > .inline-actions").first();
  const lyrics = page
    .locator(".reader-card > .lyric-layout, .reader-card > .lyric-placeholder")
    .first();
  await expect(actions).toBeVisible();
  await expect(lyrics).toBeVisible();
  const actionBox = await actions.boundingBox();
  const lyricBox = await lyrics.boundingBox();
  expect(actionBox).not.toBeNull();
  expect(lyricBox).not.toBeNull();
  expect(
    (lyricBox?.y ?? 0) - ((actionBox?.y ?? 0) + (actionBox?.height ?? 0)),
  ).toBeGreaterThanOrEqual(28);
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
