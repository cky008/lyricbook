import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { seedSyntheticProject, syntheticProject, syntheticSong } from "./print-fixtures";

const PORTAL = "body > #print-portal";
const REQUEST_IDS = ["gem-paint", "gem-distortion", "gem-let-you-know"];
const ENDING_IDS = ["gem-free-you", "gem-bubble", "gem-sky"];

function preparationFixture() {
  const preset = JSON.parse(
    readFileSync(new URL("../../content/presets/gem-gloria/project.json", import.meta.url), "utf8"),
  ) as {
    songs: Array<{ id: string; titles: Record<string, string> }>;
    setlists: ReturnType<typeof syntheticProject>["setlists"];
    activeSetlistId: string;
  };
  const songs = preset.songs.map((song) =>
    syntheticSong(
      song.id,
      song.titles["zh-Hans"] ?? song.titles.en ?? song.id,
      `SYNTHETIC-${song.id}-001 invented paper lantern\nSYNTHETIC-${song.id}-002 合成纸上星光`,
    ),
  );
  songs.push(syntheticSong("library-lantern", "Library Lantern", "LIBRARY ONLY invented text"));
  const project = syntheticProject({ songs });
  project.setlists = structuredClone(preset.setlists);
  for (const setlist of project.setlists) {
    for (const item of setlist.items) delete item.sourceRefs;
  }
  project.activeSetlistId = preset.activeSetlistId;
  return project;
}

