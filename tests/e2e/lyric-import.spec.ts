import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { strToU8, zipSync } from "fflate";
import { seedSyntheticProject, syntheticProject, syntheticSong } from "./print-fixtures";

type FixtureProject = ReturnType<typeof syntheticProject>;

// Preset responses are synthetic; the dedicated offline suite covers Service Worker caching.
test.use({ serviceWorkers: "block" });

function importProjects(): { current: FixtureProject; incoming: FixtureProject } {
  const current = syntheticProject({
    songs: [
      syntheticSong("shared-song", "Shared Lantern", ""),
      syntheticSong("new-song", "New Paper Moon", ""),
    ],
  });
  current.id = "current-concert";
  current.title = { en: "Current Concert", "zh-Hans": "新版演出" };
  current.activeSetlistId = "new-concert-order";
  current.setlists[0].id = current.activeSetlistId;
  current.setlists[0].items = [
    { type: "song", songId: "new-song" },
    { type: "song", songId: "shared-song" },
  ];
  current.preferences.activeSongId = "shared-song";

  const shared = syntheticSong("shared-song", "Shared Lantern", "ORIGINAL invented lantern");
  shared.lyricVersions[0].tracks.push({
    id: "translation",
    role: "translation",
    language: "zh-Hans",
    text: "TRANSLATION 合成灯笼",
    alignedTo: "original",
  });
  shared.lyricVersions.push({
    id: "acoustic",
    kind: "acoustic",
    label: { en: "Acoustic", "zh-Hans": "原声版" },
    isDefault: false,
    tracks: [
      { id: "acoustic-original", role: "original", language: "en", text: "ACOUSTIC invented moon" },
    ],
  });
  const incoming = syntheticProject({
    songs: [shared, syntheticSong("old-only-song", "Old Library Lantern", "OLD invented river")],
  });
  incoming.id = "old-concert";
  incoming.title = { en: "Old Concert", "zh-Hans": "旧版演出" };
  incoming.themes[0] = { ...incoming.themes[0], id: "old-concert-theme" };
  incoming.activeThemeId = incoming.themes[0].id;
  return { current, incoming };
}

async function openImport(page: Page, isMobile: boolean): Promise<Locator> {
  const header = page.locator("header.app-header");
  if (isMobile) {
    await header.getByRole("button", { name: /More actions|更多操作/i }).click();
    await page.getByRole("menuitem", { name: /^(Import|导入)$/i }).click();
  } else {
    await header.getByRole("button", { name: /^(Import|导入)$/i }).click();
  }
  const dialog = page.getByRole("dialog", { name: /Import.*Export|导入.*导出/i });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function storedProject(page: Page): Promise<FixtureProject> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("lyricbook", 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    const current = await new Promise<FixtureProject>((resolve, reject) => {
      const request = database.transaction("state").objectStore("state").get("current");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    database.close();
    return current;
  });
}

function archiveFile(project: FixtureProject) {
  return {
    name: "synthetic-old-concert.lyricbook",
    mimeType: "application/vnd.iocky.lyricbook+zip",
    buffer: Buffer.from(
      zipSync({
        "manifest.json": strToU8(JSON.stringify({ format: "lyricbook-project", formatVersion: 1 })),
        "project.json": strToU8(JSON.stringify(project)),
      }),
    ),
  };
}

test("archive lyric merge keeps the new concert order and survives reload and repeated imports", async ({
  page,
  isMobile,
}, testInfo) => {
  const { current, incoming } = importProjects();
  await seedSyntheticProject(page, current);
  const dialog = await openImport(page, isMobile);
  await dialog.locator('input[type="file"]').setInputFiles(archiveFile(incoming));
  const merge = dialog.getByRole("button", { name: "Merge lyrics and keep setlists", exact: true });
  await expect(merge).toBeVisible();
  if (testInfo.project.name === "chromium" || testInfo.project.name === "iphone") {
    const screenshot = testInfo.outputPath("import-preview.png");
    await page.screenshot({ path: screenshot, animations: "disabled" });
    await testInfo.attach("Synthetic import preview", {
      path: screenshot,
      contentType: "image/png",
    });
  }
  expect((await storedProject(page)).id).toBe(current.id);
  expect((await storedProject(page)).songs[0].lyricVersions[0].tracks[0].text).toBe("");
  await merge.click();
  await expect.poll(async () => (await storedProject(page)).songs.length).toBe(3);
  const merged = await storedProject(page);
  expect(merged.id).toBe(current.id);
  expect(merged.activeSetlistId).toBe(current.activeSetlistId);
  expect(merged.setlists).toEqual(current.setlists);
  expect(merged.activeThemeId).toBe(current.activeThemeId);
  expect(merged.themes).toMatchObject(current.themes);
  expect(merged.songs.find((song) => song.id === "shared-song")?.lyricVersions).toEqual(
    incoming.songs[0].lyricVersions,
  );
  expect(merged.songs.find((song) => song.id === "old-only-song")?.lyricVersions).toEqual(
    incoming.songs[1].lyricVersions,
  );
  await dialog
    .locator(".dialog-footer")
    .getByRole("button", { name: /^(Close|关闭)$/i })
    .click();
  await expect(page.locator(".reader-card")).toContainText("ORIGINAL invented lantern");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator(".reader-card")).toContainText("ORIGINAL invented lantern");
  const reopened = await openImport(page, isMobile);
  await reopened.locator('input[type="file"]').setInputFiles(archiveFile(incoming));
  await reopened
    .getByRole("button", { name: "Merge lyrics and keep setlists", exact: true })
    .click();
  await expect(
    reopened.getByRole("status").filter({ hasText: /Lyrics merged|歌词已合并/i }),
  ).toBeVisible();
  const repeated = await storedProject(page);
  expect(repeated.songs).toEqual(merged.songs);
  expect(repeated.setlists).toEqual(merged.setlists);
});

