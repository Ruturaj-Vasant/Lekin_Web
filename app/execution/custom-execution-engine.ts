import { toLekinpySystemPayload, fromLekinpyScheduleDict } from "../../lib/adapter/translate";
import { checkExecutionPolicy } from "../../lib/adapter/policy";
import {
  DEFAULT_CUSTOM_ALGORITHM_POLICY,
  SYNTHETIC_CUSTOM_ALGORITHM_DEFINITION,
  effectiveTimeLimitMs,
  type CustomAlgorithmPolicy,
} from "../../lib/custom-algorithm/policy";
import { collectPreflightIssues } from "../../lib/custom-algorithm/validate";
import type {
  CustomIncumbentEvent,
  CustomProgressEvent,
  CustomRunDiagnostics,
  CustomRunReproducibility,
  CustomRunResult,
  CustomRunStatus,
  CustomRunTerminationReason,
  CustomValidationResult,
  RunCustomAlgorithmOptions,
} from "../../lib/custom-algorithm/types";
import { makeIssue, hasBlockingError } from "../../lib/schema/issue";
import type { ValidationErrorCode } from "../../lib/schema/codes";
import type { ExecutionResult } from "../../lib/schema/algorithm";
import { validateProblemDefinition } from "../../lib/schema/problem";
import { computeMetrics } from "../../lib/scheduling/metrics";
import { validateScheduleAgainstProblem } from "../../lib/scheduling/validate-schedule";
import { sha256Hex } from "../../worker/wheel-integrity";
import type { CustomWorkerRequest, CustomWorkerResponse } from "../../worker/custom-scheduling-protocol";

/**
 * The TypeScript-facing API for user-defined custom Python algorithms.
 * See docs/CUSTOM_PYTHON_ALGORITHMS.md for the full contract.
 *
 * Mirrors BrowserExecutionEngine's (app/execution/browser-execution-engine.ts)
 * class shape (a stateful engine object the later UI instantiates once),
 * but does NOT share a worker with it: every `runCustomAlgorithm` call gets
 * its own brand-new, disposable Worker, terminated the moment that one run
 * settles - see worker/custom-scheduling.worker.ts's module docstring for
 * why disposability (not message-queue reuse) is this engine's isolation
 * boundary. This is a deliberate architectural split from the trusted
 * engine's single-long-lived-worker model, not an oversight.
 */

/** Grace window added to the hard JS-side timeout, so a cooperating
 * algorithm that returns right as its own time_remaining() reaches zero has
 * a real chance to finish and have its "completed" message processed
 * before the hard kill - not a looser limit, just a fair race margin. */
const TIMEOUT_GRACE_MS = 300;

interface PendingRun {
  worker: Worker;
  onCancelled: () => void;
}

export class CustomAlgorithmEngine {
  private readonly policy: CustomAlgorithmPolicy;
  private readonly pending = new Map<string, PendingRun>();
  /** Abort callbacks for in-flight validateCustomAlgorithm workers, so
   * dispose() can settle and terminate those too (they are not runs and
   * never enter `pending`). */
  private readonly pendingValidations = new Set<() => void>();

  constructor(policy: CustomAlgorithmPolicy = DEFAULT_CUSTOM_ALGORITHM_POLICY) {
    this.policy = policy;
  }

