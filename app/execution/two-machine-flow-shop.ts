import type { ProblemDefinition } from "../../lib/schema/problem";

/**
 * A two-machine flow shop, the setting Johnson's rule (SPT(1)-LPT(2)) is
 * actually stated for.
 *
 * Every other bundled example is either a single-machine problem or, in the
 * case of Pinedo 6.1.1, a four-machine flow shop - and Johnson's optimality
 * proof covers neither. This example exists so the exact rule can be run and
 * compared against the dispatching rules on a problem where it really is
 * optimal, rather than only in its heuristic fallback.
 *
 * The processing times are chosen so the rule has to do real work: both of
 * its sets are non-empty (J2 and J4 have a shorter first stage; J1, J3 and
 * J5 do not), so the answer is not simply "sort by something", and the
 * dispatching rules land on a strictly worse makespan.
 *
 * This is not attributed to a numbered textbook example - it is our own
 * problem in the classic F2 || Cmax shape.
 */
export const TWO_MACHINE_FLOW_SHOP_PROBLEM: ProblemDefinition = {
  schemaVersion: "1.0.0",
  problemId: "two-machine-flow-shop",
  name: "Two-machine flow shop",
  jobs: (
    [
      ["J1", 5, 2],
      ["J2", 1, 6],
      ["J3", 9, 7],
      ["J4", 3, 8],
      ["J5", 10, 4],
    ] as const
  ).map(([jobId, first, second]) => ({
    jobId,
    release: 0,
    // The source problem is a pure makespan question with no due dates.
    // LEKIN requires one, so the total workload is used as a neutral value.
    due: 40,
    weight: 1,
    operations: [
      {
        operationIndex: 0,
        operationId: `${jobId}-O0`,
        workcenterId: "WC-M1",
        processingTime: first,
        status: "pending",
      },
      {
        operationIndex: 1,
        operationId: `${jobId}-O1`,
        workcenterId: "WC-M2",
        processingTime: second,
        status: "pending",
      },
    ],
  })),
  workcenters: [
    { workcenterId: "WC-M1", release: 0, status: "active", machineIds: ["M1"] },
    { workcenterId: "WC-M2", release: 0, status: "active", machineIds: ["M2"] },
  ],
  machines: [
    { machineId: "M1", workcenterId: "WC-M1", release: 0, status: "active" },
    { machineId: "M2", workcenterId: "WC-M2", release: 0, status: "active" },
  ],
};
