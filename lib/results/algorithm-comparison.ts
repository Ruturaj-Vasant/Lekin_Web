import type { ExecutionResult } from "../schema/algorithm";
import { getAlgorithmDefinition } from "../registry";

export const COMPARISON_METRICS = [
  "makespan",
  "totalTardiness",
  "weightedTardiness",
  "totalCompletionTime",
] as const;
export type ComparisonMetric = (typeof COMPARISON_METRICS)[number];

export interface AlgorithmComparisonRow {
  algorithmId: string;
  status: ExecutionResult["status"];
  feasible: boolean;
  runtimeMs: number;
  makespan: number | null;
  totalTardiness: number | null;
  weightedTardiness: number | null;
  totalCompletionTime: number | null;
  limitations: string[];
}

export interface AlgorithmComparisonResult {
  rows: AlgorithmComparisonRow[];
  /** algorithmId of the lowest (best) feasible value for each metric, omitted if no row is feasible for it. */
  bestByMetric: Partial<Record<ComparisonMetric, string>>;
}

/**
 * PRODUCT_SPEC.md section 19 - Algorithm comparison: makespan, tardiness,
 * weighted tardiness, completion time, runtime, feasibility. Every input
 * result is assumed to already be for the same problem (see
 * lib/editor/comparison-history.ts, which enforces that by construction);
 * this function only shapes results into a comparable table and picks a
 * per-metric winner. Lower is better for every metric here; a
 * non-"completed" result has null metrics (ExecutionResultSchema's
 * invariant) and is excluded from bestByMetric but still shown as a row.
 */
export function buildAlgorithmComparison(results: readonly ExecutionResult[]): AlgorithmComparisonResult {
  const rows: AlgorithmComparisonRow[] = results.map((result) => {
    const definition = getAlgorithmDefinition(result.algorithmId);
    const limitations = result.algorithmId === "custom"
      ? ["User-defined Python"]
      : definition
      ? [
          ...(!definition.supportsWeights ? ["Ignores job weights"] : []),
          ...(!definition.supportsReleaseTimes ? ["Ignores release times"] : []),
          ...(!definition.libraryMetadata.supportsMultiOperation ? ["Single-operation jobs only"] : []),
        ]
      : ["Registry metadata unavailable"];
    return {
      algorithmId: result.algorithmId,
      status: result.status,
      feasible: result.status === "completed",
      runtimeMs: result.runtimeMs,
      makespan: result.metrics?.makespan ?? null,
      totalTardiness: result.metrics?.totalTardiness ?? null,
      weightedTardiness: result.metrics?.weightedTardiness ?? null,
      totalCompletionTime: result.metrics?.totalCompletionTime ?? null,
      limitations,
    };
  });

  const bestByMetric: AlgorithmComparisonResult["bestByMetric"] = {};
  for (const metric of COMPARISON_METRICS) {
    let best: AlgorithmComparisonRow | null = null;
    for (const row of rows) {
      const value = row[metric];
      if (!row.feasible || value === null) continue;
      if (best === null || value < (best[metric] as number)) best = row;
    }
    if (best !== null) bestByMetric[metric] = best.algorithmId;
  }

  return { rows, bestByMetric };
}
