import { expect, test } from "@playwright/test";
import { expectNoBrowserErrors, monitorBrowserErrors } from "./helpers";

test("completes the realistic MVP workflow from a blank project", async ({ page }) => {
  test.setTimeout(240_000);
  const errors = monitorBrowserErrors(page);

  await page.goto("/");
  await page.getByRole("button", { name: /Create new problem/ }).click();
  await page.getByLabel("Problem name").fill("Release gate study");

  await page.getByRole("button", { name: "Add workcenter" }).click();
  await page.getByText(/^Workcenters/).click();
  await page.getByLabel("Workcenter name WC-1").fill("Cutting");
  await page.getByText(/^Machines/).click();
  await page.getByRole("button", { name: "Add machine" }).click();
  await page.getByLabel("Machine name M-1").fill("Cutter 1");

  await page.getByText(/^Jobs/).click();
  await page.getByRole("button", { name: "Add job" }).click();
  let firstJob = page.locator("details.entity-row").filter({ has: page.locator('summary input[value="J-1"]') });
  await firstJob.getByLabel("Job name J-1").fill("Order A");
  firstJob = page.locator("details.entity-row").filter({ has: page.locator('summary input[value="Order A"]') });
  await firstJob.locator(".job-summary-meta").click();
  await firstJob.getByLabel("Processing time for operation 0").fill("4");
  await firstJob.getByLabel("Due").fill("12");

  await page.getByRole("button", { name: "Add job" }).click();
  let secondJob = page.locator("details.entity-row").filter({ has: page.locator('summary input[value="J-1"]') });
  await secondJob.getByLabel("Job name J-1").fill("Order B");
  secondJob = page.locator("details.entity-row").filter({ has: page.locator('summary input[value="Order B"]') });
  await secondJob.locator(".job-summary-meta").click();
  await secondJob.getByLabel("Processing time for operation 0").fill("3");
  await secondJob.getByLabel("Due").fill("8");

  await page.getByRole("button", { name: "Run schedule" }).click();
  await expect(page.locator(".valid-pill")).toContainText("Valid schedule", { timeout: 120_000 });
  await expect(page.locator(".bar")).toHaveCount(2);
  await expect(page.locator('.schedule-summary article[data-metric="makespan"] strong')).toHaveText("7");

  await page.getByLabel("Dispatching rule").selectOption("fcfs");
  await page.getByRole("button", { name: "Run schedule" }).click();
  await expect(page.locator(".valid-pill")).toContainText("Valid schedule", { timeout: 120_000 });
  await page.getByRole("tab", { name: "Algorithm comparison" }).click();
  await expect(page.locator(".comparison-table tbody tr")).toHaveCount(2);

  await page.getByLabel("Edit Order B-O0").click();
  const editor = page.getByRole("dialog", { name: "Order B · Operation 1" });
  await editor.getByLabel("Requested start time").fill("8");
  await editor.getByRole("button", { name: "Apply change" }).click();
  await expect(page.getByRole("button", { name: /Undo/ })).toBeEnabled();
  await page.getByRole("button", { name: /Undo/ }).click();
  await expect(page.getByRole("status")).toContainText("Undid");
  await page.getByLabel("Edit Order B-O0").click();
  await editor.getByLabel("Requested start time").fill("8");
  await editor.getByRole("button", { name: "Apply change" }).click();
  await page.getByRole("button", { name: "Reset schedule" }).click();
  await expect(page.getByRole("status")).toContainText("Restored the original algorithm schedule");

  await page.getByRole("button", { name: /Save locally/ }).click();
  await expect(page.locator(".save-feedback")).toContainText("Saved locally.");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Export/ }).click();
  expect((await downloadPromise).suggestedFilename()).toBe("release-gate-study.lekin.json");

  await page.reload();
  await expect(page.getByLabel("Problem name")).toHaveValue("Release gate study");
  await page.getByRole("button", { name: /LEKIN/ }).click();
  await page.getByRole("region", { name: "Recent projects" }).getByLabel("Open Release gate study").click();
  await expect(page.getByLabel("Problem name")).toHaveValue("Release gate study");
  await expectNoBrowserErrors(errors);
});
