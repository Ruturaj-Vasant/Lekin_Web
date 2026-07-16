import { z } from "zod";
import type { ValidationIssue } from "./issue";
import { ProblemDefinitionSchema } from "./problem";
import { ScheduleSchema, MetricsSchema } from "./schedule";

/** ARCHITECTURE.md §1.5 — Algorithm registry. */

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
});
export type AlgorithmDefinition = z.infer<typeof AlgorithmDefinitionSchema>;

/** ARCHITECTURE.md §1.6 — Execution. */

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

/**
 * ExecutionResult itself is produced by the adapter (not user input), so we
 * define the TS interface directly rather than a Zod schema whose every
 * field would need re-deriving from ValidationIssue (which lives in a
 * plain .ts file, not built from Zod). A Zod schema for persisted/exported
 * results can be layered on later if round-tripping through JSON import
 * needs it (PRODUCT_SPEC §17); not needed yet.
 */
export interface ExecutionResult {
  executionId: string;
  executionMode: "browser" | "backend";
  algorithmId: string;
  algorithmVersion: string;
  lekinpyVersion: string;
  schemaVersion: "1.0.0";
  status: ExecutionStatus;
  runtimeMs: number;
  schedule: z.infer<typeof ScheduleSchema> | null;
  metrics: z.infer<typeof MetricsSchema> | null;
  validationIssues: ValidationIssue[];
  policyViolation: PolicyViolation | null;
  warnings: string[];
}
