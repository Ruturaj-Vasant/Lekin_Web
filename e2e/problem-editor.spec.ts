import { expect, test, type Locator } from "@playwright/test";
import { expectNoBrowserErrors, monitorBrowserErrors, openExample } from "./helpers";

function entityDetails(page: import("@playwright/test").Page, id: string): Locator {
  return page.locator("details.entity-row").filter({
    has: page.locator(`summary input[value="${id}"]`),
  });
}

test.describe("problem editor", () => {
  test("renames jobs, workcenters, and machines while preserving references", async ({ page }) => {
    await openExample(page);
    await page.getByText(/^Jobs/).click();

    let job = entityDetails(page, "J-101");
    await job.getByLabel("Job name J-101").fill("Rush order");
    job = entityDetails(page, "Rush order");
    await expect(job.getByLabel("Job name Rush order")).toHaveValue("Rush order");
    await job.locator(".job-summary-meta").click();

    await page.getByText(/^Workcenters/).click();
    await page.getByLabel("Workcenter name WC-CUT").fill("Cutting");
    await expect(job.getByLabel("Workcenter for operation 0")).toHaveValue("Cutting");
    await expect(page.getByLabel("Workcenter for machine M-01", { exact: true })).toHaveValue("Cutting");

    await page.getByText(/^Machines/).click();
    await page.getByLabel("Machine name M-01", { exact: true }).fill("Primary cutter");
    await expect(page.getByLabel("Machine name Primary cutter")).toHaveValue("Primary cutter");
    await expect(page.getByRole("button", { name: "Run schedule" })).toBeEnabled();
  });

  test("renders structured editor cards and a working collapse rail", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openExample(page);
    await page.getByText(/^Jobs/).click();

    const sidebar = page.getByRole("complementary", { name: "Problem setup" });
    const sidebarBox = await sidebar.boundingBox();
    expect(sidebarBox?.width).toBeGreaterThanOrEqual(340);

    const firstJob = entityDetails(page, "J-101");
    await expect(firstJob.getByLabel("Job name J-101")).toHaveValue("J-101");
    await expect(firstJob.locator("summary").getByText("3 operations", { exact: true })).toBeVisible();
    await expect(firstJob.locator("summary").getByText("Due 30", { exact: true })).toBeVisible();
    await expect(firstJob.locator("summary").getByText("Weight 2", { exact: true })).toBeVisible();
    await firstJob.locator(".job-summary-meta").click();
    for (const label of ["Release", "Due", "Weight"]) {
      const box = await firstJob.getByLabel(label).boundingBox();
      expect(box?.width, `${label} job control width`).toBeGreaterThanOrEqual(70);
    }
    await expect(firstJob.getByText("Operation 1", { exact: true })).toBeVisible();
    await expect(firstJob.locator(".operation-row")).toHaveCount(3);
    expect((await firstJob.getByLabel("Workcenter for operation 0").boundingBox())?.width).toBeGreaterThanOrEqual(140);
    const headingBox = await firstJob.locator(".operation-heading").first().boundingBox();
    const actionBox = await firstJob.getByRole("button", { name: "Move operation earlier" }).first().boundingBox();
    expect(Math.abs((headingBox?.y ?? 0) - (actionBox?.y ?? 0))).toBeLessThan(8);

    await page.getByText(/^Workcenters/).click();
    const firstWorkcenter = page.locator(".workcenter-fields").first();
    for (const input of await firstWorkcenter.locator("input").all()) {
      expect((await input.boundingBox())?.width).toBeGreaterThanOrEqual(100);
    }

    await page.getByText(/^Machines/).click();
    const firstMachine = page.locator(".machine-fields").first();
    expect((await firstMachine.locator("select").boundingBox())?.width).toBeGreaterThanOrEqual(240);
    for (const input of await firstMachine.locator("input").all()) {
      expect((await input.boundingBox())?.width).toBeGreaterThanOrEqual(74);
    }

    const overflows = await sidebar.evaluate((element) => element.scrollWidth > element.clientWidth + 1);
    expect(overflows).toBe(false);

    await page.getByRole("button", { name: "Collapse problem setup panel" }).click();
    await expect(page.getByRole("complementary", { name: "Problem setup", exact: true })).not.toBeVisible();
    const expand = page.getByRole("button", { name: "Expand problem setup panel" });
    await expect(expand).toBeVisible();
    await expand.click();
    await expect(sidebar).toBeVisible();
  });

  test("creates, edits, reorders, validates, and schedules jobs and operations", async ({ page }) => {
    test.setTimeout(180_000);
    const errors = monitorBrowserErrors(page);
    await openExample(page);
    await page.getByText(/^Jobs/).click();

    await page.getByRole("button", { name: "Add job" }).click();
    const job = entityDetails(page, "J-1");
    await expect(job).toBeVisible();
    await job.locator(".job-summary-meta").click();
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
    await page.getByText(/^Jobs/).click();

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
    await page.getByText(/^Jobs/).click();

    await page.getByRole("button", { name: "Run schedule" }).click();
    await expect(page.locator(".valid-pill")).toContainText("Valid schedule", { timeout: 120_000 });
    await expect(page.locator(".bar")).toHaveCount(8);
    const originalMakespan = await page.locator(".schedule-summary article").filter({ hasText: "C_max" }).locator("strong").innerText();

    const firstJob = entityDetails(page, "J-101");
    await firstJob.locator(".job-summary-meta").click();
    await firstJob.getByLabel("Processing time for operation 0").fill("9");
    await expect(page.locator(".valid-pill")).toContainText("Ready to run");
    await expect(page.locator(".bar")).toHaveCount(0);
    await expect(page.locator(".schedule-summary article").filter({ hasText: "C_max" }).locator("strong")).toHaveText("-");

    await page.getByRole("button", { name: "Run schedule" }).click();
    await expect(page.locator(".valid-pill")).toContainText("Valid schedule", { timeout: 120_000 });
    await expect(page.locator(".bar")).toHaveCount(8);
    await expect(page.locator(".schedule-summary article").filter({ hasText: "C_max" }).locator("strong")).not.toHaveText(originalMakespan);

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
