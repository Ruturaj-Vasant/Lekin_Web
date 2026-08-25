import type { AlgorithmDefinition } from "../schema/algorithm";

/**
 * ARCHITECTURE.md §1.5 - Algorithm registry.
 *
 * `libraryMetadata` for each entry must stay byte-identical (mod
 * snake_case -> camelCase) to the pinned lekinpy v0.3.0 build's
 * SchedulingAlgorithm.metadata dict. Verified directly against
 * lekin-library/lekinpy/algorithms/{fcfs,spt,edd,wspt,johnson}.py at commit
 * 81a100b (v0.3.0):
 *   fcfs: {id: "fcfs", display_name: "First-Come, First-Served", supports_multi_operation: true, version: "1.0.0"}
 *   spt:  {id: "spt",  display_name: "Shortest Processing Time",  supports_multi_operation: true, version: "1.0.0"}
 *   edd:  {id: "edd",  display_name: "Earliest Due Date",         supports_multi_operation: true, version: "1.0.0"}
 *   wspt: {id: "wspt", display_name: "Weighted Shortest Processing Time", supports_multi_operation: true, version: "1.0.0"}
 *   johnson: {id: "johnson", display_name: "Johnson's Rule (SPT(1)-LPT(2))", supports_multi_operation: true, version: "1.0.0"}
 *
 * Everything else on AlgorithmDefinition is a web-owned addition - lekinpy's
 * plugin contract is deliberately minimal (see lekin-library_DECISIONS.md
 * item 5) and has no concept of shortName/description/problemTypes/etc.
 *
 * No auto-discovery exists (rejected in lekinpy item 5 - "no decorators or
 * entry-point magic yet"), so this file must be updated by hand whenever
 * lekin-library's pinned version changes. See verify.ts for the drift guard.
 */
export const ALGORITHM_REGISTRY: readonly AlgorithmDefinition[] = [
  {
    id: "fcfs",
    libraryMetadata: {
      id: "fcfs",
      displayName: "First-Come, First-Served",
      supportsMultiOperation: true,
      version: "1.0.0",
    },
    shortName: "FCFS",
    description: "Schedules jobs in order of release time, running every operation of a job back-to-back once selected.",
    problemTypes: ["single-operation", "multi-operation", "parallel-machine"],
    supportsReleaseTimes: true,
    supportsWeights: false,
    browserCompatible: true,
    backendRequired: false,
    estimatedComplexity: "O(n log n)",
    defaultBrowserOperationLimit: 500,
    parameters: [],
    requiresFlowShop: false,
    guarantee: "heuristic",
    optimalityConditions: null,
  },
  {
    id: "spt",
    libraryMetadata: {
      id: "spt",
      displayName: "Shortest Processing Time",
      supportsMultiOperation: true,
      version: "1.0.0",
    },
    shortName: "SPT",
    description: "Prioritizes the available job whose first operation has the shortest processing time.",
    problemTypes: ["single-operation", "multi-operation", "parallel-machine"],
    supportsReleaseTimes: true,
    supportsWeights: false,
    browserCompatible: true,
    backendRequired: false,
    estimatedComplexity: "O(n log n)",
    defaultBrowserOperationLimit: 500,
    parameters: [],
    requiresFlowShop: false,
    guarantee: "heuristic",
    optimalityConditions: null,
  },
  {
    id: "edd",
    libraryMetadata: {
      id: "edd",
      displayName: "Earliest Due Date",
      supportsMultiOperation: true,
      version: "1.0.0",
    },
    shortName: "EDD",
    description: "Prioritizes the available job with the earliest due date.",
    problemTypes: ["single-operation", "multi-operation", "parallel-machine"],
    supportsReleaseTimes: true,
    supportsWeights: false,
    browserCompatible: true,
    backendRequired: false,
    estimatedComplexity: "O(n log n)",
    defaultBrowserOperationLimit: 500,
    parameters: [],
    requiresFlowShop: false,
    guarantee: "heuristic",
    optimalityConditions: null,
  },
  {
    id: "wspt",
    libraryMetadata: {
      id: "wspt",
      displayName: "Weighted Shortest Processing Time",
      supportsMultiOperation: true,
      version: "1.0.0",
    },
    shortName: "WSPT",
    description: "Prioritizes the available job with the highest weight-to-processing-time ratio.",
    problemTypes: ["single-operation", "multi-operation", "parallel-machine"],
    supportsReleaseTimes: true,
    supportsWeights: true,
    browserCompatible: true,
    backendRequired: false,
    estimatedComplexity: "O(n log n)",
    defaultBrowserOperationLimit: 500,
    parameters: [],
    requiresFlowShop: false,
    guarantee: "heuristic",
    optimalityConditions: null,
  },
  {
    id: "johnson",
    libraryMetadata: {
      id: "johnson",
      displayName: "Johnson's Rule (SPT(1)-LPT(2))",
      supportsMultiOperation: true,
      version: "1.0.0",
    },
    shortName: "Johnson",
    description:
      "Sequences a flow shop by Johnson's rule: jobs with a shorter first-stage time go first in ascending first-stage order, the rest follow in descending last-stage order. On a two-machine flow shop this provably minimizes makespan.",
    // Not a dispatching rule: it needs every job's times up front and emits
    // one permutation both machines follow, so it only applies to a flow
    // shop, never to the job shops the other four handle.
    problemTypes: ["two-machine-flow-shop", "flow-shop"],
    // Release times are honored when building the schedule, but Johnson's
    // optimality proof assumes all jobs are released at 0 - see
    // optimalityConditions.
    supportsReleaseTimes: true,
    supportsWeights: false,
    browserCompatible: true,
    backendRequired: false,
    estimatedComplexity: "O(n log n)",
    defaultBrowserOperationLimit: 500,
    parameters: [],
    requiresFlowShop: true,
    guarantee: "optimal-under-conditions",
    optimalityConditions:
      "Exactly two stages, one machine per stage, and every job released at time 0. Longer flow shops fall back to a two-machine reduction that is only a heuristic.",
  },
] as const;

export function getAlgorithmDefinition(id: string): AlgorithmDefinition | undefined {
  return ALGORITHM_REGISTRY.find((a) => a.id === id);
}

export function isKnownAlgorithmId(id: string): boolean {
  return getAlgorithmDefinition(id) !== undefined;
}
