import type { ProblemDefinition } from "../../../lib/schema/problem";

/**
 * Real-execution fixture input — ARCHITECTURE.md §1.1.
 *
 * The single source of truth for the sample problem used to generate
 * test/fixtures/real-execution/fixture.json (see
 * scripts/fixtures/generate-real-execution-fixture.ts). Designed to give
 * FCFS/SPT/EDD/WSPT meaningfully different dispatch orders, not just
 * different numbers:
 *
 *   - 3 jobs, 2-3 operations each, routed across all 3 workcenters.
 *   - Release times (0, 2, 0), due dates (30, 18, 12), and weights (2, 1, 3)
 *     all differ, so FCFS (release order), SPT (first-op processing time),
 *     EDD (due date), and WSPT (weight / first-op processing time) each
 *     pick a genuinely different first job to dispatch:
 *       FCFS -> J1 (earliest release, tie-broken by list order over J3)
 *       SPT  -> J3 (first op processing time 2, the shortest)
 *       EDD  -> J3 (due 12, the earliest)
 *       WSPT -> J3 (weight/processing-time ratio 1.5, the highest)
 *   - WC1 has two eligible machines (M1, M1b) and three different
 *     operations (J1-O0, J2-O0, J3-O1) that require it, so real
 *     parallel-machine contention is exercised, not just a single queue.
 *   - M1b (release 3) and M3 (release 1) both have nonzero release times,
 *     so the machine-availability floor is exercised on more than one
 *     machine and workcenter.
 *
 * This is authored data (the INPUT), not a handwritten expected SCHEDULE —
 * the fixture's outputs are always the real lekinpy v0.2.0 execution
 * result, never asserted by hand.
 */
export const REAL_EXECUTION_SAMPLE_PROBLEM: ProblemDefinition = {
  schemaVersion: "1.0.0",
  problemId: "real-execution-fixture",
  name: "Real execution fixture: 3 jobs, 3 workcenters, parallel machines",
  jobs: [
    {
      jobId: "J1",
      release: 0,
      due: 30,
      weight: 2,
      operations: [
        { operationIndex: 0, operationId: "J1-O0", workcenterId: "WC1", processingTime: 4, status: "pending" },
        { operationIndex: 1, operationId: "J1-O1", workcenterId: "WC2", processingTime: 3, status: "pending" },
        { operationIndex: 2, operationId: "J1-O2", workcenterId: "WC3", processingTime: 2, status: "pending" },
      ],
    },
    {
      jobId: "J2",
      release: 2,
      due: 18,
      weight: 1,
      operations: [
        { operationIndex: 0, operationId: "J2-O0", workcenterId: "WC1", processingTime: 6, status: "pending" },
        { operationIndex: 1, operationId: "J2-O1", workcenterId: "WC3", processingTime: 3, status: "pending" },
      ],
    },
    {
      jobId: "J3",
      release: 0,
      due: 12,
      weight: 3,
      operations: [
        { operationIndex: 0, operationId: "J3-O0", workcenterId: "WC2", processingTime: 2, status: "pending" },
        { operationIndex: 1, operationId: "J3-O1", workcenterId: "WC1", processingTime: 5, status: "pending" },
        { operationIndex: 2, operationId: "J3-O2", workcenterId: "WC3", processingTime: 4, status: "pending" },
      ],
    },
  ],
  workcenters: [
    { workcenterId: "WC1", release: 0, status: "active", machineIds: ["M1", "M1b"] },
    { workcenterId: "WC2", release: 0, status: "active", machineIds: ["M2"] },
    { workcenterId: "WC3", release: 0, status: "active", machineIds: ["M3"] },
  ],
  machines: [
    { machineId: "M1", workcenterId: "WC1", release: 0, status: "active" },
    { machineId: "M1b", workcenterId: "WC1", release: 3, status: "active" },
    { machineId: "M2", workcenterId: "WC2", release: 0, status: "active" },
    { machineId: "M3", workcenterId: "WC3", release: 1, status: "active" },
  ],
};
