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

  it("is stale after a scheduling input changes", () => {
    const problem = baseProblem();
    const edited = addJob(problem, createDefaultJob(problem));
    expect(isResultStale({ problem, algorithmId: "fcfs" }, edited, "fcfs")).toBe(true);
  });

  it("keeps a valid result after a presentation-only color edit", () => {
    const problem = addJob(baseProblem(), createDefaultJob(baseProblem()));
    const recolored = {
      ...problem,
      jobs: problem.jobs.map((job) => ({ ...job, rgb: [12, 34, 56] as [number, number, number] })),
    };
    expect(isResultStale({ problem, algorithmId: "fcfs" }, recolored, "fcfs")).toBe(false);
  });

  it("is stale after an algorithm change alone, with the same problem", () => {
    const problem = baseProblem();
    expect(isResultStale({ problem, algorithmId: "fcfs" }, problem, "spt")).toBe(true);
  });
});
