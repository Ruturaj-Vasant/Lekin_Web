import { expect, test } from "@playwright/test";
import { expectNoBrowserErrors, monitorBrowserErrors, openExample } from "./helpers";

test.describe("real in-browser scheduling", () => {
  test("runs all algorithms through Pyodide and renders their real results", async ({ page }) => {
    test.setTimeout(240_000);
    const errors = monitorBrowserErrors(page);
    const fetched = new Set<string>();
    page.on("response", (response) => {
      const url = response.url();
      if (url.includes("lekinpy-0.2.0") || url.includes("pyodide")) fetched.add(url);
    });
    await openExample(page);

    const algorithm = page.getByLabel("Dispatching rule");
    const scheduleFingerprints = new Map<string, string>();
    for (const id of ["spt", "fcfs", "edd", "wspt"]) {
      await algorithm.selectOption(id);
      await page.getByRole("button", { name: "Run schedule" }).click();
      await expect(page.locator(".valid-pill")).toContainText("Valid schedule", { timeout: 120_000 });
      await expect(page.locator(".bar")).toHaveCount(8);
      await expect(page.locator(".metrics article").first().locator("strong")).not.toHaveText("-");
      scheduleFingerprints.set(id, await page.locator(".bar").evaluateAll((bars) => bars.map((bar) => {
        const element = bar as HTMLElement;
        return `${element.innerText}|${element.style.left}|${element.style.top}`;
      }).join(";")));
      await page.getByRole("tab", { name: /Execution/ }).click();
      await expect(page.getByText(new RegExp(`^${id.toUpperCase()} completed locally`))).toBeVisible();
      await page.getByRole("tab", { name: /Validation/ }).click();
      await expect(page.getByText("No validation errors.")).toBeVisible();
    }

    expect([...fetched].some((url) => url.endsWith("lekinpy-0.2.0-py3-none-any.whl"))).toBe(true);
    expect([...fetched].some((url) => url.endsWith("lekinpy-0.2.0-py3-none-any.whl.sha256"))).toBe(true);
    expect(scheduleFingerprints.get("fcfs")).not.toBe(scheduleFingerprints.get("spt"));
    expect(scheduleFingerprints.get("edd")).not.toBe(scheduleFingerprints.get("spt"));
    expect(errors, "unexpected errors during real browser execution").toEqual([]);
  });

  test("can cancel initialization and return to an executable state", async ({ page }) => {
    test.setTimeout(90_000);
    await openExample(page);
    await page.getByRole("button", { name: "Run schedule" }).click();
    const cancel = page.getByRole("button", { name: "Cancel execution" });
    await expect(cancel).toBeVisible();
    await cancel.click();
    await expect(page.locator(".valid-pill")).toContainText("Ready to run");
    await expect(page.getByRole("button", { name: "Run schedule" })).toBeEnabled();
  });

  test("renders machine timing, per-job results, and weighted execution metrics", async ({ page }) => {
    test.setTimeout(120_000);
    const errors = monitorBrowserErrors(page);
    await openExample(page);

    await page.getByRole("button", { name: "Run schedule" }).click();
    await expect(page.locator(".valid-pill")).toContainText("Valid schedule", { timeout: 120_000 });

    const summary = page.locator(".schedule-summary");
    const expectedSummary = new Map([
      ["Time", "0"], ["C_max", "16"], ["T_max", "0"], ["ΣU_j", "0"],
      ["ΣC_j", "40"], ["ΣT_j", "0"], ["ΣwC_j", "75"], ["ΣwT_j", "0"],
    ]);
    for (const [symbol, value] of expectedSummary) {
      const item = summary.locator("article").filter({ hasText: symbol });
      await expect(item.locator("strong")).toHaveText(value);
    }

    const details = page.locator(".details-card");
    await expect(details.getByText("release 0 · 69% utilized")).toBeVisible();
    await expect(details.locator(".chip").first()).toContainText("J-103 · O2 · 2–7");

    await page.getByRole("tab", { name: "Job details" }).click();
    await expect(details.getByText("release 0 · due 30 · weight 2 · completes 13 · on time")).toBeVisible();
    await expect(details.getByText("O1 · M-01B · 3–7")).toBeVisible();
    await expect(details.locator(".job-summary-row")).toHaveCount(3);

    await page.getByRole("tab", { name: "Execution" }).click();
    await expect(details.getByText(/weighted completion 75 · weighted tardiness 0/)).toBeVisible();
    await expectNoBrowserErrors(errors);
  });
});
