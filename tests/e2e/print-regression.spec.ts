import { expect, type Locator, type Page, test } from "@playwright/test";
import {
  numberedLines,
  seedSyntheticProject,
  syntheticProject,
  syntheticSong,
} from "./print-fixtures";

const PORTAL = "body > #print-portal";

async function openPrintDialog(page: Page): Promise<Locator> {
  await page
    .getByRole("button", { name: /^(Print|打印)$/i })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: /^(Print|打印)$/i });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function settleBrowserLayout(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
}

async function buildCurrentSongPreview(page: Page, strategy = "balanced"): Promise<Locator> {
  const dialog = await openPrintDialog(page);
  await dialog.getByLabel(/Print scope|打印范围/i).selectOption("current-song");
  await dialog.getByLabel(/Print strategy|排版策略/i).selectOption(strategy);
  await dialog.getByLabel(/Include linked contents|包含可点击目录/i).uncheck();
  await dialog.getByRole("button", { name: /Build preview|生成预览/i }).click();
  await expect(page.locator(`${PORTAL} [data-page-kind="song"]`).first()).toBeAttached();
  await settleBrowserLayout(page);
  return dialog;
}

interface PageGeometry {
  root: string;
  pageNumber: string | null;
  pageHeightOverflow: number;
  pageWidthOverflow: number;
  innerHeightOverflow: number;
  innerWidthOverflow: number;
  contentHeightOverflow: number;
  contentWidthOverflow: number;
  bodyPastContent: number;
  footerGap: number;
  markedOverflow: boolean;
}

async function printableGeometry(page: Page, kind: "song" | "toc"): Promise<PageGeometry[]> {
  return page.evaluate(
    ({ pageKind, portalSelector }) => {
      const rootSelectors = [".print-preview-shell .print-preview-pages", portalSelector];
      const metrics: PageGeometry[] = [];
      for (const rootSelector of rootSelectors) {
        const root = document.querySelector(rootSelector);
        if (!root) continue;
        const pages = root.querySelectorAll<HTMLElement>(`[data-page-kind="${pageKind}"]`);
        for (const printedPage of pages) {
          const inner = printedPage.querySelector<HTMLElement>(".print-page-inner");
          const content = printedPage.querySelector<HTMLElement>(".print-page-content");
          const footer = printedPage.querySelector<HTMLElement>(".print-page-footer");
          if (!inner || !content || !footer) continue;
          const contentRect = content.getBoundingClientRect();
          const footerRect = footer.getBoundingClientRect();
          const body =
            pageKind === "song"
              ? printedPage.querySelector<HTMLElement>(".print-lyric-grid")
              : printedPage.querySelector<HTMLElement>(".print-toc-columns");
          const bodyBottom = body?.getBoundingClientRect().bottom ?? contentRect.top;
          metrics.push({
            root: rootSelector,
            pageNumber: printedPage.dataset.pageNumber ?? null,
            pageHeightOverflow: printedPage.scrollHeight - printedPage.clientHeight,
            pageWidthOverflow: printedPage.scrollWidth - printedPage.clientWidth,
            innerHeightOverflow: inner.scrollHeight - inner.clientHeight,
            innerWidthOverflow: inner.scrollWidth - inner.clientWidth,
            contentHeightOverflow: content.scrollHeight - content.clientHeight,
            contentWidthOverflow: content.scrollWidth - content.clientWidth,
            bodyPastContent: bodyBottom - contentRect.bottom,
            footerGap: footerRect.top - Math.min(bodyBottom, contentRect.bottom),
            markedOverflow:
              printedPage.matches(
                '[data-overflow="true"], [data-layout-safe="false"], [data-layout-status="unsafe"]',
              ) ||
              Boolean(
                printedPage.querySelector(
                  '[data-overflow="true"], [data-layout-safe="false"], [data-layout-status="unsafe"]',
                ),
              ),
          });
        }
      }
      return metrics;
    },
    { pageKind: kind, portalSelector: PORTAL },
  );
}

