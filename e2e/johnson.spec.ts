import { expect, test, type Page } from "@playwright/test";
import { TWO_MACHINE_FLOW_SHOP_PROBLEM } from "../app/execution/two-machine-flow-shop";
import { serializeProblem } from "../lib/import-export/problem-json";
import type { ProblemDefinition } from "../lib/schema/problem";
import { monitorBrowserErrors, openExample } from "./helpers";

async function openJohnsonExample(page: Page, name = "Open Johnson's rule: Two-machine flow shop") {
  await page.goto("/");
  await page.getByRole("button", { name: "Open example", exact: true }).click();
  await page.getByRole("button", { name, exact: true }).click();
  await page.getByLabel("Scheduling rule").selectOption("johnson");
}

async function run(page: Page) {
  await page.getByRole("button", { name: "Run schedule" }).click();
  await expect(page.locator(".valid-pill")).toContainText("Valid schedule", { timeout: 120_000 });
}

async function importProblem(page: Page, problem: ProblemDefinition) {
  await page.goto("/");
  await page.getByLabel("Import a LEKIN JSON file").setInputFiles({
    name: "johnson-case.lekin.json", mimeType: "application/json", buffer: Buffer.from(serializeProblem(problem)),
  });
  await expect(page.getByLabel("Problem name")).toHaveValue(problem.name);
}

