import { z } from "zod";
import { severityForCode, VALIDATION_ERROR_CODES } from "./codes";

/** ARCHITECTURE.md §1.4 - ValidationIssue. */
export const ValidationIssueSchema = z.object({
  code: z.enum(VALIDATION_ERROR_CODES),
  message: z.string(),
  /** Zod-issue-path style, e.g. ["jobs", 2, "operations", 1, "processingTime"]. */
  path: z.array(z.union([z.string(), z.number()])),
  source: z.enum(["schema", "library", "schedule"]),
  severity: z.enum(["error", "warning"]),
  jobId: z.string().optional(),
  operationIndex: z.number().optional(),
  workcenterId: z.string().optional(),
  machineId: z.string().optional(),
});
export type ValidationIssue = z.infer<typeof ValidationIssueSchema>;

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
