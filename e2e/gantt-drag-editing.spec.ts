import { expect, test, type Locator } from "@playwright/test";
import { expectNoBrowserErrors, monitorBrowserErrors, openExample } from "./helpers";

async function dragToLane(source: Locator, lane: Locator, x: number) {
  await source.dragTo(lane, { targetPosition: { x, y: 36 } });
}

test.describe("manual Gantt editing", () => {
  test("aligns a time-9 operation with the time-9 tick and grid line", async ({ page }) => {
    test.setTimeout(150_000);
    await openExample(page);
    await page.getByRole("button", { name: "Run schedule" }).click();
    await expect(page.locator(".valid-pill")).toContainText("Valid schedule", { timeout: 120_000 });

    await page.getByLabel("Edit J-102-O0").click();
    const dialog = page.getByRole("dialog", { name: "J-102 · Operation 1" });
    await dialog.getByLabel("Requested start time").fill("9");
    await dialog.getByRole("button", { name: "Apply change" }).click();
    await expect(page.getByRole("status")).toContainText(/Moved J-102-O0 from time \d+ to 9/);

    const barBox = await page.getByLabel("Drag J-102-O0").boundingBox();
    const tickBox = await page.locator('.ticks [data-time="9"]').boundingBox();
    const lineBox = await page.locator('.grid-line[data-time="9"]').boundingBox();
    expect(barBox).not.toBeNull();
    expect(tickBox).not.toBeNull();
    expect(lineBox).not.toBeNull();
    expect(Math.abs(barBox!.x - (tickBox!.x + tickBox!.width / 2))).toBeLessThan(1.5);
    expect(Math.abs(barBox!.x - lineBox!.x)).toBeLessThan(1.5);
  });

  test("edits an exact start time by right-click and clears it with undo support", async ({ page }) => {
    test.setTimeout(150_000);
    await openExample(page);
    await page.getByRole("button", { name: "Run schedule" }).click();
    await expect(page.locator(".valid-pill")).toContainText("Valid schedule", { timeout: 120_000 });

    const operation = page.getByLabel("Drag J-103-O0");
    await operation.click({ button: "right" });
    const dialog = page.getByRole("dialog", { name: "J-103 · Operation 1" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("0–2")).toBeVisible();
    await expect(dialog.getByLabel("Machine").locator("option")).toHaveCount(1);

    await dialog.getByLabel("Requested start time").fill("1");
    await dialog.getByRole("button", { name: "Apply change" }).click();
    await expect(page.getByRole("status")).toContainText("Moved J-103-O0 from time 0 to 1");
    await expect(operation).toHaveAttribute("title", /1–3/);
    await expect(page.getByRole("button", { name: /Undo/ })).toBeEnabled();

    await operation.press("Enter");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Clear manual time" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(operation).toHaveAttribute("title", /0–2/);

    await page.getByRole("button", { name: /Undo/ }).click();
    await expect(operation).toHaveAttribute("title", /1–3/);

    await page.setViewportSize({ width: 390, height: 844 });
    await operation.press("Enter");
    await expect(dialog.getByRole("button", { name: "Apply change" })).toBeInViewport();
    await dialog.getByRole("button", { name: "Close operation editor" }).click();
  });

  test("explains when constraints move an operation later than requested", async ({ page }) => {
    test.setTimeout(150_000);
    await openExample(page);
    await page.getByRole("button", { name: "Run schedule" }).click();
    await expect(page.locator(".valid-pill")).toContainText("Valid schedule", { timeout: 120_000 });

    await page.getByLabel("Edit J-101-O1").click();
    const dialog = page.getByRole("dialog", { name: "J-101 · Operation 2" });
    await dialog.getByLabel("Requested start time").fill("0");
    await dialog.getByRole("button", { name: "Apply change" }).click();

    await expect(page.getByRole("status")).toContainText(/Requested start 0; scheduled at [1-9]/);
    await expect(page.getByRole("status")).toContainText("precedence, machine order, and release constraints");
  });

  test("lets operation bars forward nearby drops to their machine lane", async ({ page }) => {
    test.setTimeout(150_000);
    await openExample(page);
    await page.getByRole("button", { name: "Run schedule" }).click();
    await expect(page.locator(".valid-pill")).toContainText("Valid schedule", { timeout: 120_000 });

    const operation = page.getByLabel("Drag J-103-O0");
    const occupiedTarget = page.getByLabel("Drag J-101-O1");
    await operation.dragTo(occupiedTarget, { targetPosition: { x: 6, y: 18 } });
    await expect(page.getByRole("status")).toContainText(/Moved J-103-O0|cannot|cycle/i);
    await expect(page.locator(".gantt-card")).not.toHaveClass(/drag-active/);
  });

  test("moves an operation, recalculates, and supports undo, redo, and reset", async ({ page }) => {
    test.setTimeout(150_000);
    const errors = monitorBrowserErrors(page);
    await openExample(page);
    await page.getByRole("button", { name: "Run schedule" }).click();
    await expect(page.locator(".valid-pill")).toContainText("Valid schedule", { timeout: 120_000 });

    const operation = page.getByLabel("Drag J-101-O0");
    const target = page.getByLabel("Drop operation on M-01", { exact: true });
    await dragToLane(operation, target, 8);

    await expect(page.getByRole("status")).toContainText("Moved J-101-O0 from time 3 to 0");
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
