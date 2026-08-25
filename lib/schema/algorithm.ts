import { z } from "zod";
import { ValidationIssueSchema } from "./issue";
import { ProblemDefinitionSchema } from "./problem";
import { ScheduleSchema, MetricsSchema } from "./schedule";

/** ARCHITECTURE.md §1.5 - Algorithm registry. */

export const AlgorithmParameterSchema = z.object({
  name: z.string(),
  label: z.string(),
  type: z.enum(["number", "string", "boolean", "enum"]),
  default: z.unknown(),
  options: z.array(z.unknown()).optional(),
});
export type AlgorithmParameter = z.infer<typeof AlgorithmParameterSchema>;

export const LibraryMetadataSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  supportsMultiOperation: z.boolean(),
  version: z.string(),
});
export type LibraryMetadata = z.infer<typeof LibraryMetadataSchema>;

export const AlgorithmDefinitionSchema = z.object({
  id: z.string(),
  libraryMetadata: LibraryMetadataSchema,
  shortName: z.string(),
  description: z.string(),
  problemTypes: z.array(z.string()),
  supportsReleaseTimes: z.boolean(),
  supportsWeights: z.boolean(),
  browserCompatible: z.boolean(),
  backendRequired: z.boolean(),
  estimatedComplexity: z.string(),
  defaultBrowserOperationLimit: z.number(),
  parameters: z.array(AlgorithmParameterSchema),
  /**
   * Whether the algorithm is only defined on a flow shop - every job
   * visiting the same workcenters in the same order, one machine per stage.
   * lekinpy raises NotAFlowShopError for these, so this flag lets
   * validate-request.ts say so before Pyodide is ever loaded, and lets the
   * sidebar disable the option instead of offering a run that cannot work.
   */
  requiresFlowShop: z.boolean(),
  /**
   * What the algorithm actually guarantees. The dispatching rules are
   * heuristics; Johnson's rule provably minimizes makespan on a two-machine
   * flow shop. Surfaced in the UI so an optimal result is not presented as
   * merely another rule's opinion - and so a result that misses the
   * guarantee's preconditions is not presented as optimal.
   */
  guarantee: z.enum(["heuristic", "optimal-under-conditions"]),
  /** Human-readable statement of those conditions; null for pure heuristics. */
  optimalityConditions: z.string().nullable(),
});
export type AlgorithmDefinition = z.infer<typeof AlgorithmDefinitionSchema>;

/** ARCHITECTURE.md §1.6 - Execution. */

export const ExecutionRequestSchema = z.object({
  executionId: z.string(),
  problem: ProblemDefinitionSchema,
  algorithmId: z.string(),
  parameters: z.record(z.string(), z.unknown()).optional(),
});
export type ExecutionRequest = z.infer<typeof ExecutionRequestSchema>;

export const POLICY_LIMIT_NAMES = [
  "maxJobs",
  "maxOperations",
  "maxMachines",
  "maxWorkcenters",
  "maxEstimatedRuntimeMs",
  "maxInputFileSizeMb",
] as const;
export type PolicyLimitName = (typeof POLICY_LIMIT_NAMES)[number];

export const PolicyViolationSchema = z.object({
  limitName: z.enum(POLICY_LIMIT_NAMES),
  limitValue: z.number(),
  actualValue: z.number(),
  message: z.string(),
});
export type PolicyViolation = z.infer<typeof PolicyViolationSchema>;

export const EXECUTION_STATUSES = ["completed", "rejected", "invalid", "error"] as const;
export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number];

export const ExecutionResultSchema = z.object({
  executionId: z.string(),
  executionMode: z.enum(["browser", "backend"]),
  algorithmId: z.string(),
  algorithmVersion: z.string(),
  lekinpyVersion: z.string(),
  schemaVersion: z.literal("1.0.0"),
  status: z.enum(EXECUTION_STATUSES),
  runtimeMs: z.number(),
  schedule: ScheduleSchema.nullable(),
  metrics: MetricsSchema.nullable(),
  validationIssues: z.array(ValidationIssueSchema),
  policyViolation: PolicyViolationSchema.nullable(),
  warnings: z.array(z.string()),
}).superRefine((result, context) => {
  const completed = result.status === "completed";
  if (completed && (result.schedule === null || result.metrics === null)) {
    context.addIssue({
      code: "custom",
      path: result.schedule === null ? ["schedule"] : ["metrics"],
      message: "A completed execution must include both schedule and metrics.",
    });
  }
  if (!completed && (result.schedule !== null || result.metrics !== null)) {
    context.addIssue({
      code: "custom",
      path: result.schedule !== null ? ["schedule"] : ["metrics"],
      message: "Only a completed execution may include schedule or metrics.",
    });
  }

  const hasValidationError = result.validationIssues.some((issue) => issue.severity === "error");
  if ((result.status === "invalid") !== hasValidationError) {
    context.addIssue({
      code: "custom",
      path: ["validationIssues"],
      message: "Validation errors must be present if and only if status is invalid.",
    });
  }

  if ((result.status === "rejected") !== (result.policyViolation !== null)) {
    context.addIssue({
      code: "custom",
      path: ["policyViolation"],
      message: "A policy violation must be present if and only if status is rejected.",
    });
  }
});
export type ExecutionResult = z.infer<typeof ExecutionResultSchema>;
