import { describe, expect, it } from "vitest";
import { validateScheduleAgainstProblem } from "./validate-schedule";
import type { ProblemDefinition } from "../schema/problem";
import type { Schedule } from "../schema/schedule";

function problem(): ProblemDefinition {
  return {
    schemaVersion: "1.0.0",
    problemId: "p",
    name: "basic",
    jobs: [
      {
        jobId: "A",
        release: 0,
        due: 100,
        weight: 1,
        operations: [
          { operationIndex: 0, operationId: "A-O0", workcenterId: "WC1", processingTime: 5, status: "pending" },
          { operationIndex: 1, operationId: "A-O1", workcenterId: "WC2", processingTime: 3, status: "pending" },
        ],
      },
      {
        jobId: "B",
        release: 2,
        due: 100,
        weight: 1,
        operations: [
          { operationIndex: 0, operationId: "B-O0", workcenterId: "WC1", processingTime: 4, status: "pending" },
        ],
      },
    ],
    workcenters: [
      { workcenterId: "WC1", release: 0, status: "active", machineIds: ["M1"] },
      { workcenterId: "WC2", release: 1, status: "active", machineIds: ["M2"] },
    ],
    machines: [
      { machineId: "M1", workcenterId: "WC1", release: 0, status: "active" },
      { machineId: "M2", workcenterId: "WC2", release: 1, status: "active" },
    ],
  };
}

function op(overrides: Partial<Schedule["machines"][number]["operations"][number]>) {
  return {
    scheduledOperationId: `${overrides.jobId}-O${overrides.operationIndex}`,
    jobId: "A",
    operationIndex: 0,
    workcenterId: "WC1",
    machineId: "M1",
    startTime: 0,
    endTime: 5,
    sequencePosition: 0,
    status: "pending",
    source: "algorithm" as const,
    manuallyModified: false,
    ...overrides,
  };
}

function feasibleSchedule(): Schedule {
  return {
    scheduleId: "s1",
    algorithmId: "custom",
    scheduleType: "CUSTOM",
    time: 9,
    machines: [
      {
        machineId: "M1",
        workcenterId: "WC1",
        operations: [
          op({ jobId: "A", operationIndex: 0, machineId: "M1", workcenterId: "WC1", startTime: 0, endTime: 5, sequencePosition: 0 }),
          op({ jobId: "B", operationIndex: 0, machineId: "M1", workcenterId: "WC1", startTime: 5, endTime: 9, sequencePosition: 1 }),
        ],
      },
      {
        machineId: "M2",
        workcenterId: "WC2",
        operations: [
          op({ jobId: "A", operationIndex: 1, machineId: "M2", workcenterId: "WC2", startTime: 5, endTime: 8, sequencePosition: 0 }),
        ],
      },
    ],
  };
}

