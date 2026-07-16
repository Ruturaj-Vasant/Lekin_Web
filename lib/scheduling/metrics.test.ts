import { describe, expect, it } from "vitest";
import { computeMetrics } from "./metrics";
import type { ProblemDefinition } from "../schema/problem";
import type { Schedule } from "../schema/schedule";

const problem: ProblemDefinition = {
  schemaVersion: "1.0.0",
  problemId: "metrics",
  name: "Metrics boundaries",
  jobs: [{
    jobId: "J1", release: 0, due: 8, weight: 2,
    operations: [{ operationIndex: 0, operationId: "J1-O0", workcenterId: "WC1", processingTime: 4, status: "pending" }],
  }],
  workcenters: [{ workcenterId: "WC1", release: 0, status: "active", machineIds: ["M1"] }],
  machines: [{ machineId: "M1", workcenterId: "WC1", release: 2, status: "active" }],
};

function schedule(operations: Schedule["machines"][number]["operations"]): Schedule {
  return {
    scheduleId: "s", algorithmId: "fcfs", scheduleType: "FCFS", time: 0,
    machines: [{ machineId: "M1", workcenterId: "WC1", operations }],
  };
}

describe("computeMetrics boundaries", () => {
  it("returns zero aggregates and an empty utilization object for an empty schedule", () => {
    expect(computeMetrics(schedule([]), problem)).toEqual({
      timeStart: 0,
      makespan: 0,
      maxTardiness: 0,
      tardyJobCount: 0,
      totalCompletionTime: 0,
      totalTardiness: 0,
      weightedCompletionTime: 0,
      weightedTardiness: 0,
      machineUtilization: {},
    });
  });

  it("uses makespan minus machine release as the utilization denominator", () => {
    const metrics = computeMetrics(schedule([{
      scheduledOperationId: "J1-O0", jobId: "J1", operationIndex: 0,
      workcenterId: "WC1", machineId: "M1", startTime: 2, endTime: 6,
      sequencePosition: 0, status: "pending", source: "algorithm", manuallyModified: false,
    }]), problem);
    expect(metrics.timeStart).toBe(2);
    expect(metrics.machineUtilization).toEqual({ M1: 1 });
  });
});