test("project import preview can cancel or replace only after explicit confirmation", async ({
  page,
  isMobile,
}) => {
  const { current, incoming } = importProjects();
  await seedSyntheticProject(page, current);
  const dialog = await openImport(page, isMobile);
  const file = {
    name: "synthetic-old-project.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(incoming)),
  };
  await dialog.locator('input[type="file"]').setInputFiles(file);
  await expect(
    dialog.getByRole("button", { name: "Merge lyrics and keep setlists", exact: true }),
  ).toBeVisible();
  const accessibility = await new AxeBuilder({ page }).include(".dialog-content").analyze();
  expect(accessibility.violations).toEqual([]);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "Merge lyrics and keep setlists", exact: true }),
  ).toHaveCount(0);
  expect((await storedProject(page)).id).toBe(current.id);

  await dialog.locator('input[type="file"]').setInputFiles(file);
  page.once("dialog", (confirmation) => confirmation.dismiss());
  await dialog.getByRole("button", { name: "Replace entire project", exact: true }).click();
  expect((await storedProject(page)).id).toBe(current.id);
  page.once("dialog", (confirmation) => confirmation.accept());
  await dialog.getByRole("button", { name: "Replace entire project", exact: true }).click();
  await expect.poll(async () => (await storedProject(page)).id).toBe(incoming.id);
  await dialog
    .locator(".dialog-footer")
    .getByRole("button", { name: /^(Close|关闭)$/i })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() =>
        [document.body, document.documentElement].every(
          (element) => getComputedStyle(element).overflow !== "hidden",
        ),
      ),
    )
    .toBe(true);
});

test("choosing an updated preset carries existing lyrics into the new setlist", async ({
  page,
  isMobile,
}) => {
  const { current, incoming } = importProjects();
  await seedSyntheticProject(page, incoming);
  await page.route("**/content/presets/gem-gloria/project.json", (route) =>
    route.fulfill({ json: current }),
  );
  const dialog = await openImport(page, isMobile);
  await dialog.getByRole("button", { name: "G.E.M. GLORIA", exact: true }).click();
  await expect.poll(async () => (await storedProject(page)).id).toBe(current.id);
  const loaded = await storedProject(page);
  expect(loaded.setlists).toEqual(current.setlists);
  expect(loaded.activeSetlistId).toBe(current.activeSetlistId);
  expect(loaded.activeThemeId).toBe(current.activeThemeId);
  expect(loaded.songs.find((song) => song.id === "shared-song")?.lyricVersions).toEqual(
    incoming.songs[0].lyricVersions,
  );
  expect(loaded.songs.find((song) => song.id === "old-only-song")?.lyricVersions).toEqual(
    incoming.songs[1].lyricVersions,
  );
});

