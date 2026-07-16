import { z } from "zod";
import type { ValidationIssue } from "./issue";
import { makeIssue } from "./issue";

/**
 * ARCHITECTURE.md §1.1 - Problem domain.
 *
 * These Zod schemas validate STRUCTURE only (right JS types, required
 * fields present, correct nesting) - that's the "is this even shaped
 * right" gate. All business-rule validation (duplicates, cross-references,
 * positivity, non-emptiness, rgb range, operationIndex correctness,
 * warnings) is deliberately NOT expressed as Zod refinements here; it runs
 * as plain TypeScript functions over the successfully-typed data in
 * `validateProblemDefinition()` below. This keeps every ValidationIssue's
 * `code` under our exact control instead of reverse-engineering it from
 * Zod's own generic issue codes.
 */

const RgbTupleSchema = z.tuple([z.number(), z.number(), z.number()]);

export const OperationSchema = z.object({
  operationIndex: z.number(),
  operationId: z.string(),
  workcenterId: z.string(),
  processingTime: z.number(),
  status: z.string(),
});
export type Operation = z.infer<typeof OperationSchema>;

export const JobSchema = z.object({
  jobId: z.string(),
  release: z.number(),
  due: z.number(),
  weight: z.number(),
  rgb: RgbTupleSchema.optional(),
  operations: z.array(OperationSchema),
});
export type Job = z.infer<typeof JobSchema>;

export const MachineSchema = z.object({
  machineId: z.string(),
  workcenterId: z.string(),
  release: z.number(),
  status: z.string(),
});
export type Machine = z.infer<typeof MachineSchema>;

export const WorkcenterSchema = z.object({
  workcenterId: z.string(),
  release: z.number(),
  status: z.string(),
  rgb: RgbTupleSchema.optional(),
  machineIds: z.array(z.string()),
});
export type Workcenter = z.infer<typeof WorkcenterSchema>;

export const ProblemDefinitionSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  problemId: z.string(),
  name: z.string(),
  jobs: z.array(JobSchema),
  workcenters: z.array(WorkcenterSchema),
  machines: z.array(MachineSchema),
});
export type ProblemDefinition = z.infer<typeof ProblemDefinitionSchema>;

// ---------------------------------------------------------------------------
// Business-rule checks (plain functions over typed data, per the note above)
// ---------------------------------------------------------------------------

function isFinitePositive(n: number): boolean {
  return Number.isFinite(n) && n > 0;
}

function isValidRgbComponent(n: number): boolean {
  return Number.isInteger(n) && n >= 0 && n <= 255;
}

/**
 * Structural (blocking) business-rule checks - everything in
 * ARCHITECTURE.md §1.4's "what Zod should collect" list except the
 * warnings, which are collected separately (see collectProblemWarnings).
 */
