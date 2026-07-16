import { describe, expect, it } from "vitest";
import { BrowserExecutionEngine } from "./browser-execution-engine";
import { SAMPLE_PROBLEM } from "./sample-problem";

describe("BrowserExecutionEngine pre-worker gates", () => {
  it("returns invalid before constructing a Worker for an unknown algorithm", async () => {
    const engine = new BrowserExecutionEngine();
    const result = await engine.execute({ executionId: "invalid", problem: SAMPLE_PROBLEM, algorithmId: "unknown" });
    expect(result.status).toBe("invalid");
    expect(result.validationIssues.some((issue) => issue.code === "UNKNOWN_ALGORITHM_ID")).toBe(true);
  });

  it("returns every schema issue before constructing a Worker", async () => {
    const problem = structuredClone(SAMPLE_PROBLEM);
    problem.jobs[0]!.operations[0]!.processingTime = 0;
    const engine = new BrowserExecutionEngine();
    const result = await engine.execute({ executionId: "bad-problem", problem, algorithmId: "fcfs" });
    expect(result.status).toBe("invalid");
    expect(result.validationIssues.some((issue) => issue.code === "NON_POSITIVE_PROCESSING_TIME")).toBe(true);
  });
});