test("legacy backups merge title-matched versions while retaining the current concert", async ({
  page,
  isMobile,
}) => {
  const { current } = importProjects();
  await seedSyntheticProject(page, current);
  await page.route("**/content/presets/gem-gloria/project.json", (route) =>
    route.fulfill({ json: current }),
  );
  const dialog = await openImport(page, isMobile);
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "synthetic-legacy-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        format: "gem-lyricbook-backup-v4",
        titles: { "song-001": "Shared Lantern" },
        state: {
          lyricLibrary: {
            "song-001": {
              defaultVersionId: "live",
              versions: [
                {
                  id: "live",
                  name: "Synthetic Live",
                  type: "live",
                  original: "LEGACY invented lantern",
                  translation: "LEGACY 合成翻译",
                  lineAligned: true,
                },
              ],
            },
          },
          activeSetlistId: "old-legacy-setlist",
          setlists: [
            {
              id: "old-legacy-setlist",
              name: "Old synthetic order",
              sections: [{ name: "Old section", items: [{ songId: "song-001" }] }],
            },
          ],
        },
      }),
    ),
  });
  await dialog.getByRole("button", { name: "Merge lyrics and keep setlists", exact: true }).click();
  await expect
    .poll(async () =>
      (await storedProject(page)).songs
        .find((song) => song.id === "shared-song")
        ?.lyricVersions.flatMap((version) => version.tracks.map((track) => track.text)),
    )
    .toEqual(["LEGACY invented lantern", "LEGACY 合成翻译"]);
  const merged = await storedProject(page);
  expect(merged.id).toBe(current.id);
  expect(merged.setlists).toEqual(current.setlists);
  expect(merged.activeSetlistId).toBe(current.activeSetlistId);
  expect(merged.songs.map((song) => song.id)).toEqual(current.songs.map((song) => song.id));
  expect(
    merged.songs.find((song) => song.id === "shared-song")?.lyricVersions[0].tracks[1],
  ).toMatchObject({
    role: "translation",
    alignedTo: "original",
  });
});

test("invalid project input clears a pending preview and leaves the saved project untouched", async ({
  page,
  isMobile,
}) => {
  const { current, incoming } = importProjects();
  await seedSyntheticProject(page, current);
  const dialog = await openImport(page, isMobile);
  await dialog.locator('input[type="file"]').setInputFiles(archiveFile(incoming));
  await expect(
    dialog.getByRole("button", { name: "Merge lyrics and keep setlists", exact: true }),
  ).toBeVisible();
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "invalid-project.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ schemaVersion: 1, id: "broken", songs: [] })),
  });
  await expect(dialog.locator(".notice.error")).toContainText(/Import failed|导入失败/i);
  await expect(
    dialog.getByRole("button", { name: "Merge lyrics and keep setlists", exact: true }),
  ).toHaveCount(0);
  const unchanged = await storedProject(page);
  expect(unchanged.id).toBe(current.id);
  expect(unchanged.songs).toEqual(current.songs);
  expect(unchanged.setlists).toEqual(current.setlists);
});

test("a slow required backup keeps import modal until the merged project is stored", async ({
  page,
  isMobile,
}) => {
  const { current, incoming } = importProjects();
  await seedSyntheticProject(page, current);
  const dialog = await openImport(page, isMobile);
  await dialog.locator('input[type="file"]').setInputFiles(archiveFile(incoming));
  await expect(
    dialog.getByRole("button", { name: "Merge lyrics and keep setlists", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    const addListener = IDBRequest.prototype.addEventListener;
    IDBRequest.prototype.addEventListener = function (type, listener, options) {
      if (
        type === "success" &&
        this.source instanceof IDBObjectStore &&
        this.source.name === "backups"
      ) {
        return addListener.call(
          this,
          type,
          (event) => {
            window.setTimeout(() => {
              if (typeof listener === "function") listener.call(this, event);
              else listener?.handleEvent(event);
            }, 1_500);
          },
          options,
        );
      }
      return addListener.call(this, type, listener, options);
    };
  });
  await dialog.getByRole("button", { name: "Merge lyrics and keep setlists", exact: true }).click();
  await expect(
    dialog.getByRole("status").filter({ hasText: "Saving your project and backup" }),
  ).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Close", exact: true }).first()).toBeDisabled();
  await expect(
    dialog.locator(".dialog-footer").getByRole("button", { name: "Close", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  expect((await storedProject(page)).id).toBe(current.id);
  await expect(dialog.getByRole("status").filter({ hasText: "Lyrics merged" })).toBeVisible();
  await dialog
    .locator(".dialog-footer")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator(".reader-card")).toContainText("ORIGINAL invented lantern");
  const merged = await storedProject(page);
  expect(merged.id).toBe(current.id);
  expect(merged.setlists).toEqual(current.setlists);
  expect(merged.songs).toHaveLength(3);
});
