import { expect, type Locator, type Page, test } from "@playwright/test";
import { seedSyntheticProject, syntheticProject, syntheticSong } from "./print-fixtures";

const PORTAL = "body > #print-portal";
const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2S9sAAAAASUVORK5CYII=",
  "base64",
);

async function openPrintDialog(page: Page): Promise<Locator> {
  await page
    .getByRole("button", { name: /^(Print|打印)$/i })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: /^(Print|打印)$/i });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function buildPreview(dialog: Locator, page: Page): Promise<void> {
  await dialog.getByRole("button", { name: /Build preview|生成预览/i }).click();
  await expect(page.locator(`${PORTAL} [data-page-kind="song"]`).first()).toBeAttached();
  await expect(
    dialog.getByRole("button", { name: /Print \/ Save PDF|打印／保存 PDF/i }),
  ).toBeEnabled({
    timeout: 20_000,
  });
}

async function pngFixture(
  page: Page,
  width: number,
  height: number,
  color: string,
): Promise<Buffer> {
  const dataUrl = await page.evaluate(
    ({ fixtureWidth, fixtureHeight, fixtureColor }) => {
      const canvas = document.createElement("canvas");
      canvas.width = fixtureWidth;
      canvas.height = fixtureHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas is unavailable");
      context.fillStyle = fixtureColor;
      context.fillRect(0, 0, fixtureWidth, fixtureHeight);
      return canvas.toDataURL("image/png");
    },
    { fixtureWidth: width, fixtureHeight: height, fixtureColor: color },
  );
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
}

async function delayCoverEncoding(page: Page, delays: number[]): Promise<void> {
  await page.evaluate((encodingDelays) => {
    const original = HTMLCanvasElement.prototype.toBlob;
    let call = 0;
    HTMLCanvasElement.prototype.toBlob = function delayedToBlob(callback, type, quality) {
      const delay = encodingDelays[call] ?? 0;
      call += 1;
      window.setTimeout(() => original.call(this, callback, type, quality), delay);
    };
  }, delays);
}

async function openTransferDialog(page: Page): Promise<Locator> {
  const header = page.locator("header.app-header");
  const directImport = header.getByRole("button", { name: /^(Import|导入)$/i });
  if (await directImport.isVisible()) {
    await directImport.click();
  } else {
    await header.getByRole("button", { name: /More actions|更多操作/i }).click();
    await page.getByRole("menuitem", { name: /^(Import|导入)$/i }).click();
  }
  const dialog = page.getByRole("dialog", { name: /Import \/ Export|导入 \/ 导出/i });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function storedProjectPrint(page: Page): Promise<{
  id: string;
  coverWidth?: number;
  coverMode?: string;
  lineFlow?: string;
}> {
  return await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("lyricbook", 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    const stored = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const request = database.transaction("state").objectStore("state").get("current");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result as Record<string, unknown>);
    });
    database.close();
    const preferences = stored.preferences as Record<string, unknown> | undefined;
    const print = preferences?.print as Record<string, unknown> | undefined;
    const cover = print?.coverImage as Record<string, unknown> | undefined;
    return {
      id: String(stored.id),
      coverWidth: cover ? Number(cover.width) : undefined,
      coverMode: typeof print?.coverMode === "string" ? print.coverMode : undefined,
      lineFlow: typeof print?.lineFlow === "string" ? print.lineFlow : undefined,
    };
  });
}

function compactNumberedLines(count: number): string {
  return Array.from(
    { length: count },
    (_, index) => `FLOW-${String(index + 1).padStart(3, "0")} glow`,
  ).join("\n");
}

test("automatic short-line flow uses slashes to preserve a larger safe type size", async ({
  page,
}) => {
  const lineCount = 80;
  await seedSyntheticProject(
    page,
    syntheticProject({
      songs: [
        syntheticSong("short-flow", "Eighty Small Lanterns", compactNumberedLines(lineCount)),
      ],
    }),
  );
  const dialog = await openPrintDialog(page);
  await dialog.getByLabel(/Print scope|打印范围/i).selectOption("current-song");
  await dialog.getByLabel(/Include linked contents|包含可点击目录/i).uncheck();
  await expect(dialog.getByLabel(/Short-line layout|短句排版/i)).toHaveValue("auto");
  await buildPreview(dialog, page);

  const automatic = page.locator(`${PORTAL} [data-page-kind="song"]`).first();
  await expect(automatic.locator('[data-line-flow="slash"]')).toBeAttached();
  const automaticText = await automatic.locator(".print-lyrics").allTextContents();
  expect(automaticText.join("\n")).toContain(" / ");
  const automaticMarkers = automaticText.join("\n").match(/FLOW-\d{3}/g) ?? [];
  expect(automaticMarkers).toHaveLength(lineCount);
  expect(new Set(automaticMarkers).size).toBe(lineCount);
  const automaticFont = await automatic
    .locator(".print-lyrics")
    .evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));

  await dialog.getByLabel(/Short-line layout|短句排版/i).selectOption("preserve");
  await buildPreview(dialog, page);
  const preserved = page.locator(`${PORTAL} [data-page-kind="song"]`).first();
  await expect(preserved.locator('[data-line-flow="preserve"]')).toBeAttached();
  const preservedFont = await preserved
    .locator(".print-lyrics")
    .evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  expect(automaticFont).toBeGreaterThan(preservedFont);
});

