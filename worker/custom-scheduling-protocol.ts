import type { LekinpyScheduleDict, LekinpySystemPayload } from "../lib/adapter/translate";
import type { ValidationErrorCode } from "../lib/schema/codes";

/**
 * Message protocol for the DISPOSABLE custom-algorithm worker
 * (worker/custom-scheduling.worker.ts) - deliberately separate from
 * worker/scheduling-protocol.ts (the trusted, long-lived built-in-algorithm
 * worker's protocol). See docs/CUSTOM_PYTHON_ALGORITHMS.md "Worker
 * isolation" for why these are two different Worker classes rather than
 * one worker handling both: a custom worker is created fresh and
 * terminated after exactly one request, so it never shares Python state
 * (globals, monkeypatches, partially-consumed iterators, etc.) with the
 * trusted worker or with any other custom run.
 */

export type CustomWorkerProgressStage = "loading-runtime" | "verifying-wheel" | "installing-wheel" | "running";

export type CustomWorkerValidateRequest = {
  type: "validate";
  runId: string;
  source: string;
};

export type CustomWorkerRunRequest = {
  type: "run";
  runId: string;
  source: string;
  system: LekinpySystemPayload;
  parametersJson: string;
  timeLimitMs: number;
  randomSeedJson: string; // "null" or a JSON-encoded number/string
  maxProgressMessages: number;
  maxIncumbentUpdates: number;
  maxStdoutChars: number;
  maxStderrChars: number;
};

export type CustomWorkerRequest = CustomWorkerValidateRequest | CustomWorkerRunRequest;

export interface CustomWorkerValidationIssue {
  code: ValidationErrorCode;
  message: string;
  line?: number;
  column?: number;
}

export type CustomWorkerResponse =
  | { type: "progress"; runId: string; stage: CustomWorkerProgressStage }
  | { type: "validated"; runId: string; valid: boolean; issues: CustomWorkerValidationIssue[] }
  | { type: "custom-progress"; runId: string; progress: number; message: string | null }
  | {
      type: "custom-incumbent";
      runId: string;
      scheduleDict: LekinpyScheduleDict;
      objective: number | null;
      message: string | null;
    }
  | {
      type: "completed";
      runId: string;
      scheduleDict: LekinpyScheduleDict;
      lekinpyVersion: string;
      stdout: string;
      stdoutTruncated: boolean;
      stderr: string;
      stderrTruncated: boolean;
      droppedProgressMessages: number;
      droppedIncumbentUpdates: number;
    }
  | {
      /** The PROBLEM itself failed lekinpy's last-mile system.validate() - rare, see §2.2 step 5 precedent. */
      type: "problem-invalid";
      runId: string;
      code: ValidationErrorCode;
      message: string;
    }
  | {
      /** The custom SOURCE or its RETURN VALUE was rejected - syntax/entrypoint/signature/runtime/result. */
      type: "custom-error";
      runId: string;
      code: ValidationErrorCode;
      message: string;
      traceback: string | null;
      stdout: string;
      stdoutTruncated: boolean;
      stderr: string;
      stderrTruncated: boolean;
      droppedProgressMessages: number;
      droppedIncumbentUpdates: number;
    }
  | { type: "error"; runId: string; message: string };
