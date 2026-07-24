import { expect, test } from "@playwright/test";
import { expectNoBrowserErrors, monitorBrowserErrors } from "./helpers";

test("runs a real schedule from the static GitHub Pages artifact", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = monitorBrowserErrors(page);
  const basePath = process.env.PAGES_BASE_PATH ?? "";

  await page.goto(`${basePath}/`);
  await expect(page.getByText("Scheduling engine ready")).toBeVisible({ timeout: 90_000 });
  await page.getByRole("button", { name: "Open example" }).click();
  await page.getByRole("button", { name: "Open LEKIN starter: Sample job shop" }).click();
  await page.getByRole("button", { name: "Run schedule" }).click();

  await expect(page.locator(".valid-pill")).toContainText("Valid schedule", { timeout: 90_000 });
  await expect(page.locator(".bar")).toHaveCount(8);
  await expect(page.locator('.schedule-summary article[data-metric="makespan"] strong')).toHaveText("16");
  await expectNoBrowserErrors(errors);
});
