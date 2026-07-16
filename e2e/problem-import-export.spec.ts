import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { expectNoBrowserErrors, monitorBrowserErrors } from "./helpers";

test.describe("problem import and export", () => {
  test("exports, imports, schedules, and locally restores a problem", async ({ page }) => {
    const errors = monitorBrowserErrors(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Open example" }).click();
    await page.getByLabel("Problem name").fill("Round trip study");

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /Export/ }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("round-trip-study.lekin.json");
    const exportedPath = await download.path();
    expect(exportedPath).not.toBeNull();

    await page.getByRole("button", { name: /LEKIN Lab/ }).click();
    await page.getByLabel("Import a LEKIN Lab JSON file").setInputFiles(exportedPath!);
    await page.getByText(/^Jobs/).click();
    await expect(page.getByLabel("Problem name")).toHaveValue("Round trip study");
    await expect(page.getByText("J-101", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Run schedule" }).click();
    await expect(page.locator(".valid-pill")).toContainText("Valid schedule", { timeout: 120_000 });
    await expect(page.locator(".bar")).toHaveCount(8);

    await page.reload();
    await expect(page.getByLabel("Problem name")).toHaveValue("Round trip study");
    await expect(page.locator(".valid-pill")).toContainText("Ready to run");
    await expectNoBrowserErrors(errors);
  });

  test("reports a failed workspace import without replacing the current problem", async ({ page }, testInfo) => {
    const errors = monitorBrowserErrors(page);
    const invalidPath = testInfo.outputPath("incompatible.lekin.json");
    const problem = { schemaVersion: "1.0.0", problemId: "old", name: "Old file", jobs: [], workcenters: [], machines: [] };
    await writeFile(invalidPath, JSON.stringify({
      format: "lekin-lab.problem",
      formatVersion: 99,
      exportedAt: "2026-01-01T00:00:00.000Z",
      problemId: problem.problemId,
      name: problem.name,
      schemaVersion: problem.schemaVersion,
      problem,
    }));

    await page.goto("/");
    await page.getByRole("button", { name: "Open example" }).click();
    await page.getByLabel("Problem name").fill("Keep this problem");
    await page.getByLabel("Import a LEKIN Lab JSON file").setInputFiles(invalidPath);

    await expect(page.locator(".save-feedback")).toContainText("supports version 1");
    await expect(page.getByLabel("Problem name")).toHaveValue("Keep this problem");
    await expectNoBrowserErrors(errors);
  });

  test("shows a useful landing-page error for malformed JSON", async ({ page }, testInfo) => {
    const errors = monitorBrowserErrors(page);
    const malformedPath = testInfo.outputPath("malformed.lekin.json");
    await writeFile(malformedPath, "{not valid JSON");

    await page.goto("/");
    await page.getByLabel("Import a LEKIN Lab JSON file").setInputFiles(malformedPath);

    await expect(page.getByRole("status")).toContainText("not valid JSON");
    await expect(page.getByRole("button", { name: "Open example" })).toBeVisible();
    await expectNoBrowserErrors(errors);
  });

  test("rejects oversized files before parsing them", async ({ page }, testInfo) => {
    const oversizedPath = testInfo.outputPath("oversized.lekin.json");
    await writeFile(oversizedPath, " ".repeat(5 * 1024 * 1024 + 1));

    await page.goto("/");
    await page.getByLabel("Import a LEKIN Lab JSON file").setInputFiles(oversizedPath);

    await expect(page.getByRole("status")).toContainText("larger than the 5 MB import limit");
    await expect(page.getByRole("button", { name: "Open example" })).toBeVisible();
  });
});