  /**
   * Checks source syntax validity, entrypoint presence, and callable
   * signature. Pure-TS pre-checks (empty/oversized source) short-circuit
   * before ever spinning up a worker; everything else requires real
   * CPython (via Pyodide) and is not approximated in TypeScript. Does NOT
   * execute the source - see worker/custom-scheduling.worker.ts's
   * VALIDATE_PYTHON script, which is AST-only.
   */
  validateCustomAlgorithm(source: string): Promise<CustomValidationResult> {
    const preflight = collectPreflightIssues({ source }, this.policy);
    if (preflight.length > 0) {
      return Promise.resolve({ valid: false, issues: preflight, reachedPythonCheck: false });
    }

    const runId = `validate-${crypto.randomUUID()}`;
    return new Promise((resolve) => {
      const worker = this.createWorker();
      let settled = false;
      const finish = (result: CustomValidationResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(startupTimer);
        this.pendingValidations.delete(abort);
        worker.terminate();
        resolve(result);
      };
      const abort = () =>
        finish({
          valid: false,
          issues: [
            makeIssue({
              code: "CUSTOM_ALGORITHM_RUNTIME_ERROR",
              message: "Validation was aborted because the engine was disposed.",
              path: [],
              source: "custom-algorithm",
            }),
          ],
          reachedPythonCheck: false,
        });
      this.pendingValidations.add(abort);
      // A hung Pyodide bootstrap would otherwise leave this promise pending
      // forever - "validated" is the only settling message and it requires
      // a live runtime. Same rationale as runOnWorker()'s startup timer.
      const startupTimer = setTimeout(() => {
        finish({
          valid: false,
          issues: [
            makeIssue({
              code: "CUSTOM_ALGORITHM_RUNTIME_ERROR",
              message: `The Python environment did not start within ${this.policy.environmentStartupTimeoutMs} ms; validation was abandoned.`,
              path: [],
              source: "custom-algorithm",
            }),
          ],
          reachedPythonCheck: false,
        });
      }, this.policy.environmentStartupTimeoutMs);

      worker.onmessage = (event: MessageEvent<CustomWorkerResponse>) => {
        const msg = event.data;
        if (msg.runId !== runId) return;
        if (msg.type === "validated") {
          const issues = msg.issues.map((issue) =>
            makeIssue({
              code: issue.code,
              message: issue.message,
              path: issue.line !== undefined ? ["source", `line:${issue.line}`] : ["source"],
              source: "custom-algorithm",
            }),
          );
          finish({ valid: msg.valid, issues, reachedPythonCheck: true });
        } else if (msg.type === "error") {
          finish({
            valid: false,
            issues: [
              makeIssue({ code: "CUSTOM_ALGORITHM_RUNTIME_ERROR", message: msg.message, path: [], source: "custom-algorithm" }),
            ],
            reachedPythonCheck: false,
          });
        }
        // "progress" (Pyodide bootstrap stages) is otherwise ignored here.
      };
      worker.onerror = (event) => {
        finish({
          valid: false,
          issues: [
            makeIssue({
              code: "CUSTOM_ALGORITHM_RUNTIME_ERROR",
              message: event.message || "The validation worker stopped unexpectedly.",
              path: [],
              source: "custom-algorithm",
            }),
          ],
          reachedPythonCheck: false,
        });
      };

      worker.postMessage({ type: "validate", runId, source } satisfies CustomWorkerRequest);
    });
  }

  /**
   * Runs a custom algorithm against `options.problem` inside a fresh,
   * disposable Worker. Never rejects - every outcome (including a runtime
   * exception inside the user's script) resolves to a `CustomRunResult`
   * with a specific `status`.
   */
  runCustomAlgorithm(options: RunCustomAlgorithmOptions): Promise<CustomRunResult> {
    const runId = options.runId ?? `run-${crypto.randomUUID()}`;
    const timeLimitMs = effectiveTimeLimitMs(options.limits?.timeLimitMs, this.policy);
    const parameters = options.parameters ?? {};
    const algorithmName = options.algorithmName ?? "Custom algorithm";
    const randomSeed = options.randomSeed ?? null;

    // Reproducibility metadata (sha256 of the source) is computed
    // concurrently with, not before, the checks below - it must never
    // delay Worker creation, which stays entirely synchronous up through
    // `worker.postMessage(...)` in runOnWorker(). Every path below only
    // *awaits* reproPromise at the point it actually assembles a result.
    const reproPromise = this.buildReproducibility(options.source, algorithmName, parameters, randomSeed, timeLimitMs);

    // A caller-supplied runId that collides with an in-flight run would
    // otherwise silently overwrite the pending-map entry, cross-wiring
    // cancellation and teardown between the two runs.
    if (this.pending.has(runId)) {
      const issue = makeIssue({
        code: "CUSTOM_ALGORITHM_LIMITS_EXCEED_POLICY",
        message: `A run with runId '${runId}' is already in progress; runIds must be unique per run.`,
        path: ["runId"],
        source: "custom-algorithm",
      });
      return reproPromise.then((repro) => emptyResult(runId, "validation_failed", "validation_error", [issue], repro));
    }

    const preflightIssues = collectPreflightIssues(
      { source: options.source, parameters, timeLimitMs: options.limits?.timeLimitMs },
      this.policy,
    );
    if (preflightIssues.length > 0) {
      return reproPromise.then((repro) => emptyResult(runId, "validation_failed", "validation_error", preflightIssues, repro));
    }

    const problemIssues = validateProblemDefinition(options.problem);
    if (hasBlockingError(problemIssues)) {
      return reproPromise.then((repro) => emptyResult(runId, "validation_failed", "validation_error", problemIssues, repro));
    }
    const policyViolation = checkExecutionPolicy(options.problem, SYNTHETIC_CUSTOM_ALGORITHM_DEFINITION);
    if (policyViolation) {
      const issue = makeIssue({
        code: "CUSTOM_ALGORITHM_LIMITS_EXCEED_POLICY",
        message: policyViolation.message,
        path: ["problem"],
        source: "custom-algorithm",
      });
      return reproPromise.then((repro) => emptyResult(runId, "validation_failed", "validation_error", [issue], repro));
    }

    return this.runOnWorker(runId, options, timeLimitMs, parameters, reproPromise);
  }

