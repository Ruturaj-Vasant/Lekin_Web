import { describe, expect, it } from "vitest";
import { validateProblemDefinition, type ProblemDefinition } from "./problem";
import { hasBlockingError } from "./issue";

function validProblem(): ProblemDefinition {
  return {
    schemaVersion: "1.0.0",
    problemId: "p1",
    name: "Test problem",
    jobs: [
      {
        jobId: "J1",
        release: 0,
        due: 20,
        weight: 1,
        operations: [
          { operationIndex: 0, operationId: "J1-O0", workcenterId: "WC1", processingTime: 5, status: "pending" },
          { operationIndex: 1, operationId: "J1-O1", workcenterId: "WC2", processingTime: 3, status: "pending" },
        ],
      },
    ],
    workcenters: [
      { workcenterId: "WC1", release: 0, status: "active", machineIds: ["M1"] },
      { workcenterId: "WC2", release: 0, status: "active", machineIds: ["M2"] },
    ],
    machines: [
      { machineId: "M1", workcenterId: "WC1", release: 0, status: "active" },
      { machineId: "M2", workcenterId: "WC2", release: 0, status: "active" },
    ],
  };
}

describe("validateProblemDefinition", () => {
  it("accepts a well-formed problem with no issues", () => {
    expect(validateProblemDefinition(validProblem())).toEqual([]);
  });

  it("collects every violation in one pass, not just the first", () => {
    const problem = validProblem();
    problem.jobs.push({ ...problem.jobs[0]!, jobId: "J1" }); // duplicate job id
    problem.jobs[0]!.operations[0]!.processingTime = -1; // non-positive
    problem.workcenters[0]!.machineIds = []; // empty machine list... but WC1 still owns M1

    const issues = validateProblemDefinition(problem);
    const codes = issues.map((i) => i.code);
    expect(codes).toContain("DUPLICATE_JOB_ID");
    expect(codes).toContain("NON_POSITIVE_PROCESSING_TIME");
    // more than one distinct problem surfaced in a single call
    expect(new Set(codes).size).toBeGreaterThan(1);
  });

  it("flags a missing workcenter reference", () => {
    const problem = validProblem();
    problem.jobs[0]!.operations[0]!.workcenterId = "WC9";
    const issues = validateProblemDefinition(problem);
    expect(issues.some((i) => i.code === "MISSING_WORKCENTER_REFERENCE")).toBe(true);
  });

  it("flags Machine.workcenterId / Workcenter.machineIds inconsistency", () => {
    const problem = validProblem();
    problem.machines[0]!.workcenterId = "WC2"; // M1 now claims WC2, but WC1.machineIds still lists M1
    const issues = validateProblemDefinition(problem);
    expect(issues.some((i) => i.code === "INCONSISTENT_MACHINE_WORKCENTER")).toBe(true);
  });

  it("flags a machine listed more than once by the same workcenter", () => {
    const problem = validProblem();
    problem.workcenters[0]!.machineIds.push("M1");
    const issues = validateProblemDefinition(problem);
    expect(issues.some(
      (issue) => issue.code === "INCONSISTENT_MACHINE_WORKCENTER" && issue.machineId === "M1",
    )).toBe(true);
  });

  it("flags an incorrect operationIndex", () => {
    const problem = validProblem();
    problem.jobs[0]!.operations[1]!.operationIndex = 5;
    const issues = validateProblemDefinition(problem);
    expect(issues.some((i) => i.code === "INVALID_OPERATION_INDEX")).toBe(true);
  });

  it("flags an empty operations list", () => {
    const problem = validProblem();
    problem.jobs[0]!.operations = [];
    const issues = validateProblemDefinition(problem);
    expect(issues.some((i) => i.code === "EMPTY_OPERATIONS")).toBe(true);
  });

  it("flags an empty machine list", () => {
    const problem = validProblem();
    problem.workcenters[0]!.machineIds = [];
    problem.machines = problem.machines.filter((m) => m.machineId !== "M1");
    const issues = validateProblemDefinition(problem);
    expect(issues.some((i) => i.code === "EMPTY_MACHINE_LIST")).toBe(true);
  });

  it("flags an out-of-range rgb tuple", () => {
    const problem = validProblem();
    problem.jobs[0]!.rgb = [300, -1, 2.5];
    const issues = validateProblemDefinition(problem);
    expect(issues.some((i) => i.code === "INVALID_RGB")).toBe(true);
  });

  it("flags NaN/Infinity numeric fields", () => {
    const problem = validProblem();
    problem.jobs[0]!.due = Number.POSITIVE_INFINITY;
    const issues = validateProblemDefinition(problem);
    expect(issues.some((i) => i.code === "INVALID_NUMERIC_VALUE")).toBe(true);
  });

  it("warnings never set severity to error and never appear for a clean problem", () => {
    const problem = validProblem();
    problem.jobs[0]!.due = -5; // before release (0) -> warning
    const issues = validateProblemDefinition(problem);
    const dueWarning = issues.find((i) => i.code === "DUE_BEFORE_RELEASE");
    expect(dueWarning?.severity).toBe("warning");
    expect(hasBlockingError(issues)).toBe(false); // a warning alone must not block execution
  });

  it("blocking errors and warnings can co-exist; hasBlockingError reflects only errors", () => {
    const problem = validProblem();
    problem.jobs[0]!.due = -5; // warning
    problem.jobs[0]!.operations[0]!.processingTime = -1; // error
    const issues = validateProblemDefinition(problem);
    expect(hasBlockingError(issues)).toBe(true);
    expect(issues.some((i) => i.severity === "warning")).toBe(true);
  });

  it("maps raw structural (wrong-type) issues to a best-effort code without throwing", () => {
    const issues = validateProblemDefinition({ not: "a problem" });
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((i) => i.source === "schema")).toBe(true);
  });
});
