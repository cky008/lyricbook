import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";
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

async function storedInterfaceStyle(page: Page): Promise<string | null> {
  return await page.evaluate(() => localStorage.getItem("lyricbook-interface-style"));
}

async function printableStyleSnapshot(page: Page) {
  return await page
    .locator("body > #print-portal [data-print-document]")
    .evaluate((documentElement) => {
      const printablePage = documentElement.querySelector<HTMLElement>(".print-page");
      const title = documentElement.querySelector<HTMLElement>(".print-song-title");
      const lyrics = documentElement.querySelector<HTMLElement>(".print-lyrics");
      if (!printablePage || !title || !lyrics) {
        throw new Error("Expected a complete printable song page");
      }
      const pageRect = printablePage.getBoundingClientRect();
      const pageStyle = getComputedStyle(printablePage);
      const titleStyle = getComputedStyle(title);
      const lyricsStyle = getComputedStyle(lyrics);
      return {
        backgroundColor: pageStyle.backgroundColor,
        color: pageStyle.color,
        height: pageRect.height,
        lyricFontFamily: lyricsStyle.fontFamily,
        lyricFontSize: lyricsStyle.fontSize,
        printPaper: getComputedStyle(documentElement).getPropertyValue("--print-paper").trim(),
        titleFontFamily: titleStyle.fontFamily,
        titleFontSize: titleStyle.fontSize,
        width: pageRect.width,
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

test("Garden Editorial remains a browser preference across project replacement and cannot restyle print", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "Browser preference integration is covered once in Chromium",
  );

  await seedSyntheticProject(
    page,
    syntheticProject({
      songs: [
        syntheticSong(
          "interface-style-song",
          "A Garden Workspace",
          "GARDEN-001 invented line\nGARDEN-002 invented line",
        ),
      ],
    }),
  );

  const themeDialog = await openThemeDialog(page, false);
  const styleGroup = themeDialog.getByRole("radiogroup", { name: /Interface style|界面风格/i });
  await expect(styleGroup.getByRole("radio")).toHaveCount(2);
  await styleGroup.getByRole("radio", { name: /^Garden Editorial\b|^雅集\b/i }).click();
  await expect(page.locator("html")).toHaveAttribute("data-interface-style", "garden");
  await expect.poll(() => storedInterfaceStyle(page)).toBe("garden");
  const accessibility = await new AxeBuilder({ page }).include(".dialog-content").analyze();
  expect(accessibility.violations).toEqual([]);
  await themeDialog
    .getByRole("button", { name: /^(Close|关闭)$/i })
    .last()
    .click();

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator(".app-shell")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-interface-style", "garden");
  expect(await storedInterfaceStyle(page)).toBe("garden");

  const imported = syntheticProject({
    songs: [
      syntheticSong(
        "interface-style-import",
        "Imported Garden Proof",
        "IMPORT-001 invented line\nIMPORT-002 invented line",
      ),
    ],
  });
  imported.id = "synthetic-interface-style-import";
  imported.title = { en: "Imported Garden Project", "zh-Hans": "导入雅集项目" };
  const transferDialog = await openTransferDialog(page, false);
  await transferDialog.locator('input[type="file"]').setInputFiles({
    name: "synthetic-interface-style.json",
    mimeType: "application/json",
    buffer: Buffer.from(`${JSON.stringify(imported)}\n`),
  });
  await expect(transferDialog.locator(".notice").first()).toContainText(
    /Project imported successfully|项目导入成功/i,
  );
  await expect(page.locator("html")).toHaveAttribute("data-interface-style", "garden");
  expect(await storedInterfaceStyle(page)).toBe("garden");
  await transferDialog
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

  const printPortal = page.locator("body > #print-portal");
  const printDocument = printPortal.locator("[data-print-document]");
  await expect(printDocument).toBeAttached();
  await expect(printPortal).not.toHaveAttribute("data-interface-style");
  await expect(printDocument).not.toHaveAttribute("data-interface-style");
  expect(await printDocument.evaluate((element) => element.closest("#root"))).toBeNull();

  const gardenPrint = await printableStyleSnapshot(page);
  await page.locator("html").evaluate((element) => {
    element.setAttribute("data-interface-style", "studio");
    return new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  expect(await printableStyleSnapshot(page)).toEqual(gardenPrint);
  await page.locator("html").evaluate((element) => {
    element.setAttribute("data-interface-style", "garden");
  });
  await printDialog
    .getByRole("button", { name: /^(Close|关闭)$/i })
    .last()
    .click();

  const blankDialog = await openTransferDialog(page, false);
  page.once("dialog", async (dialog) => {
    expect(dialog.type()).toBe("confirm");
    await dialog.accept();
  });
  await blankDialog.getByRole("button", { name: /Blank project|空白项目/i }).click();
  await expect(blankDialog.locator(".notice").first()).toContainText(/Preset loaded|预设已载入/i);
  await expect(page.locator("html")).toHaveAttribute("data-interface-style", "garden");
  expect(await storedInterfaceStyle(page)).toBe("garden");
});

test("both interface styles preserve every crafted and project theme", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Theme and interface permutations are covered once");

  await seedSyntheticProject(
    page,
    syntheticProject({
      songs: [syntheticSong("style-theme-matrix", "Style Theme Matrix", "Invented line")],
    }),
  );
  const dialog = await openThemeDialog(page, false);
  const builtInIds = [
    "builtin-studio-slate",
    "builtin-ink-jade",
    "builtin-porcelain-blue",
    "builtin-cinnabar-silk",
    "builtin-moonlit-paper",
  ];
  const accentRuns: string[][] = [];
  const customAccents: string[] = [];

  for (const style of ["studio", "garden"] as const) {
    await dialog
      .getByRole("radio", {
        name: style === "studio" ? /^Studio\b|^现代工作室\b/i : /^Garden Editorial\b|^雅集\b/i,
      })
      .click();
    await expect(page.locator("html")).toHaveAttribute("data-interface-style", style);

    await dialog
      .getByRole("combobox", { name: /^(Theme|主题)$/i })
      .selectOption("synthetic-print-theme");
    customAccents.push(
      await page
        .locator("html")
        .evaluate((element) => getComputedStyle(element).getPropertyValue("--lb-accent").trim()),
    );

    const accents: string[] = [];
    for (const themeId of builtInIds) {
      await dialog.locator(`.theme-card[data-theme-id="${themeId}"] .theme-card-select`).click();
      await expect(page.locator("html")).toHaveAttribute("data-interface-style", style);
      accents.push(
        await page
          .locator("html")
          .evaluate((element) => getComputedStyle(element).getPropertyValue("--lb-accent").trim()),
      );
    }
    expect(new Set(accents).size).toBe(builtInIds.length);
    accentRuns.push(accents);
  }

  expect(customAccents[0]).toBe(customAccents[1]);
  expect(accentRuns[0]).toEqual(accentRuns[1]);
  await expect(dialog.locator(".theme-card")).toHaveCount(5);
});

test("Garden Editorial wraps an unbroken next-song title at 320px", async ({ page, isMobile }) => {
  test.skip(!isMobile, "The narrow next-song regression runs in the mobile project");

  await page.setViewportSize({ width: 320, height: 844 });
  await seedSyntheticProject(
    page,
    syntheticProject({
      songs: [
        syntheticSong("garden-current", "Garden Current Song", "One invented line"),
        syntheticSong(
          "garden-next",
          "NextSongTitleWithoutAnyNaturalBreakThatMustRemainCompletelyVisibleAtTheNarrowestSupportedWidth",
          "Another invented line",
        ),
      ],
    }),
  );
  await page.evaluate(() => localStorage.setItem("lyricbook-interface-style", "garden"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-interface-style", "garden");

  const layout = await page.locator(".reader-card > .next-song-card").evaluate((element) => {
    const card = element as HTMLElement;
    const copy = card.querySelector<HTMLElement>(".next-song-copy");
    const title = card.querySelector<HTMLElement>("strong");
    if (!copy || !title) throw new Error("Expected next-song copy and title");
    const cardRect = card.getBoundingClientRect();
    const titleRect = title.getBoundingClientRect();
    return {
      cardClientWidth: card.clientWidth,
      cardLeft: cardRect.left,
      cardRight: cardRect.right,
      cardScrollWidth: card.scrollWidth,
      copyClientWidth: copy.clientWidth,
      copyMinWidth: getComputedStyle(copy).minWidth,
      copyScrollWidth: copy.scrollWidth,
      titleLeft: titleRect.left,
      titleOverflowWrap: getComputedStyle(title).overflowWrap,
      titleRight: titleRect.right,
    };
  });

  expect(layout.cardScrollWidth).toBeLessThanOrEqual(layout.cardClientWidth + 1);
  expect(layout.copyScrollWidth).toBeLessThanOrEqual(layout.copyClientWidth + 1);
  expect(layout.titleLeft).toBeGreaterThanOrEqual(layout.cardLeft - 1);
  expect(layout.titleRight).toBeLessThanOrEqual(layout.cardRight + 1);
  expect(layout.copyMinWidth).toBe("0px");
  expect(layout.titleOverflowWrap).toBe("anywhere");
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

  for (const style of ["studio", "garden"] as const) {
    await page.evaluate((value) => localStorage.setItem("lyricbook-interface-style", value), style);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator(".app-shell")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-interface-style", style);

    for (const width of MOBILE_THEME_WIDTHS) {
      await page.setViewportSize({ width, height: 844 });
      const dialog = await openThemeDialog(page, true);
      await expect(dialog.locator(".theme-card")).toHaveCount(5);

      const layout = await inspectThemeDialogLayout(dialog);
      expect(
        layout.documentScrollWidth,
        `${style} document overflow at ${width}px`,
      ).toBeLessThanOrEqual(layout.documentClientWidth + 1);
      expect(layout.bodyScrollWidth, `${style} body overflow at ${width}px`).toBeLessThanOrEqual(
        layout.bodyClientWidth + 1,
      );
      expect(
        layout.dialogScrollWidth,
        `${style} dialog overflow at ${width}px`,
      ).toBeLessThanOrEqual(layout.dialogClientWidth + 1);
      expect(layout.controlHorizontalIssues, `${style} control bounds at ${width}px`).toEqual([]);
      expect(layout.cardTextIssues, `${style} card text clipping at ${width}px`).toEqual([]);

      await page.keyboard.press("Tab");
      await expect(
        dialog.locator(
          "button:focus:not([disabled]), input:focus:not([disabled]), select:focus:not([disabled])",
        ),
        `${style} keyboard focus at ${width}px`,
      ).toHaveCount(1);

      await dialog
        .getByRole("button", { name: /^(Close|关闭)$/i })
        .last()
        .click();
      await expect(dialog).toBeHidden();
    }
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