test("a private local booklet cover supports generated, image-only, and image-with-text modes", async ({
  page,
}) => {
  await seedSyntheticProject(
    page,
    syntheticProject({
      songs: [syntheticSong("cover-song", "Local Cover Song", "An invented printable line")],
    }),
  );
  let dialog = await openPrintDialog(page);
  await dialog.getByLabel(/Page format|页面格式/i).selectOption("booklet");
  await expect(dialog.getByLabel(/Generated cover|系统生成封面/i)).toBeChecked();
  await expect(dialog.getByLabel(/My image only|仅使用我的图片/i)).toBeDisabled();

  await dialog.getByLabel(/Choose cover image|选择封面图片/i).setInputFiles({
    name: "private-original-name.png",
    mimeType: "image/png",
    buffer: ONE_PIXEL_PNG,
  });
  await expect(dialog.getByText(/Local cover ready|本地封面已就绪/i)).toBeVisible();
  await expect(
    dialog.getByLabel(/My image \+ LyricBook text|我的图片＋LyricBook 文字/i),
  ).toBeChecked();
  await buildPreview(dialog, page);

  const cover = page.locator(`${PORTAL} [data-page-kind="cover"]`).first();
  await expect(cover.locator('[data-cover-mode="image-with-text"]')).toBeAttached();
  await expect(cover.locator("img[data-print-cover-image]")).toHaveJSProperty("complete", true);

  await dialog.getByLabel(/My image only|仅使用我的图片/i).check();
  await buildPreview(dialog, page);
  await expect(
    page.locator(`${PORTAL} [data-page-kind="cover"] [data-cover-mode="image"]`).first(),
  ).toBeAttached();
  await expect.poll(async () => (await storedProjectPrint(page)).coverMode).toBe("image");

  const readStoredCover = () =>
    page.evaluate(async () => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("lyricbook", 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
      const stored = await new Promise<Record<string, unknown>>((resolve, reject) => {
        const request = database.transaction("state").objectStore("state").get("current");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result as Record<string, unknown>);
      });
      database.close();
      const preferences = stored.preferences as Record<string, unknown>;
      const print = preferences.print as Record<string, unknown> | undefined;
      return (print?.coverImage as Record<string, unknown> | undefined) ?? null;
    });
  await expect.poll(readStoredCover).not.toBeNull();
  const storedCover = await readStoredCover();
  if (!storedCover) throw new Error("Expected the local cover to be persisted");
  expect(storedCover.dataUrl).toMatch(/^data:image\/jpeg;base64,/);
  expect(storedCover).not.toHaveProperty("name");
  expect(storedCover).not.toHaveProperty("fileName");

  await dialog.getByRole("button", { name: /^(Close|关闭)$/i }).click();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator(".app-shell")).toBeVisible();
  dialog = await openPrintDialog(page);
  await expect(dialog.getByLabel(/Page format|页面格式/i)).toHaveValue("booklet");
  await expect(dialog.getByLabel(/My image only|仅使用我的图片/i)).toBeChecked();
});

test("only the latest cover request may apply and it cannot roll back newer print options", async ({
  page,
}) => {
  await seedSyntheticProject(
    page,
    syntheticProject({
      songs: [syntheticSong("cover-race", "Cover Race", "An invented printable line")],
    }),
  );
  const first = await pngFixture(page, 1, 1, "#111111");
  const second = await pngFixture(page, 2, 1, "#eeeeee");
  const dialog = await openPrintDialog(page);
  await dialog.getByLabel(/Page format|页面格式/i).selectOption("booklet");
  await delayCoverEncoding(page, [900, 40]);

  const input = dialog.getByLabel(/Choose cover image|选择封面图片/i);
  await input.setInputFiles({ name: "first.png", mimeType: "image/png", buffer: first });
  await dialog.getByLabel(/Short-line layout|短句排版/i).selectOption("preserve");
  await expect(input).toBeEnabled({ timeout: 300 });
  await input.setInputFiles({ name: "second.png", mimeType: "image/png", buffer: second });

  await expect(dialog.getByText(/Local cover ready|本地封面已就绪/i)).toContainText("2 × 1");
  await page.waitForTimeout(1_000);
  await expect(dialog.getByText(/Local cover ready|本地封面已就绪/i)).toContainText("2 × 1");
  await expect(dialog.getByLabel(/Short-line layout|短句排版/i)).toHaveValue("preserve");
  await expect
    .poll(async () => await storedProjectPrint(page))
    .toMatchObject({
      coverWidth: 2,
      lineFlow: "preserve",
    });
});

test("a closed cover request cannot attach private image data to an imported project", async ({
  page,
}) => {
  await seedSyntheticProject(
    page,
    syntheticProject({
      songs: [syntheticSong("old-project", "Old Project Song", "An invented printable line")],
    }),
  );
  const pendingCover = await pngFixture(page, 1, 1, "#222222");
  const dialog = await openPrintDialog(page);
  await dialog.getByLabel(/Page format|页面格式/i).selectOption("booklet");
  await page.waitForTimeout(400);
  await delayCoverEncoding(page, [900]);
  await dialog.getByLabel(/Choose cover image|选择封面图片/i).setInputFiles({
    name: "old-private-cover.png",
    mimeType: "image/png",
    buffer: pendingCover,
  });
  await dialog.getByRole("button", { name: /^(Close|关闭)$/i }).click();

  const imported = syntheticProject({
    songs: [syntheticSong("clean-song", "Clean Song", "No private cover belongs here")],
  });
  imported.id = "clean-imported-project";
  imported.title = { en: "Clean Imported Project", "zh-Hans": "干净的导入项目" };
  const transfer = await openTransferDialog(page);
  await transfer.locator('input[type="file"]').setInputFiles({
    name: "clean-project.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(imported)),
  });
  await expect(transfer.getByText(/Project imported successfully|项目导入成功/i)).toBeVisible();

  await page.waitForTimeout(1_300);
  await expect
    .poll(async () => await storedProjectPrint(page))
    .toEqual({
      id: "clean-imported-project",
      coverWidth: undefined,
      coverMode: undefined,
      lineFlow: undefined,
    });
});
