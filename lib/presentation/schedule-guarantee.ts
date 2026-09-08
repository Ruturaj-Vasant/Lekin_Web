import type { ExecutionResult } from "../schema/algorithm";
import type { ProblemDefinition } from "../schema/problem";
import { analyzeFlowShop, meetsJohnsonOptimalityConditions } from "../scheduling/flow-shop";

/** Describe only the unmet conditions; a late release must never blame two stages. */
export function johnsonLimitations(problem: ProblemDefinition): string {
  const flowShop = analyzeFlowShop(problem);
  if (!flowShop.isFlowShop) return `Johnson is unavailable because ${flowShop.reason}.`;
  const reasons: string[] = [];
  if (flowShop.route.length !== 2) {
    reasons.push(`${flowShop.route.length} stages: the two-machine reduction is a heuristic. The proof needs exactly two stages.`);
  }
  const lateJobs = problem.jobs.filter((job) => job.release !== 0);
  if (lateJobs.length) {
    reasons.push(lateJobs.length === 1
      ? `${lateJobs[0]!.jobId} has release time ${lateJobs[0]!.release}. The proof needs every job released at 0.`
      : `${lateJobs.length} jobs have nonzero release times. The proof needs every job released at 0.`);
  }
  return reasons.join(" ");
}

export type ScheduleGuarantee = {
  kind: "optimal" | "heuristic" | "manual";
  title: string;
  description: string;
};

/** Validity, the algorithm name, and a low objective value alone are not proofs. */
export function scheduleGuarantee(problem: ProblemDefinition, result: Pick<ExecutionResult, "status" | "schedule" | "algorithmId"> | null): ScheduleGuarantee | null {
  if (result?.status !== "completed" || !result.schedule) return null;
  if (result.schedule.machines.some((machine) => machine.operations.some((op) => op.manuallyModified || op.source === "manual"))) {
    return { kind: "manual", title: "Manually adjusted", description: "The schedule has been edited. Optimality is no longer certified; reset the schedule to restore the algorithm result." };
  }
  if (result.algorithmId === "johnson" && meetsJohnsonOptimalityConditions(problem)) {
    return { kind: "optimal", title: "Optimal makespan", description: "Johnson's rule proves the shortest possible makespan for this problem. Other performance measures are not covered by this guarantee." };
  }
  return {
    kind: "heuristic",
    title: "Heuristic result",
    description: result.algorithmId === "johnson"
      ? johnsonLimitations(problem)
      : "A feasible schedule with no certified optimum. Compare runs to explore better results.",
  };
}
