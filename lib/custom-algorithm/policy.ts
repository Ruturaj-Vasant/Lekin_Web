import { DEFAULT_BROWSER_EXECUTION_POLICY } from "../adapter/policy";
import type { AlgorithmDefinition } from "../schema/algorithm";

/**
 * Execution policy for user-defined custom Python algorithms.
 *
 * Distinct from `lib/adapter/policy.ts`'s `BrowserExecutionPolicy` (which
 * bounds PROBLEM size for the trusted built-in algorithms) - custom
 * algorithms are additionally bounded on SOURCE size, TIME budget, and
 * MESSAGE volume, because unlike a built-in algorithm, arbitrary user code
 * has unknown - possibly unbounded or malicious-by-accident - runtime
 * behavior. Problem-size limits still apply too; see
 * `DEFAULT_BROWSER_EXECUTION_POLICY` in lib/adapter/policy.ts, reused
 * as-is for custom runs (no separate/looser limit for custom algorithms).
 *
 * Values are deliberately conservative defaults for this milestone, not
 * benchmarked the way `DEFAULT_BROWSER_EXECUTION_POLICY` was (see
 * docs/BROWSER_CAPACITY.md) - a disposable per-run Pyodide worker has very
 * different cold-start cost than the trusted long-lived one, and there is
 * no UI consuming this yet to observe real usage patterns against. Flagged
 * as a benchmarking follow-up in lekin-web_DECISIONS.md.
 */
export interface CustomAlgorithmPolicy {
  /** Maximum size of the user-authored Python source, in UTF-8 bytes. */
  maxSourceBytes: number;
  /** Time limit applied when the caller does not request a specific one. */
  defaultTimeLimitMs: number;
  /**
   * Hard ceiling on a caller-requested time limit. Kept conservative: a
   * non-cooperating algorithm fully occupies its disposable worker's single
   * thread until either it finishes or `terminate()` fires (see
   * docs/CUSTOM_PYTHON_ALGORITHMS.md's cancellation section) - a long ceiling
   * here is a long worst-case unresponsive-tab window per run.
   */
  maxTimeLimitMs: number;
  /** Progress updates beyond this count are silently dropped, not queued. */
  maxProgressMessages: number;
  /** Incumbent-schedule updates beyond this count are silently dropped. */
  maxIncumbentUpdates: number;
  /** Captured stdout is truncated beyond this many UTF-16 characters. */
  maxStdoutChars: number;
  /** Captured stderr is truncated beyond this many UTF-16 characters. */
  maxStderrChars: number;
}

export const DEFAULT_CUSTOM_ALGORITHM_POLICY: CustomAlgorithmPolicy = {
  maxSourceBytes: 200_000,
  defaultTimeLimitMs: 5_000,
  maxTimeLimitMs: 20_000,
  maxProgressMessages: 200,
  maxIncumbentUpdates: 50,
  maxStdoutChars: 20_000,
  maxStderrChars: 20_000,
};

export function effectiveTimeLimitMs(
  requestedMs: number | undefined,
  policy: CustomAlgorithmPolicy = DEFAULT_CUSTOM_ALGORITHM_POLICY,
): number {
  return requestedMs ?? policy.defaultTimeLimitMs;
}

export function isTimeLimitWithinPolicy(
  requestedMs: number,
  policy: CustomAlgorithmPolicy = DEFAULT_CUSTOM_ALGORITHM_POLICY,
): boolean {
  return Number.isFinite(requestedMs) && requestedMs > 0 && requestedMs <= policy.maxTimeLimitMs;
}

export function isSourceSizeWithinPolicy(
  source: string,
  policy: CustomAlgorithmPolicy = DEFAULT_CUSTOM_ALGORITHM_POLICY,
): boolean {
  return new TextEncoder().encode(source).length <= policy.maxSourceBytes;
}

export function sourceSizeBytes(source: string): number {
  return new TextEncoder().encode(source).length;
}

/**
 * Custom algorithms have no `lib/registry/algorithms.ts` entry (they are
 * not built-in, approved, versioned library code), but PROBLEM-size limits
 * still apply identically (§ "existing problem-size limits" in this
 * feature's task spec) - `checkExecutionPolicy` from lib/adapter/policy.ts
 * takes an `AlgorithmDefinition` only to read its
 * `defaultBrowserOperationLimit` override; this synthetic definition
 * supplies the global policy's own `maxOperations` as that value (i.e. no
 * tighter override), so the exact same, already-tested limit-checking code
 * path is reused rather than duplicated.
 */
export const SYNTHETIC_CUSTOM_ALGORITHM_DEFINITION: AlgorithmDefinition = {
  id: "custom",
  libraryMetadata: {
    id: "custom",
    displayName: "Custom algorithm",
    supportsMultiOperation: true,
    version: "0.0.0",
  },
  shortName: "Custom",
  description: "User-defined Python algorithm.",
  problemTypes: [],
  supportsReleaseTimes: true,
  supportsWeights: true,
  browserCompatible: true,
  backendRequired: false,
  estimatedComplexity: "unknown",
  defaultBrowserOperationLimit: DEFAULT_BROWSER_EXECUTION_POLICY.maxOperations,
  parameters: [],
};
