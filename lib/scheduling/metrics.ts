import type { Metrics, Schedule } from "../schema/schedule";
import type { ProblemDefinition } from "../schema/problem";

/**
 * ARCHITECTURE.md §1.3 — Metrics, computed client-side.
 *
 * Mirrors lekinpy's Schedule.display_summary() formulas exactly (same
 * min/max-over-a-job's-ScheduledOperations approach, not the
 * sorted-by-operationIndex-first/last approach display_job_details uses),
 * including its behavior of silently excluding any job with zero
 * ScheduledOperations in this particular schedule from every aggregate.
 */
export function computeMetrics(schedule: Schedule, problem: ProblemDefinition): Metrics {
  const opsByJob = new Map<string, Array<{ startTime: number; endTime: number }>>();
  for (const ms of schedule.machines) {
    for (const op of ms.operations) {
      const list = opsByJob.get(op.jobId) ?? [];
      list.push({ startTime: op.startTime, endTime: op.endTime });
      opsByJob.set(op.jobId, list);
    }
  }

  const ends: number[] = [];
  const tardinesses: number[] = [];
  const completions: number[] = [];
  const weightedCompletions: number[] = [];
  const weightedTardinesses: number[] = [];
  let tardyCount = 0;

  for (const job of problem.jobs) {
    const ops = opsByJob.get(job.jobId);
    if (!ops || ops.length === 0) continue; // excluded, matching display_summary()

    const end = Math.max(...ops.map((o) => o.endTime));
    const tardiness = Math.max(0, end - job.due);

    ends.push(end);
    tardinesses.push(tardiness);
    completions.push(end);
    weightedCompletions.push(end * job.weight);
    weightedTardinesses.push(tardiness * job.weight);
    if (tardiness > 0) tardyCount += 1;
  }

  const makespan = ends.length > 0 ? Math.max(...ends) : 0;

  const metrics: Metrics = {
    makespan,
    maxTardiness: tardinesses.length > 0 ? Math.max(...tardinesses) : 0,
    tardyJobCount: tardyCount,
    totalCompletionTime: sum(completions),
    totalTardiness: sum(tardinesses),
    weightedCompletionTime: sum(weightedCompletions),
    weightedTardiness: sum(weightedTardinesses),
  };

  const utilization = computeMachineUtilization(schedule, problem, makespan);
  if (Object.keys(utilization).length > 0) {
    metrics.machineUtilization = utilization;
  }

  return metrics;
}

/**
 * machineUtilization denominator, precisely (ARCHITECTURE.md §1.3):
 * availableTime = makespan - machine.release, NOT the raw makespan — a
 * machine with a late release would otherwise be penalized for time it was
 * never available to use. A machine never used, or one whose release is
 * >= makespan (degenerate/empty schedule), is omitted rather than
 * reporting a divide-by-zero or a misleading 0%.
 */
function computeMachineUtilization(
  schedule: Schedule,
  problem: ProblemDefinition,
  makespan: number,
): Record<string, number> {
  const releaseByMachine = new Map(problem.machines.map((m) => [m.machineId, m.release]));
  const utilization: Record<string, number> = {};
  for (const ms of schedule.machines) {
    const release = releaseByMachine.get(ms.machineId) ?? 0;
    const availableTime = makespan - release;
    if (availableTime <= 0) continue;
    const busyTime = ms.operations.reduce((total, op) => total + (op.endTime - op.startTime), 0);
    utilization[ms.machineId] = busyTime / availableTime;
  }
  return utilization;
}

function sum(values: number[]): number {
  return values.reduce((total, v) => total + v, 0);
}
