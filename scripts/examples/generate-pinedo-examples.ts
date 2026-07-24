import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serializeProblem } from "../../lib/import-export/problem-json";
import type { Job, Machine, ProblemDefinition, Workcenter } from "../../lib/schema/problem";

const here = dirname(fileURLToPath(import.meta.url));
const outputDirectory = resolve(here, "../../examples/pinedo");
const exportedAt = "2026-07-19T00:00:00.000Z";

type SingleMachineJob = {
  processingTime: number;
  release?: number;
  due: number;
  weight?: number;
};

function singleMachineProblem(
  problemId: string,
  name: string,
  sourceJobs: SingleMachineJob[],
): ProblemDefinition {
  const jobs: Job[] = sourceJobs.map((job, index) => {
    const jobId = `J${index + 1}`;
    return {
      jobId,
      release: job.release ?? 0,
      due: job.due,
      weight: job.weight ?? 1,
      operations: [
        {
          operationIndex: 0,
          operationId: `${jobId}-O1`,
          workcenterId: "WC-M1",
          processingTime: job.processingTime,
          status: "pending",
        },
      ],
    };
  });

  return {
    schemaVersion: "1.0.0",
    problemId,
    name,
    jobs,
    workcenters: [
      {
        workcenterId: "WC-M1",
        release: 0,
        status: "active",
        machineIds: ["M1"],
      },
    ],
    machines: [
      {
        machineId: "M1",
        workcenterId: "WC-M1",
        release: 0,
        status: "active",
      },
    ],
  };
}

function flowShop611(): ProblemDefinition {
  const durations = [
    [5, 4, 4, 3],
    [5, 4, 4, 6],
    [3, 2, 3, 3],
    [6, 4, 4, 2],
    [3, 4, 1, 5],
  ];
  const workcenters: Workcenter[] = durations[0].map((_, machineIndex) => ({
    workcenterId: `WC-M${machineIndex + 1}`,
    release: 0,
    status: "active",
    machineIds: [`M${machineIndex + 1}`],
  }));
  const machines: Machine[] = workcenters.map((workcenter, machineIndex) => ({
    machineId: `M${machineIndex + 1}`,
    workcenterId: workcenter.workcenterId,
    release: 0,
    status: "active",
  }));
  const jobs: Job[] = durations.map((processingTimes, jobIndex) => {
    const jobId = `J${jobIndex + 1}`;
    return {
      jobId,
      release: 0,
      // The source problem has no due dates. LEKIN requires one, so the
      // total workload is used as a neutral value and documented in README.
      due: 84,
      weight: 1,
      operations: processingTimes.map((processingTime, operationIndex) => ({
        operationIndex,
        operationId: `${jobId}-O${operationIndex + 1}`,
        workcenterId: `WC-M${operationIndex + 1}`,
        processingTime,
        status: "pending",
      })),
    };
  });

  return {
    schemaVersion: "1.0.0",
    problemId: "pinedo-6-1-1",
    name: "Pinedo 6.1.1: Flow shop",
    jobs,
    workcenters,
    machines,
  };
}

const importableProblems: Array<{ filename: string; problem: ProblemDefinition }> = [
  {
    filename: "pinedo-3.2.5-maximum-lateness.lekin.json",
    problem: singleMachineProblem("pinedo-3-2-5", "Pinedo 3.2.5: Maximum lateness", [
      { processingTime: 4, release: 0, due: 8 },
      { processingTime: 2, release: 1, due: 12 },
      { processingTime: 6, release: 3, due: 11 },
      { processingTime: 5, release: 5, due: 10 },
    ]),
  },
  {
    filename: "pinedo-3.3.3-tardy-jobs.lekin.json",
    problem: singleMachineProblem("pinedo-3-3-3", "Pinedo 3.3.3: Number of tardy jobs", [
      { processingTime: 7, due: 9 },
      { processingTime: 8, due: 17 },
      { processingTime: 4, due: 18 },
      { processingTime: 6, due: 19 },
      { processingTime: 6, due: 21 },
    ]),
  },
  {
    filename: "pinedo-3.4.5-total-tardiness.lekin.json",
    problem: singleMachineProblem("pinedo-3-4-5", "Pinedo 3.4.5: Total tardiness", [
      { processingTime: 121, due: 260 },
      { processingTime: 79, due: 266 },
      { processingTime: 147, due: 266 },
      { processingTime: 83, due: 336 },
      { processingTime: 130, due: 337 },
    ]),
  },
  {
    filename: "pinedo-3.6.3-weighted-tardiness.lekin.json",
    problem: singleMachineProblem("pinedo-3-6-3", "Pinedo 3.6.3: Weighted tardiness", [
      { weight: 4, processingTime: 12, due: 16 },
      { weight: 5, processingTime: 8, due: 26 },
      { weight: 3, processingTime: 15, due: 25 },
      { weight: 5, processingTime: 9, due: 27 },
    ]),
  },
  {
    filename: "pinedo-4.1.5-earliness-tardiness.lekin.json",
    problem: singleMachineProblem("pinedo-4-1-5", "Pinedo 4.1.5: Earliness and tardiness", [
      { processingTime: 106, due: 180 },
      { processingTime: 100, due: 180 },
      { processingTime: 96, due: 180 },
      { processingTime: 22, due: 180 },
      { processingTime: 20, due: 180 },
      { processingTime: 2, due: 180 },
    ]),
  },
  {
    filename: "pinedo-4.2.3-deadlines.lekin.json",
    problem: singleMachineProblem("pinedo-4-2-3", "Pinedo 4.2.3: Completion time with deadlines", [
      { processingTime: 4, due: 10 },
      { processingTime: 6, due: 12 },
      { processingTime: 2, due: 14 },
      { processingTime: 4, due: 18 },
      { processingTime: 2, due: 18 },
    ]),
  },
  {
    filename: "pinedo-6.1.1-flow-shop.lekin.json",
    problem: flowShop611(),
  },
];

