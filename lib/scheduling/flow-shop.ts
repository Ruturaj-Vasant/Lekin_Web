import type { ProblemDefinition } from "../schema/problem";

/**
 * Flow shop detection, mirroring lekinpy's JohnsonAlgorithm.flow_shop_route().
 *
 * Algorithms like Johnson's rule are only defined on a flow shop: every job
 * visiting the same workcenters in the same order, each with exactly one
 * machine. lekinpy raises NotAFlowShopError for anything else, and the
 * worker maps that onto a validation issue - but only after Pyodide has
 * booted and the wheel has installed, which is several seconds of waiting to
 * be told the run was never going to work.
 *
 * This is the same check run against the ProblemDefinition up front, so the
 * sidebar can disable the option and validate-request.ts can report it
 * immediately. The two must stay in agreement: if this says a problem is a
 * flow shop, lekinpy must not then reject it.
 */

export type FlowShopAnalysis =
  | { readonly isFlowShop: true; readonly route: readonly string[] }
  | { readonly isFlowShop: false; readonly reason: string };

function routeOf(problem: ProblemDefinition, jobIndex: number): string[] {
  return [...problem.jobs[jobIndex]!.operations]
    .sort((a, b) => a.operationIndex - b.operationIndex)
    .map((op) => op.workcenterId);
}

export function analyzeFlowShop(problem: ProblemDefinition): FlowShopAnalysis {
  if (problem.jobs.length === 0) {
    return { isFlowShop: false, reason: "the problem has no jobs" };
  }

  const route = routeOf(problem, 0);
  for (let jobIndex = 1; jobIndex < problem.jobs.length; jobIndex++) {
    const other = routeOf(problem, jobIndex);
    const sameRoute =
      other.length === route.length && other.every((wc, i) => wc === route[i]);
    if (!sameRoute) {
      return {
        isFlowShop: false,
        reason:
          `job '${problem.jobs[jobIndex]!.jobId}' follows ${other.join(" → ") || "no stages"}, ` +
          `but job '${problem.jobs[0]!.jobId}' follows ${route.join(" → ") || "no stages"} - ` +
          "a flow shop needs every job to visit the same stages in the same order",
      };
    }
  }

  if (route.length < 2) {
    return {
      isFlowShop: false,
      reason: `every job has only ${route.length} operation(s), and a flow shop needs at least two stages`,
    };
  }

  if (new Set(route).size !== route.length) {
    return {
      isFlowShop: false,
      reason: `the route ${route.join(" → ")} visits the same workcenter more than once`,
    };
  }

  for (const workcenterId of route) {
    const workcenter = problem.workcenters.find((wc) => wc.workcenterId === workcenterId);
    if (workcenter && workcenter.machineIds.length !== 1) {
      return {
        isFlowShop: false,
        reason:
          `workcenter '${workcenterId}' has ${workcenter.machineIds.length} machines, ` +
          "and a flow shop stage must have exactly one",
      };
    }
  }

  return { isFlowShop: true, route };
}

/**
 * Whether Johnson's optimality proof actually applies, given a problem this
 * analysis already accepted as a flow shop. Two stages and every job
 * released at time 0; anything else still schedules, but the result is not
 * provably optimal and must not be presented as if it were.
 */
export function meetsJohnsonOptimalityConditions(problem: ProblemDefinition): boolean {
  const analysis = analyzeFlowShop(problem);
  if (!analysis.isFlowShop || analysis.route.length !== 2) return false;
  return problem.jobs.every((job) => job.release === 0);
}