function expectSafeGeometry(metrics: PageGeometry[], expectedCopies: number): void {
  expect(metrics).toHaveLength(expectedCopies);
  for (const metric of metrics) {
    expect(
      metric.pageHeightOverflow,
      `${metric.root} page ${metric.pageNumber}`,
    ).toBeLessThanOrEqual(1);
    expect(
      metric.pageWidthOverflow,
      `${metric.root} page ${metric.pageNumber}`,
    ).toBeLessThanOrEqual(1);
    expect(
      metric.innerHeightOverflow,
      `${metric.root} page ${metric.pageNumber}`,
    ).toBeLessThanOrEqual(1);
    expect(
      metric.innerWidthOverflow,
      `${metric.root} page ${metric.pageNumber}`,
    ).toBeLessThanOrEqual(1);
    expect(
      metric.contentHeightOverflow,
      `${metric.root} content on page ${metric.pageNumber}`,
    ).toBeLessThanOrEqual(1);
    expect(
      metric.contentWidthOverflow,
      `${metric.root} content on page ${metric.pageNumber}`,
    ).toBeLessThanOrEqual(1);
    expect(
      metric.bodyPastContent,
      `${metric.root} body on page ${metric.pageNumber}`,
    ).toBeLessThanOrEqual(1);
    expect(metric.footerGap, `${metric.root} footer on page ${metric.pageNumber}`).toBeGreaterThan(
      1,
    );
    expect(metric.markedOverflow, `${metric.root} page ${metric.pageNumber}`).toBe(false);
  }
}

function expectEveryMarkerExactlyOnce(text: string, prefix: string, count: number): void {
  const markers = text.match(new RegExp(`${prefix}-\\d{3}`, "g")) ?? [];
  expect(markers).toHaveLength(count);
  expect(new Set(markers).size).toBe(count);
  expect(markers).toContain(`${prefix}-001`);
  expect(markers).toContain(`${prefix}-${String(count).padStart(3, "0")}`);
}

test("print studio exposes an accessible, non-repeating idle preview state", async ({ page }) => {
  const project = syntheticProject({
    songs: [syntheticSong("idle-song", "Idle state song", numberedLines("IDLE", 6))],
  });
  await seedSyntheticProject(page, project);
  const dialog = await openPrintDialog(page);

  await expect(
    dialog.getByRole("heading", { name: /Preview (?:has )?not (?:yet )?been generated/i }),
  ).toBeVisible();
  await expect(
    dialog.getByText(/Choose print options.*build a preview.*layout validation.*save (?:a )?PDF/i),
  ).toBeVisible();
  await expect(dialog.getByText("Build preview", { exact: true })).toHaveCount(1);
  await expect(dialog.getByRole("button", { name: /Print \/ Save PDF/i })).toBeDisabled();
});

test("short A4 lyrics grow above the readable minimum and keep a safe footer", async ({ page }) => {
  const project = syntheticProject({
    songs: [syntheticSong("short-song", "Six Lanterns", numberedLines("SHORT", 6))],
  });
  await seedSyntheticProject(page, project);
  const dialog = await buildCurrentSongPreview(page);
  await expect(dialog.getByRole("button", { name: /Print \/ Save PDF/i })).toBeEnabled({
    timeout: 15_000,
  });
  await settleBrowserLayout(page);

  const fontSizesInPoints = await page
    .locator(`${PORTAL} [data-page-kind="song"] .print-lyrics`)
    .evaluateAll((lyrics) =>
      lyrics.map((element) => Number.parseFloat(getComputedStyle(element).fontSize) * 0.75),
    );
  expect(fontSizesInPoints.length).toBeGreaterThan(0);
  expect(Math.min(...fontSizesInPoints)).toBeGreaterThanOrEqual(16);

  const geometry = await printableGeometry(page, "song");
  expectSafeGeometry(geometry, 2);
});