async function openSetlist(page: Page, isMobile: boolean): Promise<Locator> {
  const header = page.locator("header.app-header");
  if (isMobile) {
    await header.getByRole("button", { name: /More actions|更多操作/i }).click();
    await page.getByRole("menuitem", { name: /Setlist editor|歌单编辑器/i }).click();
  } else {
    await header.getByRole("button", { name: /Setlist editor|歌单编辑器/i }).click();
  }
  const dialog = page.getByRole("dialog", { name: /Setlist editor|歌单编辑器/i });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function showLibrary(page: Page, isMobile: boolean): Promise<Locator> {
  if (isMobile) {
    await page
      .locator("header.app-header")
      .getByRole("button", { name: /Open menu|打开菜单/i })
      .click();
    return page.locator("aside.mobile-sidebar");
  }
  return page.locator("aside.sidebar.desktop");
}

async function closeLibrary(page: Page, isMobile: boolean): Promise<void> {
  if (isMobile) {
    await page
      .locator("aside.mobile-sidebar")
      .getByRole("button", { name: /Close menu|关闭菜单/i })
      .click();
  }
}

function membership(root: Locator, id: string): Locator {
  return root.locator(`.song-row[data-song-id="${id}"] .song-setlist-membership`);
}

test("library badges distinguish the Shenzhen programme, requests, and saved library-only songs", async ({
  page,
  isMobile,
}, testInfo) => {
  await seedSyntheticProject(page, preparationFixture());
  const library = await showLibrary(page, isMobile);
  for (const id of ENDING_IDS) {
    await expect(membership(library, id)).toHaveText("Main programme");
    await expect(membership(library, id)).toHaveAttribute("data-membership", "required");
  }
  for (const id of REQUEST_IDS) {
    await expect(membership(library, id)).toHaveText("Optional song");
  }
  await expect(membership(library, "library-lantern")).toHaveText("Library only");
  await expect(library.locator('[data-membership="required"]')).toHaveCount(39);
  await expect(library.locator('[data-membership="optional"]')).toHaveCount(3);
  await closeLibrary(page, isMobile);
  await page.evaluate(() => localStorage.setItem("lyricbook-ui-locale", "zh-CN"));
  await page.reload({ waitUntil: "domcontentloaded" });
  const setlistSummary = page.locator(".side-panels .panel").filter({
    has: page.getByRole("heading", { name: "当前歌单", exact: true }),
  });
  await expect(setlistSummary.locator(".panel-copy").first()).toContainText("已确认");
  await expect(setlistSummary.locator(".panel-copy").first()).not.toContainText("confirmed");
  const chineseLibrary = await showLibrary(page, isMobile);
  for (const id of ENDING_IDS) await expect(membership(chineseLibrary, id)).toHaveText("主流程");
  for (const id of REQUEST_IDS) await expect(membership(chineseLibrary, id)).toHaveText("可选曲目");
  await expect(membership(chineseLibrary, "library-lantern")).toHaveText("仅在曲库");
  if (["chromium", "iphone"].includes(testInfo.project.name)) {
    await chineseLibrary.locator('.song-row[data-song-id="gem-free-you"]').scrollIntoViewIfNeeded();
    const screenshot = testInfo.outputPath("programme-request-library-badges.png");
    await page.screenshot({ path: screenshot, animations: "disabled" });
    await testInfo.attach("Programme and request classifications", {
      path: screenshot,
      contentType: "image/png",
    });
  }
  await closeLibrary(page, isMobile);

  const dialog = await openSetlist(page, isMobile);
  await expect(dialog.getByLabel(/Active setlist|当前歌单/i)).toHaveValue(
    "gem-gloria-shenzhen-2026-preparation",
  );
  await dialog
    .getByLabel(/Active setlist|当前歌单/i)
    .selectOption("gem-gloria-shenzhen-2026-09-11-observed");
  await dialog
    .locator(".dialog-footer")
    .getByRole("button", { name: /^(Close|关闭)$/i })
    .click();
  const observedLibrary = await showLibrary(page, isMobile);
  for (const id of REQUEST_IDS) {
    await expect(membership(observedLibrary, id)).toHaveText("当晚实演");
  }
  await expect(observedLibrary.locator('[data-membership="optional"]')).toHaveCount(0);
  await expect(membership(observedLibrary, "library-lantern")).toHaveText("仅在曲库");
});

test("section optionality is visible, resets at the next section, and can be edited without clearing individual choices", async ({
  page,
  isMobile,
}, testInfo) => {
  const project = syntheticProject({
    songs: [
      syntheticSong("main-lantern", "Main Lantern", "MAIN invented line"),
      syntheticSong("inherited-lantern", "Inherited Lantern", "INHERITED invented line"),
      syntheticSong("individual-lantern", "Individual Lantern", "INDIVIDUAL invented line"),
      syntheticSong("ending-lantern", "Ending Lantern", "ENDING invented line"),
    ],
  });
  project.setlists[0].items = [
    { type: "section", id: "main", label: { en: "Main section" } },
    { type: "song", songId: "main-lantern" },
    { type: "section", id: "requests", label: { en: "Request section" }, optional: true },
    {
      type: "song",
      songId: "inherited-lantern",
      optional: false,
      note: { en: "This song was a request on one observed night." },
    },
    { type: "note", text: { en: "Request choices can change." } },
    { type: "song", songId: "individual-lantern", optional: true },
    { type: "section", id: "ending", label: { en: "Fixed ending" }, optional: false },
    { type: "song", songId: "ending-lantern" },
  ];
  await seedSyntheticProject(page, project);
  const dialog = await openSetlist(page, isMobile);
  const inherited = dialog.locator('.setlist-editor-row[data-item-index="3"]');
  const individual = dialog.locator('.setlist-editor-row[data-item-index="5"]');
  const ending = dialog.locator('.setlist-editor-row[data-item-index="7"]');
  const section = dialog.locator('.setlist-editor-row[data-item-index="2"]');
  await expect(inherited.locator(".song-setlist-membership")).toHaveText("Optional song");
  await expect(inherited.getByLabel("Optional song entry", { exact: true })).not.toBeChecked();
  await expect(inherited).toContainText("Optional because this section is optional.");
  await expect(inherited).toContainText("This song was a request on one observed night.");
  await expect(ending.locator(".song-setlist-membership")).toHaveText("Main programme");
  const accessibility = await new AxeBuilder({ page }).include(".dialog-content").analyze();
  expect(accessibility.violations).toEqual([]);
  if (["chromium", "iphone"].includes(testInfo.project.name)) {
    await inherited.scrollIntoViewIfNeeded();
    const screenshot = testInfo.outputPath("inherited-optional-editor.png");
    await page.screenshot({ path: screenshot, animations: "disabled" });
    await testInfo.attach("Inherited optionality and evidence note", {
      path: screenshot,
      contentType: "image/png",
    });
  }
  await section.getByLabel("Optional section", { exact: true }).uncheck();
  await expect(inherited.locator(".song-setlist-membership")).toHaveText("Main programme");
  await expect(individual.locator(".song-setlist-membership")).toHaveText("Optional song");
  await expect(individual.getByLabel("Optional song entry", { exact: true })).toBeChecked();
  await expect(ending.locator(".song-setlist-membership")).toHaveText("Main programme");
  await dialog
    .locator(".dialog-footer")
    .getByRole("button", { name: /^(Close|关闭)$/i })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        [document.body, document.documentElement].every(
          (element) => getComputedStyle(element).overflow !== "hidden",
        ),
      ),
    )
    .toBe(true);
  await expect(page.locator(".status-line").first()).toContainText(/Saved locally|已保存到本机/i);
  await page.reload({ waitUntil: "domcontentloaded" });
  const reopened = await openSetlist(page, isMobile);
  await expect(
    reopened.locator('.setlist-editor-row[data-item-index="3"] .song-setlist-membership'),
  ).toHaveText("Main programme");
  await expect(
    reopened.locator('.setlist-editor-row[data-item-index="5"] .song-setlist-membership'),
  ).toHaveText("Optional song");
});

