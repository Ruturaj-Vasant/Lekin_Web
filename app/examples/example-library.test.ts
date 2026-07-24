import { describe, expect, it } from "vitest";
import { EXAMPLE_LIBRARY, createExampleProblem, exampleCounts } from "./example-library";

describe("example library", () => {
  it("publishes only examples that can be opened in the current application", () => {
    expect(EXAMPLE_LIBRARY).toHaveLength(8);
    expect(EXAMPLE_LIBRARY.filter((example) => example.problem)).toHaveLength(8);
    expect(EXAMPLE_LIBRARY.every((example) => example.problem)).toBe(true);
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
