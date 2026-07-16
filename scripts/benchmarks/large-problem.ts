import type { ProblemDefinition } from "../../lib/schema/problem";

export interface LargeProblemShape {
  jobs: number;
  operationsPerJob: number;
  workcenters: number;
  machinesPerWorkcenter: number;
}

const JOB_COLORS: Array<[number, number, number]> = [
  [75, 111, 164],
  [196, 116, 76],
  [85, 151, 123],
  [129, 95, 160],
  [196, 156, 65],
  [67, 140, 156],
];

/**
 * Build a deterministic, valid job-shop problem with enough routing variety
 * to exercise the browser scheduler and Gantt renderer realistically.
 */
export function createLargeProblem(shape: LargeProblemShape): ProblemDefinition {
  const pad = (value: number, width = 3) => String(value).padStart(width, "0");
  const workcenters = Array.from({ length: shape.workcenters }, (_, wcIndex) => {
    const workcenterId = `WC-${pad(wcIndex + 1, 2)}`;
    return {
      workcenterId,
      release: wcIndex % 4 === 0 ? 1 : 0,
      status: "A",
      machineIds: Array.from(
        { length: shape.machinesPerWorkcenter },
        (_, machineIndex) => `M-${pad(wcIndex + 1, 2)}-${machineIndex + 1}`,
      ),
    };
  });

  const machines = workcenters.flatMap((workcenter, wcIndex) =>
    workcenter.machineIds.map((machineId, machineIndex) => ({
      machineId,
      workcenterId: workcenter.workcenterId,
      release: (wcIndex + machineIndex) % 7 === 0 ? 1 : 0,
      status: "A",
    })),
  );

  const jobs = Array.from({ length: shape.jobs }, (_, jobIndex) => {
    const jobId = `J-${pad(jobIndex + 1)}`;
    const operations = Array.from({ length: shape.operationsPerJob }, (_, operationIndex) => {
      // The coprime multipliers spread routes through the shop while keeping
      // the fixture deterministic and reproducible across benchmark runs.
      const wcIndex = (jobIndex * 7 + operationIndex * 11) % shape.workcenters;
      return {
        operationIndex,
        operationId: `${jobId}-O${operationIndex + 1}`,
        workcenterId: workcenters[wcIndex].workcenterId,
        processingTime: 1 + ((jobIndex * 3 + operationIndex * 5) % 10),
        status: "A",
      };
    });
    const totalProcessingTime = operations.reduce((sum, operation) => sum + operation.processingTime, 0);
    const release = jobIndex % 8;
    return {
      jobId,
      release,
      due: release + totalProcessingTime * 3 + (jobIndex % 17),
      weight: 1 + (jobIndex % 5),
      rgb: JOB_COLORS[jobIndex % JOB_COLORS.length],
      operations,
    };
  });

  return {
    schemaVersion: "1.0.0",
    problemId: `large-${shape.jobs}j-${shape.jobs * shape.operationsPerJob}o`,
    name: `Large browser study (${shape.jobs} jobs, ${shape.jobs * shape.operationsPerJob} operations)`,
    jobs,
    workcenters,
    machines,
  };
}

