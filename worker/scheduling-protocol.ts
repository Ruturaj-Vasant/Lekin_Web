import type { LekinpyScheduleDict, LekinpySystemPayload } from "../lib/adapter/translate";
import type { ValidationErrorCode } from "../lib/schema/codes";

export type ExecutionProgress = "loading-runtime" | "verifying-wheel" | "installing-wheel" | "running";

export type WorkerExecuteMessage = {
  type: "execute";
  executionId: string;
  algorithmId: string;
  system: LekinpySystemPayload;
};

export type WorkerRequest = WorkerExecuteMessage;

export type WorkerProgressMessage = {
  type: "progress";
  executionId: string;
  stage: ExecutionProgress;
};

export type WorkerCompletedMessage = {
  type: "completed";
  executionId: string;
  schedule: LekinpyScheduleDict;
  lekinpyVersion: string;
  algorithmVersion: string;
};

export type WorkerValidationMessage = {
  type: "validation-error";
  executionId: string;
  code: ValidationErrorCode;
  message: string;
};

export type WorkerErrorMessage = {
  type: "error";
  executionId: string;
  message: string;
};

export type WorkerResponse =
  | WorkerProgressMessage
  | WorkerCompletedMessage
  | WorkerValidationMessage
  | WorkerErrorMessage;
