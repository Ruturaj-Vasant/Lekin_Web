import { expect, test } from "@playwright/test";
import { expectNoBrowserErrors, monitorBrowserErrors, openExample } from "./helpers";

test.describe("landing and workspace shell", () => {
  test("presents the research workbench and opens the sample problem", async ({ page }) => {
    const errors = monitorBrowserErrors(page);
    await page.goto("/");

    await expect(page).toHaveTitle("LEKIN Lab - Scheduling Research Workbench");
    await expect(page.getByRole("heading", { name: /Build, run, and understand/ })).toBeVisible();
    await expect(page.getByRole("region", { name: "LEKIN Lab features" }).getByRole("article")).toHaveCount(3);
    await page.getByRole("button", { name: "Open example" }).click();

    await expect(page.getByRole("heading", { name: "Schedule overview" })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Problem setup" })).toBeVisible();
    await expect(page.getByLabel("Problem name")).toHaveValue("Sample job shop");
    await expect(page.locator(".valid-pill")).toContainText("Ready to run");
    await expect(page.locator(".bar")).toHaveCount(0);
    await expectNoBrowserErrors(errors);
  });

  test("exposes every built-in algorithm and starts with empty result panels", async ({ page }) => {
    await openExample(page);
    const algorithm = page.getByLabel("Dispatching rule");
    await expect(algorithm).toHaveValue("spt");
    await expect(algorithm.locator("option")).toHaveCount(4);
    await expect(algorithm.locator("option")).toHaveText([
      "SPT - Shortest processing time",
      "FCFS - First come, first served",
      "EDD - Earliest due date",
      "WSPT - Weighted SPT",
    ]);
    await expect(page.getByText("Run a schedule", { exact: true })).toBeVisible();
    await expect(page.getByText("No schedule yet", { exact: true })).toBeVisible();

    await page.getByRole("tab", { name: /Execution/ }).click();
    await expect(page.getByText("No execution has run.")).toBeVisible();
    await page.getByRole("tab", { name: /Validation/ }).click();
    await expect(page.getByText("No validation errors.")).toBeVisible();
  });

  test("returns to the landing screen through the LEKIN Lab brand", async ({ page }) => {
    await openExample(page);
    await page.getByRole("button", { name: /LEKIN Lab/ }).click();
    await expect(page.getByRole("button", { name: "Open example" })).toBeVisible();
  });

  test("supports keyboard navigation into the example", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Open example" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Schedule overview" })).toBeVisible();
  });
});