export function collectStructuralIssues(problem: ProblemDefinition): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const addr = (...path: Array<string | number>) => path;

  // --- Numeric finiteness (NaN/Infinity, INVALID_NUMERIC_VALUE) ---
  const checkFinite = (value: number, path: Array<string | number>) => {
    if (!Number.isFinite(value)) {
      issues.push(
        makeIssue({
          code: "INVALID_NUMERIC_VALUE",
          message: `Value at ${path.join(".")} must be a finite number, got ${value}.`,
          path,
          source: "schema",
        }),
      );
    }
  };

  // --- rgb range/integer validity (INVALID_RGB) ---
  const checkRgb = (
    rgb: readonly [number, number, number] | undefined,
    path: Array<string | number>,
  ) => {
    if (rgb === undefined) return;
    if (!rgb.every(isValidRgbComponent)) {
      issues.push(
        makeIssue({
          code: "INVALID_RGB",
          message: `rgb at ${path.join(".")} must be three integers in 0-255, got [${rgb.join(", ")}].`,
          path,
          source: "schema",
        }),
      );
    }
  };

  // --- Jobs: duplicates, empty operations, operationIndex, processingTime, rgb, numeric ---
  const seenJobIds = new Set<string>();
  problem.jobs.forEach((job, jobIndex) => {
    if (seenJobIds.has(job.jobId)) {
      issues.push(
        makeIssue({
          code: "DUPLICATE_JOB_ID",
          message: `Duplicate job id '${job.jobId}'.`,
          path: addr("jobs", jobIndex, "jobId"),
          source: "schema",
          jobId: job.jobId,
        }),
      );
    }
    seenJobIds.add(job.jobId);

    checkFinite(job.release, addr("jobs", jobIndex, "release"));
    checkFinite(job.due, addr("jobs", jobIndex, "due"));
    checkFinite(job.weight, addr("jobs", jobIndex, "weight"));
    checkRgb(job.rgb, addr("jobs", jobIndex, "rgb"));

    if (job.operations.length === 0) {
      issues.push(
        makeIssue({
          code: "EMPTY_OPERATIONS",
          message: `Job '${job.jobId}' must have at least one operation.`,
          path: addr("jobs", jobIndex, "operations"),
          source: "schema",
          jobId: job.jobId,
        }),
      );
    }

    job.operations.forEach((op, opIndex) => {
      if (op.operationIndex !== opIndex) {
        issues.push(
          makeIssue({
            code: "INVALID_OPERATION_INDEX",
            message: `Operation at position ${opIndex} of job '${job.jobId}' has operationIndex ${op.operationIndex}, expected ${opIndex}.`,
            path: addr("jobs", jobIndex, "operations", opIndex, "operationIndex"),
            source: "schema",
            jobId: job.jobId,
            operationIndex: opIndex,
          }),
        );
      }
      if (!isFinitePositive(op.processingTime)) {
        issues.push(
          makeIssue({
            code: "NON_POSITIVE_PROCESSING_TIME",
            message: `Operation ${opIndex} of job '${job.jobId}' has processingTime ${op.processingTime}; it must be a positive number.`,
            path: addr("jobs", jobIndex, "operations", opIndex, "processingTime"),
            source: "schema",
            jobId: job.jobId,
            operationIndex: opIndex,
          }),
        );
      }
    });
  });

  // --- Workcenters: duplicates, empty machine lists, rgb, numeric ---
  const seenWorkcenterIds = new Set<string>();
  problem.workcenters.forEach((wc, wcIndex) => {
    if (seenWorkcenterIds.has(wc.workcenterId)) {
      issues.push(
        makeIssue({
          code: "DUPLICATE_WORKCENTER_ID",
          message: `Duplicate workcenter id '${wc.workcenterId}'.`,
          path: addr("workcenters", wcIndex, "workcenterId"),
          source: "schema",
          workcenterId: wc.workcenterId,
        }),
      );
    }
    seenWorkcenterIds.add(wc.workcenterId);

    checkFinite(wc.release, addr("workcenters", wcIndex, "release"));
    checkRgb(wc.rgb, addr("workcenters", wcIndex, "rgb"));

    if (wc.machineIds.length === 0) {
      issues.push(
        makeIssue({
          code: "EMPTY_MACHINE_LIST",
          message: `Workcenter '${wc.workcenterId}' must have at least one machine.`,
          path: addr("workcenters", wcIndex, "machineIds"),
          source: "schema",
          workcenterId: wc.workcenterId,
        }),
      );
    }

    const seenListedMachineIds = new Set<string>();
    wc.machineIds.forEach((machineId, machineIndex) => {
      if (seenListedMachineIds.has(machineId)) {
        issues.push(
          makeIssue({
            code: "INCONSISTENT_MACHINE_WORKCENTER",
            message: `Workcenter '${wc.workcenterId}' lists machine '${machineId}' more than once.`,
            path: addr("workcenters", wcIndex, "machineIds", machineIndex),
            source: "schema",
            workcenterId: wc.workcenterId,
            machineId,
          }),
        );
      }
      seenListedMachineIds.add(machineId);
    });
  });

  // --- Machines: duplicates (global), numeric ---
  const seenMachineIds = new Set<string>();
  problem.machines.forEach((machine, machineIndex) => {
    if (seenMachineIds.has(machine.machineId)) {
      issues.push(
        makeIssue({
          code: "DUPLICATE_MACHINE_ID",
          message: `Duplicate machine id '${machine.machineId}'.`,
          path: addr("machines", machineIndex, "machineId"),
          source: "schema",
          machineId: machine.machineId,
        }),
      );
    }
    seenMachineIds.add(machine.machineId);
    checkFinite(machine.release, addr("machines", machineIndex, "release"));
  });

  // --- Cross-reference: every operation's workcenterId must exist (MISSING_WORKCENTER_REFERENCE) ---
  problem.jobs.forEach((job, jobIndex) => {
    job.operations.forEach((op, opIndex) => {
      if (!seenWorkcenterIds.has(op.workcenterId)) {
        issues.push(
          makeIssue({
            code: "MISSING_WORKCENTER_REFERENCE",
            message: `Job '${job.jobId}' operation ${opIndex} references unknown workcenter '${op.workcenterId}'. Known workcenters: ${[...seenWorkcenterIds].sort().join(", ") || "(none)"}.`,
            path: addr("jobs", jobIndex, "operations", opIndex, "workcenterId"),
            source: "schema",
            jobId: job.jobId,
            operationIndex: opIndex,
            workcenterId: op.workcenterId,
          }),
        );
      }
    });
  });

  // --- Machine.workcenterId <-> Workcenter.machineIds consistency (INCONSISTENT_MACHINE_WORKCENTER) ---
  const machineIdToWorkcenterId = new Map(problem.machines.map((m) => [m.machineId, m.workcenterId]));
  problem.workcenters.forEach((wc, wcIndex) => {
    wc.machineIds.forEach((machineId, i) => {
      const actualWorkcenterId = machineIdToWorkcenterId.get(machineId);
      if (actualWorkcenterId === undefined) {
        issues.push(
          makeIssue({
            code: "INCONSISTENT_MACHINE_WORKCENTER",
            message: `Workcenter '${wc.workcenterId}' lists machine '${machineId}', which does not exist in problem.machines.`,
            path: addr("workcenters", wcIndex, "machineIds", i),
            source: "schema",
            workcenterId: wc.workcenterId,
            machineId,
          }),
        );
      } else if (actualWorkcenterId !== wc.workcenterId) {
        issues.push(
          makeIssue({
            code: "INCONSISTENT_MACHINE_WORKCENTER",
            message: `Workcenter '${wc.workcenterId}' lists machine '${machineId}', but that machine's workcenterId is '${actualWorkcenterId}'.`,
            path: addr("workcenters", wcIndex, "machineIds", i),
            source: "schema",
            workcenterId: wc.workcenterId,
            machineId,
          }),
        );
      }
    });
  });
  problem.machines.forEach((machine, machineIndex) => {
    const owningWorkcenter = problem.workcenters.find((wc) => wc.workcenterId === machine.workcenterId);
    if (owningWorkcenter === undefined) {
      issues.push(
        makeIssue({
          code: "INCONSISTENT_MACHINE_WORKCENTER",
          message: `Machine '${machine.machineId}' claims workcenterId '${machine.workcenterId}', which does not exist in problem.workcenters.`,
          path: addr("machines", machineIndex, "workcenterId"),
          source: "schema",
          machineId: machine.machineId,
          workcenterId: machine.workcenterId,
        }),
      );
    } else if (!owningWorkcenter.machineIds.includes(machine.machineId)) {
      issues.push(
        makeIssue({
          code: "INCONSISTENT_MACHINE_WORKCENTER",
          message: `Machine '${machine.machineId}' claims workcenterId '${machine.workcenterId}', but that workcenter's machineIds does not list it.`,
          path: addr("machines", machineIndex, "workcenterId"),
          source: "schema",
          machineId: machine.machineId,
          workcenterId: machine.workcenterId,
        }),
      );
    }
  });

  return issues;
}

