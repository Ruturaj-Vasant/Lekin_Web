import { describe, expect, it } from "vitest";
import { EXAMPLE_LIBRARY, createExampleProblem, exampleCounts } from "./example-library";
import { analyzeFlowShop, meetsJohnsonOptimalityConditions } from "../../lib/scheduling/flow-shop";

describe("example library", () => {
  it("publishes only examples that can be opened in the current application", () => {
    expect(EXAMPLE_LIBRARY).toHaveLength(9);
    expect(EXAMPLE_LIBRARY.filter((example) => example.problem)).toHaveLength(9);
    expect(EXAMPLE_LIBRARY.every((example) => example.problem)).toBe(true);
  });

  it("ships a problem where Johnson's rule is genuinely optimal, not just runnable", () => {
    // Without this, every bundled flow shop would be the four-stage Pinedo
    // 6.1.1, where the rule only applies through its heuristic fallback.
    const problem = createExampleProblem("two-machine-flow-shop");
    const analysis = analyzeFlowShop(problem);
    expect(analysis.isFlowShop).toBe(true);
    if (analysis.isFlowShop) expect(analysis.route).toHaveLength(2);
    expect(meetsJohnsonOptimalityConditions(problem)).toBe(true);
  });

  it("keeps Pinedo 6.1.1 a flow shop, so Johnson's rule stays selectable on it", () => {
    const analysis = analyzeFlowShop(createExampleProblem("pinedo-6-1-1"));
    expect(analysis.isFlowShop).toBe(true);
    // Four stages, so it runs but is explicitly not the provably optimal case.
    if (analysis.isFlowShop) expect(analysis.route).toHaveLength(4);
    expect(meetsJohnsonOptimalityConditions(createExampleProblem("pinedo-6-1-1"))).toBe(false);
  });

  it("creates independent projects without mutating the bundled example", () => {
    const first = createExampleProblem("pinedo-6-1-1");
    const second = createExampleProblem("pinedo-6-1-1");

    expect(first.problemId).not.toBe(second.problemId);
    expect(first.name).toBe("Pinedo 6.1.1: Flow shop");
    expect(exampleCounts(first)).toEqual({ jobs: 5, machines: 4, operations: 20 });

    first.jobs[0].jobId = "EDITED";
    expect(second.jobs[0].jobId).not.toBe("EDITED");
  });
});
