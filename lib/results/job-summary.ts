import type { Schedule, ScheduledOperation } from "../schema/schedule";
import type { ProblemDefinition } from "../schema/problem";

export interface JobSummary {
  jobId: string;
  release: number;
  due: number;
  weight: number;
  scheduled: boolean;
  completionTime: number | null;
  tardiness: number | null;
  operations: ScheduledOperation[];
}

/**
 * Per-job breakdown for the Job Details tab - mirrors lekinpy's
 * display_job_details() fields. Uses the same unscheduled-job handling as
 * computeMetrics (lib/scheduling/metrics.ts): a job with zero
 * ScheduledOperations in this schedule gets completionTime/tardiness of
 * null rather than a misleading 0, and is reported as scheduled: false.
 */
export function buildJobSummaries(schedule: Schedule, problem: ProblemDefinition): JobSummary[] {
  const opsByJob = new Map<string, ScheduledOperation[]>();
  for (const machine of schedule.machines) {
    for (const op of machine.operations) {
      const list = opsByJob.get(op.jobId) ?? [];
      list.push(op);
      opsByJob.set(op.jobId, list);
    }
  }

  return problem.jobs.map((job) => {
    const operations = (opsByJob.get(job.jobId) ?? [])
      .slice()
      .sort((a, b) => a.operationIndex - b.operationIndex);
    const scheduled = operations.length > 0;
    const completionTime = scheduled ? Math.max(...operations.map((op) => op.endTime)) : null;
    const tardiness = completionTime !== null ? Math.max(0, completionTime - job.due) : null;

    return {
      jobId: job.jobId,
      release: job.release,
      due: job.due,
      weight: job.weight,
      scheduled,
      completionTime,
      tardiness,
      operations,
    };
  });
}
