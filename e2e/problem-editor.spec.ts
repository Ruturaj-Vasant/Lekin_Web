import { expect, test, type Locator } from "@playwright/test";
import { expectNoBrowserErrors, monitorBrowserErrors, openExample } from "./helpers";

function entityDetails(page: import("@playwright/test").Page, id: string): Locator {
  return page.locator("details.entity-row").filter({
    has: page.locator("summary strong", { hasText: new RegExp(`^${id}$`) }),
  });
}

test.describe("problem editor", () => {
  test("creates, edits, reorders, validates, and schedules jobs and operations", async ({ page }) => {
    test.setTimeout(180_000);
    const errors = monitorBrowserErrors(page);
    await openExample(page);

    await page.getByRole("button", { name: "Add job" }).click();
    const job = entityDetails(page, "J-1");
    await expect(job).toBeVisible();
    await job.locator("summary").click();
    await job.getByLabel("Release").fill("3");
    await job.getByLabel("Due").fill("25");
    await job.getByLabel("Weight").fill("4");
    await job.getByLabel("Workcenter for operation 0").selectOption("WC-MILL");
    await job.getByLabel("Processing time for operation 0").fill("7");

    await job.getByRole("button", { name: "Add operation" }).click();
    await job.getByLabel("Workcenter for operation 1").selectOption("WC-FINISH");
    await job.getByLabel("Processing time for operation 1").fill("5");
    await job.getByRole("button", { name: "Move operation earlier" }).nth(1).click();
    await expect(job.getByLabel("Processing time for operation 0")).toHaveValue("5");
    await expect(job.getByLabel("Workcenter for operation 0")).toHaveValue("WC-FINISH");
    await expect(job.getByLabel("Processing time for operation 1")).toHaveValue("7");

    await job.getByRole("button", { name: "Remove J-1 operation 1" }).click();
    await job.getByRole("button", { name: "Remove J-1 operation 0" }).click();
    await expect(job.getByText("must have at least one operation")).toBeVisible();
    await expect(page.getByRole("button", { name: "Fix validation errors to run" })).toBeDisabled();
    await page.getByRole("tab", { name: /Validation/ }).click();
    await expect(page.getByText(/EMPTY_OPERATIONS/)).toBeVisible();

    await job.getByRole("button", { name: "Add operation" }).click();
    await job.getByLabel("Processing time for operation 0").fill("0");
    await expect(job.getByText(/must be a positive number/)).toBeVisible();
    await expect(page.getByText(/NON_POSITIVE_PROCESSING_TIME/)).toBeVisible();
    await job.getByLabel("Processing time for operation 0").fill("6");
    await job.getByLabel("Workcenter for operation 0").selectOption("WC-CUT");
    await expect(page.getByText("No validation errors.")).toBeVisible();

    await page.getByRole("button", { name: "Run schedule" }).click();
    await expect(page.locator(".valid-pill")).toContainText("Valid schedule", { timeout: 120_000 });
    await expect(page.locator(".bar")).toHaveCount(9);
    await expectNoBrowserErrors(errors);
  });

  test("keeps workcenter and machine membership consistent and reports destructive edits", async ({ page }) => {
    const errors = monitorBrowserErrors(page);
    await openExample(page);

    await page.getByText(/^Workcenters/).click();
    await page.getByRole("button", { name: "Add workcenter" }).click();
    await expect(page.getByText("Workcenter 'WC-1' must have at least one machine.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Fix validation errors to run" })).toBeDisabled();

    await page.getByText(/^Machines/).click();
    await page.getByRole("button", { name: "Add machine" }).click();
    await page.getByLabel("Workcenter for machine M-1").selectOption("WC-1");
    await expect(page.getByRole("button", { name: "Run schedule" })).toBeEnabled();

    await page.getByRole("button", { name: "Delete machine M-1" }).click();
    await expect(page.getByText("Workcenter 'WC-1' must have at least one machine.")).toBeVisible();
    await page.getByRole("button", { name: "Delete workcenter WC-1" }).click();
    await expect(page.getByRole("button", { name: "Run schedule" })).toBeEnabled();

    await page.getByRole("button", { name: "Delete workcenter WC-FINISH" }).click();
    await expect(page.locator(".valid-pill")).toContainText("Fix validation errors");
    await page.getByRole("tab", { name: /Validation/ }).click();
    await expect(page.getByText(/MISSING_WORKCENTER_REFERENCE/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Fix validation errors to run" })).toBeDisabled();
    await expectNoBrowserErrors(errors);
  });

  test("clears stale results after problem and algorithm changes, then reruns", async ({ page }) => {
    test.setTimeout(240_000);
    const errors = monitorBrowserErrors(page);
    await openExample(page);

    await page.getByRole("button", { name: "Run schedule" }).click();
    await expect(page.locator(".valid-pill")).toContainText("Valid schedule", { timeout: 120_000 });
    await expect(page.locator(".bar")).toHaveCount(8);
    const originalMakespan = await page.locator(".metrics article").first().locator("strong").innerText();

    const firstJob = entityDetails(page, "J-101");
    await firstJob.locator("summary").click();
    await firstJob.getByLabel("Processing time for operation 0").fill("9");
    await expect(page.locator(".valid-pill")).toContainText("Ready to run");
    await expect(page.locator(".bar")).toHaveCount(0);
    await expect(page.locator(".metrics article").first().locator("strong")).toHaveText("—");

    await page.getByRole("button", { name: "Run schedule" }).click();
    await expect(page.locator(".valid-pill")).toContainText("Valid schedule", { timeout: 120_000 });
    await expect(page.locator(".bar")).toHaveCount(8);
    await expect(page.locator(".metrics article").first().locator("strong")).not.toHaveText(originalMakespan);

    await page.getByLabel("Dispatching rule").selectOption("fcfs");
    await expect(page.locator(".valid-pill")).toContainText("Ready to run");
    await expect(page.locator(".bar")).toHaveCount(0);
    await page.getByRole("button", { name: "Run schedule" }).click();
    await expect(page.locator(".valid-pill")).toContainText("Valid schedule", { timeout: 120_000 });
    await page.getByRole("tab", { name: /Execution/ }).click();
    await expect(page.getByText(/^FCFS completed locally/)).toBeVisible();
    await expectNoBrowserErrors(errors);
  });
});
