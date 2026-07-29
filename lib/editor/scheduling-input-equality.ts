import type { ProblemDefinition } from "../schema/problem";

function schedulingShape(problem: ProblemDefinition) {
  return {
    schemaVersion: problem.schemaVersion,
    problemId: problem.problemId,
    name: problem.name,
    jobs: problem.jobs.map((job) => ({
      jobId: job.jobId,
      release: job.release,
      due: job.due,
      weight: job.weight,
      operations: job.operations,
    })),
    workcenters: problem.workcenters.map((workcenter) => ({
      workcenterId: workcenter.workcenterId,
      release: workcenter.release,
      status: workcenter.status,
      machineIds: workcenter.machineIds,
    })),
    machines: problem.machines,
  };
}

/**
 * Job and workcenter display colors do not alter an already-computed schedule.
 * All established project identity, naming, ordering, and scheduling inputs
 * remain part of the comparison.
 */
export function sameSchedulingInput(first: ProblemDefinition, second: ProblemDefinition): boolean {
  if (first === second) return true;
  return JSON.stringify(schedulingShape(first)) === JSON.stringify(schedulingShape(second));
}
