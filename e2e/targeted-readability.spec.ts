import { expect, test } from "@playwright/test";
import { openExample } from "./helpers";

test("makes the requested workspace text clearer without hiding utilization", async ({ page }) => {
  await openExample(page);

  await expect(page.getByRole("button", { name: /LEKIN/ })).toBeVisible();
  await expect(page.getByText("LEKIN Lab", { exact: true })).toHaveCount(0);

  const sizes = await page.locator("body").evaluate(() => {
    const size = (selector: string) => Number.parseFloat(getComputedStyle(document.querySelector(selector)!).fontSize);
    const weight = (selector: string) => Number.parseInt(getComputedStyle(document.querySelector(selector)!).fontWeight, 10);
    return {
      project: size(".project small"),
      action: size(".app-actions button"),
      actionWeight: weight(".app-actions button"),
      workspaceInstruction: size(".canvas-head p"),
      ganttInstruction: size(".gantt-head small"),
      operationHeading: size(".operation-heading strong"),
      workcenter: size(".machine-labels small"),
      utilization: size(".machine-labels em"),
      detailTab: size(".tabs button"),
      summaryHeading: size(".schedule-summary h2"),
      summaryDescription: size(".schedule-summary header p"),
      summarySymbol: size(".summary-grid article > span"),
      summaryValue: size(".summary-grid article > strong"),
      summaryLabel: size(".summary-grid article > small"),
      detailMessage: size(".tab-empty"),
      problemNameLabel: size(".sidebar > .field-label"),
      problemNameInput: size(".sidebar > .field-label > input"),
      sidebarSection: size(".sidebar > details > summary"),
      sidebarCount: size(".sidebar > details > summary em"),
      dispatchingLabel: size(".sidebar > details > .field-label"),
      dispatchingSelect: size(".sidebar > details > .field-label > select"),
    };
  });

  expect(sizes.project).toBeGreaterThanOrEqual(13);
  expect(sizes.action).toBeGreaterThanOrEqual(13);
  expect(sizes.actionWeight).toBeGreaterThanOrEqual(600);
  expect(sizes.workspaceInstruction).toBeGreaterThanOrEqual(14);
  expect(sizes.ganttInstruction).toBeGreaterThanOrEqual(13);
  expect(sizes.operationHeading).toBeGreaterThanOrEqual(13);
  expect(sizes.workcenter).toBeGreaterThanOrEqual(10);
  expect(sizes.utilization).toBeGreaterThanOrEqual(10);
  expect(sizes.detailTab).toBeGreaterThanOrEqual(13);
  expect(sizes.summaryHeading).toBeGreaterThanOrEqual(20);
  expect(sizes.summaryDescription).toBeGreaterThanOrEqual(13);
  expect(sizes.summarySymbol).toBeGreaterThanOrEqual(15);
  expect(sizes.summaryValue).toBeGreaterThanOrEqual(28);
  expect(sizes.summaryLabel).toBeGreaterThanOrEqual(13);
  expect(sizes.detailMessage).toBeGreaterThanOrEqual(14);
  expect(sizes.problemNameLabel).toBeGreaterThanOrEqual(12);
  expect(sizes.problemNameInput).toBeGreaterThanOrEqual(15);
  expect(sizes.sidebarSection).toBeGreaterThanOrEqual(15);
  expect(sizes.sidebarCount).toBeGreaterThanOrEqual(12);
  expect(sizes.dispatchingLabel).toBeGreaterThanOrEqual(12);
  expect(sizes.dispatchingSelect).toBeGreaterThanOrEqual(14);
  await expect(page.locator('.schedule-summary article[data-metric="makespan"] sub')).toHaveText("max");
  await expect(page.locator('.schedule-summary article[data-metric="totalTardiness"] sub')).toHaveText("j");
  await expect(page.getByLabel("M-01 utilization")).toBeVisible();
});
