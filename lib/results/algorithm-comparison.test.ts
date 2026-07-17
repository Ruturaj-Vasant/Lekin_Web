import { describe, expect, it } from "vitest";
import { buildAlgorithmComparison } from "./algorithm-comparison";
import type { ExecutionResult } from "../schema/algorithm";

function completed(algorithmId: string, overrides: Partial<NonNullable<ExecutionResult["metrics"]>> = {}, runtimeMs = 5): ExecutionResult {
  return {
    executionId: `exec-${algorithmId}`,
    executionMode: "browser",
    algorithmId,
    algorithmVersion: "1.0.0",
    lekinpyVersion: "0.2.0",
    schemaVersion: "1.0.0",
    status: "completed",
    runtimeMs,
    schedule: { scheduleId: "S1", algorithmId, scheduleType: "final", time: 10, machines: [] },
    metrics: {
      timeStart: 0,
      makespan: 10,
      maxTardiness: 0,
      tardyJobCount: 0,
      totalCompletionTime: 10,
      totalTardiness: 0,
      weightedCompletionTime: 10,
      weightedTardiness: 0,
      ...overrides,
    },
    validationIssues: [],
    policyViolation: null,
    warnings: [],
  };
}

function invalid(algorithmId: string): ExecutionResult {
  return {
    executionId: `exec-${algorithmId}`,
    executionMode: "browser",
    algorithmId,
    algorithmVersion: "1.0.0",
    lekinpyVersion: "0.2.0",
    schemaVersion: "1.0.0",
    status: "invalid",
    runtimeMs: 1,
    schedule: null,
    metrics: null,
    validationIssues: [{ code: "EMPTY_OPERATIONS", message: "x", path: [], source: "schema", severity: "error" }],
    policyViolation: null,
    warnings: [],
  };
}

describe("buildAlgorithmComparison", () => {
  it("returns one row per result with feasibility derived from status", () => {
    const { rows } = buildAlgorithmComparison([completed("fcfs"), invalid("spt")]);

    expect(rows.map((r) => [r.algorithmId, r.feasible])).toEqual([
      ["fcfs", true],
      ["spt", false],
    ]);
  });

  it("picks the lowest feasible value per metric as the winner", () => {
    const a = completed("fcfs", { makespan: 20, totalTardiness: 5 });
    const b = completed("spt", { makespan: 10, totalTardiness: 8 });

    const { bestByMetric } = buildAlgorithmComparison([a, b]);

    expect(bestByMetric.makespan).toBe("spt");
    expect(bestByMetric.totalTardiness).toBe("fcfs");
  });

  it("excludes infeasible results from bestByMetric even if they were somehow numerically lower", () => {
    const feasible = completed("fcfs", { makespan: 50 });
    const infeasible = invalid("spt");

    const { bestByMetric } = buildAlgorithmComparison([feasible, infeasible]);

    expect(bestByMetric.makespan).toBe("fcfs");
  });

  it("omits a metric from bestByMetric entirely when no result is feasible", () => {
    const { bestByMetric, rows } = buildAlgorithmComparison([invalid("fcfs"), invalid("spt")]);

    expect(bestByMetric).toEqual({});
    expect(rows).toHaveLength(2);
  });

  it("returns empty rows and bestByMetric for no results", () => {
    expect(buildAlgorithmComparison([])).toEqual({ rows: [], bestByMetric: {} });
  });

  it("breaks ties by keeping the first-seen algorithm", () => {
    const a = completed("fcfs", { makespan: 10 });
    const b = completed("spt", { makespan: 10 });

    const { bestByMetric } = buildAlgorithmComparison([a, b]);

    expect(bestByMetric.makespan).toBe("fcfs");
  });

  it("surfaces limitations from the versioned algorithm registry", () => {
    const { rows } = buildAlgorithmComparison([completed("fcfs"), completed("wspt")]);
    expect(rows[0]!.limitations).toEqual(["Ignores job weights"]);
    expect(rows[1]!.limitations).toEqual([]);
  });

  it("identifies custom Python results without pretending registry metadata is missing", () => {
    const { rows } = buildAlgorithmComparison([completed("custom")]);
    expect(rows[0]!.limitations).toEqual(["User-defined Python"]);
  });
});
