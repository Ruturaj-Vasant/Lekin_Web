import { describe, expect, it } from "vitest";
import { SAMPLE_PROBLEM } from "../../app/execution/sample-problem";
import { sameSchedulingInput } from "./scheduling-input-equality";

describe("sameSchedulingInput", () => {
  it("ignores presentation-only colors", () => {
    const changed = structuredClone(SAMPLE_PROBLEM);
    changed.jobs[0]!.rgb = [1, 2, 3];
    changed.workcenters[0]!.rgb = [4, 5, 6];
    expect(sameSchedulingInput(SAMPLE_PROBLEM, changed)).toBe(true);
  });

  it("detects real job, operation, machine, and workcenter scheduling changes", () => {
    const variants = [
      (problem: typeof SAMPLE_PROBLEM) => { problem.jobs[0]!.due += 1; },
      (problem: typeof SAMPLE_PROBLEM) => { problem.jobs[0]!.operations[0]!.processingTime += 1; },
      (problem: typeof SAMPLE_PROBLEM) => { problem.machines[0]!.release += 1; },
      (problem: typeof SAMPLE_PROBLEM) => { problem.workcenters[0]!.release += 1; },
      (problem: typeof SAMPLE_PROBLEM) => { problem.name = "Renamed study"; },
    ];
    for (const mutate of variants) {
      const changed = structuredClone(SAMPLE_PROBLEM);
      mutate(changed);
      expect(sameSchedulingInput(SAMPLE_PROBLEM, changed)).toBe(false);
    }
  });
});
