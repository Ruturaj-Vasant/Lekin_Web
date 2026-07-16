import { describe, expect, it } from "vitest";
import {
  applyMove,
  buildJobPrecedenceEdges,
  buildMachineSequenceEdges,
  queuesFromMachines,
  topoSortOrFindCycle,
  type MachineQueues,
} from "./graph";
import type { ProblemDefinition } from "../schema/problem";

function twoJobTwoMachineProblem(): ProblemDefinition {
  // Job 1: J1-O0 on WC1 -> J1-O1 on WC2
  // Job 2: J2-O0 on WC2 -> J2-O1 on WC1
  return {
    schemaVersion: "1.0.0",
    problemId: "p",
    name: "cycle test",
    jobs: [
      {
        jobId: "J1",
        release: 0,
        due: 100,
        weight: 1,
        operations: [
          { operationIndex: 0, operationId: "J1-O0", workcenterId: "WC1", processingTime: 5, status: "pending" },
          { operationIndex: 1, operationId: "J1-O1", workcenterId: "WC2", processingTime: 5, status: "pending" },
        ],
      },
      {
        jobId: "J2",
        release: 0,
        due: 100,
        weight: 1,
        operations: [
          { operationIndex: 0, operationId: "J2-O0", workcenterId: "WC2", processingTime: 5, status: "pending" },
          { operationIndex: 1, operationId: "J2-O1", workcenterId: "WC1", processingTime: 5, status: "pending" },
        ],
      },
    ],
    workcenters: [
      { workcenterId: "WC1", release: 0, status: "active", machineIds: ["M1"] },
      { workcenterId: "WC2", release: 0, status: "active", machineIds: ["M2"] },
    ],
    machines: [
      { machineId: "M1", workcenterId: "WC1", release: 0, status: "active" },
      { machineId: "M2", workcenterId: "WC2", release: 0, status: "active" },
    ],
  };
}

describe("buildJobPrecedenceEdges", () => {
  it("chains consecutive operations of the same job, and only those", () => {
    const problem = twoJobTwoMachineProblem();
    const edges = buildJobPrecedenceEdges(problem);
    expect(edges).toEqual(
      expect.arrayContaining([
        { from: "J1-O0", to: "J1-O1" },
        { from: "J2-O0", to: "J2-O1" },
      ]),
    );
    expect(edges).toHaveLength(2);
  });
});

describe("topoSortOrFindCycle", () => {
  it("returns a valid topological order for an acyclic graph", () => {
    const nodes = ["A", "B", "C"];
    const edges = [
      { from: "A", to: "B" },
      { from: "B", to: "C" },
    ];
    const result = topoSortOrFindCycle(nodes, edges);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.order.indexOf("A")).toBeLessThan(result.order.indexOf("B"));
      expect(result.order.indexOf("B")).toBeLessThan(result.order.indexOf("C"));
    }
  });

  it("detects the exact two-job/two-machine cycle from the architecture review", () => {
    // Job precedence: J1-O0 -> J1-O1, J2-O0 -> J2-O1
    // Manual machine orders: M1: J2-O1 -> J1-O0 ; M2: J1-O1 -> J2-O0
    // Combined: J1-O0 -> J1-O1 -> J2-O0 -> J2-O1 -> J1-O0 (cycle)
    const problem = twoJobTwoMachineProblem();
    const jobEdges = buildJobPrecedenceEdges(problem);
    const queues: MachineQueues = {
      M1: ["J2-O1", "J1-O0"],
      M2: ["J1-O1", "J2-O0"],
    };
    const machineEdges = buildMachineSequenceEdges(queues);
    const nodes = ["J1-O0", "J1-O1", "J2-O0", "J2-O1"];

    const result = topoSortOrFindCycle(nodes, [...jobEdges, ...machineEdges]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // The reported cycle must actually be a cycle: consecutive nodes are
      // connected by an edge, and it wraps back to its own start.
      const edgeSet = new Set([...jobEdges, ...machineEdges].map((e) => `${e.from}->${e.to}`));
      for (let i = 0; i < result.cycle.length; i++) {
        const from = result.cycle[i]!;
        const to = result.cycle[(i + 1) % result.cycle.length]!;
        expect(edgeSet.has(`${from}->${to}`)).toBe(true);
      }
      expect(result.cycle.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("does NOT report a cycle for a non-cyclic cross-machine reorder", () => {
    const problem = twoJobTwoMachineProblem();
    const jobEdges = buildJobPrecedenceEdges(problem);
    // M1: J1-O0 -> J2-O1 (consistent with J2-O0 -> J2-O1 needing J2-O0 done first,
    // and this ordering doesn't force J1-O0 after J1-O1)
    const queues: MachineQueues = {
      M1: ["J1-O0", "J2-O1"],
      M2: ["J2-O0", "J1-O1"],
    };
    const machineEdges = buildMachineSequenceEdges(queues);
    const nodes = ["J1-O0", "J1-O1", "J2-O0", "J2-O1"];
    const result = topoSortOrFindCycle(nodes, [...jobEdges, ...machineEdges]);
    expect(result.ok).toBe(true);
  });

  it("an operation with both a job-predecessor and a machine-predecessor keeps both edges", () => {
    // J1-O1 has job-predecessor J1-O0 AND (if machine-queued after it) a
    // machine-predecessor from a different job on the same machine.
    const nodes = ["J1-O0", "J1-O1", "J2-O0"];
    const edges = [
      { from: "J1-O0", to: "J1-O1" }, // job precedence
      { from: "J2-O0", to: "J1-O1" }, // machine precedence, different job
    ];
    const result = topoSortOrFindCycle(nodes, edges);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.order.indexOf("J1-O0")).toBeLessThan(result.order.indexOf("J1-O1"));
      expect(result.order.indexOf("J2-O0")).toBeLessThan(result.order.indexOf("J1-O1"));
    }
  });
});

describe("applyMove", () => {
  it("removes the operation from its old queue and inserts it at the target position", () => {
    const queues: MachineQueues = { M1: ["A", "B", "C"], M2: ["D"] };
    const next = applyMove(queues, "B", "M2", 0);
    expect(next.M1).toEqual(["A", "C"]);
    expect(next.M2).toEqual(["B", "D"]);
    // does not mutate the input
    expect(queues.M1).toEqual(["A", "B", "C"]);
  });

  it("clamps an out-of-range target position", () => {
    const queues: MachineQueues = { M1: ["A"] };
    const next = applyMove(queues, "A", "M1", 99);
    expect(next.M1).toEqual(["A"]);
  });
});

describe("queuesFromMachines", () => {
  it("derives ordered queues from machine schedule operations", () => {
    const queues = queuesFromMachines([
      { machineId: "M1", operations: [{ scheduledOperationId: "A" }, { scheduledOperationId: "B" }] },
    ]);
    expect(queues).toEqual({ M1: ["A", "B"] });
  });
});