test("long lyrics paginate without losing markers or entering the footer", async ({ page }) => {
  const lineCount = 190;
  const project = syntheticProject({
    songs: [syntheticSong("long-song", "A Long Synthetic Sky", numberedLines("LONG", lineCount))],
  });
  await seedSyntheticProject(page, project);
  const dialog = await buildCurrentSongPreview(page);
  await expect(dialog.getByRole("button", { name: /Print \/ Save PDF/i })).toBeEnabled({
    timeout: 15_000,
  });

  const songPages = page.locator(`${PORTAL} [data-page-kind="song"]`);
  const pageCount = await songPages.count();
  expect(pageCount).toBeGreaterThan(1);
  const printedText = await songPages.locator(".print-lyrics").allTextContents();
  expectEveryMarkerExactlyOnce(printedText.join("\n"), "LONG", lineCount);

  const geometry = await printableGeometry(page, "song");
  expectSafeGeometry(geometry, pageCount * 2);
});

test("an unbroken Unicode lyric paginates safely without losing text", async ({ page }) => {
  const expectedText = "纸上灯火🌙".repeat(2_000);
  const project = syntheticProject({
    songs: [syntheticSong("unbroken-song", "One Continuous Synthetic Line", expectedText)],
  });
  await seedSyntheticProject(page, project);
  const dialog = await buildCurrentSongPreview(page);
  await expect(dialog.getByRole("button", { name: /Print \/ Save PDF/i })).toBeEnabled({
    timeout: 20_000,
  });

  const songPages = page.locator(`${PORTAL} [data-page-kind="song"]`);
  const pageCount = await songPages.count();
  expect(pageCount).toBeGreaterThan(1);
  expect((await songPages.locator(".print-lyrics").allTextContents()).join("")).toBe(expectedText);
  expectSafeGeometry(await printableGeometry(page, "song"), pageCount * 2);
});

test("A4 keeps independent original and translation tracks in safe parallel columns", async ({
  page,
}) => {
  const originalCount = 46;
  const translationCount = 39;
  const originalText = numberedLines("ORIGINAL", originalCount);
  const translationText = Array.from(
    { length: translationCount },
    (_, index) => `TRANSLATION-${String(index + 1).padStart(3, "0")} 合成灯火穿过纸上夜空`,
  ).join("\n");
  const song = syntheticSong("independent-bilingual", "Two Independent Lanterns", originalText, [
    {
      id: "original",
      language: "en",
      role: "original",
      text: originalText,
      label: { en: "Original", "zh-Hans": "原文" },
    },
    {
      id: "translation",
      language: "zh-Hans",
      role: "translation",
      text: translationText,
      label: { en: "Translation", "zh-Hans": "翻译" },
    },
  ]);
  await seedSyntheticProject(page, syntheticProject({ songs: [song] }));
  const dialog = await buildCurrentSongPreview(page);
  await expect(dialog.getByRole("button", { name: /Print \/ Save PDF/i })).toBeEnabled({
    timeout: 20_000,
  });

  const songPages = page.locator(`${PORTAL} [data-page-kind="song"]`);
  const pageCount = await songPages.count();
  expect(pageCount).toBeGreaterThan(0);
  await expect(songPages.first().locator(".print-song-content")).toHaveClass(/parallel-tracks/);
  const firstPageColumns = await songPages
    .first()
    .locator(".print-track")
    .evaluateAll((tracks) => ({
      count: tracks.length,
      lefts: tracks.map((track) => track.getBoundingClientRect().left),
      template: getComputedStyle(tracks[0]?.parentElement as Element).gridTemplateColumns,
    }));
  expect(firstPageColumns.count).toBe(2);
  expect(firstPageColumns.lefts[1] ?? 0).toBeGreaterThan(firstPageColumns.lefts[0] ?? 0);
  expect(firstPageColumns.template.trim().split(/\s+/)).toHaveLength(2);

  const text = (await songPages.locator(".print-lyrics").allTextContents()).join("\n");
  expectEveryMarkerExactlyOnce(text, "ORIGINAL", originalCount);
  expectEveryMarkerExactlyOnce(text, "TRANSLATION", translationCount);
  expectSafeGeometry(await printableGeometry(page, "song"), pageCount * 2);
});