const UNUSUALLY_LARGE_WEIGHT_THRESHOLD = 1000;
const UNUSUALLY_LONG_PROCESSING_TIME_THRESHOLD = 10_000;
const KNOWN_STATUS_VALUES = new Set(["pending", "scheduled", "in-progress", "done", "active", "inactive"]);

/** Non-blocking warnings (severity: "warning") - ARCHITECTURE.md §1.4. */
export function collectProblemWarnings(problem: ProblemDefinition): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  problem.jobs.forEach((job, jobIndex) => {
    if (Number.isFinite(job.due) && Number.isFinite(job.release) && job.due < job.release) {
      issues.push(
        makeIssue({
          code: "DUE_BEFORE_RELEASE",
          message: `Job '${job.jobId}' has a due date (${job.due}) earlier than its release time (${job.release}).`,
          path: ["jobs", jobIndex, "due"],
          source: "schema",
          jobId: job.jobId,
        }),
      );
    }
    if (Number.isFinite(job.weight) && job.weight > UNUSUALLY_LARGE_WEIGHT_THRESHOLD) {
      issues.push(
        makeIssue({
          code: "UNUSUALLY_LARGE_WEIGHT",
          message: `Job '${job.jobId}' has an unusually large weight (${job.weight}).`,
          path: ["jobs", jobIndex, "weight"],
          source: "schema",
          jobId: job.jobId,
        }),
      );
    }
    job.operations.forEach((op, opIndex) => {
      if (
        Number.isFinite(op.processingTime) &&
        op.processingTime > UNUSUALLY_LONG_PROCESSING_TIME_THRESHOLD
      ) {
        issues.push(
          makeIssue({
            code: "UNUSUALLY_LONG_PROCESSING_TIME",
            message: `Operation ${opIndex} of job '${job.jobId}' has an unusually long processingTime (${op.processingTime}).`,
            path: ["jobs", jobIndex, "operations", opIndex, "processingTime"],
            source: "schema",
            jobId: job.jobId,
            operationIndex: opIndex,
          }),
        );
      }
      if (!KNOWN_STATUS_VALUES.has(op.status)) {
        issues.push(
          makeIssue({
            code: "UNCLEAR_STATUS",
            message: `Operation ${opIndex} of job '${job.jobId}' has status '${op.status}', which is not one of the common values (${[...KNOWN_STATUS_VALUES].join(", ")}). lekinpy treats status as free-form, so this is advisory only.`,
            path: ["jobs", jobIndex, "operations", opIndex, "status"],
            source: "schema",
            jobId: job.jobId,
            operationIndex: opIndex,
          }),
        );
      }
    });
  });

  return issues;
}

