import { expect, test } from "@playwright/test";
import { monitorBrowserErrors, openExample } from "./helpers";

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
});
