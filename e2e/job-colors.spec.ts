import { expect, test, type Locator } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { expectNoBrowserErrors, monitorBrowserErrors, openExample } from "./helpers";
import { SAMPLE_PROBLEM } from "../app/execution/sample-problem";

function entityDetails(page: import("@playwright/test").Page, id: string): Locator {
  return page.locator("details.entity-row").filter({
    has: page.locator(`summary input[value="${id}"]`),
  });
}

test.describe("editable job colors", () => {
  test("recolors an existing schedule everywhere without rerunning and preserves the color", async ({ page }) => {
    test.setTimeout(240_000);
    const errors = monitorBrowserErrors(page);
    await openExample(page);

    await page.getByRole("button", { name: "Run schedule" }).click();
    await expect(page.locator(".valid-pill")).toContainText("Valid schedule", { timeout: 120_000 });
    await expect(page.locator(".bar")).toHaveCount(8);

    await page.getByText(/^Jobs/).click();
    let firstJob = entityDetails(page, "J-101");
    await firstJob.locator(".job-summary-meta").click();
    const colorInput = firstJob.getByLabel("Color for job J-101");
    expect(await firstJob.locator(".job-color-editor").evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await colorInput.fill("#123456");

    await expect(page.locator(".valid-pill")).toContainText("Valid schedule");
    await expect(page.locator(".bar")).toHaveCount(8);
    await expect(page.locator(".bar").filter({ hasText: "J-101" }).first()).toHaveCSS("background-color", "rgb(18, 52, 86)");
    await expect(page.locator(".bar").filter({ hasText: "J-101" }).first()).toHaveCSS("color", "rgb(255, 255, 255)");
    await expect(page.locator(".legend span").filter({ hasText: "J-101" }).locator("i")).toHaveCSS("background-color", "rgb(18, 52, 86)");

    await page.getByRole("tab", { name: "Machine sequence" }).click();
    await expect(page.locator(".sequence-table .chip").filter({ hasText: "J-101" }).first()).toHaveCSS("background-color", "rgb(18, 52, 86)");
    await page.getByRole("tab", { name: "Job details" }).click();
    await expect(page.locator(".job-summary-row").filter({ hasText: "J-101" }).locator(".chip").first()).toHaveCSS("background-color", "rgb(18, 52, 86)");

    await page.getByRole("button", { name: /Save locally/ }).click();
    await expect(page.locator(".save-feedback")).toContainText("Saved locally.");
    await page.reload();
    await page.getByText(/^Jobs/).click();
    firstJob = entityDetails(page, "J-101");
    await firstJob.locator(".job-summary-meta").click();
    await expect(firstJob.getByLabel("Color for job J-101")).toHaveValue("#123456");

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /Export/ }).click();
    const exportedPath = await (await downloadPromise).path();
    expect(exportedPath).not.toBeNull();
    await page.getByRole("button", { name: /LEKIN/ }).click();
    await page.getByLabel("Import a LEKIN JSON file").setInputFiles(exportedPath!);
    await page.getByText(/^Jobs/).click();
    firstJob = entityDetails(page, "J-101");
    await firstJob.locator(".job-summary-meta").click();
    await expect(firstJob.getByLabel("Color for job J-101")).toHaveValue("#123456");
    await expectNoBrowserErrors(errors);
  });

  test("assigns distinct colors when importing a legacy problem without rgb values", async ({ page }, testInfo) => {
    const legacyPath = testInfo.outputPath("legacy-without-colors.lekin.json");
    const legacyProblem = structuredClone(SAMPLE_PROBLEM);
    legacyProblem.problemId = "legacy-colors";
    legacyProblem.name = "Legacy colors";
    for (const job of legacyProblem.jobs) delete job.rgb;
    await writeFile(legacyPath, JSON.stringify({
      format: "lekin-lab.problem",
      formatVersion: 1,
      exportedAt: "2026-07-29T12:00:00.000Z",
      problemId: legacyProblem.problemId,
      name: legacyProblem.name,
      schemaVersion: legacyProblem.schemaVersion,
      problem: legacyProblem,
    }));

    await page.goto("/");
    await page.getByLabel("Import a LEKIN JSON file").setInputFiles(legacyPath);
    await page.getByText(/^Jobs/).click();
    for (const id of ["J-101", "J-102", "J-103"]) {
      const job = entityDetails(page, id);
      await job.locator(".job-summary-meta").click();
    }
    const colors = await page.locator('.job-color-picker input[type="color"]').evaluateAll(
      (inputs) => inputs.map((input) => (input as HTMLInputElement).value),
    );
    expect(colors).toHaveLength(3);
    expect(new Set(colors).size).toBe(3);
  });

  test("prevents manually assigning a color already used by another job", async ({ page }) => {
    await openExample(page);
    await page.getByText(/^Jobs/).click();
    const secondJob = entityDetails(page, "J-102");
    await secondJob.locator(".job-summary-meta").click();
    await secondJob.getByLabel("Color for job J-102").fill("#5b78a5");
    await expect(secondJob.getByRole("alert")).toContainText("J-101 already uses that color");
    await expect(secondJob.getByLabel("Color for job J-102")).toHaveValue("#ba7959");
  });
});
