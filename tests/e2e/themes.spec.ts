import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { seedSyntheticProject, syntheticProject, syntheticSong } from "./print-fixtures";

const MOBILE_THEME_WIDTHS = [320, 393, 430] as const;
const MOONLIT_PAPER_THEME = {
  id: "builtin-moonlit-paper",
  name: { "zh-Hans": "月白宣纸", en: "Moonlit Paper" },
  tokens: {
    accent: "#aebfd5",
    accent2: "#c9a86a",
    background: "#161b24",
    surface: "#202733",
    surfaceStrong: "#2b3442",
    text: "#f2f0e9",
    muted: "#bbc0c8",
    radius: "12px",
    density: 0.9,
    headingFont: "serif",
    bodyFont: "serif",
  },
  print: {
    accent: "#667c9e",
    paper: "#f8f6ee",
    text: "#1b2028",
    headingStyle: "classic",
  },
  style: { surface: "solid", elevation: "flat", ornament: "none" },
};

async function openThemeDialog(page: Page, isMobile: boolean): Promise<Locator> {
  const header = page.locator("header.app-header");
  if (isMobile) {
    await header.getByRole("button", { name: /More actions|更多操作/i }).click();
    await page.getByRole("menuitem", { name: /Theme editor|主题编辑器/i }).click();
  } else {
    await header.getByRole("button", { name: /Theme editor|主题编辑器/i }).click();
  }
  const dialog = page.getByRole("dialog", { name: /Theme editor|主题编辑器/i });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function openTransferDialog(page: Page, isMobile: boolean): Promise<Locator> {
  const header = page.locator("header.app-header");
  if (isMobile) {
    await header.getByRole("button", { name: /More actions|更多操作/i }).click();
    await page.getByRole("menuitem", { name: /^(Import|导入)$/i }).click();
  } else {
    await header.getByRole("button", { name: /^(Import|导入)$/i }).click();
  }
  const dialog = page.getByRole("dialog", { name: /Import \/ Export|导入 \/ 导出/i });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function storedThemeState(page: Page): Promise<{ active?: string; ids: string[] }> {
  return await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("lyricbook", 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    const project = await new Promise<{ activeThemeId?: string; themes?: Array<{ id: string }> }>(
      (resolve, reject) => {
        const request = database.transaction("state").objectStore("state").get("current");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      },
    );
    database.close();
    return { active: project.activeThemeId, ids: (project.themes ?? []).map((theme) => theme.id) };
  });
}

async function inspectThemeDialogLayout(dialog: Locator) {
  return await dialog.evaluate((element) => {
    const root = element as HTMLElement;
    const tolerance = 1;
    const describe = (node: HTMLElement) => {
      const name = node.getAttribute("aria-label") ?? node.textContent?.trim() ?? "";
      return `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ""}${
        node.className ? `.${node.className.toString().trim().replaceAll(/\s+/g, ".")}` : ""
      }${name ? ` (${name.replaceAll(/\s+/g, " ")})` : ""}`;
    };
    const isVisible = (node: HTMLElement) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        rect.width > 0 &&
        rect.height > 0
      );
    };
    const controlHorizontalIssues = [...root.querySelectorAll<HTMLElement>("button, input, select")]
      .filter(isVisible)
      .flatMap((control) => {
        const boundary = control.closest<HTMLElement>(".theme-card") ?? root;
        const controlRect = control.getBoundingClientRect();
        const boundaryRect = boundary.getBoundingClientRect();
        return controlRect.left < boundaryRect.left - tolerance ||
          controlRect.right > boundaryRect.right + tolerance
          ? [
              `${describe(control)} is ${controlRect.left.toFixed(1)}-${controlRect.right.toFixed(
                1,
              )} within ${describe(boundary)} at ${boundaryRect.left.toFixed(
                1,
              )}-${boundaryRect.right.toFixed(1)}`,
            ]
          : [];
      });
    const cardTextIssues = [
      ...root.querySelectorAll<HTMLElement>(
        ".theme-card-title strong, .theme-card-title > span, .theme-card-meta > span, .theme-card-copy",
      ),
    ]
      .filter(isVisible)
      .flatMap((text) => {
        const card = text.closest<HTMLElement>(".theme-card");
        if (!card) return [];
        const textRect = text.getBoundingClientRect();
        const cardRect = card.getBoundingClientRect();
        const overflowsOwnBox = text.scrollWidth > text.clientWidth + tolerance;
        const escapesCard =
          textRect.left < cardRect.left - tolerance || textRect.right > cardRect.right + tolerance;
        return overflowsOwnBox || escapesCard
          ? [
              `${describe(text)} has scroll/client width ${text.scrollWidth}/${text.clientWidth} ` +
                `and bounds ${textRect.left.toFixed(1)}-${textRect.right.toFixed(1)} within card ` +
                `${cardRect.left.toFixed(1)}-${cardRect.right.toFixed(1)}`,
            ]
          : [];
      });
    const documentElement = document.documentElement;
    const body = document.body;

    return {
      bodyClientWidth: body.clientWidth,
      bodyScrollWidth: body.scrollWidth,
      cardTextIssues,
      controlHorizontalIssues,
      dialogClientWidth: root.clientWidth,
      dialogScrollWidth: root.scrollWidth,
      documentClientWidth: documentElement.clientWidth,
      documentScrollWidth: documentElement.scrollWidth,
    };
  });
}

