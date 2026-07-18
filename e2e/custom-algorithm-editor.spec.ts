import { expect, test } from "@playwright/test";
import { expectNoBrowserErrors, monitorBrowserErrors, openExample } from "./helpers";

async function selectCustomPython(page: import("@playwright/test").Page) {
  await page.getByLabel("Dispatching rule").selectOption("custom");
  await expect(page.getByRole("heading", { name: "Custom Python algorithm" })).toBeVisible();
}

async function validateAndTrust(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Validate code" }).click();
  await expect(page.getByText("Code contract validated")).toBeVisible({ timeout: 90_000 });
  await page.getByLabel(/I trust this Python code/).check();
}

test.describe("custom Python editor", () => {
  test("validates and runs the starter algorithm into the real workspace", async ({ page }) => {
    test.setTimeout(180_000);
    const errors = monitorBrowserErrors(page);
    await openExample(page);
    await selectCustomPython(page);

    const source = page.getByRole("textbox", { name: "Python algorithm source" });
    await expect(source).toContainText("dynamic_schedule");
    await source.press("ControlOrMeta+End");
    await expect(source).toContainText(/def schedule\(system, parameters, context\)/);
    await source.press("ControlOrMeta+Home");
    await expect(page.locator(".cm-lineNumbers")).toBeVisible();
    await expect(page.locator(".cm-line span").first()).toBeVisible();
    await expect(page.getByText("Inspect the input your code receives")).toBeVisible();
    await expect(page.locator(".custom-input-counts")).toContainText("3 jobs · 8 operations · 4 machines");
    await expect(page.locator(".custom-input-tables")).toContainText("J-101");
    await page.getByRole("tab", { name: "Python attributes" }).click();
    await expect(page.locator(".custom-input-code pre")).toContainText('job_id="J-101"');
    await expect(page.locator(".custom-input-code pre")).toContainText("processing_time=4");
    await page.getByRole("tab", { name: "JSON payload" }).click();
    await expect(page.locator(".custom-input-code pre")).toContainText('"processing_time": 4');
    await expect(page.getByRole("heading", { name: "What LEKIN Lab passes in and expects back" })).toBeVisible();
    await expect(page.locator(".custom-contract-return")).toContainText("lekinpy.Schedule");
    await expect(page.locator(".custom-selector-contract")).toContainText("pick(available_jobs)");
    await expect(page.getByRole("button", { name: "Run custom algorithm", exact: true })).toBeDisabled();

    await validateAndTrust(page);
    await expect(page.getByRole("button", { name: "Run custom algorithm", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Run custom algorithm", exact: true }).click();

    await expect(page.locator(".valid-pill")).toContainText("Valid schedule", { timeout: 120_000 });
    await expect(page.locator(".bar")).toHaveCount(8);
    await expect(page.locator('.schedule-summary article[data-metric="makespan"] strong')).toHaveText("16");
    await expect(page.locator(".custom-console").getByText("completed", { exact: true })).toBeVisible();
    await expect(page.getByText(/scheduled J-/)).toHaveCount(0);

    await page.getByRole("tab", { name: "Algorithm comparison" }).click();
    await expect(page.locator(".comparison-table tbody tr")).toHaveCount(1);
    await expect(page.locator(".comparison-table tbody tr").first()).toContainText("Custom SPT");
    await expectNoBrowserErrors(errors);
  });

  test("imports, rejects invalid input, cancels infinite code, and preserves built-in execution", async ({ page }) => {
    test.setTimeout(240_000);
    const errors = monitorBrowserErrors(page);
    await openExample(page);
    await selectCustomPython(page);

    await page.getByLabel("Parameters (JSON object)").fill("[]");
    await expect(page.getByText("Parameters must be a JSON object, such as {}.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Run custom algorithm", exact: true })).toBeDisabled();
    await page.getByLabel("Parameters (JSON object)").fill("{}");

    await page.getByLabel("Import a Python algorithm").setInputFiles({
      name: "infinite-study.py",
      mimeType: "text/x-python",
      buffer: Buffer.from("def schedule(system, parameters, context):\n    while True:\n        pass\n"),
    });
    await expect(page.getByLabel("Algorithm name")).toHaveValue("infinite-study");
    await expect(page.getByRole("textbox", { name: "Python algorithm source" })).toContainText(/while True/);
    await expect(page.getByLabel(/I trust this Python code/)).not.toBeChecked();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download .py" }).click();
    expect((await downloadPromise).suggestedFilename()).toBe("infinite-study.py");

    await validateAndTrust(page);
    await page.getByRole("button", { name: "Run custom algorithm", exact: true }).click();
    const stop = page.getByRole("button", { name: "Stop algorithm" });
    await expect(stop).toBeVisible();
    await page.waitForTimeout(400);
    await stop.click();
    await expect(page.getByText("cancelled", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".bar")).toHaveCount(0);

    await page.getByLabel("Dispatching rule").selectOption("fcfs");
    await page.getByRole("button", { name: "Run schedule" }).click();
    await expect(page.locator(".valid-pill")).toContainText("Valid schedule", { timeout: 120_000 });
    await expect(page.locator(".bar")).toHaveCount(8);
    await page.getByRole("tab", { name: "Execution" }).click();
    await expect(page.getByText(/^FCFS completed locally/)).toBeVisible();
    await expectNoBrowserErrors(errors);
  });

  test("loads templates and clears a stale custom result when source changes", async ({ page }) => {
    test.setTimeout(180_000);
    await openExample(page);
    await selectCustomPython(page);
    await validateAndTrust(page);
    await page.getByRole("button", { name: "Run custom algorithm", exact: true }).click();
    await expect(page.locator(".valid-pill")).toContainText("Valid schedule", { timeout: 120_000 });
    await expect(page.locator(".bar")).toHaveCount(8);

    const source = page.getByRole("textbox", { name: "Python algorithm source" });
    await source.fill(`${await source.innerText()}\n# changed`);
    await expect(page.locator(".bar")).toHaveCount(0);
    await expect(page.getByText("Code contract validated")).toHaveCount(0);
    await expect(page.getByLabel(/I trust this Python code/)).not.toBeChecked();

    await page.getByLabel("Starter example").selectOption("edd");
    await page.getByRole("button", { name: "Load template" }).click();
    await expect(page.getByLabel("Algorithm name")).toHaveValue("Custom EDD");
    await expect(page.getByRole("textbox", { name: "Python algorithm source" })).toContainText("job.due");

    await page.getByLabel("Starter example").selectOption("blank");
    await page.getByRole("button", { name: "Load template" }).click();
    await expect(page.getByLabel("Algorithm name")).toHaveValue("Untitled custom algorithm");
    await expect(page.getByRole("textbox", { name: "Python algorithm source" })).toContainText(/NotImplementedError/);

    await validateAndTrust(page);
    await page.getByRole("button", { name: "Run custom algorithm", exact: true }).click();
    await expect(page.locator(".custom-console").getByText("runtime failed", { exact: true })).toBeVisible({ timeout: 120_000 });
    await expect(page.locator(".custom-console-errors")).toContainText("NotImplementedError");
    await expect(page.getByText("Python traceback")).toBeVisible();
  });

  test("validates and executes every beginner job-rule starter", async ({ page }) => {
    test.setTimeout(180_000);
    await openExample(page);
    await selectCustomPython(page);

    for (const [templateId, expectedName] of [
      ["edd", "Custom EDD"],
      ["wspt", "Custom WSPT"],
      ["composite", "Due date, then shortest"],
    ] as const) {
      await page.getByLabel("Starter example").selectOption(templateId);
      await page.getByRole("button", { name: "Load template" }).click();
      await expect(page.getByLabel("Algorithm name")).toHaveValue(expectedName);
      await validateAndTrust(page);
      await page.getByRole("button", { name: "Run custom algorithm", exact: true }).click();
      await expect(page.locator(".valid-pill")).toContainText("Valid schedule", { timeout: 120_000 });
      await expect(page.locator(".bar")).toHaveCount(8);
    }
  });
});
