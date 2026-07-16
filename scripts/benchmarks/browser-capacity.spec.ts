import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { serializeProblem } from "../../lib/import-export/problem-json";
import { createLargeProblem, type LargeProblemShape } from "./large-problem";

const CASES: Array<{ name: string; shape: LargeProblemShape }> = [
  { name: "100 operations", shape: { jobs: 25, operationsPerJob: 4, workcenters: 10, machinesPerWorkcenter: 2 } },
  { name: "250 operations", shape: { jobs: 50, operationsPerJob: 5, workcenters: 15, machinesPerWorkcenter: 2 } },
  { name: "400 operations", shape: { jobs: 80, operationsPerJob: 5, workcenters: 20, machinesPerWorkcenter: 2 } },
  { name: "500 operations", shape: { jobs: 100, operationsPerJob: 5, workcenters: 25, machinesPerWorkcenter: 2 } },
];

test("measures real import, Pyodide scheduling, and Gantt rendering capacity", async ({ page }, testInfo) => {
  const results: unknown[] = [];
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });

  for (const benchmarkCase of CASES) {
    console.log(`Benchmarking ${benchmarkCase.name}...`);
    const problem = createLargeProblem(benchmarkCase.shape);
    const operationCount = problem.jobs.reduce((sum, job) => sum + job.operations.length, 0);
    const fixturePath = testInfo.outputPath(`${operationCount}-operations.lekin.json`);
    await writeFile(fixturePath, serializeProblem(problem));

    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    const importStarted = performance.now();
    await page.getByLabel("Import a LEKIN Lab JSON file").setInputFiles(fixturePath);
    await expect(page.getByLabel("Problem name")).toHaveValue(problem.name);
    const importAndRenderMs = Math.round(performance.now() - importStarted);

    const algorithmRuns: Record<string, { wallMs: number; reportedMs: number }> = {};
    const algorithm = page.getByLabel("Dispatching rule");
    for (const algorithmId of ["spt", "fcfs", "edd", "wspt"]) {
      await algorithm.selectOption(algorithmId);
      const started = performance.now();
      await page.getByRole("button", { name: "Run schedule" }).click();
      await expect(page.locator(".valid-pill")).toContainText("Valid schedule");
      const wallMs = Math.round(performance.now() - started);
      await expect(page.locator(".bar")).toHaveCount(operationCount);
      const executionText = await page.locator(".canvas-head p").textContent();
      const reportedMs = Number(executionText?.match(/Last run (\d+) ms/)?.[1] ?? -1);
      algorithmRuns[algorithmId] = { wallMs, reportedMs };
      console.log(`${benchmarkCase.name} ${algorithmId}: ${wallMs} ms wall, ${reportedMs} ms reported`);
    }

    let editWallMs: number | null = null;
    if (operationCount === 500) {
      const operation = page.getByLabel("Drag J-001-O0");
      await operation.click({ button: "right" });
      const dialog = page.getByRole("dialog", { name: "J-001 · Operation 1" });
      const currentStart = Number((await operation.getAttribute("title"))?.match(/: (\d+)–/)?.[1] ?? 0);
      await dialog.getByLabel("Requested start time").fill(String(currentStart + 1));
      const editStarted = performance.now();
      await dialog.getByRole("button", { name: "Apply change" }).click();
      await expect(dialog).not.toBeVisible();
      editWallMs = Math.round(performance.now() - editStarted);
      await expect(page.locator(".bar")).toHaveCount(operationCount);
      console.log(`${benchmarkCase.name} precise edit: ${editWallMs} ms wall`);
    }

    const renderStats = await page.evaluate(() => ({
      domElements: document.querySelectorAll("*").length,
      ganttBars: document.querySelectorAll(".bar").length,
      jsHeapMb: "memory" in performance
        ? Math.round(((performance as Performance & { memory: { usedJSHeapSize: number } }).memory.usedJSHeapSize / 1024 / 1024) * 10) / 10
        : null,
    }));
    results.push({
      name: benchmarkCase.name,
      ...benchmarkCase.shape,
      operations: operationCount,
      importAndRenderMs,
      editWallMs,
      algorithmRuns,
      ...renderStats,
    });
  }

  expect(browserErrors).toEqual([]);
  console.log(`LEKIN_BROWSER_CAPACITY_RESULTS=${JSON.stringify(results)}`);
});
