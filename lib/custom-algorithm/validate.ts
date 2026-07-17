import { makeIssue } from "../schema/issue";
import type { ValidationIssue } from "../schema/issue";
import {
  DEFAULT_CUSTOM_ALGORITHM_POLICY,
  isSourceSizeWithinPolicy,
  isTimeLimitWithinPolicy,
  sourceSizeBytes,
  type CustomAlgorithmPolicy,
} from "./policy";

/**
 * Pure-TypeScript, pre-Pyodide validation checks for custom algorithms -
 * mirrors ARCHITECTURE.md §2.2's "cheap checks before paying for the
 * runtime" ordering: empty/oversized source, non-serializable parameters,
 * and out-of-policy limits are all checkable without ever loading Pyodide,
 * so they run first and can short-circuit before a worker is spun up.
 *
 * Python-native checks this module deliberately does NOT attempt (syntax
 * validity, entrypoint presence, callable signature) are handled by
 * worker/custom-scheduling.worker.ts's "validate" mode, since only a real
 * Python parser can answer them correctly - see
 * docs/CUSTOM_PYTHON_ALGORITHMS.md.
 */

export function isBlankSource(source: string): boolean {
  return source.trim().length === 0;
}

const JSON_PRIMITIVE_TYPES = new Set(["string", "number", "boolean"]);

/**
 * Recursively checks that `value` contains only plain JSON-representable
 * data (string/number/boolean/null, plain arrays, plain objects) - no
 * functions, symbols, bigints, class instances, or circular references.
 * Returns the first offending path found, or null if fully serializable.
 */
export function findNonSerializablePath(
  value: unknown,
  path: Array<string | number> = [],
  seen: Set<unknown> = new Set(),
): Array<string | number> | null {
  if (value === null) return null;
  const type = typeof value;
  if (JSON_PRIMITIVE_TYPES.has(type)) {
    if (type === "number" && !Number.isFinite(value as number)) return path;
    return null;
  }
  if (type === "undefined" || type === "function" || type === "symbol" || type === "bigint") {
    return path;
  }
  if (type !== "object") return path;

  if (seen.has(value)) return path; // circular reference
  seen.add(value);

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const bad = findNonSerializablePath(value[i], [...path, i], seen);
      if (bad) return bad;
    }
    return null;
  }

  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return path; // class instance, Map, Set, Date, etc.

  for (const [key, entryValue] of Object.entries(value as Record<string, unknown>)) {
    const bad = findNonSerializablePath(entryValue, [...path, key], seen);
    if (bad) return bad;
  }
  return null;
}

export interface CustomAlgorithmPreflightInput {
  source: string;
  parameters?: Record<string, unknown>;
  timeLimitMs?: number;
}

/**
 * Collects every pure-TS-checkable blocking issue in one pass (matching
 * the rest of this codebase's multi-error validation convention -
 * lib/schema/problem.ts's `collectStructuralIssues`). An empty return
 * means "safe to spend Pyodide startup cost on the remaining Python-native
 * checks," not "fully valid" - see CustomValidationResult.reachedPythonCheck.
 */
export function collectPreflightIssues(
  input: CustomAlgorithmPreflightInput,
  policy: CustomAlgorithmPolicy = DEFAULT_CUSTOM_ALGORITHM_POLICY,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (isBlankSource(input.source)) {
    issues.push(
      makeIssue({
        code: "CUSTOM_ALGORITHM_EMPTY_SOURCE",
        message: "Custom algorithm source is empty. Write a schedule(system, parameters, context) function.",
        path: ["source"],
        source: "custom-algorithm",
      }),
    );
    // Every other pre-check is meaningless against empty source.
    return issues;
  }

  if (!isSourceSizeWithinPolicy(input.source, policy)) {
    issues.push(
      makeIssue({
        code: "CUSTOM_ALGORITHM_SOURCE_TOO_LARGE",
        message: `Custom algorithm source is ${sourceSizeBytes(input.source)} bytes, exceeding the ${policy.maxSourceBytes}-byte limit. Shorten the script.`,
        path: ["source"],
        source: "custom-algorithm",
      }),
    );
  }

  if (input.parameters !== undefined) {
    const badPath = findNonSerializablePath(input.parameters);
    if (badPath) {
      issues.push(
        makeIssue({
          code: "CUSTOM_ALGORITHM_PARAMETERS_NOT_SERIALIZABLE",
          message: `Parameter value at ${["parameters", ...badPath].join(".")} is not JSON-serializable (functions, symbols, bigints, class instances, and circular references are not allowed).`,
          path: ["parameters", ...badPath],
          source: "custom-algorithm",
        }),
      );
    }
  }

  if (input.timeLimitMs !== undefined && !isTimeLimitWithinPolicy(input.timeLimitMs, policy)) {
    issues.push(
      makeIssue({
        code: "CUSTOM_ALGORITHM_LIMITS_EXCEED_POLICY",
        message: `Requested time limit ${input.timeLimitMs} ms is not a positive number within the ${policy.maxTimeLimitMs} ms policy ceiling.`,
        path: ["limits", "timeLimitMs"],
        source: "custom-algorithm",
      }),
    );
  }

  return issues;
}
