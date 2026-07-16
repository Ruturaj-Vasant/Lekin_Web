import { describe, expect, it } from "vitest";
import { recordComparisonResult, comparisonResultsFor } from "./comparison-history";
import type { ExecutionResult } from "../schema/algorithm";
import type { ProblemDefinition } from "../schema/problem";

function problem(problemId: string): ProblemDefinition {
  return { schemaVersion: "1.0.0", problemId, name: "Test", jobs: [], workcenters: [], machines: [] };
}

function result(algorithmId: string): ExecutionResult {
  return {
    executionId: `exec-${algorithmId}`,
    executionMode: "browser",
    algorithmId,
    algorithmVersion: "1.0.0",
    lekinpyVersion: "0.2.0",
    schemaVersion: "1.0.0",
    status: "completed",
    runtimeMs: 5,
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
    },
    validationIssues: [],
    policyViolation: null,
    warnings: [],
  };
}

describe("recordComparisonResult / comparisonResultsFor", () => {
  it("starts a fresh set on the first recorded result", () => {
    const p = problem("P1");
    const history = recordComparisonResult(null, p, result("fcfs"));

    expect(comparisonResultsFor(history, p)).toEqual([result("fcfs")]);
  });

  it("accumulates results for different algorithms against the same problem", () => {
    const p = problem("P1");
    let history = recordComparisonResult(null, p, result("fcfs"));
    history = recordComparisonResult(history, p, result("spt"));

    const algorithmIds = comparisonResultsFor(history, p).map((r) => r.algorithmId).sort();
    expect(algorithmIds).toEqual(["fcfs", "spt"]);
  });

  it("replaces the prior result when the same algorithm is rerun for the same problem", () => {
    const p = problem("P1");
    let history = recordComparisonResult(null, p, result("fcfs"));
    const rerun: ExecutionResult = { ...result("fcfs"), runtimeMs: 99 };
    history = recordComparisonResult(history, p, rerun);

    const results = comparisonResultsFor(history, p);
    expect(results).toHaveLength(1);
    expect(results[0].runtimeMs).toBe(99);
  });

  it("drops prior results and starts fresh once the problem reference changes", () => {
    const p1 = problem("P1");
    const p2 = problem("P1");
    const history = recordComparisonResult(null, p1, result("fcfs"));

    expect(comparisonResultsFor(history, p2)).toEqual([]);
  });

  it("returns an empty array for a null history", () => {
    expect(comparisonResultsFor(null, problem("P1"))).toEqual([]);
  });
});
