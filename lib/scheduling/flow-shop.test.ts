import { describe, expect, it } from "vitest";
import { analyzeFlowShop, meetsJohnsonOptimalityConditions } from "./flow-shop";
import type { ProblemDefinition } from "../schema/problem";

/**
 * These must agree with lekinpy's JohnsonAlgorithm.flow_shop_route(). If this
 * says a problem is a flow shop and lekinpy then raises NotAFlowShopError,
 * the user gets an enabled button that fails several seconds into a Pyodide
 * boot - which is exactly what this pre-flight check exists to prevent.
 */

type JobSpec = { jobId: string; route: string[]; release?: number };

function problemFrom(jobs: JobSpec[], machinesByWorkcenter: Record<string, string[]>): ProblemDefinition {
  const workcenterIds = Object.keys(machinesByWorkcenter);
  return {
    schemaVersion: "1.0.0",
    problemId: "p",
    name: "n",
    jobs: jobs.map((job) => ({
      jobId: job.jobId,
      release: job.release ?? 0,
      due: 50,
      weight: 1,
      operations: job.route.map((workcenterId, index) => ({
        operationIndex: index,
        operationId: `${job.jobId}-O${index}`,
        workcenterId,
        processingTime: index + 1,
        status: "pending",
      })),
    })),
    workcenters: workcenterIds.map((workcenterId) => ({
      workcenterId,
      release: 0,
      status: "active",
      machineIds: machinesByWorkcenter[workcenterId]!,
    })),
    machines: workcenterIds.flatMap((workcenterId) =>
      machinesByWorkcenter[workcenterId]!.map((machineId) => ({
        machineId,
        workcenterId,
        release: 0,
        status: "active",
      })),
    ),
  };
}

const TWO_STAGE_MACHINES = { WC1: ["M1"], WC2: ["M2"] };

describe("analyzeFlowShop", () => {
  it("accepts a two-machine flow shop and reports the route", () => {
    const result = analyzeFlowShop(
      problemFrom(
        [
          { jobId: "J1", route: ["WC1", "WC2"] },
          { jobId: "J2", route: ["WC1", "WC2"] },
        ],
        TWO_STAGE_MACHINES,
      ),
    );
    expect(result.isFlowShop).toBe(true);
    if (result.isFlowShop) expect(result.route).toEqual(["WC1", "WC2"]);
  });

  it("accepts a longer flow shop", () => {
    const result = analyzeFlowShop(
      problemFrom([{ jobId: "J1", route: ["WC1", "WC2", "WC3"] }], { WC1: ["M1"], WC2: ["M2"], WC3: ["M3"] }),
    );
    expect(result.isFlowShop).toBe(true);
  });

  it("rejects a job shop where routes differ", () => {
    const result = analyzeFlowShop(
      problemFrom(
        [
          { jobId: "J1", route: ["WC1", "WC2"] },
          { jobId: "J2", route: ["WC2", "WC1"] },
        ],
        TWO_STAGE_MACHINES,
      ),
    );
    expect(result.isFlowShop).toBe(false);
    if (!result.isFlowShop) expect(result.reason).toContain("same stages in the same order");
  });

  it("rejects routes of differing length", () => {
    const result = analyzeFlowShop(
      problemFrom(
        [
          { jobId: "J1", route: ["WC1", "WC2"] },
          { jobId: "J2", route: ["WC1"] },
        ],
        TWO_STAGE_MACHINES,
      ),
    );
    expect(result.isFlowShop).toBe(false);
  });

  it("rejects a single-stage problem", () => {
    const result = analyzeFlowShop(problemFrom([{ jobId: "J1", route: ["WC1"] }], { WC1: ["M1"] }));
    expect(result.isFlowShop).toBe(false);
    if (!result.isFlowShop) expect(result.reason).toContain("at least two stages");
  });

  it("rejects a route that revisits a workcenter", () => {
    const result = analyzeFlowShop(
      problemFrom([{ jobId: "J1", route: ["WC1", "WC2", "WC1"] }], TWO_STAGE_MACHINES),
    );
    expect(result.isFlowShop).toBe(false);
    if (!result.isFlowShop) expect(result.reason).toContain("more than once");
  });

  it("rejects parallel machines at a stage", () => {
    const result = analyzeFlowShop(
      problemFrom([{ jobId: "J1", route: ["WC1", "WC2"] }], { WC1: ["M1", "M1b"], WC2: ["M2"] }),
    );
    expect(result.isFlowShop).toBe(false);
    if (!result.isFlowShop) expect(result.reason).toContain("exactly one");
  });

  it("rejects a problem with no jobs", () => {
    const result = analyzeFlowShop(problemFrom([], TWO_STAGE_MACHINES));
    expect(result.isFlowShop).toBe(false);
    if (!result.isFlowShop) expect(result.reason).toContain("no jobs");
  });

  it("reads the route in operationIndex order, not array order", () => {
    const problem = problemFrom([{ jobId: "J1", route: ["WC1", "WC2"] }], TWO_STAGE_MACHINES);
    problem.jobs[0]!.operations.reverse(); // same operationIndex values, shuffled positions
    const result = analyzeFlowShop(problem);
    expect(result.isFlowShop).toBe(true);
    if (result.isFlowShop) expect(result.route).toEqual(["WC1", "WC2"]);
  });
});

describe("meetsJohnsonOptimalityConditions", () => {
  it("holds for a two-stage flow shop released at time 0", () => {
    expect(
      meetsJohnsonOptimalityConditions(
        problemFrom([{ jobId: "J1", route: ["WC1", "WC2"] }], TWO_STAGE_MACHINES),
      ),
    ).toBe(true);
  });

  it("fails on three stages, where the rule is only a heuristic", () => {
    expect(
      meetsJohnsonOptimalityConditions(
        problemFrom([{ jobId: "J1", route: ["WC1", "WC2", "WC3"] }], { WC1: ["M1"], WC2: ["M2"], WC3: ["M3"] }),
      ),
    ).toBe(false);
  });

  it("fails when any job has a nonzero release time", () => {
    expect(
      meetsJohnsonOptimalityConditions(
        problemFrom(
          [
            { jobId: "J1", route: ["WC1", "WC2"] },
            { jobId: "J2", route: ["WC1", "WC2"], release: 3 },
          ],
          TWO_STAGE_MACHINES,
        ),
      ),
    ).toBe(false);
  });

  it("fails on anything that is not a flow shop at all", () => {
    expect(
      meetsJohnsonOptimalityConditions(problemFrom([{ jobId: "J1", route: ["WC1"] }], { WC1: ["M1"] })),
    ).toBe(false);
  });
});