async function assertPrintContent(page: Page, expectedIds: string[], optionalIds: string[]) {
  const portal = page.locator(PORTAL);
  await expect(portal.locator('[data-page-kind="song"]')).toHaveCount(expectedIds.length);
  await expect(portal.locator(".print-toc-entry")).toHaveCount(expectedIds.length);
  const links = await portal.locator(".print-toc-entry").evaluateAll((elements) =>
    elements.map((element) => {
      const href = element.getAttribute("href") ?? "";
      const target = document.getElementById(href.slice(1));
      return {
        songId: element.getAttribute("data-toc-song-id"),
        sequence: Number(element.firstElementChild?.textContent),
        displayedPage: Number(element.lastElementChild?.textContent),
        targetPage: Number(target?.getAttribute("data-page-number")),
        hasOptionalBadge: Boolean(element.querySelector('[data-toc-optional="entry"]')),
      };
    }),
  );
  links.sort((left, right) => left.sequence - right.sequence);
  expect(links.map((entry) => entry.songId)).toEqual(expectedIds);
  expect(links.filter((entry) => entry.hasOptionalBadge).map((entry) => entry.songId)).toEqual(
    optionalIds,
  );
  expect(
    links.every((entry) => entry.displayedPage === entry.targetPage && entry.targetPage > 0),
  ).toBe(true);
  for (const id of expectedIds) {
    await expect(portal.locator(`[id="print-song-${id}"] .print-lyrics`)).toContainText(
      `SYNTHETIC-${id}-001`,
    );
    await expect(portal.locator(`[id="print-song-${id}"] .print-lyrics`)).toContainText(
      `SYNTHETIC-${id}-002`,
    );
  }
  const unsafe = await portal
    .locator('[data-page-kind="song"], [data-page-kind="toc"]')
    .evaluateAll((pages) =>
      pages.flatMap((printedPage) => {
        const inner = printedPage.querySelector<HTMLElement>(".print-page-inner");
        const content = printedPage.querySelector<HTMLElement>(".print-page-content");
        const footer = printedPage.querySelector<HTMLElement>(".print-page-footer");
        const body = printedPage.querySelector<HTMLElement>(
          ".print-lyric-grid, .print-toc-columns",
        );
        const elements = [printedPage, inner, content];
        const unsafeBounds = elements.some(
          (element) =>
            !element ||
            element.scrollHeight > element.clientHeight + 1 ||
            element.scrollWidth > element.clientWidth + 1,
        );
        const bodyBottom = body?.getBoundingClientRect().bottom ?? Number.POSITIVE_INFINITY;
        const contentBottom = content?.getBoundingClientRect().bottom ?? 0;
        const footerTop = footer?.getBoundingClientRect().top ?? 0;
        const markedUnsafe = printedPage.getAttribute("data-layout-status") === "unsafe";
        return unsafeBounds ||
          bodyBottom > contentBottom + 1 ||
          footerTop - bodyBottom <= 1 ||
          markedUnsafe
          ? [printedPage.getAttribute("data-print-page-id")]
          : [];
      }),
    );
  expect(unsafe).toEqual([]);
}