  /** Hard cancellation: terminates the run's Worker immediately, regardless
   * of whether the algorithm cooperates - see the module docstring and
   * docs/CUSTOM_PYTHON_ALGORITHMS.md's cancellation section for why this
   * (not a cooperative flag) is the only mechanism that reliably works. */
  cancelCustomAlgorithm(runId: string): void {
    const pending = this.pending.get(runId);
    if (!pending) return;
    this.pending.delete(runId);
    pending.onCancelled();
  }

  dispose(): void {
    for (const runId of [...this.pending.keys()]) {
      this.cancelCustomAlgorithm(runId);
    }
    for (const abort of [...this.pendingValidations]) {
      abort();
    }
  }

  private createWorker(): Worker {
    return new Worker(new URL("../../worker/custom-scheduling.worker.ts", import.meta.url), { type: "module" });
  }

  private async buildReproducibility(
    source: string,
    algorithmName: string,
    parameters: Record<string, unknown>,
    randomSeed: number | string | null,
    timeLimitMs: number,
  ): Promise<CustomRunReproducibility> {
    const sourceChecksum = await sha256Hex(new TextEncoder().encode(source).buffer as ArrayBuffer);
    return {
      algorithmName,
      sourceChecksum,
      lekinpyVersion: "0.2.0",
      schemaVersion: "1.0.0",
      parameters,
      randomSeed,
      timeLimitMs,
    };
  }

