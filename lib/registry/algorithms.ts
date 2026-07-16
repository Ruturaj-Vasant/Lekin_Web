import type { AlgorithmDefinition } from "../schema/algorithm";

/**
 * ARCHITECTURE.md §1.5 — Algorithm registry.
 *
 * `libraryMetadata` for each entry must stay byte-identical (mod
 * snake_case -> camelCase) to the pinned lekinpy v0.2.0 build's
 * SchedulingAlgorithm.metadata dict. Verified directly against
 * lekin-library/lekinpy/algorithms/{fcfs,spt,edd,wspt}.py at commit
 * a3fee48 (tag v0.2.0):
 *   fcfs: {id: "fcfs", display_name: "First-Come, First-Served", supports_multi_operation: true, version: "1.0.0"}
 *   spt:  {id: "spt",  display_name: "Shortest Processing Time",  supports_multi_operation: true, version: "1.0.0"}
 *   edd:  {id: "edd",  display_name: "Earliest Due Date",         supports_multi_operation: true, version: "1.0.0"}
 *   wspt: {id: "wspt", display_name: "Weighted Shortest Processing Time", supports_multi_operation: true, version: "1.0.0"}
 *
 * Everything else on AlgorithmDefinition is a web-owned addition — lekinpy's
 * plugin contract is deliberately minimal (see lekin-library_DECISIONS.md
 * item 5) and has no concept of shortName/description/problemTypes/etc.
 *
 * No auto-discovery exists (rejected in lekinpy item 5 — "no decorators or
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
  },
] as const;

export function getAlgorithmDefinition(id: string): AlgorithmDefinition | undefined {
  return ALGORITHM_REGISTRY.find((a) => a.id === id);
}

export function isKnownAlgorithmId(id: string): boolean {
  return getAlgorithmDefinition(id) !== undefined;
}
