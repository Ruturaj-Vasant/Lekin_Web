import type { ProblemDefinition } from "../schema/problem";

/**
 * What an ExecutionResult was actually computed for. Compared by reference
 * against the live problem/algorithmId: since every problem-editor mutation
 * (lib/editor/problem-editor.ts) returns a new ProblemDefinition object
 * rather than mutating in place, reference inequality is exactly "the
 * problem changed since this result was computed" -- no deep-equality or
 * hashing needed.
 */
export interface ResultContext {
  problem: ProblemDefinition;
  algorithmId: string;
}

/**
 * Whether a currently-displayed result should be cleared because the
 * problem or algorithm has changed since it was computed. Extracted as a
 * pure predicate (rather than inlined in a React effect) specifically so it
 * is unit-testable without a DOM/React testing setup, and so the state
 * reset in WorkspaceShell can happen during render -- React's documented
 * pattern for "adjusting state when a dependency changes" -- instead of in
 * a useEffect, which would cause an extra cascading render and trips the
 * react-hooks/set-state-in-effect lint rule.
 */
export function isResultStale(
  resultFor: ResultContext | null,
  currentProblem: ProblemDefinition,
  currentAlgorithmId: string,
): boolean {
  if (resultFor === null) return false;
  return resultFor.problem !== currentProblem || resultFor.algorithmId !== currentAlgorithmId;
}