test("crafted themes remain accessible, responsive, and persist only after selection", async ({
  page,
  isMobile,
}) => {
  await seedSyntheticProject(
    page,
    syntheticProject({
      songs: [syntheticSong("theme-song", "A Theme Song", "One invented line")],
    }),
  );
  const dialog = await openThemeDialog(page, isMobile);
  await expect(dialog.locator(".theme-card")).toHaveCount(5);
  await expect(dialog.getByLabel("Accent color picker", { exact: true })).toHaveAttribute(
    "type",
    "color",
  );
  await expect(dialog.getByRole("textbox", { name: "Accent value", exact: true })).toHaveValue(
    "#6a4c93",
  );

  const geometry = await dialog.evaluate((element) => {
    const cards = [...element.querySelectorAll<HTMLElement>(".theme-card")];
    const dialogRect = element.getBoundingClientRect();
    const grid = element.querySelector<HTMLElement>(".theme-gallery");
    return {
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      columns: grid ? getComputedStyle(grid).gridTemplateColumns.split(" ").length : 0,
      cardsInside: cards.every((card) => {
        const rect = card.getBoundingClientRect();
        return rect.left >= dialogRect.left - 1 && rect.right <= dialogRect.right + 1;
      }),
    };
  });
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
  expect(geometry.cardsInside).toBe(true);
  if (isMobile) expect(geometry.columns).toBe(1);
  else expect(geometry.columns).toBeGreaterThanOrEqual(2);

  const accessibility = await new AxeBuilder({ page }).include(".dialog-content").analyze();
  expect(accessibility.violations).toEqual([]);

  const inkJadeAction = dialog.getByRole("button", {
    name: /Use theme: Ink Jade|使用主题[:：] 墨玉/i,
  });
  await inkJadeAction.focus();
  const focusIndicator = await inkJadeAction.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      color: style.color,
      outlineColor: style.outlineColor,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
    };
  });
  expect(focusIndicator.outlineColor).toBe(focusIndicator.color);
  expect(focusIndicator.outlineStyle).toBe("solid");
  expect(focusIndicator.outlineWidth).toBe("3px");

  await inkJadeAction.click();
  await expect(
    dialog.getByRole("button", { name: /Use theme: Ink Jade|使用主题[:：] 墨玉/i }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("html")).toHaveAttribute("data-theme-ornament", "ink-wash");
  await expect(page.locator("html")).toHaveAttribute("data-theme-surface", "glass");

  await expect
    .poll(() => storedThemeState(page))
    .toEqual({
      active: "builtin-ink-jade",
      ids: ["synthetic-print-theme", "builtin-ink-jade"],
    });

  await dialog
    .getByRole("button", { name: /^(Close|关闭)$/i })
    .last()
    .click();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator(".app-shell")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme-ornament", "ink-wash");
  expect((await storedThemeState(page)).ids).toEqual(["synthetic-print-theme", "builtin-ink-jade"]);
});

test("theme editor stays usable at supported narrow mobile widths", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Narrow viewport coverage runs in the mobile project");

  await page.setViewportSize({ width: MOBILE_THEME_WIDTHS[0], height: 844 });
  await seedSyntheticProject(
    page,
    syntheticProject({
      songs: [syntheticSong("narrow-theme-song", "Narrow Theme", "One invented line")],
    }),
  );

  for (const width of MOBILE_THEME_WIDTHS) {
    await page.setViewportSize({ width, height: 844 });
    const dialog = await openThemeDialog(page, true);
    await expect(dialog.locator(".theme-card")).toHaveCount(5);

    const layout = await inspectThemeDialogLayout(dialog);
    expect(layout.documentScrollWidth, `document overflow at ${width}px`).toBeLessThanOrEqual(
      layout.documentClientWidth + 1,
    );
    expect(layout.bodyScrollWidth, `body overflow at ${width}px`).toBeLessThanOrEqual(
      layout.bodyClientWidth + 1,
    );
    expect(layout.dialogScrollWidth, `dialog overflow at ${width}px`).toBeLessThanOrEqual(
      layout.dialogClientWidth + 1,
    );
    expect(layout.controlHorizontalIssues, `control bounds at ${width}px`).toEqual([]);
    expect(layout.cardTextIssues, `card text clipping at ${width}px`).toEqual([]);

    await page.keyboard.press("Tab");
    await expect(
      dialog.locator(
        "button:focus:not([disabled]), input:focus:not([disabled]), select:focus:not([disabled])",
      ),
      `keyboard focus at ${width}px`,
    ).toHaveCount(1);

    await dialog
      .getByRole("button", { name: /^(Close|关闭)$/i })
      .last()
      .click();
    await expect(dialog).toBeHidden();
  }
});

