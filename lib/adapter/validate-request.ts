import type { ProblemDefinition } from "../schema/problem";
import { validateProblemDefinition } from "../schema/problem";
import type { ValidationIssue } from "../schema/issue";
import { makeIssue } from "../schema/issue";
import { getAlgorithmDefinition } from "../registry/algorithms";
import { analyzeFlowShop, meetsJohnsonOptimalityConditions } from "../scheduling/flow-shop";

/**
 * ARCHITECTURE.md §1.4/§2.2 step 2 - layer 1 of validation: Zod problem
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

  // Structural requirement, checked here rather than left to lekinpy so the
  // user is told before Pyodide boots and the wheel installs. lekinpy raises
  // NotAFlowShopError for exactly these cases; analyzeFlowShop() mirrors it.
  if (algorithm.requiresFlowShop) {
    const analysis = analyzeFlowShop(problem);
    if (!analysis.isFlowShop) {
      issues.push(
        makeIssue({
          code: "UNSUPPORTED_ALGORITHM_PROBLEM_COMBINATION",
          message: `${algorithm.shortName} only applies to a flow shop, but ${analysis.reason}.`,
          path: ["algorithmId"],
          source: "schema",
        }),
      );
    } else if (algorithm.guarantee === "optimal-under-conditions" && !meetsJohnsonOptimalityConditions(problem)) {
      // Runs fine and returns a valid schedule - it just isn't the provably
      // optimal one, so say so rather than letting the UI imply otherwise.
      // Name the condition that is actually violated. Leading with the stage
      // count unconditionally blamed it even on a two-stage flow shop whose
      // only problem was a nonzero release time, which points the reader at
      // the wrong thing to change.
      const unmet: string[] = [];
      if (analysis.route.length !== 2) {
        unmet.push(`this is a ${analysis.route.length}-stage flow shop, not two`);
      }
      const releasedLate = problem.jobs.filter((job) => job.release !== 0);
      if (releasedLate.length > 0) {
        unmet.push(
          releasedLate.length === 1
            ? `job '${releasedLate[0]!.jobId}' is released at ${releasedLate[0]!.release}, not 0`
            : `${releasedLate.length} jobs are released after time 0`,
        );
      }
      // unmet is non-empty for every condition meetsJohnsonOptimalityConditions
      // currently checks; the fallback keeps the sentence well-formed if a
      // condition is added there without being described here.
      const because = unmet.length > 0 ? `: ${unmet.join(", and ")}` : "";
      issues.push(
        makeIssue({
          code: "OPTIMALITY_CONDITIONS_NOT_MET",
          message:
            `${algorithm.shortName} will still produce a schedule, but not a provably optimal one here${because}. ` +
            `Its optimality guarantee needs: ${algorithm.optimalityConditions}`,
          path: ["algorithmId"],
          source: "schema",
        }),
      );
    }
  }

  return issues;
}
