import { expect, type Page, test } from "@playwright/test";

const mobileWidths = [320, 393, 430] as const;

async function openApplication(page: Page, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 760 });
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await expect(page.locator("header.app-header")).toBeVisible();
}

test.describe("mobile header", () => {
  for (const width of mobileWidths) {
    test(`fits every visible control inside a ${width}px viewport`, async ({ page }) => {
      await openApplication(page, width);

      const geometry = await page.locator("header.app-header").evaluate((header) => {
        const viewportWidth = document.documentElement.clientWidth;
        const visibleControls = [...header.querySelectorAll<HTMLElement>("a, button")].filter(
          (element) => element.getClientRects().length > 0,
        );

        return {
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth,
          headerWidth: header.scrollWidth,
          headerClientWidth: header.clientWidth,
          controls: visibleControls.map((element) => {
            const rect = element.getBoundingClientRect();
            return {
              label: element.getAttribute("aria-label") ?? element.textContent?.trim() ?? "",
              left: rect.left,
              right: rect.right,
              width: rect.width,
              height: rect.height,
            };
          }),
        };
      });

      expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);
      expect(geometry.headerWidth).toBeLessThanOrEqual(geometry.headerClientWidth);
      expect(geometry.controls.length).toBeGreaterThanOrEqual(5);
      for (const control of geometry.controls) {
        expect(control.left, `${control.label} starts outside the viewport`).toBeGreaterThanOrEqual(
          -0.5,
        );
        expect(control.right, `${control.label} ends outside the viewport`).toBeLessThanOrEqual(
          geometry.viewportWidth + 0.5,
        );
        expect(control.width, `${control.label} has a narrow touch target`).toBeGreaterThanOrEqual(
          40,
        );
        expect(control.height, `${control.label} has a short touch target`).toBeGreaterThanOrEqual(
          40,
        );
      }

      const header = page.locator("header.app-header");
      await expect(header.getByRole("button", { name: /Open menu|打开菜单/i })).toBeVisible();
      await expect(header.locator("a.brand")).toBeVisible();
      await expect(header.getByRole("button", { name: /^(Print|打印)$/i })).toBeVisible();
      await expect(header.getByRole("button", { name: /Immersive mode|沉浸模式/i })).toBeVisible();
      await expect(header.getByRole("button", { name: /More actions|更多操作/i })).toBeVisible();
    });
  }

  test("keeps the complete desktop toolbar visible", async ({ page }) => {
    await openApplication(page, 1280);
    const header = page.locator("header.app-header");
    const desktopActions = header.locator(".header-actions-desktop .icon-button");

    await expect(desktopActions).toHaveCount(9);
    for (const action of await desktopActions.all()) await expect(action).toBeVisible();
    await expect(header.locator(".header-actions-mobile")).toBeHidden();
    await expect(header.getByRole("button", { name: /More actions|更多操作/i })).toHaveCount(0);
  });

  test("keeps the library and brand usable at the narrowest width", async ({ page }) => {
    await openApplication(page, 320);
    const header = page.locator("header.app-header");

    await expect(header.locator("a.brand")).toHaveAttribute("href", "./");
    await header.getByRole("button", { name: /Open menu|打开菜单/i }).click();
    await expect(page.locator(".mobile-sidebar.open")).toBeVisible();
    await page
      .locator(".mobile-sidebar.open")
      .getByRole("button", { name: /Close menu|关闭菜单/i })
      .click();
    await expect(page.locator(".mobile-sidebar")).toHaveCount(0);
  });

  test("exposes every secondary action through the More menu", async ({ page }) => {
    await openApplication(page, 320);
    const more = page.locator(
      "header.app-header .header-actions-mobile button[aria-haspopup='menu']",
    );
    await expect(more).toHaveAccessibleName(/More actions|更多操作/i);
    await expect(more).toHaveAttribute("aria-haspopup", "menu");
    await more.click();
    await expect(more).toHaveAttribute("aria-expanded", "true");

    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /Setlist editor|歌单编辑器/i })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /Theme editor|主题编辑器/i })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /^(Import|导入)$/i })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /^(Export|导出)$/i })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /Appearance|外观/i })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /^(Language|语言)$/i })).toBeVisible();
    const repository = menu.getByRole("menuitem", { name: /Star on GitHub|在 GitHub 点 Star/i });
    await expect(repository).toHaveAttribute("target", "_blank");
    await expect(repository).toHaveAttribute("rel", "noopener noreferrer");

    const geometry = await menu.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
        left: rect.left,
        right: rect.right,
      };
    });
    expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(geometry.left).toBeGreaterThanOrEqual(0);
    expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth);
  });

  test("opens a secondary action with the keyboard", async ({ page }) => {
    await openApplication(page, 393);
    const more = page
      .locator("header.app-header")
      .getByRole("button", { name: /More actions|更多操作/i });

    await more.focus();
    await page.keyboard.press("Enter");
    const setlistItem = page.getByRole("menuitem", {
      name: /Setlist editor|歌单编辑器/i,
    });
    await expect(setlistItem).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog")).toContainText(/Setlist editor|歌单编辑器/i);
  });

  test("opens a secondary action with touch", async ({ page, isMobile }) => {
    test.skip(!isMobile, "touch interaction is covered by the iPhone project");
    await openApplication(page, 393);

    await page
      .locator("header.app-header")
      .getByRole("button", { name: /More actions|更多操作/i })
      .tap();
    await page.getByRole("menuitem", { name: /Setlist editor|歌单编辑器/i }).tap();
    await expect(page.getByRole("dialog")).toBeVisible();
  });
});
