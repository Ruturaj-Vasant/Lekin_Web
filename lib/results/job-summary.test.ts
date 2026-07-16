import { describe, expect, it } from "vitest";
import { buildJobSummaries } from "./job-summary";
import type { Schedule, ScheduledOperation } from "../schema/schedule";
import type { ProblemDefinition } from "../schema/problem";

function op(overrides: Partial<ScheduledOperation>): ScheduledOperation {
  return {
    scheduledOperationId: "J1-O0",
    jobId: "J1",
    operationIndex: 0,
    workcenterId: "WC1",
    machineId: "M1",
    startTime: 0,
    endTime: 5,
    sequencePosition: 0,
    status: null,
    source: "algorithm",
    manuallyModified: false,
    ...overrides,
  };
}

function problem(jobs: ProblemDefinition["jobs"]): ProblemDefinition {
  return {
    schemaVersion: "1.0.0",
    problemId: "P1",
    name: "Test",
    jobs,
    workcenters: [],
    machines: [],
  };
}

describe("buildJobSummaries", () => {
  it("computes completion time and tardiness for a scheduled, tardy job", () => {
    const schedule: Schedule = {
      scheduleId: "S1",
      algorithmId: "fcfs",
      scheduleType: "final",
      time: 12,
      machines: [
        {
          machineId: "M1",
          workcenterId: "WC1",
          operations: [
            op({ operationIndex: 0, startTime: 0, endTime: 5 }),
            op({ operationIndex: 1, startTime: 5, endTime: 12, scheduledOperationId: "J1-O1" }),
          ],
        },
      ],
    };
    const p = problem([{ jobId: "J1", release: 0, due: 10, weight: 2, operations: [] }]);

    const [summary] = buildJobSummaries(schedule, p);

    expect(summary.scheduled).toBe(true);
    expect(summary.completionTime).toBe(12);
    expect(summary.tardiness).toBe(2);
    expect(summary.operations.map((o) => o.operationIndex)).toEqual([0, 1]);
  });

  it("reports null completion/tardiness for a job with no scheduled operations", () => {
    const schedule: Schedule = { scheduleId: "S1", algorithmId: "fcfs", scheduleType: "final", time: 0, machines: [] };
    const p = problem([{ jobId: "J1", release: 0, due: 10, weight: 1, operations: [] }]);

    const [summary] = buildJobSummaries(schedule, p);

    expect(summary.scheduled).toBe(false);
    expect(summary.completionTime).toBeNull();
    expect(summary.tardiness).toBeNull();
    expect(summary.operations).toEqual([]);
  });

  it("reports zero tardiness, not negative, for an early-finishing job", () => {
    const schedule: Schedule = {
      scheduleId: "S1",
      algorithmId: "fcfs",
      scheduleType: "final",
      time: 3,
      machines: [{ machineId: "M1", workcenterId: "WC1", operations: [op({ startTime: 0, endTime: 3 })] }],
    };
    const p = problem([{ jobId: "J1", release: 0, due: 100, weight: 1, operations: [] }]);

    const [summary] = buildJobSummaries(schedule, p);

    expect(summary.tardiness).toBe(0);
  });

  it("sorts operations by operationIndex regardless of machine iteration order, across machines", () => {
    const schedule: Schedule = {
      scheduleId: "S1",
      algorithmId: "fcfs",
      scheduleType: "final",
      time: 10,
      machines: [
        { machineId: "M2", workcenterId: "WC2", operations: [op({ operationIndex: 1, machineId: "M2", startTime: 5, endTime: 10, scheduledOperationId: "J1-O1" })] },
        { machineId: "M1", workcenterId: "WC1", operations: [op({ operationIndex: 0, machineId: "M1", startTime: 0, endTime: 5 })] },
      ],
    };
    const p = problem([{ jobId: "J1", release: 0, due: 10, weight: 1, operations: [] }]);

    const [summary] = buildJobSummaries(schedule, p);

    expect(summary.operations.map((o) => o.machineId)).toEqual(["M1", "M2"]);
  });

  it("returns one summary per problem job, independent of schedule content", () => {
    const schedule: Schedule = { scheduleId: "S1", algorithmId: "fcfs", scheduleType: "final", time: 0, machines: [] };
    const p = problem([
      { jobId: "J1", release: 0, due: 10, weight: 1, operations: [] },
      { jobId: "J2", release: 0, due: 10, weight: 1, operations: [] },
    ]);

    const summaries = buildJobSummaries(schedule, p);

    expect(summaries.map((s) => s.jobId)).toEqual(["J1", "J2"]);
  });
});
