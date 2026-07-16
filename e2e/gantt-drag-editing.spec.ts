import { expect, test, type Locator } from "@playwright/test";
import { expectNoBrowserErrors, monitorBrowserErrors, openExample } from "./helpers";

async function dragToLane(source: Locator, lane: Locator, x: number) {
  await source.dragTo(lane, { targetPosition: { x, y: 36 } });
}

test.describe("manual Gantt editing", () => {
  test("moves an operation, recalculates, and supports undo, redo, and reset", async ({ page }) => {
    test.setTimeout(150_000);
    const errors = monitorBrowserErrors(page);
    await openExample(page);
    await page.getByRole("button", { name: "Run schedule" }).click();
    await expect(page.locator(".valid-pill")).toContainText("Valid schedule", { timeout: 120_000 });

    const operation = page.getByLabel("Drag J-101-O0");
    const target = page.getByLabel("Drop operation on M-01", { exact: true });
    await dragToLane(operation, target, 8);

    await expect(page.getByRole("status")).toContainText("Moved J-101-O0 to M-01, position 1");
    await expect(page.locator(".metrics article").first().locator("strong")).toContainText("18");
    await expect(operation).toHaveClass(/bar-manual/);
    await expect(page.getByRole("button", { name: /Undo/ })).toBeEnabled();

    await page.getByRole("button", { name: /Undo/ }).click();
    await expect(page.getByRole("status")).toContainText("Undid");
    await expect(page.locator(".metrics article").first().locator("strong")).toContainText("16");
    await expect(operation).not.toHaveClass(/bar-manual/);
    await expect(page.getByRole("button", { name: /Redo/ })).toBeEnabled();

    await page.getByRole("button", { name: /Redo/ }).click();
    await expect(page.getByRole("status")).toContainText("Redid");
    await expect(page.locator(".metrics article").first().locator("strong")).toContainText("18");
    await expect(operation).toHaveClass(/bar-manual/);

    await page.getByRole("button", { name: "Reset schedule" }).click();
    await expect(page.getByRole("status")).toContainText("Restored the original algorithm schedule");
    await expect(page.locator(".metrics article").first().locator("strong")).toContainText("16");
    await expect(operation).not.toHaveClass(/bar-manual/);

    await page.getByLabel("Problem name").fill("Changed problem");
    await expect(page.getByRole("button", { name: /Undo/ })).toBeDisabled();
    await expect(page.locator(".bar")).toHaveCount(0);
    await expectNoBrowserErrors(errors);
  });

  test("rejects an ineligible-machine drop with the exact blocking reason", async ({ page }) => {
    test.setTimeout(150_000);
    await openExample(page);
    await page.getByRole("button", { name: "Run schedule" }).click();
    await expect(page.locator(".valid-pill")).toContainText("Valid schedule", { timeout: 120_000 });

    await dragToLane(
      page.getByLabel("Drag J-101-O0"),
      page.getByLabel("Drop operation on M-03"),
      8,
    );

    await expect(page.getByRole("status")).toContainText(
      "Operation J-101-O0 cannot run on M-03 because M-03 is not in workcenter WC-CUT",
    );
    await expect(page.getByRole("button", { name: /Undo/ })).toBeDisabled();
  });
});