const sourceCatalog = {
  source: "https://processscheduler.github.io/pinedo/",
  retrievedAt: "2026-07-19",
  examples: [
    {
      example: "2.3.2",
      title: "A Scheduling Anomaly",
      notation: "P2 | prec | Cmax",
      durations: [8, 7, 7, 2, 3, 2, 2, 8, 8, 15],
      reducedDurations: [7, 6, 6, 1, 2, 1, 1, 7, 7, 14],
      precedenceEdges: [
        [1, 2], [1, 3], [2, 10], [3, 10], [5, 3], [4, 5],
        [4, 6], [5, 8], [6, 7], [7, 9], [5, 9], [7, 8],
      ],
      machineCountsShown: [2, 3],
      nonDelay: true,
      lekinCompatibility: "not-faithful",
      reason: "LEKIN has ordered operations within a job, but no arbitrary precedence graph between separate jobs and no non-delay constraint.",
    },
    {
      example: "3.2.5",
      title: "Minimizing Maximum Lateness",
      jobs: [
        { job: 1, processingTime: 4, release: 0, due: 8 },
        { job: 2, processingTime: 2, release: 1, due: 12 },
        { job: 3, processingTime: 6, release: 3, due: 11 },
        { job: 4, processingTime: 5, release: 5, due: 10 },
      ],
      lekinCompatibility: "input-compatible",
    },
    {
      example: "3.3.3",
      title: "Minimizing Number of Tardy Jobs",
      jobs: [
        { job: 1, processingTime: 7, due: 9 },
        { job: 2, processingTime: 8, due: 17 },
        { job: 3, processingTime: 4, due: 18 },
        { job: 4, processingTime: 6, due: 19 },
        { job: 5, processingTime: 6, due: 21 },
      ],
      lekinCompatibility: "input-compatible",
    },
    {
      example: "3.4.5",
      title: "Minimizing Total Tardiness",
      jobs: [
        { job: 1, processingTime: 121, due: 260 },
        { job: 2, processingTime: 79, due: 266 },
        { job: 3, processingTime: 147, due: 266 },
        { job: 4, processingTime: 83, due: 336 },
        { job: 5, processingTime: 130, due: 337 },
      ],
      lekinCompatibility: "input-compatible",
    },
    {
      example: "3.6.3",
      title: "Minimizing Total Weighted Tardiness",
      jobs: [
        { job: 1, weight: 4, processingTime: 12, due: 16 },
        { job: 2, weight: 5, processingTime: 8, due: 26 },
        { job: 3, weight: 3, processingTime: 15, due: 25 },
        { job: 4, weight: 5, processingTime: 9, due: 27 },
      ],
      lekinCompatibility: "input-compatible",
    },
    {
      example: "4.1.5",
      title: "Minimizing Total Earliness and Tardiness with Tight Due Date",
      commonDue: 180,
      processingTimes: [106, 100, 96, 22, 20, 2],
      lekinCompatibility: "data-only",
      reason: "LEKIN stores the data but does not currently calculate earliness or optimize a combined earliness and tardiness objective.",
    },
    {
      example: "4.2.3",
      title: "Minimizing Total Completion Time with Deadlines",
      jobs: [
        { job: 1, processingTime: 4, due: 10 },
        { job: 2, processingTime: 6, due: 12 },
        { job: 3, processingTime: 2, due: 14 },
        { job: 4, processingTime: 4, due: 18 },
        { job: 5, processingTime: 2, due: 18 },
      ],
      lekinCompatibility: "data-only",
      reason: "LEKIN treats due dates as soft targets and does not enforce hard deadlines.",
    },
    {
      example: "6.1.1",
      title: "Flow Shops with Unlimited Intermediate Storage",
      durationsByJob: [
        [5, 4, 4, 3],
        [5, 4, 4, 6],
        [3, 2, 3, 3],
        [6, 4, 4, 2],
        [3, 4, 1, 5],
      ],
      lekinCompatibility: "input-compatible",
    },
  ],
};

await mkdir(outputDirectory, { recursive: true });

await Promise.all([
  ...importableProblems.map(({ filename, problem }) =>
    writeFile(resolve(outputDirectory, filename), serializeProblem(problem, exportedAt) + "\n", "utf8"),
  ),
  writeFile(
    resolve(outputDirectory, "source-catalog.json"),
    JSON.stringify(sourceCatalog, null, 2) + "\n",
    "utf8",
  ),
]);

console.log(`Generated ${importableProblems.length} LEKIN imports and the source catalog in ${outputDirectory}.`);
