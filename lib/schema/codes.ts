/**
 * ValidationErrorCode - ARCHITECTURE.md §1.4.
 *
 * Shared vocabulary across both validation layers (`source: "schema"` from
 * Zod, `source: "library"` from a mapped lekinpy exception). Codes mirrored
 * 1:1 from lekinpy.exceptions map directly to their exception names; the
 * rest are web/editor-only structural checks or non-blocking warnings.
 */
export const VALIDATION_ERROR_CODES = [
  // Mirrored from lekinpy.exceptions.LekinValidationError subclasses.
  "EMPTY_OPERATIONS",
  "NON_POSITIVE_PROCESSING_TIME",
  "EMPTY_MACHINE_LIST",
  "DUPLICATE_JOB_ID",
  "DUPLICATE_MACHINE_ID",
  "DUPLICATE_WORKCENTER_ID",
  "MISSING_WORKCENTER_REFERENCE",
  // Web/editor-only structural checks.
  "INCONSISTENT_MACHINE_WORKCENTER",
  "INVALID_OPERATION_INDEX",
  "INVALID_NUMERIC_VALUE",
  "INVALID_RGB",
  "UNKNOWN_ALGORITHM_ID",
  "UNSUPPORTED_ALGORITHM_PROBLEM_COMBINATION",
  // Warnings - severity: "warning", never block execution.
  "DUE_BEFORE_RELEASE",
  "UNUSUALLY_LARGE_WEIGHT",
  "UNUSUALLY_LONG_PROCESSING_TIME",
  "UNCLEAR_STATUS",
  "APPROACHING_BROWSER_LIMIT",
  // Custom user-authored Python algorithm validation/execution (source:
  // "custom-algorithm"). See lib/custom-algorithm/policy.ts and
  // docs/CUSTOM_PYTHON_ALGORITHMS.md. All severity "error" - a custom run
  // either fully succeeds or is rejected, there is no warning-only case here.
  "CUSTOM_ALGORITHM_EMPTY_SOURCE",
  "CUSTOM_ALGORITHM_SYNTAX_ERROR",
  "CUSTOM_ALGORITHM_MISSING_ENTRYPOINT",
  "CUSTOM_ALGORITHM_INVALID_SIGNATURE",
  "CUSTOM_ALGORITHM_SOURCE_TOO_LARGE",
  "CUSTOM_ALGORITHM_PARAMETERS_NOT_SERIALIZABLE",
  "CUSTOM_ALGORITHM_LIMITS_EXCEED_POLICY",
  "CUSTOM_ALGORITHM_RUNTIME_ERROR",
  "CUSTOM_ALGORITHM_INVALID_RESULT",
  "CUSTOM_ALGORITHM_TIMEOUT",
  // Independent post-execution schedule-feasibility checks (source:
  // "schedule" - the value ARCHITECTURE.md §1.4 already reserved for this
  // exact purpose). Used by lib/scheduling/validate-schedule.ts to verify
  // ANY returned Schedule (today: from a custom algorithm) against the
  // ProblemDefinition it claims to schedule, independent of how it was
  // produced - never trusted merely for being a well-formed lekinpy object.
  "SCHEDULE_SCHEMA_INVALID",
  "SCHEDULE_MISSING_OPERATION",
  "SCHEDULE_DUPLICATE_OPERATION",
  "SCHEDULE_UNKNOWN_REFERENCE",
  "SCHEDULE_DURATION_MISMATCH",
  "SCHEDULE_INELIGIBLE_MACHINE",
  "SCHEDULE_PRECEDENCE_VIOLATION",
  "SCHEDULE_MACHINE_OVERLAP",
  "SCHEDULE_RELEASE_VIOLATION",
  "SCHEDULE_INVALID_TIME",
] as const;

export type ValidationErrorCode = (typeof VALIDATION_ERROR_CODES)[number];

/** Codes above this line in VALIDATION_ERROR_CODES are always severity "error". */
const WARNING_CODES: ReadonlySet<ValidationErrorCode> = new Set([
  "DUE_BEFORE_RELEASE",
  "UNUSUALLY_LARGE_WEIGHT",
  "UNUSUALLY_LONG_PROCESSING_TIME",
  "UNCLEAR_STATUS",
  "APPROACHING_BROWSER_LIMIT",
]);

export function severityForCode(code: ValidationErrorCode): "error" | "warning" {
  return WARNING_CODES.has(code) ? "warning" : "error";
}
