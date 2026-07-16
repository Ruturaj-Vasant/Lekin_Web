import type { ProblemDefinition } from "../schema/problem";
import type { ExecutionResult } from "../schema/algorithm";

/**
 * The set of algorithm results collected so far for one specific problem,
 * keyed by algorithmId (re-running the same algorithm replaces its prior
 * result). Compared by reference against the live problem, mirroring
 * ResultContext/isResultStale in result-staleness.ts: since every
 * problem-editor mutation returns a new ProblemDefinition object, reference
 * inequality is exactly "the problem changed since these results were
 * recorded" -- no deep-equality or hashing needed.
 */
export interface ComparisonHistory {
  problem: ProblemDefinition;
  results: Record<string, ExecutionResult>;
}

/** Records a completed execution into the running comparison set, starting a fresh set if the problem has changed since the last recorded result. */
export function recordComparisonResult(
  history: ComparisonHistory | null,
  problem: ProblemDefinition,
  result: ExecutionResult,
): ComparisonHistory {
  const base = history !== null && history.problem === problem ? history.results : {};
  return { problem, results: { ...base, [result.algorithmId]: result } };
}

/** The comparison set for the current problem, or an empty array if none has been recorded yet or the problem has since changed. */
export function comparisonResultsFor(
  history: ComparisonHistory | null,
  problem: ProblemDefinition,
): ExecutionResult[] {
  if (history === null || history.problem !== problem) return [];
  return Object.values(history.results);
}
