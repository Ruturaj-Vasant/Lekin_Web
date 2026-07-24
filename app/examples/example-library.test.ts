import { describe, expect, it } from "vitest";
import { EXAMPLE_LIBRARY, createExampleProblem, exampleCounts } from "./example-library";

describe("example library", () => {
  it("publishes every extracted example and explains the unsupported anomaly", () => {
    expect(EXAMPLE_LIBRARY).toHaveLength(9);
    expect(EXAMPLE_LIBRARY.filter((example) => example.problem)).toHaveLength(8);
    const anomaly = EXAMPLE_LIBRARY.find((example) => example.id === "pinedo-2-3-2");
    expect(anomaly?.compatibility).toBe("unavailable");
    expect(anomaly?.problem).toBeUndefined();
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

  it("rejects an example that cannot be represented by the current schema", () => {
    expect(() => createExampleProblem("pinedo-2-3-2")).toThrow("is not available");
  });
});