test("a project-owned catalog id stays stable and cannot masquerade as the catalog design", async ({
  page,
  isMobile,
}) => {
  const project = syntheticProject({
    songs: [syntheticSong("collision-theme-song", "Collision Theme", "One invented line")],
  });
  project.themes.push({
    id: "builtin-moonlit-paper",
    name: { en: "Private Moon" },
    tokens: {
      accent: "#345678",
      background: "#101820",
      surface: "#1a2730",
      text: "#f7f3eb",
      radius: "14px",
    },
  });
  project.activeThemeId = "builtin-moonlit-paper";
  await seedSyntheticProject(page, project);

  const dialog = await openThemeDialog(page, isMobile);
  const catalogAction = dialog.getByRole("button", {
    name: /Use theme: Moonlit Paper|使用主题[:：] 月白宣纸/i,
  });
  await expect(catalogAction).toBeDisabled();
  await expect(catalogAction).toHaveAttribute("aria-pressed", "false");
  await expect(catalogAction).toHaveAttribute(
    "aria-describedby",
    "theme-status-builtin-moonlit-paper",
  );
  await expect(dialog.getByRole("combobox", { name: /^(Theme|主题)$/i })).toHaveValue(
    "builtin-moonlit-paper",
  );
  await expect(
    dialog.getByRole("button", {
      name: /Copy and customize: Moonlit Paper|复制并自定义[:：] 月白宣纸/i,
    }),
  ).toBeEnabled();
  const layout = await inspectThemeDialogLayout(dialog);
  expect(layout.controlHorizontalIssues).toEqual([]);
  expect(layout.cardTextIssues).toEqual([]);
  await expect
    .poll(() => storedThemeState(page))
    .toEqual({
      active: "builtin-moonlit-paper",
      ids: ["synthetic-print-theme", "builtin-moonlit-paper"],
    });

  await dialog
    .getByRole("button", { name: /^(Close|关闭)$/i })
    .last()
    .click();
  const transferDialog = await openTransferDialog(page, isMobile);
  await transferDialog.locator('input[type="file"]').setInputFiles({
    name: "moonlit-catalog.theme.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(MOONLIT_PAPER_THEME)),
  });
  await expect(transferDialog.locator(".notice").first()).toContainText(
    /Project imported successfully|项目导入成功/i,
  );
  await expect
    .poll(() => storedThemeState(page))
    .toEqual({
      active: expect.stringMatching(/^theme-/),
      ids: ["synthetic-print-theme", "builtin-moonlit-paper", expect.stringMatching(/^theme-/)],
    });
});

