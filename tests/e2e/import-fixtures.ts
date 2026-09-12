import { expect, type Locator, type Page } from "@playwright/test";

export async function confirmProjectReplacement(page: Page, dialog: Locator): Promise<void> {
  const replace = dialog.getByRole("button", {
    name: /Replace entire project|替换整个项目/i,
  });
  await expect(replace).toBeVisible();
  page.once("dialog", (confirmation) => confirmation.accept());
  await replace.click();
}
