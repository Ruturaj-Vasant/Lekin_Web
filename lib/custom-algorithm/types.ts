import type { ExecutionResult } from "../schema/algorithm";
import type { ValidationIssue } from "../schema/issue";
import type { Metrics, Schedule } from "../schema/schedule";

/**
 * Shared, framework-independent types for user-defined custom Python
 * algorithm execution. See docs/CUSTOM_PYTHON_ALGORITHMS.md for the full
 * Python-side contract these mirror on the TypeScript side.
 */

export interface CustomValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  /**
   * true once the check reached real Python (syntax/entrypoint/signature
   * checks) rather than stopping at a pure-TS pre-check (empty/oversized
   * source, non-serializable parameters, out-of-policy limits). Lets a
   * caller distinguish "we know this is broken without spinning up
   * Pyodide" from "Pyodide confirmed this compiles and has a callable
   * entrypoint with a usable signature."
   */
  reachedPythonCheck: boolean;
}

export const CUSTOM_RUN_STATUSES = [
  "completed",
  "cancelled",
  "timed_out",
  "validation_failed",
  "runtime_failed",
  "invalid_result",
] as const;
export type CustomRunStatus = (typeof CUSTOM_RUN_STATUSES)[number];

export const CUSTOM_RUN_TERMINATION_REASONS = [
  "completed",
  "user_cancelled",
  "timeout",
  "validation_error",
  "runtime_exception",
  "invalid_return_value",
] as const;
export type CustomRunTerminationReason = (typeof CUSTOM_RUN_TERMINATION_REASONS)[number];

export interface CustomProgressEvent {
  progress: number;
  message?: string;
  /** Milliseconds since the run started (`performance.now()` delta). */
  atMs: number;
}

export interface CustomIncumbentEvent {
  schedule: Schedule;
  metrics: Metrics;
  objective?: number;
  message?: string;
  atMs: number;
}

/** Reproducibility metadata (per the task's explicit requirement list). */
export interface CustomRunReproducibility {
  algorithmName: string;
  sourceChecksum: string;
  lekinpyVersion: string;
  schemaVersion: string;
  parameters: Record<string, unknown>;
  randomSeed: number | string | null;
  timeLimitMs: number;
}

export interface CustomRunDiagnostics {
  /** Full Python traceback, present only when status is "runtime_failed". */
  traceback?: string;
  droppedProgressMessages: number;
  droppedIncumbentUpdates: number;
  /** Incumbent updates that arrived but failed independent validation. */
  invalidIncumbentUpdates: number;
}

export interface CustomRunResult {
  runId: string;
  status: CustomRunStatus;
  terminationReason: CustomRunTerminationReason;
  /** Set iff status === "completed". */
  result: ExecutionResult | null;
  /** Structured issues explaining an unsuccessful status. */
  issues: ValidationIssue[];
  runtimeMs: number;
  stdout: string;
  stdoutTruncated: boolean;
  stderr: string;
  stderrTruncated: boolean;
  /** Every progress update actually delivered to the caller, in order. */
  progress: CustomProgressEvent[];
  reproducibility: CustomRunReproducibility;
  diagnostics: CustomRunDiagnostics;
}

export interface RunCustomAlgorithmLimits {
  timeLimitMs?: number;
}

export interface RunCustomAlgorithmOptions {
  runId?: string;
  source: string;
  problem: import("../schema/problem").ProblemDefinition;
  parameters?: Record<string, unknown>;
  algorithmName?: string;
  randomSeed?: number | string;
  limits?: RunCustomAlgorithmLimits;
  onProgress?: (event: CustomProgressEvent) => void;
  onIncumbent?: (event: CustomIncumbentEvent) => void;
}