for (const format of ["a4", "a5", "booklet"] as const) {
  test(`${format} prints only the three request songs optionally while retaining the fixed ending`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    const project = preparationFixture();
    const preparation = project.setlists.find(
      (setlist) => setlist.id === "gem-gloria-shenzhen-2026-preparation",
    );
    expect(
      preparation,
      "the default preset must expose a distinct future preparation list",
    ).toBeDefined();
    const songIds =
      preparation?.items
        .filter((item) => item.type === "song")
        .map((item) => String(item.songId)) ?? [];
    expect(songIds).toHaveLength(42);
    await seedSyntheticProject(page, project);
    await page
      .getByRole("button", { name: /^(Print|打印)$/i })
      .first()
      .click();
    const dialog = page.getByRole("dialog", { name: /^(Print|打印)$/i });
    await dialog.getByLabel(/Page format|页面格式/i).selectOption(format);
    await dialog.getByLabel(/Print scope|打印范围/i).selectOption("active-setlist");
    await dialog.getByLabel(/Include optional songs|包含可选曲目/i).uncheck();
    await dialog.getByRole("button", { name: /Build preview|生成预览/i }).click();
    await expect(
      dialog.getByRole("button", { name: /Print \/ Save PDF|打印／保存 PDF/i }),
    ).toBeEnabled({ timeout: 30_000 });
    const required = songIds.filter((id) => !REQUEST_IDS.includes(id));
    expect(required).toHaveLength(39);
    await assertPrintContent(page, required, []);
    for (const id of REQUEST_IDS)
      await expect(page.locator(`${PORTAL} [id="print-song-${id}"]`)).toHaveCount(0);
    for (const id of ENDING_IDS)
      await expect(page.locator(`${PORTAL} [id="print-song-${id}"]`)).toHaveCount(1);
    await dialog.getByLabel(/Include optional songs|包含可选曲目/i).check();
    await dialog.getByRole("button", { name: /Build preview|生成预览/i }).click();
    await expect(
      dialog.getByRole("button", { name: /Print \/ Save PDF|打印／保存 PDF/i }),
    ).toBeEnabled({ timeout: 30_000 });
    await assertPrintContent(page, songIds, REQUEST_IDS);
    // Exercise the actual final audit and @page setup without opening a native dialog.
    await page.evaluate(() => {
      window.print = () => {
        document.documentElement.dataset.testPrintCalled = "true";
      };
    });
    await dialog.getByRole("button", { name: /Print \/ Save PDF|打印／保存 PDF/i }).click();
    await expect(page.locator("html")).toHaveAttribute("data-test-print-called", "true");
    const paper =
      format === "booklet" ? "A4 landscape" : format === "a5" ? "A5 portrait" : "A4 portrait";
    await expect(page.locator("head #lyricbook-page-style")).toHaveJSProperty(
      "textContent",
      `@page { size: ${paper}; margin: 0; }`,
    );
    if (testInfo.project.name === "chromium") {
      const screenshot = testInfo.outputPath(`synthetic-shenzhen-${format}-contents.png`);
      await page
        .locator('.print-preview-shell [data-page-kind="toc"]')
        .first()
        .screenshot({ path: screenshot, animations: "disabled" });
      await testInfo.attach(`${format} contents with request labels`, {
        path: screenshot,
        contentType: "image/png",
      });
      const pdf = testInfo.outputPath(`synthetic-shenzhen-${format}.pdf`);
      await page.pdf({ path: pdf, preferCSSPageSize: true, printBackground: true });
      await testInfo.attach(`${format} synthetic printable evidence`, {
        path: pdf,
        contentType: "application/pdf",
      });
    }
  });
}
