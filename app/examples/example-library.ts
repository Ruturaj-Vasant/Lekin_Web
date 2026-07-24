import pinedo325 from "../../examples/pinedo/pinedo-3.2.5-maximum-lateness.lekin.json";
import pinedo333 from "../../examples/pinedo/pinedo-3.3.3-tardy-jobs.lekin.json";
import pinedo345 from "../../examples/pinedo/pinedo-3.4.5-total-tardiness.lekin.json";
import pinedo363 from "../../examples/pinedo/pinedo-3.6.3-weighted-tardiness.lekin.json";
import pinedo415 from "../../examples/pinedo/pinedo-4.1.5-earliness-tardiness.lekin.json";
import pinedo423 from "../../examples/pinedo/pinedo-4.2.3-deadlines.lekin.json";
import pinedo611 from "../../examples/pinedo/pinedo-6.1.1-flow-shop.lekin.json";
import { ProblemDefinitionSchema, type ProblemDefinition } from "../../lib/schema/problem";
import { SAMPLE_PROBLEM } from "../execution/sample-problem";

export type ExampleCompatibility = "ready" | "partial" | "unavailable";

export type ExampleDefinition = {
  id: string;
  title: string;
  reference: string;
  environment: string;
  objective: string;
  description: string;
  compatibility: ExampleCompatibility;
  compatibilityNote: string;
  problem?: ProblemDefinition;
};

function problemFromEnvelope(envelope: unknown): ProblemDefinition {
  const result = ProblemDefinitionSchema.safeParse(
    typeof envelope === "object" && envelope !== null && "problem" in envelope
      ? envelope.problem
      : undefined,
  );
  if (!result.success) {
    throw new Error("A bundled example does not match the LEKIN problem schema.");
  }
  return result.data;
}

export const EXAMPLE_LIBRARY: readonly ExampleDefinition[] = [
  {
    id: "sample-job-shop",
    title: "Sample job shop",
    reference: "LEKIN starter",
    environment: "Flexible job shop",
    objective: "Explore dispatching rules",
    description: "A compact multi-operation problem designed to make algorithm differences visible.",
    compatibility: "ready",
    compatibilityNote: "Ready for editing, scheduling, comparison, and Gantt experiments.",
    problem: SAMPLE_PROBLEM,
  },
  {
    id: "pinedo-3-2-5",
    title: "Maximum lateness",
    reference: "Pinedo 3.2.5",
    environment: "Single machine",
    objective: "Maximum lateness",
    description: "Release dates and due dates create a concise sequencing study.",
    compatibility: "ready",
    compatibilityNote: "The full input is supported. Built-in rules do not guarantee the source optimum.",
    problem: problemFromEnvelope(pinedo325),
  },
  {
    id: "pinedo-3-3-3",
    title: "Number of tardy jobs",
    reference: "Pinedo 3.3.3",
    environment: "Single machine",
    objective: "Minimize tardy jobs",
    description: "A teaching example focused on which jobs finish after their due dates.",
    compatibility: "ready",
    compatibilityNote: "The input and tardy-job metric are fully supported.",
    problem: problemFromEnvelope(pinedo333),
  },
  {
    id: "pinedo-3-4-5",
    title: "Total tardiness",
    reference: "Pinedo 3.4.5",
    environment: "Single machine",
    objective: "Total tardiness",
    description: "Compare how different priority rules affect aggregate lateness.",
    compatibility: "ready",
    compatibilityNote: "The input and total-tardiness metric are fully supported.",
    problem: problemFromEnvelope(pinedo345),
  },
  {
    id: "pinedo-3-6-3",
    title: "Weighted tardiness",
    reference: "Pinedo 3.6.3",
    environment: "Single machine",
    objective: "Weighted tardiness",
    description: "Job weights expose the tradeoff between urgency and processing time.",
    compatibility: "ready",
    compatibilityNote: "The input and weighted-tardiness metric are fully supported.",
    problem: problemFromEnvelope(pinedo363),
  },
  {
    id: "pinedo-4-1-5",
    title: "Earliness and tardiness",
    reference: "Pinedo 4.1.5",
    environment: "Single machine",
    objective: "Earliness and tardiness",
    description: "A due-date study whose input can be explored with current LEKIN metrics.",
    compatibility: "partial",
    compatibilityNote: "Input supported. Earliness and the combined objective are not yet calculated.",
    problem: problemFromEnvelope(pinedo415),
  },
  {
    id: "pinedo-4-2-3",
    title: "Completion with deadlines",
    reference: "Pinedo 4.2.3",
    environment: "Single machine",
    objective: "Completion time with deadlines",
    description: "A deadline-oriented problem useful for studying schedule feasibility.",
    compatibility: "partial",
    compatibilityNote: "Input supported. LEKIN treats due dates as soft and does not enforce hard deadlines.",
    problem: problemFromEnvelope(pinedo423),
  },
  {
    id: "pinedo-6-1-1",
    title: "Four-machine flow shop",
    reference: "Pinedo 6.1.1",
    environment: "Flow shop",
    objective: "Makespan exploration",
    description: "Every job follows the same route through four machines.",
    compatibility: "ready",
    compatibilityNote: "The route and processing times map directly into LEKIN workcenters.",
    problem: problemFromEnvelope(pinedo611),
  },
  {
    id: "pinedo-2-3-2",
    title: "Scheduling anomaly",
    reference: "Pinedo 2.3.2",
    environment: "Parallel machines",
    objective: "Precedence-constrained makespan",
    description: "A classic anomaly involving arbitrary precedence relations between jobs.",
    compatibility: "unavailable",
    compatibilityNote: "Not yet runnable because LEKIN does not model arbitrary cross-job precedence constraints.",
  },
] as const;

export function exampleCounts(problem: ProblemDefinition) {
  return {
    jobs: problem.jobs.length,
    machines: problem.machines.length,
    operations: problem.jobs.reduce((sum, job) => sum + job.operations.length, 0),
  };
}

export function createExampleProblem(exampleId: string): ProblemDefinition {
  const example = EXAMPLE_LIBRARY.find((candidate) => candidate.id === exampleId);
  if (!example?.problem) {
    throw new Error(`Example '${exampleId}' is not available.`);
  }
  return {
    ...structuredClone(example.problem),
    problemId: crypto.randomUUID(),
  };
}