test("strict page limits preserve extreme text and block unsafe printing", async ({ page }) => {
  const lineCount = 500;
  const project = syntheticProject({
    songs: [
      syntheticSong(
        "strict-song",
        "An Intentionally Impossible One Page Song",
        numberedLines("STRICT", lineCount),
      ),
    ],
  });
  await seedSyntheticProject(page, project);
  const dialog = await buildCurrentSongPreview(page, "strict-page-limit");

  const unsafeStatus = dialog.getByRole("status").filter({
    hasText: /unsafe|cannot fit safely|needs attention/i,
  });
  await expect(unsafeStatus).toBeVisible({ timeout: 15_000 });
  await expect(dialog.getByRole("button", { name: /Print \/ Save PDF/i })).toBeDisabled();

  const printedText = await page
    .locator(`${PORTAL} [data-page-kind="song"] .print-lyrics`)
    .allTextContents();
  expectEveryMarkerExactlyOnce(printedText.join("\n"), "STRICT", lineCount);
});

test("measured A5 contents paginate, wrap titles, and link to final song page numbers", async ({
  page,
}) => {
  test.slow();
  const songs = Array.from({ length: 52 }, (_, index) => {
    const sequence = String(index + 1).padStart(3, "0");
    return syntheticSong(
      `toc-song-${sequence}`,
      `Synthetic contents entry ${sequence} with several invented words for measured wrapping and footer safety`,
      `TOC-LYRIC-${sequence} invented line`,
    );
  });
  await seedSyntheticProject(page, syntheticProject({ songs, sectionSize: 13 }));
  const dialog = await openPrintDialog(page);
  await dialog.getByLabel(/Page format|页面格式/i).selectOption("a5");
  await dialog.getByRole("button", { name: /Build preview|生成预览/i }).click();
  await expect(page.locator(`${PORTAL} [data-page-kind="toc"]`).first()).toBeAttached();
  await expect(dialog.getByRole("button", { name: /Print \/ Save PDF/i })).toBeEnabled({
    timeout: 20_000,
  });
  await settleBrowserLayout(page);

  const tocPages = page.locator(`${PORTAL} [data-page-kind="toc"]`);
  const tocPageCount = await tocPages.count();
  expect(tocPageCount).toBeGreaterThan(1);

  const entries = page.locator(`${PORTAL} .print-toc-entry`);
  await expect(entries).toHaveCount(songs.length);
  const linkChecks = await page.locator(`${PORTAL} .print-preview-pages`).evaluate((root) =>
    Array.from(root.querySelectorAll<HTMLAnchorElement>(".print-toc-entry")).map((entry) => {
      const href = entry.getAttribute("href") ?? "";
      const target = href ? root.querySelector<HTMLElement>(href) : null;
      const title = entry.querySelector<HTMLElement>("span:nth-child(2)");
      const displayedPage = Number(entry.lastElementChild?.textContent ?? Number.NaN);
      return {
        href,
        targetPage: Number(target?.dataset.pageNumber ?? Number.NaN),
        displayedPage,
        titleClipped: title ? title.scrollWidth > title.clientWidth + 1 : true,
        titleEllipsized: title ? getComputedStyle(title).textOverflow === "ellipsis" : true,
      };
    }),
  );
  expect(new Set(linkChecks.map((entry) => entry.href)).size).toBe(songs.length);
  expect(linkChecks.every((entry) => entry.targetPage === entry.displayedPage)).toBe(true);
  expect(linkChecks.every((entry) => entry.targetPage > tocPageCount)).toBe(true);
  expect(linkChecks.every((entry) => !entry.titleClipped && !entry.titleEllipsized)).toBe(true);

  const geometry = await printableGeometry(page, "toc");
  expectSafeGeometry(geometry, tocPageCount * 2);
});

