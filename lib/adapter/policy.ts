import type { ProblemDefinition } from "../schema/problem";
import type { AlgorithmDefinition, PolicyLimitName, PolicyViolation } from "../schema/algorithm";

/** ARCHITECTURE.md §2.2 step 1 / PRODUCT_SPEC §9 - execution policy. */
export interface BrowserExecutionPolicy {
  enabled: boolean;
  maxJobs: number;
  maxOperations: number;
  maxMachines: number;
  maxWorkcenters: number;
  maxEstimatedRuntimeMs: number;
  maxInputFileSizeMb: number;
}

/**
 * Hard browser ceilings, benchmarked in Chromium on 2026-07-16.
 * See docs/BROWSER_CAPACITY.md for the test shape, timings, and the lower
 * recommended working range used for ordinary interactive studies.
 */
export const DEFAULT_BROWSER_EXECUTION_POLICY: BrowserExecutionPolicy = {
  enabled: true,
  maxJobs: 100,
  maxOperations: 500,
  maxMachines: 50,
  maxWorkcenters: 25,
  maxEstimatedRuntimeMs: 3000,
  maxInputFileSizeMb: 5,
};

const UNIT_LABEL: Record<PolicyLimitName, string> = {
  maxJobs: "jobs",
  maxOperations: "operations",
  maxMachines: "machines",
  maxWorkcenters: "workcenters",
  maxEstimatedRuntimeMs: "ms of estimated runtime",
  maxInputFileSizeMb: "MB",
};

function buildMessage(limitName: PolicyLimitName, limitValue: number, actualValue: number): string {
  const unit = UNIT_LABEL[limitName];
  return (
    `This problem contains ${actualValue} ${unit}, while the current browser limit is ${limitValue} ${unit}. ` +
    `Reduce the problem size or export it for later execution.`
  );
}

/**
 * Pure TS/JS, no Pyodide (ARCHITECTURE.md §2.2 step 1). Counts are derived
 * directly from the in-memory ProblemDefinition; the effective operation
 * limit is the tighter of the global policy and the selected algorithm's
 * own `defaultBrowserOperationLimit`.
 */
export function checkExecutionPolicy(
  problem: ProblemDefinition,
  algorithm: AlgorithmDefinition,
  policy: BrowserExecutionPolicy = DEFAULT_BROWSER_EXECUTION_POLICY,
): PolicyViolation | null {
  const operationCount = problem.jobs.reduce((total, job) => total + job.operations.length, 0);
  const effectiveMaxOperations = Math.min(policy.maxOperations, algorithm.defaultBrowserOperationLimit);

  const checks: Array<{ limitName: PolicyLimitName; limitValue: number; actualValue: number }> = [
    { limitName: "maxJobs", limitValue: policy.maxJobs, actualValue: problem.jobs.length },
    { limitName: "maxOperations", limitValue: effectiveMaxOperations, actualValue: operationCount },
    { limitName: "maxMachines", limitValue: policy.maxMachines, actualValue: problem.machines.length },
    { limitName: "maxWorkcenters", limitValue: policy.maxWorkcenters, actualValue: problem.workcenters.length },
  ];

  for (const check of checks) {
    if (check.actualValue > check.limitValue) {
      return {
        limitName: check.limitName,
        limitValue: check.limitValue,
        actualValue: check.actualValue,
        message: buildMessage(check.limitName, check.limitValue, check.actualValue),
      };
    }
  }
  return null;
}