describe("validateScheduleAgainstProblem", () => {
  it("accepts a genuinely feasible schedule with zero issues", () => {
    expect(validateScheduleAgainstProblem(feasibleSchedule(), problem())).toEqual([]);
  });

  it("rejects a schema-malformed value before attempting deeper checks", () => {
    const issues = validateScheduleAgainstProblem({ not: "a schedule" }, problem());
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((i) => i.code === "SCHEDULE_SCHEMA_INVALID")).toBe(true);
  });

  it("flags a missing operation", () => {
    const s = feasibleSchedule();
    s.machines[1]!.operations = []; // drop A-O1 entirely
    const issues = validateScheduleAgainstProblem(s, problem());
    expect(issues.some((i) => i.code === "SCHEDULE_MISSING_OPERATION" && i.jobId === "A" && i.operationIndex === 1)).toBe(true);
  });

  it("flags a duplicate operation", () => {
    const s = feasibleSchedule();
    s.machines[0]!.operations.push(op({ jobId: "A", operationIndex: 0, machineId: "M1", workcenterId: "WC1", startTime: 20, endTime: 25, sequencePosition: 2 }));
    const issues = validateScheduleAgainstProblem(s, problem());
    expect(issues.some((i) => i.code === "SCHEDULE_DUPLICATE_OPERATION")).toBe(true);
  });

  it("flags an unknown job reference", () => {
    const s = feasibleSchedule();
    s.machines[0]!.operations[0] = op({ jobId: "ZZZ", operationIndex: 0, machineId: "M1", workcenterId: "WC1", startTime: 0, endTime: 5, sequencePosition: 0 });
    const issues = validateScheduleAgainstProblem(s, problem());
    expect(issues.some((i) => i.code === "SCHEDULE_UNKNOWN_REFERENCE" && i.jobId === "ZZZ")).toBe(true);
  });

  it("flags an unknown machine reference", () => {
    const s = feasibleSchedule();
    const badOp = op({ jobId: "A", operationIndex: 0, machineId: "GHOST", workcenterId: "WC1", startTime: 0, endTime: 5, sequencePosition: 0 });
    s.machines[0]!.machineId = "GHOST";
    s.machines[0]!.operations[0] = badOp;
    const issues = validateScheduleAgainstProblem(s, problem());
    expect(issues.some((i) => i.code === "SCHEDULE_UNKNOWN_REFERENCE" && i.machineId === "GHOST")).toBe(true);
  });

  it("flags a duration mismatch", () => {
    const s = feasibleSchedule();
    s.machines[0]!.operations[0] = op({ jobId: "A", operationIndex: 0, machineId: "M1", workcenterId: "WC1", startTime: 0, endTime: 999, sequencePosition: 0 });
    const issues = validateScheduleAgainstProblem(s, problem());
    expect(issues.some((i) => i.code === "SCHEDULE_DURATION_MISMATCH")).toBe(true);
  });

  it("flags an ineligible-machine assignment", () => {
    const s = feasibleSchedule();
    // Assign A-O0 (requires WC1) to M2, which is in WC2.
    s.machines[1]!.operations.push(op({ jobId: "A", operationIndex: 0, machineId: "M2", workcenterId: "WC2", startTime: 10, endTime: 15, sequencePosition: 1 }));
    s.machines[0]!.operations = s.machines[0]!.operations.filter((o) => o.jobId !== "A" || o.operationIndex !== 0);
    const issues = validateScheduleAgainstProblem(s, problem());
    expect(issues.some((i) => i.code === "SCHEDULE_INELIGIBLE_MACHINE")).toBe(true);
  });

  it("flags a precedence violation", () => {
    const s = feasibleSchedule();
    // A-O1 starts before A-O0 finishes.
    s.machines[1]!.operations[0] = op({ jobId: "A", operationIndex: 1, machineId: "M2", workcenterId: "WC2", startTime: 1, endTime: 4, sequencePosition: 0 });
    const issues = validateScheduleAgainstProblem(s, problem());
    expect(issues.some((i) => i.code === "SCHEDULE_PRECEDENCE_VIOLATION")).toBe(true);
  });

  it("flags a machine-overlap violation", () => {
    const s = feasibleSchedule();
    s.machines[0]!.operations[1] = op({ jobId: "B", operationIndex: 0, machineId: "M1", workcenterId: "WC1", startTime: 3, endTime: 7, sequencePosition: 1 });
    const issues = validateScheduleAgainstProblem(s, problem());
    expect(issues.some((i) => i.code === "SCHEDULE_MACHINE_OVERLAP")).toBe(true);
  });

  it("flags a job-release violation", () => {
    const s = feasibleSchedule();
    s.machines[0]!.operations[1] = op({ jobId: "B", operationIndex: 0, machineId: "M1", workcenterId: "WC1", startTime: 0, endTime: 4, sequencePosition: 1 });
    s.machines[0]!.operations[0] = op({ jobId: "A", operationIndex: 0, machineId: "M1", workcenterId: "WC1", startTime: 4, endTime: 9, sequencePosition: 0 });
    // B releases at time 2; scheduling it at 0 violates release.
    const issues = validateScheduleAgainstProblem(s, problem());
    expect(issues.some((i) => i.code === "SCHEDULE_RELEASE_VIOLATION" && i.jobId === "B")).toBe(true);
  });

  it("flags a machine-release violation", () => {
    const s = feasibleSchedule();
    // M2 releases at time 1; start A-O1 at time 0 instead.
    s.machines[1]!.operations[0] = op({ jobId: "A", operationIndex: 1, machineId: "M2", workcenterId: "WC2", startTime: 0, endTime: 3, sequencePosition: 0 });
    const issues = validateScheduleAgainstProblem(s, problem());
    expect(issues.some((i) => i.code === "SCHEDULE_RELEASE_VIOLATION" && i.machineId === "M2")).toBe(true);
  });

  it("flags non-finite and negative times", () => {
    const s = feasibleSchedule();
    s.machines[0]!.operations[0] = op({ jobId: "A", operationIndex: 0, machineId: "M1", workcenterId: "WC1", startTime: -5, endTime: 5, sequencePosition: 0 });
    const issues = validateScheduleAgainstProblem(s, problem());
    expect(issues.some((i) => i.code === "SCHEDULE_INVALID_TIME")).toBe(true);
  });

  it("accepts back-to-back operations where one ends exactly when the next starts", () => {
    // feasibleSchedule() already has A-O0 (0-5) and B-O0 (5-9) adjacent on
    // M1, and A-O1 starting at 5 exactly when A-O0 ends - assert that
    // adjacency explicitly so boundary semantics can't regress silently.
    const s = feasibleSchedule();
    expect(s.machines[0]!.operations[0]!.endTime).toBe(s.machines[0]!.operations[1]!.startTime);
    expect(validateScheduleAgainstProblem(s, problem())).toEqual([]);
  });

  it("flags a machine entry for an unknown machine even when it carries no operations", () => {
    const s = feasibleSchedule();
    s.machines.push({ machineId: "GHOST", workcenterId: "WC1", operations: [] });
    const issues = validateScheduleAgainstProblem(s, problem());
    expect(issues.some((i) => i.code === "SCHEDULE_UNKNOWN_REFERENCE" && i.machineId === "GHOST")).toBe(true);
  });

  it("flags duplicate machine entries for the same machine", () => {
    const s = feasibleSchedule();
    // Split M1's operations across two entries - individually feasible,
    // structurally malformed.
    const [first, second] = s.machines[0]!.operations;
    s.machines[0]!.operations = [first!];
    s.machines.push({ machineId: "M1", workcenterId: "WC1", operations: [second!] });
    const issues = validateScheduleAgainstProblem(s, problem());
    expect(issues.some((i) => i.code === "SCHEDULE_SCHEMA_INVALID" && i.machineId === "M1")).toBe(true);
  });

  it("flags a machine entry whose workcenter disagrees with the problem", () => {
    const s = feasibleSchedule();
    s.machines[0]!.workcenterId = "WC2"; // M1 actually belongs to WC1
    const issues = validateScheduleAgainstProblem(s, problem());
    expect(issues.some((i) => i.code === "SCHEDULE_UNKNOWN_REFERENCE" && i.machineId === "M1" && i.workcenterId === "WC2")).toBe(true);
  });

  it("flags a scheduledOperationId inconsistent with its jobId/operationIndex", () => {
    const s = feasibleSchedule();
    s.machines[0]!.operations[0]!.scheduledOperationId = "B-O0"; // actually A-O0
    const issues = validateScheduleAgainstProblem(s, problem());
    expect(issues.some((i) => i.code === "SCHEDULE_SCHEMA_INVALID" && i.jobId === "A" && i.operationIndex === 0)).toBe(true);
  });

  it("flags startTime >= endTime", () => {
    const s = feasibleSchedule();
    s.machines[0]!.operations[0] = op({ jobId: "A", operationIndex: 0, machineId: "M1", workcenterId: "WC1", startTime: 5, endTime: 5, sequencePosition: 0 });
    const issues = validateScheduleAgainstProblem(s, problem());
    expect(issues.some((i) => i.code === "SCHEDULE_INVALID_TIME")).toBe(true);
  });
});
