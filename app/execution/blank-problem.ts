import type { ProblemDefinition } from "../../lib/schema/problem";

export function createBlankProblem(): ProblemDefinition {
  return {
    schemaVersion: "1.0.0",
    problemId: crypto.randomUUID(),
    name: "Untitled problem",
    jobs: [],
    workcenters: [],
    machines: [],
  };
}
