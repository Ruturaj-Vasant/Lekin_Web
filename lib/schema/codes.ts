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