  private runOnWorker(
    runId: string,
    options: RunCustomAlgorithmOptions,
    timeLimitMs: number,
    parameters: Record<string, unknown>,
    reproPromise: Promise<CustomRunReproducibility>,
  ): Promise<CustomRunResult> {
    return new Promise((resolve) => {
      // Everything through worker.postMessage() below is synchronous - the
      // disposable Worker exists and has received its request before this
      // Promise executor returns, independent of whether reproPromise (the
      // sha256 checksum) has resolved yet. See runCustomAlgorithm()'s
      // comment for why that independence matters.
      const worker = this.createWorker();
      // Reset to performance.now() once the "running" progress stage
      // arrives (see below) - Pyodide/wheel load time must not eat into
      // the algorithm's own time budget, matching how
      // BrowserExecutionEngine (app/execution/browser-execution-engine.ts)
      // already times the trusted worker's runs. Until "running" arrives,
      // elapsedMs() measures from Worker creation, same as the trusted
      // engine's pre-"running" behavior.
      let startedAt = performance.now();
      const progressEvents: CustomProgressEvent[] = [];
      let invalidIncumbentUpdates = 0;
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      let startupTimer: ReturnType<typeof setTimeout> | null = null;

      const elapsedMs = () => Math.round(performance.now() - startedAt);

      /**
       * Claims "settled" and tears down the worker/timer immediately
       * (synchronously), then resolves the outer promise once
       * reproPromise is ready. Claiming settled synchronously - not inside
       * the `.then()` - is what prevents two near-simultaneous triggers
       * (e.g. a message arriving right as the timeout fires) from both
       * proceeding.
       */
      const finishWithRepro = (build: (repro: CustomRunReproducibility) => CustomRunResult) => {
        if (settled) return;
        settled = true;
        if (timer !== null) clearTimeout(timer);
        if (startupTimer !== null) clearTimeout(startupTimer);
        this.pending.delete(runId);
        worker.terminate();
        reproPromise.then((repro) => resolve(build(repro)));
      };

      /** Bounds Pyodide/wheel bootstrap, which the algorithm timeout below
       * deliberately excludes - without this, a hung loadPyodide() (e.g. an
       * unreachable CDN that neither resolves nor rejects) would leave this
       * promise pending forever, permanently occupying the caller. Cleared
       * the moment "running" arrives. */
      startupTimer = setTimeout(() => {
        finishWithRepro((repro) =>
          buildResult(runId, "runtime_failed", "runtime_exception", [
            makeIssue({
              code: "CUSTOM_ALGORITHM_RUNTIME_ERROR",
              message: `The Python environment did not start within ${this.policy.environmentStartupTimeoutMs} ms; the run was abandoned before the algorithm ever started.`,
              path: [],
              source: "custom-algorithm",
            }),
          ], repro, {
            runtimeMs: elapsedMs(),
            progress: progressEvents,
            diagnostics: { droppedProgressMessages: 0, droppedIncumbentUpdates: 0, invalidIncumbentUpdates },
          }),
        );
      }, this.policy.environmentStartupTimeoutMs);

      /** Armed only once Python actually starts running (see the
       * "progress"/"running" case below) - the whole point of the fix. */
      const armTimeout = () => {
        if (timer !== null) return;
        timer = setTimeout(() => {
          finishWithRepro((repro) =>
            buildResult(runId, "timed_out", "timeout", [
              makeIssue({
                code: "CUSTOM_ALGORITHM_TIMEOUT",
                message: `The custom algorithm did not finish within its ${timeLimitMs} ms time limit and was terminated.`,
                path: [],
                source: "custom-algorithm",
              }),
            ], repro, {
              runtimeMs: elapsedMs(),
              progress: progressEvents,
              diagnostics: { droppedProgressMessages: 0, droppedIncumbentUpdates: 0, invalidIncumbentUpdates },
            }),
          );
        }, timeLimitMs + TIMEOUT_GRACE_MS);
      };

      this.pending.set(runId, {
        worker,
        onCancelled: () =>
          finishWithRepro((repro) =>
            buildResult(runId, "cancelled", "user_cancelled", [
              makeIssue({
                code: "CUSTOM_ALGORITHM_TIMEOUT",
                message: "The custom algorithm run was cancelled.",
                path: [],
                source: "custom-algorithm",
              }),
            ], repro, {
              runtimeMs: elapsedMs(),
              progress: progressEvents,
              diagnostics: { droppedProgressMessages: 0, droppedIncumbentUpdates: 0, invalidIncumbentUpdates },
            }),
          ),
      });

      worker.onmessage = (event: MessageEvent<CustomWorkerResponse>) => {
        const msg = event.data;
        if (msg.runId !== runId) return;

        switch (msg.type) {
          case "progress":
            if (msg.stage === "running") {
              if (startupTimer !== null) {
                clearTimeout(startupTimer);
                startupTimer = null;
              }
              startedAt = performance.now();
              armTimeout();
            }
            return;

          case "custom-progress": {
            const progressEvent: CustomProgressEvent = {
              progress: msg.progress,
              message: msg.message ?? undefined,
              atMs: elapsedMs(),
            };
            progressEvents.push(progressEvent);
            options.onProgress?.(progressEvent);
            return;
          }

          case "custom-incumbent": {
            // fromLekinpyScheduleDict() assumes lekinpy's to_dict() shape and
            // throws on anything else (e.g. a Schedule subclass overriding
            // to_dict(), or a message forged via Pyodide's JS interop) - an
            // uncaught throw here would crash this onmessage handler, so a
            // malformed dict is treated exactly like an infeasible incumbent.
            let schedule: ReturnType<typeof fromLekinpyScheduleDict>;
            try {
              schedule = fromLekinpyScheduleDict(msg.scheduleDict, `incumbent-${runId}-${progressEvents.length}`, "custom");
            } catch {
              invalidIncumbentUpdates += 1;
              return;
            }
            const issues = validateScheduleAgainstProblem(schedule, options.problem);
            if (issues.length > 0) {
              invalidIncumbentUpdates += 1;
              return; // never expose an unvalidated incumbent to the caller
            }
            const metrics = computeMetrics(schedule, options.problem);
            const incumbentEvent: CustomIncumbentEvent = {
              schedule,
              metrics,
              objective: msg.objective ?? undefined,
              message: msg.message ?? undefined,
              atMs: elapsedMs(),
            };
            options.onIncumbent?.(incumbentEvent);
            return;
          }

          case "completed": {
            // Same throw hazard as the "custom-incumbent" case above: a
            // malformed dict must settle the run as invalid_result, not
            // crash the handler and leave the run to die by timeout.
            let schedule: ReturnType<typeof fromLekinpyScheduleDict>;
            try {
              schedule = fromLekinpyScheduleDict(msg.scheduleDict, `schedule-${runId}`, "custom");
            } catch (error) {
              finishWithRepro((repro) =>
                buildResult(runId, "invalid_result", "invalid_return_value", [
                  makeIssue({
                    code: "SCHEDULE_SCHEMA_INVALID",
                    message: `The returned schedule could not be translated: ${error instanceof Error ? error.message : String(error)}`,
                    path: ["schedule"],
                    source: "schedule",
                  }),
                ], repro, {
                  runtimeMs: elapsedMs(),
                  stdout: msg.stdout,
                  stdoutTruncated: msg.stdoutTruncated,
                  stderr: msg.stderr,
                  stderrTruncated: msg.stderrTruncated,
                  progress: progressEvents,
                  diagnostics: {
                    droppedProgressMessages: msg.droppedProgressMessages,
                    droppedIncumbentUpdates: msg.droppedIncumbentUpdates,
                    invalidIncumbentUpdates,
                  },
                }),
              );
              return;
            }
            const issues = validateScheduleAgainstProblem(schedule, options.problem);
            if (issues.length > 0) {
              finishWithRepro((repro) =>
                buildResult(runId, "invalid_result", "invalid_return_value", issues, repro, {
                  runtimeMs: elapsedMs(),
                  stdout: msg.stdout,
                  stdoutTruncated: msg.stdoutTruncated,
                  stderr: msg.stderr,
                  stderrTruncated: msg.stderrTruncated,
                  progress: progressEvents,
                  diagnostics: {
                    droppedProgressMessages: msg.droppedProgressMessages,
                    droppedIncumbentUpdates: msg.droppedIncumbentUpdates,
                    invalidIncumbentUpdates,
                  },
                }),
              );
              return;
            }

            const metrics = computeMetrics(schedule, options.problem);
            finishWithRepro((repro) => {
              const result: ExecutionResult = {
                executionId: runId,
                executionMode: "browser",
                algorithmId: "custom",
                algorithmVersion: repro.sourceChecksum.slice(0, 12),
                lekinpyVersion: msg.lekinpyVersion,
                schemaVersion: "1.0.0",
                status: "completed",
                runtimeMs: elapsedMs(),
                schedule,
                metrics,
                validationIssues: [],
                policyViolation: null,
                warnings: [],
              };
              return {
                runId,
                status: "completed",
                terminationReason: "completed",
                result,
                issues: [],
                runtimeMs: elapsedMs(),
                stdout: msg.stdout,
                stdoutTruncated: msg.stdoutTruncated,
                stderr: msg.stderr,
                stderrTruncated: msg.stderrTruncated,
                progress: progressEvents,
                reproducibility: repro,
                diagnostics: {
                  droppedProgressMessages: msg.droppedProgressMessages,
                  droppedIncumbentUpdates: msg.droppedIncumbentUpdates,
                  invalidIncumbentUpdates,
                },
              };
            });
            return;
          }

          case "problem-invalid": {
            finishWithRepro((repro) =>
              buildResult(
                runId,
                "validation_failed",
                "validation_error",
                [makeIssue({ code: msg.code, message: msg.message, path: [], source: "library" })],
                repro,
                { runtimeMs: elapsedMs(), progress: progressEvents, diagnostics: { droppedProgressMessages: 0, droppedIncumbentUpdates: 0, invalidIncumbentUpdates } },
              ),
            );
            return;
          }

          case "custom-error": {
            const [status, terminationReason] = statusForCustomErrorCode(msg.code);
            finishWithRepro((repro) =>
              buildResult(runId, status, terminationReason, [
                makeIssue({ code: msg.code, message: msg.message, path: [], source: "custom-algorithm" }),
              ], repro, {
                runtimeMs: elapsedMs(),
                stdout: msg.stdout,
                stdoutTruncated: msg.stdoutTruncated,
                stderr: msg.stderr,
                stderrTruncated: msg.stderrTruncated,
                progress: progressEvents,
                diagnostics: {
                  traceback: msg.traceback ?? undefined,
                  droppedProgressMessages: msg.droppedProgressMessages,
                  droppedIncumbentUpdates: msg.droppedIncumbentUpdates,
                  invalidIncumbentUpdates,
                },
              }),
            );
            return;
          }

          case "error": {
            finishWithRepro((repro) =>
              buildResult(runId, "runtime_failed", "runtime_exception", [
                makeIssue({ code: "CUSTOM_ALGORITHM_RUNTIME_ERROR", message: msg.message, path: [], source: "custom-algorithm" }),
              ], repro, {
                runtimeMs: elapsedMs(),
                progress: progressEvents,
                diagnostics: { droppedProgressMessages: 0, droppedIncumbentUpdates: 0, invalidIncumbentUpdates },
              }),
            );
            return;
          }
        }
      };

      worker.onerror = (event) => {
        finishWithRepro((repro) =>
          buildResult(runId, "runtime_failed", "runtime_exception", [
            makeIssue({
              code: "CUSTOM_ALGORITHM_RUNTIME_ERROR",
              message: event.message || "The custom algorithm worker stopped unexpectedly.",
              path: [],
              source: "custom-algorithm",
            }),
          ], repro, {
            runtimeMs: elapsedMs(),
            progress: progressEvents,
            diagnostics: { droppedProgressMessages: 0, droppedIncumbentUpdates: 0, invalidIncumbentUpdates },
          }),
        );
      };

      worker.postMessage({
        type: "run",
        runId,
        source: options.source,
        system: toLekinpySystemPayload(options.problem),
        parametersJson: JSON.stringify(parameters),
        timeLimitMs,
        randomSeedJson: JSON.stringify(options.randomSeed ?? null),
        maxProgressMessages: this.policy.maxProgressMessages,
        maxIncumbentUpdates: this.policy.maxIncumbentUpdates,
        maxStdoutChars: this.policy.maxStdoutChars,
        maxStderrChars: this.policy.maxStderrChars,
      } satisfies CustomWorkerRequest);
    });
  }
}

