import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { expectNoBrowserErrors, monitorBrowserErrors } from "./helpers";
import type { CustomRunResult, CustomValidationResult } from "../lib/custom-algorithm/types";
import type { RunCustomAlgorithmOptions } from "../lib/custom-algorithm/types";

/**
 * Real-Pyodide coverage for the custom Python algorithm execution
 * foundation (feat/custom-python-execution-core), driven through the
 * non-visual test harness at /dev/custom-algorithm-harness - see that
 * route's own docstring for why it exists. There is no visual editor to
 * click through yet; every check here goes through
 * `window.__customAlgorithmHarness`, which wraps the exact
 * `CustomAlgorithmEngine` the future UI will call.
 */

const EXAMPLES_DIR = fileURLToPath(new URL("../examples/custom-algorithms/", import.meta.url));
const MINIMAL_SPT = readFileSync(`${EXAMPLES_DIR}01_minimal_spt.py`, "utf-8");
const DELIBERATELY_INVALID = readFileSync(`${EXAMPLES_DIR}02_deliberately_invalid.py`, "utf-8");
const BOUNDED_ITERATIVE = readFileSync(`${EXAMPLES_DIR}03_bounded_iterative_improvement.py`, "utf-8");

async function gotoHarness(page: Page) {
  await page.goto("/dev/custom-algorithm-harness");
  await expect(page.getByTestId("custom-algorithm-harness-ready")).toHaveText("ready");
}

async function validateSource(page: Page, source: string): Promise<CustomValidationResult> {
  return page.evaluate((src) => window.__customAlgorithmHarness!.validate(src), source);
}

async function runAndAwait(
  page: Page,
  options: Omit<RunCustomAlgorithmOptions, "problem" | "onProgress" | "onIncumbent"> & {
    problem?: RunCustomAlgorithmOptions["problem"];
  },
  timeoutMs = 60_000,
) {
  const runId = await page.evaluate((opts) => window.__customAlgorithmHarness!.start(opts), options);
  await expect
    .poll(() => page.evaluate((id) => window.__customAlgorithmHarness!.getResult(id) !== null, runId), {
      timeout: timeoutMs,
    })
    .toBe(true);
  return page.evaluate((id) => window.__customAlgorithmHarness!.getResult(id), runId) as Promise<{
    result: CustomRunResult;
    progress: { progress: number; message?: string }[];
    incumbents: unknown[];
  }>;
}