test("A4 contents keeps optional songs visible without creating a sparse continuation", async ({
  page,
}) => {
  const songs = Array.from({ length: 34 }, (_, index) =>
    syntheticSong(
      `optional-toc-${index + 1}`,
      `Invented lantern song ${String(index + 1).padStart(2, "0")}`,
      `OPTIONAL-TOC-${String(index + 1).padStart(3, "0")}`,
    ),
  );
  const project = syntheticProject({ songs, sectionSize: 7 });
  const setlist = project.setlists[0];
  if (!setlist) throw new Error("Expected synthetic setlist");
  const sections = setlist.items.filter((item) => item.type === "section");
  if (sections[1]?.type === "section") sections[1].optional = true;
  const firstSongItem = setlist.items.find(
    (item) => item.type === "song" && item.songId === songs[1]?.id,
  );
  if (firstSongItem?.type === "song") firstSongItem.optional = true;

  await seedSyntheticProject(page, project);
  const dialog = await openPrintDialog(page);
  await dialog.getByRole("button", { name: /Build preview|生成预览/i }).click();
  await expect(dialog.getByRole("button", { name: /Print \/ Save PDF/i })).toBeEnabled({
    timeout: 20_000,
  });

  const tocPages = page.locator(`${PORTAL} [data-page-kind="toc"]`);
  await expect(tocPages).toHaveCount(1);
  await expect(tocPages.getByText(/continued|续/u)).toHaveCount(0);
  await expect(tocPages.locator('[data-toc-optional="section"]')).toHaveCount(1);
  await expect(tocPages.locator('[data-toc-optional="entry"]')).toHaveCount(8);
  await expect(tocPages.locator(".print-toc-entry")).toHaveCount(34);
  expectSafeGeometry(await printableGeometry(page, "toc"), 2);
});

test("generated booklet cover keeps long copy inside three non-overlapping regions", async ({
  page,
}) => {
  const project = syntheticProject({
    songs: [syntheticSong("cover-song", "Cover song", numberedLines("COVER", 5))],
  });
  project.title = {
    en: "A Deliberately Long Synthetic Concert Notebook Title Without Hidden Clipping",
    "zh-Hans": "灯火穿过很长很长的纸上天空并照亮每一段合成演唱会歌词本标题",
  };
  project.description = {
    en: "A private, local booklet assembled from invented lines for cover geometry verification. ".repeat(
      2,
    ),
  };
  await seedSyntheticProject(page, project);
  const dialog = await openPrintDialog(page);
  await dialog.getByLabel(/Page format|页面格式/i).selectOption("booklet");
  await dialog.getByRole("button", { name: /Build preview|生成预览/i }).click();
  await expect(dialog.getByRole("button", { name: /Print \/ Save PDF/i })).toBeEnabled({
    timeout: 20_000,
  });

  const cover = page.locator(`${PORTAL} [data-page-kind="cover"]`).first();
  const geometry = await cover.evaluate((element) => {
    const pageRect = element.getBoundingClientRect();
    const frame = element.querySelector<HTMLElement>("[data-print-cover-frame]");
    const regions = Array.from(
      element.querySelectorAll<HTMLElement>(
        ".print-cover-header, .print-cover-copy, .print-cover-details",
      ),
    ).map((region) => region.getBoundingClientRect());
    const frameRect = frame?.getBoundingClientRect();
    return {
      count: regions.length,
      frameInside:
        Boolean(frameRect) &&
        (frameRect?.left ?? 0) >= pageRect.left &&
        (frameRect?.right ?? 0) <= pageRect.right &&
        (frameRect?.top ?? 0) >= pageRect.top &&
        (frameRect?.bottom ?? 0) <= pageRect.bottom,
      ordered: regions.every(
        (region, index) => index === 0 || region.top >= (regions[index - 1]?.bottom ?? 0) - 1,
      ),
      frameOverflow:
        frame &&
        (frame.scrollHeight > frame.clientHeight + 1 || frame.scrollWidth > frame.clientWidth + 1),
    };
  });
  expect(geometry).toEqual({ count: 3, frameInside: true, ordered: true, frameOverflow: false });
});

