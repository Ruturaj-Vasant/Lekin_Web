import { expect, test, type Locator } from "@playwright/test";
import { expectNoBrowserErrors, monitorBrowserErrors, openExample } from "./helpers";

async function dragToLane(source: Locator, lane: Locator, x: number) {
  await source.dragTo(lane, { targetPosition: { x, y: 36 } });
}

test.describe("manual Gantt editing", () => {
  test("provides timeline zoom, utilization, idle, cursor, and operation inspection controls", async ({ page }) => {
    test.setTimeout(150_000);
    await openExample(page);
    await page.getByRole("button", { name: "Run schedule" }).click();
    await expect(page.locator(".valid-pill")).toContainText("Valid schedule", { timeout: 120_000 });

    await expect(page.getByLabel(/utilization/)).toHaveCount(4);
    await expect(page.locator(".idle-segment")).not.toHaveCount(0);
    await expect(page.locator(".gantt-card .chart-toolbar").getByRole("button", { name: /Undo/ })).toBeVisible();
    await expect(page.locator(".gantt-card .chart-toolbar").getByRole("button", { name: /Redo/ })).toBeVisible();
    await expect(page.locator(".gantt-card .chart-toolbar").getByRole("button", { name: "Reset schedule" })).toBeVisible();
    await expect(page.locator(".appbar").getByRole("button", { name: /Undo/ })).toHaveCount(0);

    const timeline = page.locator(".timeline");
    const ganttBounds = (await page.locator(".gantt").boundingBox())!;
    const initialTimelineBounds = (await timeline.boundingBox())!;
    expect(ganttBounds.x + ganttBounds.width - (initialTimelineBounds.x + initialTimelineBounds.width)).toBeGreaterThanOrEqual(14);
    const fittedWidth = (await timeline.boundingBox())!.width;
    await page.getByRole("button", { name: "Zoom in timeline" }).click();
    await expect.poll(async () => (await timeline.boundingBox())!.width).toBeGreaterThan(fittedWidth);
    await page.getByRole("button", { name: "Fit" }).click();
    await expect.poll(async () => Math.round((await timeline.boundingBox())!.width)).toBe(Math.round(fittedWidth));
    for (let index = 0; index < 9; index += 1) {
      await page.getByRole("button", { name: "Zoom in timeline" }).click();
    }
    await expect(page.locator(".chart-toolbar strong")).toHaveText("325%");
    await page.getByRole("button", { name: "Fit" }).click();

    const timelineBox = (await timeline.boundingBox())!;
    await page.mouse.move(timelineBox.x + timelineBox.width / 2, timelineBox.y + 20);
    await expect(page.locator(".cursor-time")).toBeVisible();

    const operation = page.getByLabel("Drag J-103-O0");
    await expect(operation).not.toHaveAttribute("title");
    await operation.hover();
    await expect(page.getByRole("tooltip")).toContainText("Start to end");
    await expect(page.getByRole("tooltip")).toContainText("Weight");

    const bottomOperation = page.getByLabel("Drag J-102-O1");
    await bottomOperation.hover();
    const bottomCardBox = await page.getByRole("tooltip").boundingBox();
    const viewport = page.viewportSize();
    expect(bottomCardBox).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(bottomCardBox!.x).toBeGreaterThanOrEqual(0);
    expect(bottomCardBox!.y).toBeGreaterThanOrEqual(0);
    expect(bottomCardBox!.x + bottomCardBox!.width).toBeLessThanOrEqual(viewport!.width);
    expect(bottomCardBox!.y + bottomCardBox!.height).toBeLessThanOrEqual(viewport!.height);

    await page.getByRole("button", { name: "Idle time" }).click();
    await expect(page.locator(".idle-segment")).toHaveCount(0);
  });

  test("keeps a one-machine operation hover card fully visible", async ({ page }) => {
    test.setTimeout(150_000);
    await page.goto("/");
    await page.getByRole("button", { name: "Open example" }).click();
    await page.getByRole("button", { name: "Open Pinedo 3.2.5: Maximum lateness" }).click();
    await page.getByRole("button", { name: "Run schedule" }).click();
    await expect(page.locator(".valid-pill")).toContainText("Valid schedule", { timeout: 120_000 });
    await expect(page.locator(".bar")).toHaveCount(4);

    await page.locator(".bar").first().hover();
    const tooltip = page.getByRole("tooltip");
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText("Start to end");

    const tooltipBox = await tooltip.boundingBox();
    const viewport = page.viewportSize();
    expect(tooltipBox).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(tooltipBox!.x).toBeGreaterThanOrEqual(0);
    expect(tooltipBox!.y).toBeGreaterThanOrEqual(0);
    expect(tooltipBox!.x + tooltipBox!.width).toBeLessThanOrEqual(viewport!.width);
    expect(tooltipBox!.y + tooltipBox!.height).toBeLessThanOrEqual(viewport!.height);
  });

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
    const machineLabelsBox = await page.locator(".machine-labels").boundingBox();
    const zeroLineBox = await page.locator('.grid-line[data-time="0"]').boundingBox();
    expect(barBox).not.toBeNull();
    expect(tickBox).not.toBeNull();
    expect(lineBox).not.toBeNull();
    expect(machineLabelsBox).not.toBeNull();
    expect(zeroLineBox).not.toBeNull();
    expect(Math.abs(zeroLineBox!.x - (machineLabelsBox!.x + machineLabelsBox!.width))).toBeLessThan(1.5);
    await expect(page.locator(".machine-labels")).toHaveCSS("border-right-width", "0px");
    expect(Math.abs(barBox!.x - (tickBox!.x + tickBox!.width / 2))).toBeLessThan(1.5);
    expect(Math.abs(barBox!.x - lineBox!.x)).toBeLessThan(1.5);
    await expect(page.getByLabel("Drag J-102-O0").locator("small")).toHaveText("9–15 · 6u");
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
    await expect(operation.locator("small").first()).toContainText("1–3");
    await expect(page.getByRole("button", { name: /Undo/ })).toBeEnabled();

    await operation.press("Enter");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Clear manual time" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(operation.locator("small").first()).toContainText("0–2");

    await page.getByRole("button", { name: /Undo/ }).click();
    await expect(operation.locator("small").first()).toContainText("1–3");

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
    await expect(page.locator('.schedule-summary article[data-metric="makespan"] strong')).toContainText("18");
    await expect(operation).toHaveClass(/bar-manual/);
    await expect(page.getByRole("button", { name: /Undo/ })).toBeEnabled();

    await page.getByRole("button", { name: /Undo/ }).click();
    await expect(page.getByRole("status")).toContainText("Undid");
    await expect(page.locator('.schedule-summary article[data-metric="makespan"] strong')).toContainText("16");
    await expect(operation).not.toHaveClass(/bar-manual/);
    await expect(page.getByRole("button", { name: /Redo/ })).toBeEnabled();

    await page.getByRole("button", { name: /Redo/ }).click();
    await expect(page.getByRole("status")).toContainText("Redid");
    await expect(page.locator('.schedule-summary article[data-metric="makespan"] strong')).toContainText("18");
    await expect(operation).toHaveClass(/bar-manual/);

    await page.getByRole("button", { name: "Reset schedule" }).click();
    await expect(page.getByRole("status")).toContainText("Restored the original algorithm schedule");
    await expect(page.locator('.schedule-summary article[data-metric="makespan"] strong')).toContainText("16");
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
