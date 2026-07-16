import { expect, test } from "@playwright/test";
import { expectNoBrowserErrors, monitorBrowserErrors } from "./helpers";

test.describe("local persistence", () => {
  test("saves a project locally, survives a refresh, and can be reopened from the landing page", async ({ page }) => {
    const errors = monitorBrowserErrors(page);
    await page.goto("/");
    await page.getByRole("button", { name: /Create new problem/ }).click();
    await page.getByLabel("Problem name").fill("Persisted experiment");

    await page.getByRole("button", { name: /Save locally/ }).click();
    await expect(page.locator(".save-feedback")).toContainText("Saved locally.");

    await page.reload();
    await expect(page.getByRole("heading", { name: "Schedule overview" })).toBeVisible();
    await expect(page.getByLabel("Problem name")).toHaveValue("Persisted experiment");

    await page.getByRole("button", { name: /LEKIN Lab/ }).click();
    const recent = page.getByRole("region", { name: "Recent projects" });
    await expect(recent.getByLabel("Open Persisted experiment")).toBeVisible();

    await recent.getByLabel("Open Persisted experiment").click();
    await expect(page.getByRole("heading", { name: "Schedule overview" })).toBeVisible();
    await expect(page.getByLabel("Problem name")).toHaveValue("Persisted experiment");

    await expectNoBrowserErrors(errors);
  });

  test("deletes a saved project after confirmation", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Create new problem/ }).click();
    await page.getByLabel("Problem name").fill("Disposable experiment");
    await page.getByRole("button", { name: /Save locally/ }).click();
    await expect(page.locator(".save-feedback")).toContainText("Saved locally.");

    await page.getByRole("button", { name: /LEKIN Lab/ }).click();
    const recent = page.getByRole("region", { name: "Recent projects" });
    await expect(recent.getByLabel("Open Disposable experiment")).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await recent.getByLabel("Delete Disposable experiment").click();
    await expect(page.getByRole("region", { name: "Recent projects" })).toHaveCount(0);
  });

  test("creating New makes a separate blank project instead of overwriting the saved one", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Create new problem/ }).click();
    await page.getByLabel("Problem name").fill("Original project");
    await page.getByRole("button", { name: /Save locally/ }).click();
    await expect(page.locator(".save-feedback")).toContainText("Saved locally.");

    await page.getByRole("button", { name: /New/ }).click();
    await expect(page.getByLabel("Problem name")).toHaveValue("Untitled problem");
    await page.getByLabel("Problem name").fill("Second project");
    await page.getByRole("button", { name: /Save locally/ }).click();
    await expect(page.locator(".save-feedback")).toContainText("Saved locally.");

    await page.getByRole("button", { name: /LEKIN Lab/ }).click();
    const recent = page.getByRole("region", { name: "Recent projects" });
    await expect(recent.getByLabel("Open Original project")).toBeVisible();
    await expect(recent.getByLabel("Open Second project")).toBeVisible();
  });

  test("does not restore stale schedules or comparison history when a refreshed project reopens", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Open example" }).click();
    await page.getByRole("button", { name: "Run schedule" }).click();
    await expect(page.locator(".valid-pill")).toContainText("Valid schedule", { timeout: 120_000 });
    await expect(page.locator(".bar").first()).toBeVisible();
    await page.getByRole("tab", { name: /Execution/ }).click();
    await expect(page.getByText("No execution has run.")).not.toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { name: "Schedule overview" })).toBeVisible();
    await expect(page.locator(".valid-pill")).toContainText("Ready to run");
    await expect(page.locator(".bar")).toHaveCount(0);
    await page.getByRole("tab", { name: /Execution/ }).click();
    await expect(page.getByText("No execution has run.")).toBeVisible();
  });

  test("gracefully continues when the last-active saved project is corrupted", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Create new problem/ }).click();
    await page.getByLabel("Problem name").fill("Will be corrupted");
    await page.getByRole("button", { name: /Save locally/ }).click();
    await expect(page.locator(".save-feedback")).toContainText("Saved locally.");

    await page.evaluate(() => {
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key?.startsWith("lekin-lab:v1:project:")) {
          window.localStorage.setItem(key, "{not json");
        }
      }
    });

    await page.reload();
    await expect(page.getByRole("button", { name: "Open example" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Recent projects" })).toHaveCount(0);
  });
});
