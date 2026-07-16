import { describe, expect, it } from "vitest";
import { isResultStale } from "./result-staleness";
import { addJob, createDefaultJob } from "./problem-editor";
import type { ProblemDefinition } from "../schema/problem";

function baseProblem(): ProblemDefinition {
  return { schemaVersion: "1.0.0", problemId: "p", name: "n", jobs: [], workcenters: [], machines: [] };
}

describe("isResultStale", () => {
  it("is not stale when no result exists yet", () => {
    expect(isResultStale(null, baseProblem(), "fcfs")).toBe(false);
  });

  it("is not stale when the problem and algorithm are unchanged (same reference)", () => {
    const problem = baseProblem();
    expect(isResultStale({ problem, algorithmId: "fcfs" }, problem, "fcfs")).toBe(false);
  });

  it("is stale after any problem edit, even one that produces deep-equal content", () => {
    const problem = baseProblem();
    // every lib/editor mutation returns a new object, even a no-op-shaped one
    const edited = addJob(problem, createDefaultJob(problem));
    const revertedShape = { ...problem }; // same content as `problem`, different reference
    expect(isResultStale({ problem, algorithmId: "fcfs" }, edited, "fcfs")).toBe(true);
    expect(isResultStale({ problem, algorithmId: "fcfs" }, revertedShape, "fcfs")).toBe(true);
  });

  it("is stale after an algorithm change alone, with the same problem", () => {
    const problem = baseProblem();
    expect(isResultStale({ problem, algorithmId: "fcfs" }, problem, "spt")).toBe(true);
  });
});