test.describe("Johnson's rule", () => {
  test.setTimeout(150_000);
  test.use({ actionTimeout: 10_000 });

  test("explains why the job-shop option is disabled without selecting it", async ({ page }) => {
    await openExample(page);
    await expect(page.getByLabel("Scheduling rule").locator('option[value="johnson"]')).toHaveAttribute("disabled", "");
    await expect(page.locator("#algorithm-guidance")).toContainText("Johnson needs a flow shop");
    await expect(page.locator("#algorithm-guidance")).toContainText("same stages in the same order");
    await expect(page.locator("#algorithm-guidance")).toContainText("Examples");
    await expect(page.getByLabel("Scheduling rule")).toHaveAttribute("aria-describedby", "algorithm-guidance");
  });

  test("runs the pinned wheel to Cmax 30 and restores certification on undo and comparison selection", async ({ page }) => {
    const errors = monitorBrowserErrors(page);
    await openJohnsonExample(page);
    await expect(page.locator("#algorithm-guidance")).toContainText("Proof conditions met");
    await expect(page.getByRole("region", { name: "Result guarantee" })).toHaveCount(0);
    await run(page);
    const guarantee = page.getByRole("region", { name: "Result guarantee" });
    await expect(guarantee).toContainText("Optimal makespan");
    await expect(page.locator('[data-metric="makespan"] strong')).toHaveText("30");
    await expect(page.locator(".bar")).toHaveCount(10);
    await expect(page.locator(".metric-certification")).toHaveText("Proven minimum");
    await page.getByLabel("Edit J2-O0", { exact: true }).click();
    await page.getByRole("dialog").getByLabel("Requested start time").fill("20");
    await page.getByRole("button", { name: "Apply change", exact: true }).click();
    await expect(guarantee).toContainText("Manually adjusted");
    await expect(page.locator(".metric-certification")).toHaveCount(0);
    await page.getByRole("button", { name: /Undo/ }).click();
    await expect(guarantee).toContainText("Optimal makespan");
    await page.getByRole("button", { name: /Redo/ }).click();
    await expect(guarantee).toContainText("Manually adjusted");
    await page.getByRole("button", { name: "Reset schedule", exact: true }).click();
    await expect(guarantee).toContainText("Optimal makespan");
    await page.getByLabel("Scheduling rule").selectOption("spt");
    await expect(guarantee).toHaveCount(0);
    await run(page);
    await expect(guarantee).toContainText("Heuristic result");
    await page.getByRole("tab", { name: "Algorithm comparison", exact: true }).click();
    await page.getByRole("button", { name: "JOHNSON", exact: true }).click();
    await expect(guarantee).toContainText("Optimal makespan");
    expect(errors).toEqual([]);
  });

  test("runs four stages with a visible heuristic warning", async ({ page }) => {
    await openJohnsonExample(page, "Open Pinedo 6.1.1: Four-machine flow shop");
    await expect(page.locator("#algorithm-guidance")).toContainText("exactly two stages");
    await run(page);
    await expect(page.getByRole("region", { name: "Result guarantee" })).toContainText("Heuristic result");
    await expect(page.getByRole("region", { name: "Result guarantee" })).toContainText("4 stages");
    await expect(page.locator('[data-metric="makespan"] strong')).toHaveText("32");
    await expect(page.locator(".bar")).toHaveCount(20);
    await expect(page.locator(".metric-certification")).toHaveCount(0);
  });

  test("changing a job release clears the optimum and warns about release time alone", async ({ page }) => {
    await openJohnsonExample(page);
    await run(page);
    await page.locator(".sidebar-section-jobs > summary").click();
    const job = page.locator(".sidebar-section-jobs .entity-row").first();
    await job.locator("summary").press("Enter");
    await job.getByLabel("Release", { exact: true }).fill("7");
    await expect(page.getByRole("region", { name: "Result guarantee" })).toHaveCount(0);
    await expect(page.locator("#algorithm-guidance .condition-unmet")).toHaveCount(1);
    await expect(page.locator("#algorithm-guidance .condition-unmet")).toContainText("released at time 0");
    await run(page);
    const guarantee = page.getByRole("region", { name: "Result guarantee" });
    await expect(guarantee).toContainText("J1 has release time 7");
    await expect(guarantee).not.toContainText("stages");
    await expect(guarantee).toContainText("Heuristic result");
  });

  for (const shape of ["single job", "identical times", "100 jobs"] as const) {
    test(`schedules ${shape} without overclaiming other objectives`, async ({ page }) => {
      const problem = structuredClone(TWO_MACHINE_FLOW_SHOP_PROBLEM);
      const count = shape === "single job" ? 1 : shape === "100 jobs" ? 100 : 5;
      problem.jobs = Array.from({ length: count }, (_, index) => ({
        ...structuredClone(problem.jobs[0]!), jobId: `J${index + 1}`,
        operations: problem.jobs[0]!.operations.map((op, operationIndex) => ({
          ...op, operationId: `J${index + 1}-O${operationIndex}`, processingTime: 3,
        })),
      }));
      await importProblem(page, problem);
      await page.getByLabel("Scheduling rule").selectOption("johnson");
      await run(page);
      await expect(page.locator(".bar")).toHaveCount(count * 2);
      await expect(page.locator('[data-metric="makespan"] strong')).toHaveText(String(3 * (count + 1)));
      await expect(page.getByRole("region", { name: "Result guarantee" })).toContainText("Other performance measures are not covered");
    });
  }

  for (const shape of ["one stage", "revisited workcenter", "parallel machines"] as const) {
    test(`explains why Johnson cannot run with ${shape}`, async ({ page }) => {
      const problem = structuredClone(TWO_MACHINE_FLOW_SHOP_PROBLEM);
      let reason: string;
      if (shape === "one stage") {
        problem.jobs.forEach((job) => { job.operations = job.operations.slice(0, 1); });
        reason = "at least two stages";
      } else if (shape === "revisited workcenter") {
        problem.jobs.forEach((job) => job.operations.push({ ...job.operations[0]!, operationIndex: 2, operationId: `${job.jobId}-O2` }));
        reason = "more than once";
      } else {
        problem.workcenters[0]!.machineIds.push("M1b");
        problem.machines.push({ ...problem.machines[0]!, machineId: "M1b" });
        reason = "exactly one";
      }
      await importProblem(page, problem);
      await expect(page.getByLabel("Scheduling rule").locator('option[value="johnson"]')).toHaveAttribute("disabled", "");
      await expect(page.locator("#algorithm-guidance")).toContainText(reason);
    });
  }

  test("rejects an oversized flow shop without displaying an optimal result", async ({ page }) => {
    const problem = structuredClone(TWO_MACHINE_FLOW_SHOP_PROBLEM);
    problem.jobs = Array.from({ length: 101 }, (_, i) => ({ ...structuredClone(problem.jobs[0]!), jobId: `J${i}`, operations: problem.jobs[0]!.operations.map((op, n) => ({ ...op, operationId: `J${i}-O${n}` })) }));
    await importProblem(page, problem);
    await page.getByLabel("Scheduling rule").selectOption("johnson");
    await page.getByRole("button", { name: "Run schedule" }).click();
    await expect(page.locator(".valid-pill")).toContainText("rejected");
    await expect(page.getByRole("alert")).toContainText("current browser limit is 100 jobs");
    await expect(page.getByRole("alert")).toContainText("Reduce the problem size");
    await expect(page.getByRole("region", { name: "Result guarantee" })).toHaveCount(0);
    await expect(page.locator(".bar")).toHaveCount(0);
  });

  test("keeps guarantee and metrics readable on mobile with a dark system preference", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: "dark" });
    await openJohnsonExample(page);
    await run(page);
    await expect(page.getByRole("region", { name: "Result guarantee" })).toContainText("Optimal makespan");
    const dimensions = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth }));
    expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport);
    const summary = page.locator(".summary-grid");
    expect(await summary.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.locator(".gantt").evaluate((element) => { element.scrollLeft = 250; });
    const chart = (await page.locator(".gantt").boundingBox())!;
    const labels = (await page.locator(".machine-labels").boundingBox())!;
    expect(Math.abs(chart.x - labels.x)).toBeLessThanOrEqual(1);
  });
});