test("booklet keeps CJK, bilingual tracks, versions, and sectionless contents complete", async ({
  page,
}) => {
  const cjkTitle = "灯火越过很长很长的纸上天空并继续照亮每一段合成测试文字";
  const originalText = Array.from(
    { length: 28 },
    (_, index) => `中文-${String(index + 1).padStart(3, "0")} 合成灯火经过安静的纸上天空`,
  ).join("\n");
  const translationText = Array.from(
    { length: 28 },
    (_, index) => `TRANS-${String(index + 1).padStart(3, "0")} invented lights cross a quiet sky`,
  ).join("\n");
  const bilingual = syntheticSong("cjk-bilingual", cjkTitle, originalText, [
    {
      id: "original",
      language: "zh-Hans",
      role: "original",
      text: originalText,
      label: { en: "Original", "zh-Hans": "原文" },
    },
    {
      id: "translation",
      language: "en",
      role: "translation",
      text: translationText,
      label: { en: "Translation", "zh-Hans": "翻译" },
      alignedTo: "original",
    },
  ]);
  const multiVersion = syntheticSong(
    "multi-version",
    "Two Synthetic Arrangements",
    numberedLines("STUDIO", 18),
  );
  multiVersion.lyricVersions.push({
    id: "acoustic",
    label: { en: "Acoustic", "zh-Hans": "不插电" },
    kind: "acoustic",
    isDefault: false,
    tracks: [
      {
        id: "acoustic-original",
        language: "en",
        role: "original",
        text: numberedLines("ACOUSTIC", 22),
        label: { en: "Original", "zh-Hans": "原文" },
      },
    ],
  });
  const project = syntheticProject({ songs: [bilingual, multiVersion] });
  const setlist = project.setlists[0];
  if (!setlist) throw new Error("Expected a synthetic setlist");
  setlist.items = [
    { type: "song", songId: bilingual.id },
    { type: "song", songId: multiVersion.id },
  ];

  await seedSyntheticProject(page, project);
  const dialog = await openPrintDialog(page);
  await dialog.getByLabel(/Page format|页面格式/i).selectOption("booklet");
  await dialog.getByLabel(/Version output|版本输出/i).selectOption("all");
  await dialog.getByLabel(/Language output|语言输出/i).selectOption("all-tracks");
  await dialog.getByRole("button", { name: /Build preview|生成预览/i }).click();
  await expect(dialog.getByRole("button", { name: /Print \/ Save PDF/i })).toBeEnabled({
    timeout: 20_000,
  });

  const portal = page.locator(PORTAL);
  await expect(portal.getByText(cjkTitle, { exact: true }).first()).toBeAttached();
  await expect(portal.getByText(/Concert songs/i).first()).toBeAttached();
  await expect(portal.getByText("Acoustic", { exact: true })).toBeAttached();
  await expect(portal.getByText("Default", { exact: true })).toBeAttached();
  const songText = (await portal.locator(".print-lyrics").allTextContents()).join("\n");
  expectEveryMarkerExactlyOnce(songText, "TRANS", 28);
  expectEveryMarkerExactlyOnce(songText, "STUDIO", 18);
  expectEveryMarkerExactlyOnce(songText, "ACOUSTIC", 22);

  const songPageCount = await portal.locator('[data-page-kind="song"]').count();
  expect(songPageCount).toBeGreaterThanOrEqual(3);
  expectSafeGeometry(await printableGeometry(page, "song"), songPageCount * 2);
  const duplicateIds = await page.locator("body").evaluate((body) => {
    const counts = new Map<string, number>();
    for (const element of body.querySelectorAll<HTMLElement>("[id]")) {
      counts.set(element.id, (counts.get(element.id) ?? 0) + 1);
    }
    return [...counts].filter(([, count]) => count > 1).map(([id]) => id);
  });
  expect(duplicateIds).toEqual([]);
});
