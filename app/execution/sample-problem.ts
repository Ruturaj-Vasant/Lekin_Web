import type { ProblemDefinition } from "../../lib/schema/problem";

export const SAMPLE_PROBLEM: ProblemDefinition = {
  schemaVersion: "1.0.0",
  problemId: "sample-job-shop",
  name: "Sample job shop",
  jobs: [
    {
      jobId: "J-101", release: 0, due: 18, weight: 1, rgb: [91, 120, 165],
      operations: [
        { operationIndex: 0, operationId: "J-101-O0", workcenterId: "WC-CUT", processingTime: 5, status: "pending" },
        { operationIndex: 1, operationId: "J-101-O1", workcenterId: "WC-MILL", processingTime: 7, status: "pending" },
        { operationIndex: 2, operationId: "J-101-O2", workcenterId: "WC-FINISH", processingTime: 4, status: "pending" },
      ],
    },
    {
      jobId: "J-102", release: 2, due: 24, weight: 1.5, rgb: [186, 121, 89],
      operations: [
        { operationIndex: 0, operationId: "J-102-O0", workcenterId: "WC-CUT", processingTime: 6, status: "pending" },
        { operationIndex: 1, operationId: "J-102-O1", workcenterId: "WC-MILL", processingTime: 8, status: "pending" },
        { operationIndex: 2, operationId: "J-102-O2", workcenterId: "WC-FINISH", processingTime: 3, status: "pending" },
      ],
    },
    {
      jobId: "J-103", release: 4, due: 30, weight: 0.8, rgb: [102, 143, 122],
      operations: [
        { operationIndex: 0, operationId: "J-103-O0", workcenterId: "WC-CUT", processingTime: 4, status: "pending" },
        { operationIndex: 1, operationId: "J-103-O1", workcenterId: "WC-FINISH", processingTime: 6, status: "pending" },
      ],
    },
  ],
  workcenters: [
    { workcenterId: "WC-CUT", release: 0, status: "active", rgb: [91, 120, 165], machineIds: ["M-01", "M-01B"] },
    { workcenterId: "WC-MILL", release: 0, status: "active", rgb: [186, 121, 89], machineIds: ["M-02"] },
    { workcenterId: "WC-FINISH", release: 0, status: "active", rgb: [102, 143, 122], machineIds: ["M-03"] },
  ],
  machines: [
    { machineId: "M-01", workcenterId: "WC-CUT", release: 0, status: "active" },
    { machineId: "M-01B", workcenterId: "WC-CUT", release: 3, status: "active" },
    { machineId: "M-02", workcenterId: "WC-MILL", release: 0, status: "active" },
    { machineId: "M-03", workcenterId: "WC-FINISH", release: 0, status: "active" },
  ],
};