/**
 * Full problem-editor validation pass (ARCHITECTURE.md §1.4, layer 1):
 * structural type-shape check, then business-rule + warning checks over the
 * successfully-typed data. Collects every issue in one pass - this is what
 * makes the editor/import flow able to show every problem at once, with
 * zero lekin-library involvement.
 *
 * Raw Zod issues (from `problem` not even satisfying the base structural
 * shape - wrong JS types, missing required keys) are mapped with a
 * best-effort code inferred from the path. This is intentionally coarse -
 * genuinely malformed input (as opposed to well-typed-but-semantically-
 * invalid input, which collectStructuralIssues above handles precisely) is
 * a rare edge case (e.g. hand-edited import JSON), not the primary
 * validation UX.
 */
export function validateProblemDefinition(problem: unknown): ValidationIssue[] {
  const parsed = ProblemDefinitionSchema.safeParse(problem);
  if (!parsed.success) {
    return parsed.error.issues.map((issue) => {
      const path = issue.path as Array<string | number>;
      const lastSegment = path[path.length - 1];
      const code =
        lastSegment === "rgb"
          ? "INVALID_RGB"
          : lastSegment === "operations"
            ? "EMPTY_OPERATIONS"
            : lastSegment === "machineIds"
              ? "EMPTY_MACHINE_LIST"
              : "INVALID_NUMERIC_VALUE";
      return makeIssue({
        code,
        message: `${path.join(".") || "(root)"}: ${issue.message}`,
        path,
        source: "schema",
      });
    });
  }
  return [...collectStructuralIssues(parsed.data), ...collectProblemWarnings(parsed.data)];
}