test("selected theme typography and print palette reach the measured document", async ({
  page,
  isMobile,
}) => {
  await seedSyntheticProject(
    page,
    syntheticProject({
      songs: [
        syntheticSong(
          "print-theme-song",
          "Porcelain Theme Proof",
          "THEME-001 invented line\nTHEME-002 invented line",
        ),
      ],
    }),
  );
  const themeDialog = await openThemeDialog(page, isMobile);
  await themeDialog
    .getByRole("button", { name: /Use theme: Porcelain Blue|使用主题[:：] 青花/i })
    .click();
  await themeDialog
    .getByRole("button", { name: /^(Close|关闭)$/i })
    .last()
    .click();

  await page
    .getByRole("button", { name: /^(Print|打印)$/i })
    .first()
    .click();
  const printDialog = page.getByRole("dialog", { name: /^(Print|打印)$/i });
  await printDialog.getByLabel(/Print scope|打印范围/i).selectOption("current-song");
  await printDialog.getByLabel(/Include linked contents|包含可点击目录/i).uncheck();
  await printDialog.getByRole("button", { name: /Build preview|生成预览/i }).click();
  await expect(
    printDialog.getByRole("button", { name: /Print \/ Save PDF|打印／保存 PDF/i }),
  ).toBeEnabled({ timeout: 20_000 });

  const document = page.locator("body > #print-portal [data-print-document]");
  await expect(document).toHaveAttribute("data-print-heading-style", "classic");
  const tokens = await document.evaluate((element) => {
    const html = element as HTMLElement;
    const title = html.querySelector<HTMLElement>(".print-song-title");
    const lyrics = html.querySelector<HTMLElement>(".print-lyrics");
    return {
      paper: html.style.getPropertyValue("--print-paper"),
      text: html.style.getPropertyValue("--print-text"),
      accent: html.style.getPropertyValue("--print-accent"),
      titleFont: title ? getComputedStyle(title).fontFamily : "",
      lyricFont: lyrics ? getComputedStyle(lyrics).fontFamily : "",
      horizontalOverflow: html.scrollWidth - html.clientWidth,
    };
  });
  expect(tokens).toMatchObject({ paper: "#fbfaf5", text: "#142033", accent: "#245c9c" });
  expect(tokens.titleFont).toContain("Iowan Old Style");
  expect(tokens.lyricFont).toContain("Inter");
  expect(tokens.horizontalOverflow).toBeLessThanOrEqual(1);
  await expect(document.locator('[data-layout-status="safe"]')).toHaveCount(1);
  await expect(document.locator(".print-lyrics")).toContainText("THEME-002");
});

test("invalid and reserved-id theme imports cannot replace project or catalog data", async ({
  page,
  isMobile,
}) => {
  await seedSyntheticProject(
    page,
    syntheticProject({
      songs: [syntheticSong("theme-import-song", "Theme Import", "One invented line")],
    }),
  );
  const before = await storedThemeState(page);
  const dialog = await openTransferDialog(page, isMobile);
  const input = dialog.locator('input[type="file"]');

  await input.setInputFiles({
    name: "invalid.theme.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ id: "invalid-theme", name: { en: "Invalid" }, tokens: {} }),
    ),
  });
  await expect(dialog.locator(".notice.error")).toContainText(/Import failed|导入失败/i);
  await expect.poll(() => storedThemeState(page)).toEqual(before);

  await input.setInputFiles({
    name: "reserved.theme.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        id: "builtin-ink-jade",
        name: { en: "Private reserved collision" },
        tokens: {
          accent: "#345678",
          background: "#101820",
          surface: "#1a2730",
          text: "#f7f3eb",
          radius: "14px",
        },
      }),
    ),
  });
  await expect(dialog.locator(".notice").first()).toContainText(
    /Project imported successfully|项目导入成功/i,
  );
  await expect
    .poll(async () => {
      const state = await storedThemeState(page);
      return {
        activeIsCustom: state.active?.startsWith("theme-") ?? false,
        activeIsStored: state.active ? state.ids.includes(state.active) : false,
        hasReservedId: state.ids.includes("builtin-ink-jade"),
      };
    })
    .toEqual({ activeIsCustom: true, activeIsStored: true, hasReservedId: false });
  const imported = await storedThemeState(page);
  expect(imported.active).toMatch(/^theme-/);
  expect(imported.ids).toContain(imported.active);

  await dialog
    .getByRole("button", { name: /^(Close|关闭)$/i })
    .last()
    .click();
  const themeDialog = await openThemeDialog(page, isMobile);
  await expect(
    themeDialog.getByRole("button", { name: /Use theme: Ink Jade|使用主题[:：] 墨玉/i }),
  ).toBeEnabled();
});

test("standalone theme export omits inert legacy asset references", async ({ page, isMobile }) => {
  const project = syntheticProject({
    songs: [syntheticSong("theme-export-song", "Theme Export", "One invented line")],
  });
  const activeTheme = project.themes[0];
  if (!activeTheme) throw new Error("Expected the synthetic project theme");
  Object.assign(activeTheme, {
    assets: {
      cover: "file:///Users/private-user/private-cover.png",
      background: "https://private.example/background.svg",
    },
  });
  await seedSyntheticProject(page, project);

  const dialog = await openTransferDialog(page, isMobile);
  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /Export theme|导出主题/i }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  if (!downloadPath) throw new Error("Expected a local standalone theme download");
  const exported = JSON.parse(await readFile(downloadPath, "utf8")) as Record<string, unknown>;

  expect(exported.id).toBe("synthetic-print-theme");
  expect(exported).not.toHaveProperty("assets");
  expect(JSON.stringify(exported)).not.toContain("private-user");
  expect(JSON.stringify(exported)).not.toContain("private.example");
});
