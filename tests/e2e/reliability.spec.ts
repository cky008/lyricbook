import { expect, type Page, test } from "@playwright/test";
import { seedSyntheticProject, syntheticProject, syntheticSong } from "./print-fixtures";

async function waitForApplication(page: Page): Promise<void> {
  await expect(page.locator(".app-shell")).toBeVisible();
  await expect(page.locator("header.app-header")).toBeVisible();
}

async function openImport(page: Page, isMobile: boolean): Promise<void> {
  const header = page.locator("header.app-header");
  if (isMobile) {
    await header.getByRole("button", { name: /More actions|更多操作/i }).click();
    await page.getByRole("menuitem", { name: /^(Import|导入)$/i }).click();
  } else {
    await header.getByRole("button", { name: /^(Import|导入)$/i }).click();
  }
  await expect(page.getByRole("dialog", { name: /Import.*Export|导入.*导出/i })).toBeVisible();
}

async function openSetlist(page: Page, isMobile: boolean): Promise<void> {
  const header = page.locator("header.app-header");
  if (isMobile) {
    await header.getByRole("button", { name: /More actions|更多操作/i }).click();
    await page.getByRole("menuitem", { name: /Setlist editor|歌单编辑器/i }).click();
  } else {
    await header.getByRole("button", { name: /Setlist editor|歌单编辑器/i }).click();
  }
  await expect(page.getByRole("dialog", { name: /Setlist editor|歌单编辑器/i })).toBeVisible();
}

test("users can choose Markdown setlist editing and apply it back to structured controls", async ({
  page,
  isMobile,
}) => {
  await seedSyntheticProject(
    page,
    syntheticProject({
      songs: [syntheticSong("known-markdown-song", "Known Markdown Song", "Invented line")],
    }),
  );
  await openSetlist(page, isMobile);
  const dialog = page.getByRole("dialog", { name: /Setlist editor|歌单编辑器/i });
  await expect(dialog.getByRole("tab", { name: /Structured|结构化编辑/i })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await dialog.getByRole("tab", { name: "Markdown" }).click();
  const editor = dialog.getByRole("textbox", { name: /Setlist Markdown|歌单 Markdown/i });
  await editor.fill("## Main section\n- Known Markdown Song\n- New Local Song");
  await dialog.getByRole("button", { name: /Apply Markdown|应用 Markdown/i }).click();
  await expect(dialog.getByRole("status")).toContainText(/1 new song|1 首歌曲/i);

  await dialog.getByRole("tab", { name: /Structured|结构化编辑/i }).click();
  await expect(dialog.locator(".setlist-editor-row .song-title")).toHaveText([
    "Main section",
    "Known Markdown Song",
    "New Local Song",
  ]);
});

test("an imported project title and description remain editable and persist", async ({
  page,
  isMobile,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await waitForApplication(page);

  const imported = syntheticProject({
    songs: [syntheticSong("editable-project-song", "Invented Import", "A local invented line")],
  });
  imported.title = {
    en: "G.E.M. GLORIA Concert LyricBook (Migrated)",
    "zh-Hans": "G.E.M. GLORIA 演唱会歌词本（已迁移）",
  };
  imported.description = { en: "Imported synthetic project" };

  await openImport(page, isMobile);
  const dialog = page.getByRole("dialog", { name: /Import.*Export|导入.*导出/i });
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "synthetic-import.json",
    mimeType: "application/json",
    buffer: Buffer.from(`${JSON.stringify(imported)}\n`),
  });
  await expect(dialog.getByText(/Project imported successfully|项目导入成功/i)).toBeVisible();
  await dialog
    .locator(".dialog-footer")
    .getByRole("button", { name: /^(Close|关闭)$/i })
    .click();

  const title = page.getByLabel(/Project title|项目名称/i);
  const description = page.getByLabel(/Description|项目说明/i);
  await title.fill("G.E.M. GLORIA Concert LyricBook");
  await description.fill("Edited safely after a local import");
  await expect(title).toHaveValue("G.E.M. GLORIA Concert LyricBook");
  await expect(description).toHaveValue("Edited safely after a local import");
  await expect(page.locator(".app-shell")).toBeVisible();

  await expect
    .poll(() =>
      page.evaluate(async () => {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open("lyricbook", 1);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result);
        });
        const current = await new Promise<{ title?: Record<string, string> }>((resolve, reject) => {
          const request = database.transaction("state").objectStore("state").get("current");
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result);
        });
        database.close();
        return current.title?.en;
      }),
    )
    .toBe("G.E.M. GLORIA Concert LyricBook");

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForApplication(page);
  await expect(page.getByLabel(/Project title|项目名称/i)).toHaveValue(
    "G.E.M. GLORIA Concert LyricBook",
  );
  await expect(page.getByLabel(/Description|项目说明/i)).toHaveValue(
    "Edited safely after a local import",
  );
  expect(pageErrors).toEqual([]);
});

test("a normal reload ignores stale cached HTML that references removed hashes", async ({
  page,
  browserName,
  context,
}) => {
  test.skip(
    browserName !== "chromium",
    "service-worker cache lifecycle is covered once in Chromium",
  );
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await waitForApplication(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), {
          once: true,
        }),
      );
    }
    const stale = await caches.open("lyricbook-build-0.0.7-stale-test");
    const staleResponse = new Response(
      '<!doctype html><html><body data-stale-shell="true"><div id="root"></div><script type="module" src="./assets/index-deadbeef.js"></script></body></html>',
      { headers: { "Content-Type": "text/html" } },
    );
    await stale.put(location.href, staleResponse.clone());
    await stale.put(new URL("index.html", location.href), staleResponse);
  });

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForApplication(page);
  await expect(page.locator('body[data-stale-shell="true"]')).toHaveCount(0);
  await expect(page.locator("#root")).not.toBeEmpty();

  expect(
    await page.evaluate(async () => {
      const currentName = (await caches.keys()).find((name) =>
        name.startsWith("lyricbook-build-scope-"),
      );
      if (!currentName) throw new Error("Missing scoped application cache");
      return Boolean(await (await caches.open(currentName)).match(location.href));
    }),
  ).toBe(false);

  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForApplication(page);
  await expect(page.locator('body[data-stale-shell="true"]')).toHaveCount(0);
  await expect(page.locator("#root")).not.toBeEmpty();
});
