import { describe, expect, it } from "vitest";
import { checkExecutionPolicy, DEFAULT_BROWSER_EXECUTION_POLICY } from "./policy";
import { validateExecutionRequest } from "./validate-request";
import { fromLekinpyScheduleDict, toLekinpySystemPayload } from "./translate";
import { ALGORITHM_REGISTRY, getAlgorithmDefinition } from "../registry/algorithms";
import type { ProblemDefinition } from "../schema/problem";

function problemWithOperations(operationCount: number): ProblemDefinition {
  return {
    schemaVersion: "1.0.0",
    problemId: "p",
    name: "n",
    jobs: [
      {
        jobId: "J1",
        release: 0,
        due: 10,
        weight: 1,
        operations: Array.from({ length: operationCount }, (_, i) => ({
          operationIndex: i,
          operationId: `J1-O${i}`,
          workcenterId: "WC1",
          processingTime: 1,
          status: "pending",
        })),
      },
    ],
    workcenters: [{ workcenterId: "WC1", release: 0, status: "active", machineIds: ["M1"] }],
    machines: [{ machineId: "M1", workcenterId: "WC1", release: 0, status: "active" }],
  };
}

describe("checkExecutionPolicy", () => {
  it("returns null when the problem is within all limits", () => {
    const fcfs = getAlgorithmDefinition("fcfs")!;
    expect(checkExecutionPolicy(problemWithOperations(5), fcfs)).toBeNull();
  });

  it("rejects with the exact PRODUCT_SPEC §10 wording contract when a limit is exceeded", () => {
    const fcfs = getAlgorithmDefinition("fcfs")!;
    const policy = { ...DEFAULT_BROWSER_EXECUTION_POLICY, maxOperations: 500 };
    const violation = checkExecutionPolicy(problemWithOperations(720), fcfs, policy);
    expect(violation).not.toBeNull();
    expect(violation!.limitName).toBe("maxOperations");
    expect(violation!.actualValue).toBe(720);
    expect(violation!.limitValue).toBe(500);
    expect(violation!.message).toContain("720 operations");
    expect(violation!.message).toContain("limit is 500 operations");
    expect(violation!.message).not.toMatch(/something went wrong/i);
  });

  it("uses the tighter of the global policy and the algorithm's own operation limit", () => {
    const fcfs = getAlgorithmDefinition("fcfs")!;
    const tightAlgorithm = { ...fcfs, defaultBrowserOperationLimit: 3 };
    const violation = checkExecutionPolicy(problemWithOperations(5), tightAlgorithm, DEFAULT_BROWSER_EXECUTION_POLICY);
    expect(violation?.limitValue).toBe(3);
  });
});

describe("validateExecutionRequest", () => {
  it("flags an unknown algorithm id", () => {
    const issues = validateExecutionRequest(problemWithOperations(1), "does-not-exist");
    expect(issues.some((i) => i.code === "UNKNOWN_ALGORITHM_ID")).toBe(true);
  });

  it("all four built-in algorithms currently support multi-operation jobs, so no combination is flagged", () => {
    const problem = problemWithOperations(3);
    for (const algorithm of ALGORITHM_REGISTRY) {
      const issues = validateExecutionRequest(problem, algorithm.id);
      expect(issues.some((i) => i.code === "UNSUPPORTED_ALGORITHM_PROBLEM_COMBINATION")).toBe(false);
    }
  });

  it("still surfaces schema-level structural issues alongside algorithm checks", () => {
    const problem = problemWithOperations(1);
    problem.jobs[0]!.operations[0]!.processingTime = -1;
    const issues = validateExecutionRequest(problem, "fcfs");
    expect(issues.some((i) => i.code === "NON_POSITIVE_PROCESSING_TIME")).toBe(true);
  });
});

describe("translate: ProblemDefinition -> lekinpy System payload", () => {
  it("groups flat machines by workcenterId into nested Workcenter.machines", () => {
    const problem = problemWithOperations(1);
    problem.machines.push({ machineId: "M1b", workcenterId: "WC1", release: 0, status: "active" });
    const payload = toLekinpySystemPayload(problem);
    expect(payload.workcenters).toHaveLength(1);
    expect(payload.workcenters[0]!.machines.map((m) => m.name)).toEqual(["M1", "M1b"]);
  });

  it("uses snake_case keys matching lekinpy's real constructor parameter names", () => {
    const payload = toLekinpySystemPayload(problemWithOperations(1));
    expect(payload.jobs[0]).toMatchObject({
      job_id: "J1",
      release: 0,
      due: 10,
      weight: 1,
    });
    expect(payload.jobs[0]!.operations[0]).toMatchObject({
      workcenter: "WC1",
      processing_time: 1,
      status: "pending",
    });
  });
});

describe("translate: lekinpy Schedule.to_dict() -> web Schedule", () => {
  it("derives scheduledOperationId and tags every record as algorithm-sourced", () => {
    const schedule = fromLekinpyScheduleDict(
      {
        schedule_type: "FCFS",
        time: 5,
        rgb: null,
        machines: [
          {
            workcenter: "WC1",
            machine: "M1",
            operations: [
              {
                job_id: "J1",
                operation_index: 0,
                workcenter: "WC1",
                machine: "M1",
                start_time: 0,
                end_time: 5,
                sequence_position: 0,
                status: "pending",
              },
            ],
          },
        ],
      },
      "sched-1",
      "fcfs",
    );
    const op = schedule.machines[0]!.operations[0]!;
    expect(op.scheduledOperationId).toBe("J1-O0");
    expect(op.source).toBe("algorithm");
    expect(op.manuallyModified).toBe(false);
    expect(schedule.scheduleId).toBe("sched-1");
    expect(schedule.algorithmId).toBe("fcfs");
  });
});