test.describe("custom Python algorithm execution (real Pyodide)", () => {
  test("validateCustomAlgorithm: empty source, syntax error, missing entrypoint, invalid signature, and a valid script", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoHarness(page);

    const empty = await validateSource(page, "");
    expect(empty.valid).toBe(false);
    expect(empty.reachedPythonCheck).toBe(false);
    expect(empty.issues.some((i) => i.code === "CUSTOM_ALGORITHM_EMPTY_SOURCE")).toBe(true);

    const syntaxError = await validateSource(page, "def schedule(system, parameters, context:\n    return None\n");
    expect(syntaxError.valid).toBe(false);
    expect(syntaxError.reachedPythonCheck).toBe(true);
    const syntaxIssue = syntaxError.issues.find((i) => i.code === "CUSTOM_ALGORITHM_SYNTAX_ERROR");
    expect(syntaxIssue).toBeDefined();
    expect(syntaxIssue?.path.some((segment) => typeof segment === "string" && segment.startsWith("line:"))).toBe(true);

    const missingEntrypoint = await validateSource(page, "def not_schedule(a, b, c):\n    return None\n");
    expect(missingEntrypoint.valid).toBe(false);
    expect(missingEntrypoint.issues.some((i) => i.code === "CUSTOM_ALGORITHM_MISSING_ENTRYPOINT")).toBe(true);

    const invalidSignature = await validateSource(page, "def schedule(only_one_arg):\n    return None\n");
    expect(invalidSignature.valid).toBe(false);
    expect(invalidSignature.issues.some((i) => i.code === "CUSTOM_ALGORITHM_INVALID_SIGNATURE")).toBe(true);

    const valid = await validateSource(page, MINIMAL_SPT);
    expect(valid.valid).toBe(true);
    expect(valid.issues).toEqual([]);
  });

  test("a valid custom algorithm runs successfully, receives a real System, and produces a completed result with no console errors", async ({ page }) => {
    test.setTimeout(90_000);
    const errors = monitorBrowserErrors(page);
    await gotoHarness(page);

    const { result, progress } = await runAndAwait(page, { source: MINIMAL_SPT });
    expect(result.status).toBe("completed");
    expect(result.terminationReason).toBe("completed");
    expect(result.result).not.toBeNull();
    expect(result.result?.metrics).not.toBeNull();
    const totalOps = result.result!.schedule!.machines.reduce((n, m) => n + m.operations.length, 0);
    expect(totalOps).toBe(8); // SAMPLE_PROBLEM has 8 operations across its 3 jobs
    expect(progress).toHaveLength(0); // dynamic_schedule owns the beginner rule's internal dispatch loop
    expect(result.reproducibility.lekinpyVersion).toBe("0.2.0");
    expect(result.reproducibility.sourceChecksum).toMatch(/^[a-f0-9]{64}$/);

    await expectNoBrowserErrors(errors);
  });

  test("an invalid schedule is rejected two ways: a Schedule with missing operations, and a non-Schedule return value", async ({ page }) => {
    test.setTimeout(90_000);
    await gotoHarness(page);

    const missingOps = await runAndAwait(page, { source: DELIBERATELY_INVALID });
    expect(missingOps.result.status).toBe("invalid_result");
    expect(missingOps.result.terminationReason).toBe("invalid_return_value");
    expect(missingOps.result.result).toBeNull();
    expect(missingOps.result.issues.some((i) => i.code === "SCHEDULE_MISSING_OPERATION")).toBe(true);

    const notASchedule = await runAndAwait(page, {
      source: "def schedule(system, parameters, context):\n    return {\"not\": \"a schedule\"}\n",
    });
    expect(notASchedule.result.status).toBe("invalid_result");
    expect(notASchedule.result.issues.some((i) => i.code === "CUSTOM_ALGORITHM_INVALID_RESULT")).toBe(true);
  });

  test("a runtime exception is captured with a concise message and full traceback; parameters and stdout reach Python", async ({ page }) => {
    test.setTimeout(90_000);
    await gotoHarness(page);

    const failing = await runAndAwait(page, {
      source: "def schedule(system, parameters, context):\n    raise ValueError('boom')\n",
    });
    expect(failing.result.status).toBe("runtime_failed");
    expect(failing.result.terminationReason).toBe("runtime_exception");
    expect(failing.result.issues[0]?.code).toBe("CUSTOM_ALGORITHM_RUNTIME_ERROR");
    expect(failing.result.issues[0]?.message).toContain("boom");
    expect(failing.result.diagnostics.traceback).toContain("ValueError");
    expect(failing.result.diagnostics.traceback).toContain("boom");

    const paramsAndStdout = await runAndAwait(page, {
      source:
        "import sys\n" +
        "def schedule(system, parameters, context):\n" +
        "    print('multiplier is', parameters.get('multiplier'))\n" +
        "    sys.stderr.write('a diagnostic warning\\n')\n" +
        "    return None\n",
      parameters: { multiplier: 3 },
    });
    expect(paramsAndStdout.result.stdout).toContain("multiplier is 3");
    expect(paramsAndStdout.result.stderr).toContain("a diagnostic warning");
  });

  test("stdout and stderr are bounded and marked truncated once the cap is exceeded", async ({ page }) => {
    test.setTimeout(90_000);
    await gotoHarness(page);

    const { result } = await runAndAwait(page, {
      // DEFAULT_CUSTOM_ALGORITHM_POLICY caps each stream at 20,000 chars.
      // Print/write comfortably past that on both streams.
      source:
        "import sys\n" +
        "def schedule(system, parameters, context):\n" +
        "    for _ in range(3000):\n" +
        "        print('0123456789')\n" +
        "        sys.stderr.write('0123456789\\n')\n" +
        "    return None\n",
    });
    expect(result.stdoutTruncated).toBe(true);
    expect(result.stderrTruncated).toBe(true);
    expect(result.stdout.length).toBeLessThanOrEqual(20_000);
    expect(result.stderr.length).toBeLessThanOrEqual(20_000);
    // The retained prefix must not be corrupted/garbled by truncation.
    expect(result.stdout.startsWith("0123456789")).toBe(true);
  });

  test("excessive progress messages are throttled, not queued without bound", async ({ page }) => {
    test.setTimeout(90_000);
    await gotoHarness(page);

    const { result, progress } = await runAndAwait(page, {
      source:
        "def schedule(system, parameters, context):\n" +
        "    for i in range(1000):\n" +
        "        context.report_progress(i / 1000, str(i))\n" +
        "    return None\n",
    });
    // DEFAULT_CUSTOM_ALGORITHM_POLICY.maxProgressMessages is 200.
    expect(progress.length).toBeLessThanOrEqual(200);
    expect(progress.length).toBeGreaterThan(0);
    expect(result.diagnostics.droppedProgressMessages).toBeGreaterThan(0);
    expect(progress.length + result.diagnostics.droppedProgressMessages).toBe(1000);
  });

  test("a bounded iterative algorithm cooperatively stops via should_stop(), reporting progress and validated incumbents", async ({ page }) => {
    test.setTimeout(90_000);
    await gotoHarness(page);

    const { result, progress, incumbents } = await runAndAwait(page, {
      source: BOUNDED_ITERATIVE,
      parameters: { maxIterations: 2000, seed: 7 },
      limits: { timeLimitMs: 1500 },
    });
    // A cooperating algorithm that respects its time budget completes
    // cleanly well before the hard timeout - this is the "cooperative
    // cancellation works" case, distinct from hard termination below.
    expect(result.status).toBe("completed");
    expect(result.terminationReason).toBe("completed");
    expect(result.runtimeMs).toBeLessThan(1500 + 300 /* TIMEOUT_GRACE_MS */);
    expect(incumbents.length).toBeGreaterThan(0);
    expect(progress.length).toBeGreaterThan(0);
  });

  test("hard cancellation interrupts a truly infinite loop that never cooperates", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoHarness(page);

    const runId = await page.evaluate(
      () =>
        window.__customAlgorithmHarness!.start({
          source: "def schedule(system, parameters, context):\n    while True:\n        pass\n",
          limits: { timeLimitMs: 15_000 },
        }),
    );
    // Give it a moment to actually enter the infinite loop, then cancel -
    // this is the real test: cancellation must work well before the 15s
    // time limit would otherwise fire.
    await page.waitForTimeout(400);
    const cancelledAt = Date.now();
    await page.evaluate((id) => window.__customAlgorithmHarness!.cancel(id), runId);

    await expect
      .poll(() => page.evaluate((id) => window.__customAlgorithmHarness!.getResult(id) !== null, runId), { timeout: 20_000 })
      .toBe(true);
    expect(Date.now() - cancelledAt).toBeLessThan(15_000);

    const outcome = await page.evaluate((id) => window.__customAlgorithmHarness!.getResult(id), runId);
    expect(outcome!.result.status).toBe("cancelled");
    expect(outcome!.result.terminationReason).toBe("user_cancelled");
  });

  test("a non-cooperating algorithm is terminated by its time limit and reports timed_out", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoHarness(page);

    const startedAt = Date.now();
    const { result } = await runAndAwait(
      page,
      {
        source: "def schedule(system, parameters, context):\n    while True:\n        pass\n",
        limits: { timeLimitMs: 1000 },
      },
      20_000,
    );
    expect(result.status).toBe("timed_out");
    expect(result.terminationReason).toBe("timeout");
    // runtimeMs deliberately excludes the disposable worker's Pyodide and
    // wheel cold start, so it is the correct clock for the algorithm budget.
    // The wider wall-clock assertion still proves the worker was killed well
    // before the full poll timeout without making CDN/startup speed part of
    // the timeout contract.
    expect(result.runtimeMs).toBeGreaterThanOrEqual(1000);
    expect(result.runtimeMs).toBeLessThan(3000);
    expect(Date.now() - startedAt).toBeLessThan(15_000);
  });

  test("two successive custom runs get fresh interpreters: globals, builtins pollution, and sys.modules do not survive", async ({ page }) => {
    test.setTimeout(120_000);
    await gotoHarness(page);

    // Run 1 pollutes every channel state could plausibly leak through:
    // module globals, builtins, an injected sys.module - then completes
    // (invalidly, which is fine: the interpreter still ran to completion).
    const first = await runAndAwait(page, {
      source:
        "import builtins, sys, types\n" +
        "LEAKED_GLOBAL = 'from-run-1'\n" +
        "builtins.LEAKED_BUILTIN = 'from-run-1'\n" +
        "sys.modules['leaked_module'] = types.ModuleType('leaked_module')\n" +
        "def schedule(system, parameters, context):\n" +
        "    context.report_progress(0.5, {'non': 'string message'})\n" +
        "    return None\n",
    });
    expect(first.result.status).toBe("invalid_result"); // returned None, as intended
    // The dict message was coerced to a bounded string, not a crash.
    expect(first.progress.length).toBe(1);
    expect(typeof first.progress[0]!.message).toBe("string");

    // Run 2 reports what survived. Nothing must have.
    const second = await runAndAwait(page, {
      source:
        "import builtins, sys\n" +
        "def schedule(system, parameters, context):\n" +
        "    print('global-survived:', 'LEAKED_GLOBAL' in globals())\n" +
        "    print('builtin-survived:', hasattr(builtins, 'LEAKED_BUILTIN'))\n" +
        "    print('module-survived:', 'leaked_module' in sys.modules)\n" +
        "    return None\n",
    });
    expect(second.result.stdout).toContain("global-survived: False");
    expect(second.result.stdout).toContain("builtin-survived: False");
    expect(second.result.stdout).toContain("module-survived: False");
  });

  test("micropip is not importable from custom code, so package installation fails at import time", async ({ page }) => {
    test.setTimeout(90_000);
    await gotoHarness(page);

    const { result } = await runAndAwait(page, {
      source:
        "def schedule(system, parameters, context):\n" +
        "    import micropip\n" +
        "    return None\n",
    });
    expect(result.status).toBe("runtime_failed");
    expect(result.issues[0]?.code).toBe("CUSTOM_ALGORITHM_RUNTIME_ERROR");
    expect(result.issues[0]?.message).toContain("ModuleNotFoundError");
    // lekinpy itself must still be importable after the micropip purge.
    const lekinpyStillWorks = await runAndAwait(page, { source: MINIMAL_SPT });
    expect(lekinpyStillWorks.result.status).toBe("completed");
  });

  test("a cancelled/failed custom run does not affect a later built-in algorithm run on the main workspace", async ({ page }) => {
    test.setTimeout(120_000);
    await gotoHarness(page);
    const runId = await page.evaluate(() =>
      window.__customAlgorithmHarness!.start({
        source: "def schedule(system, parameters, context):\n    while True:\n        pass\n",
        limits: { timeLimitMs: 15_000 },
      }),
    );
    await page.waitForTimeout(200);
    await page.evaluate((id) => window.__customAlgorithmHarness!.cancel(id), runId);
    await expect
      .poll(() => page.evaluate((id) => window.__customAlgorithmHarness!.getResult(id) !== null, runId), { timeout: 20_000 })
      .toBe(true);

    // Navigate away entirely (the custom-algorithm worker was already its
    // own disposable instance, structurally unrelated to the trusted
    // worker below) and confirm ordinary built-in execution is unaffected.
    await page.goto("/");
    await expect(page.getByText("Scheduling engine ready")).toBeVisible({ timeout: 120_000 });
    await page.getByRole("button", { name: "Open example" }).click();
    await page.getByRole("button", { name: "Open LEKIN starter: Sample job shop" }).click();
    await expect(page.getByRole("heading", { name: "Schedule overview" })).toBeVisible();
    await page.getByRole("button", { name: "Run schedule" }).click();
    await expect(page.locator(".valid-pill")).toContainText("Valid schedule", { timeout: 120_000 });
    await expect(page.locator(".bar")).toHaveCount(8);
  });
});
