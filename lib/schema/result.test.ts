import { describe, expect, it } from "vitest";
import { ExecutionResultSchema } from "./algorithm";
import { ManualStartConstraintsSchema } from "./manual-edit";
import { ValidationIssueSchema } from "./issue";

describe("runtime schemas for shared result shapes", () => {
  it("validates a completed ExecutionResult at the persistence boundary", () => {
    expect(ExecutionResultSchema.safeParse({
      executionId: "e1",
      executionMode: "browser",
      algorithmId: "fcfs",
      algorithmVersion: "1.0.0",
      lekinpyVersion: "0.2.0",
      schemaVersion: "1.0.0",
      status: "completed",
      runtimeMs: 12,
      schedule: {
        scheduleId: "s1", algorithmId: "fcfs", scheduleType: "FCFS", time: 0, machines: [],
      },
      metrics: {
        timeStart: 0,
        makespan: 0, maxTardiness: 0, tardyJobCount: 0,
        totalCompletionTime: 0, totalTardiness: 0,
        weightedCompletionTime: 0, weightedTardiness: 0,
        machineUtilization: {},
      },
      validationIssues: [],
      policyViolation: null,
      warnings: [],
    }).success).toBe(true);
  });

  it("rejects impossible status/payload combinations", () => {
    const incompleteSuccess = {
      executionId: "e1", executionMode: "browser", algorithmId: "fcfs",
      algorithmVersion: "1.0.0", lekinpyVersion: "0.2.0", schemaVersion: "1.0.0",
      status: "completed", runtimeMs: 1, schedule: null, metrics: null,
      validationIssues: [], policyViolation: null, warnings: [],
    };
    expect(ExecutionResultSchema.safeParse(incompleteSuccess).success).toBe(false);
  });

  it("rejects unknown issue codes and malformed constraint values", () => {
    expect(ValidationIssueSchema.safeParse({
      code: "NOT_A_REAL_CODE", message: "bad", path: [], source: "schema", severity: "error",
    }).success).toBe(false);
    expect(ManualStartConstraintsSchema.safeParse({ "J1-O0": "later" }).success).toBe(false);
  });
});