function statusForCustomErrorCode(code: ValidationErrorCode): [CustomRunStatus, CustomRunTerminationReason] {
  switch (code) {
    case "CUSTOM_ALGORITHM_SYNTAX_ERROR":
    case "CUSTOM_ALGORITHM_MISSING_ENTRYPOINT":
    case "CUSTOM_ALGORITHM_INVALID_SIGNATURE":
      return ["validation_failed", "validation_error"];
    case "CUSTOM_ALGORITHM_INVALID_RESULT":
      return ["invalid_result", "invalid_return_value"];
    default:
      return ["runtime_failed", "runtime_exception"];
  }
}

interface PartialResultFields {
  runtimeMs: number;
  stdout?: string;
  stdoutTruncated?: boolean;
  stderr?: string;
  stderrTruncated?: boolean;
  progress: CustomProgressEvent[];
  diagnostics: CustomRunDiagnostics;
}

function buildResult(
  runId: string,
  status: CustomRunStatus,
  terminationReason: CustomRunTerminationReason,
  issues: ReturnType<typeof makeIssue>[],
  reproducibility: CustomRunReproducibility,
  fields: PartialResultFields,
): CustomRunResult {
  return {
    runId,
    status,
    terminationReason,
    result: null,
    issues,
    runtimeMs: fields.runtimeMs,
    stdout: fields.stdout ?? "",
    stdoutTruncated: fields.stdoutTruncated ?? false,
    stderr: fields.stderr ?? "",
    stderrTruncated: fields.stderrTruncated ?? false,
    progress: fields.progress,
    reproducibility,
    diagnostics: fields.diagnostics,
  };
}

function emptyResult(
  runId: string,
  status: CustomRunStatus,
  terminationReason: CustomRunTerminationReason,
  issues: ReturnType<typeof makeIssue>[],
  reproducibility: CustomRunReproducibility,
): CustomRunResult {
  return buildResult(runId, status, terminationReason, issues, reproducibility, {
    runtimeMs: 0,
    progress: [],
    diagnostics: { droppedProgressMessages: 0, droppedIncumbentUpdates: 0, invalidIncumbentUpdates: 0 },
  });
}
