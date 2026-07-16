import type { ValidationErrorCode } from "./codes";
import { severityForCode } from "./codes";

/** ARCHITECTURE.md §1.4 — ValidationIssue. */
export interface ValidationIssue {
  code: ValidationErrorCode;
  message: string;
  /** Zod-issue-path style, e.g. ["jobs", 2, "operations", 1, "processingTime"]. */
  path: Array<string | number>;
  source: "schema" | "library" | "schedule";
  severity: "error" | "warning";
  jobId?: string;
  operationIndex?: number;
  workcenterId?: string;
  machineId?: string;
}

export type ValidationIssueInput = Omit<ValidationIssue, "severity"> & {
  severity?: "error" | "warning";
};

/** Builds a ValidationIssue, defaulting severity from the code's category (§1.4). */
export function makeIssue(input: ValidationIssueInput): ValidationIssue {
  return {
    ...input,
    severity: input.severity ?? severityForCode(input.code),
  };
}

export function hasBlockingError(issues: ValidationIssue[]): boolean {
  return issues.some((issue) => issue.severity === "error");
}
