import type { ProblemDefinition } from "../schema/problem";
import type { ExecutionResult } from "../schema/algorithm";
import { sameSchedulingInput } from "./scheduling-input-equality";

/**
 * The set of algorithm results collected so far for one specific problem,
 * keyed by algorithmId (re-running the same algorithm replaces its prior
 * result). Presentation-only edits retain the comparison set; actual
 * scheduling-input changes start a new set.
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
  const base = history !== null && sameSchedulingInput(history.problem, problem) ? history.results : {};
  return { problem, results: { ...base, [result.algorithmId]: result } };
}

/** The comparison set for the current problem, or an empty array if none has been recorded yet or the problem has since changed. */
export function comparisonResultsFor(
  history: ComparisonHistory | null,
  problem: ProblemDefinition,
): ExecutionResult[] {
  if (history === null || !sameSchedulingInput(history.problem, problem)) return [];
  return Object.values(history.results);
}

/** Removes one algorithm's stale result while preserving other comparisons for the same unchanged problem. */
export function removeComparisonResult(
  history: ComparisonHistory | null,
  problem: ProblemDefinition,
  algorithmId: string,
): ComparisonHistory | null {
  if (history === null || !sameSchedulingInput(history.problem, problem) || !(algorithmId in history.results)) return history;
  const results = { ...history.results };
  delete results[algorithmId];
  return { problem, results };
}
