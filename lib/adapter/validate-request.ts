import type { ProblemDefinition } from "../schema/problem";
import { validateProblemDefinition } from "../schema/problem";
import type { ValidationIssue } from "../schema/issue";
import { makeIssue } from "../schema/issue";
import { getAlgorithmDefinition } from "../registry/algorithms";

/**
 * ARCHITECTURE.md §1.4/§2.2 step 2 — layer 1 of validation: Zod problem
 * structure/business rules + algorithm-compatibility, collected together,
 * before Pyodide ever loads. UNSUPPORTED_ALGORITHM_PROBLEM_COMBINATION is
 * checked separately from ProblemDefinitionSchema itself because it depends
 * on the (problem, algorithmId) pair, not the problem alone.
 */
export function validateExecutionRequest(problem: ProblemDefinition, algorithmId: string): ValidationIssue[] {
  const issues = validateProblemDefinition(problem);

  const algorithm = getAlgorithmDefinition(algorithmId);
  if (!algorithm) {
    issues.push(
      makeIssue({
        code: "UNKNOWN_ALGORITHM_ID",
        message: `Unknown algorithm id '${algorithmId}'.`,
        path: ["algorithmId"],
        source: "schema",
      }),
    );
    return issues;
  }

  if (!algorithm.libraryMetadata.supportsMultiOperation) {
    const multiOpJob = problem.jobs.find((job) => job.operations.length > 1);
    if (multiOpJob) {
      issues.push(
        makeIssue({
          code: "UNSUPPORTED_ALGORITHM_PROBLEM_COMBINATION",
          message: `${algorithm.shortName} does not currently support multi-operation jobs, but job '${multiOpJob.jobId}' has ${multiOpJob.operations.length} operations. (PRODUCT_SPEC §6 compatibility check.)`,
          path: ["algorithmId"],
          source: "schema",
          jobId: multiOpJob.jobId,
        }),
      );
    }
  }

  return issues;
}
