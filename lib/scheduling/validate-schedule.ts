import { makeIssue } from "../schema/issue";
import type { ValidationIssue } from "../schema/issue";
import type { ProblemDefinition } from "../schema/problem";
import { ScheduleSchema, makeOperationId, type Schedule } from "../schema/schedule";

/**
 * Independent, from-scratch feasibility validator for a Schedule against
 * the ProblemDefinition it claims to schedule.
 *
 * Why this exists (see lekin-web_DECISIONS.md for the full reconciliation
 * note): no reusable "verify an arbitrary Schedule is feasible for this
 * System" check exists anywhere today.
 *   - `lekinpy.System.validate()` checks the PROBLEM (jobs/workcenters/
 *     machines), never a produced Schedule.
 *   - `lib/scheduling/recalculate.ts`'s `checkDropValidity()` only validates
 *     ONE proposed incremental drag-drop move against an already-trusted
 *     schedule; it assumes the starting schedule is already feasible and
 *     was never designed to audit an arbitrary schedule from scratch (e.g.
 *     one returned by untrusted code).
 * This module is a checker, not a scheduler: it never decides where an
 * operation SHOULD go (that would be "duplicating scheduling rules", which
 * ARCHITECTURE.md's own §6.2 precedent explicitly avoids elsewhere) - it
 * only verifies where a given schedule SAYS operations go is internally
 * consistent and compatible with the problem. Flagged in
 * lekin-web_DECISIONS.md as a `lekin-library` enhancement candidate (an
 * eventual `System.validate_schedule(schedule)`), matching the precedent
 * already set for `recalculate.ts` in ARCHITECTURE.md §6.2.
 *
 * Required checks (per this feature's task spec), each producing zero or
 * more `ValidationIssue`s with `source: "schedule"` (the value
 * ARCHITECTURE.md §1.4 already reserved for exactly this purpose):
 *   - schema conformance
 *   - every required operation appears exactly once
 *   - no unknown job/operation/machine/workcenter
 *   - operation durations match the problem
 *   - machine/workcenter eligibility is respected
 *   - job precedence is respected
 *   - machine operations do not overlap
 *   - release times (job and machine) are respected
 *   - times are finite, nonnegative, and start < end
 *
 * Deliberately NOT checked here: due dates (lekinpy has no hard deadline
 * concept - due only affects the tardiness metric, matching
 * ARCHITECTURE.md §4.4) and optimality of any kind - a valid-but-bad
 * schedule (e.g. everything running on one machine) is still feasible.
 */

const EPSILON = 1e-6;

export function validateScheduleAgainstProblem(
  scheduleInput: unknown,
  problem: ProblemDefinition,
): ValidationIssue[] {
  const parsed = ScheduleSchema.safeParse(scheduleInput);
  if (!parsed.success) {
    return parsed.error.issues.map((issue) =>
      makeIssue({
        code: "SCHEDULE_SCHEMA_INVALID",
        message: `Returned schedule does not match the expected shape at ${issue.path.join(".") || "(root)"}: ${issue.message}`,
        path: ["schedule", ...issue.path.map((p) => (typeof p === "symbol" ? String(p) : p))],
        source: "schedule",
      }),
    );
  }
  return validateParsedSchedule(parsed.data, problem);
}

function validateParsedSchedule(schedule: Schedule, problem: ProblemDefinition): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const jobsById = new Map(problem.jobs.map((job) => [job.jobId, job]));
  const machinesById = new Map(problem.machines.map((m) => [m.machineId, m]));

  type Placed = {
    jobId: string;
    operationIndex: number;
    machineId: string;
    startTime: number;
    endTime: number;
  };
  const placedByExpectedId = new Map<string, Placed>();
  const duplicateIdsReported = new Set<string>();

  // --- Machine-entry-level checks: these must not depend on the entry
  // carrying any operations, or an unknown/duplicate machine entry with an
  // empty operations list would sail through the per-operation loop below. ---
  const seenMachineEntries = new Set<string>();
  for (const ms of schedule.machines) {
    const machine = machinesById.get(ms.machineId);
    if (!machine) {
      issues.push(
        makeIssue({
          code: "SCHEDULE_UNKNOWN_REFERENCE",
          message: `The schedule lists a machine entry for unknown machine '${ms.machineId}'.`,
          path: ["schedule", "machines"],
          source: "schedule",
          machineId: ms.machineId,
        }),
      );
    } else if (ms.workcenterId !== null && ms.workcenterId !== machine.workcenterId) {
      issues.push(
        makeIssue({
          code: "SCHEDULE_UNKNOWN_REFERENCE",
          message: `The schedule places machine '${ms.machineId}' in workcenter '${ms.workcenterId}', but the problem places it in '${machine.workcenterId}'.`,
          path: ["schedule", "machines"],
          source: "schedule",
          machineId: ms.machineId,
          workcenterId: ms.workcenterId,
        }),
      );
    }
    if (seenMachineEntries.has(ms.machineId)) {
      issues.push(
        makeIssue({
          code: "SCHEDULE_SCHEMA_INVALID",
          message: `The schedule lists machine '${ms.machineId}' more than once.`,
          path: ["schedule", "machines"],
          source: "schedule",
          machineId: ms.machineId,
        }),
      );
    }
    seenMachineEntries.add(ms.machineId);
  }

  for (const ms of schedule.machines) {
    for (const op of ms.operations) {
      if (op.machineId !== ms.machineId) {
        issues.push(
          makeIssue({
            code: "SCHEDULE_UNKNOWN_REFERENCE",
            message: `Operation ${op.scheduledOperationId} is listed under machine '${ms.machineId}' but its own machineId field says '${op.machineId}'.`,
            path: ["schedule", "machines"],
            source: "schedule",
            machineId: ms.machineId,
          }),
        );
      }

      if (!Number.isFinite(op.startTime) || !Number.isFinite(op.endTime) || op.startTime < 0) {
        issues.push(
          makeIssue({
            code: "SCHEDULE_INVALID_TIME",
            message: `Operation ${op.scheduledOperationId} has a non-finite or negative time (start=${op.startTime}, end=${op.endTime}).`,
            path: ["schedule", "machines"],
            source: "schedule",
            jobId: op.jobId,
            operationIndex: op.operationIndex,
          }),
        );
        continue; // further arithmetic on these times isn't meaningful
      }
      if (op.startTime >= op.endTime) {
        issues.push(
          makeIssue({
            code: "SCHEDULE_INVALID_TIME",
            message: `Operation ${op.scheduledOperationId} has startTime (${op.startTime}) not earlier than endTime (${op.endTime}).`,
            path: ["schedule", "machines"],
            source: "schedule",
            jobId: op.jobId,
            operationIndex: op.operationIndex,
          }),
        );
        continue;
      }

      const job = jobsById.get(op.jobId);
      if (!job) {
        issues.push(
          makeIssue({
            code: "SCHEDULE_UNKNOWN_REFERENCE",
            message: `Operation ${op.scheduledOperationId} references unknown job '${op.jobId}'.`,
            path: ["schedule", "machines"],
            source: "schedule",
            jobId: op.jobId,
          }),
        );
        continue;
      }
      const operation = job.operations[op.operationIndex];
      if (!operation) {
        issues.push(
          makeIssue({
            code: "SCHEDULE_UNKNOWN_REFERENCE",
            message: `Operation ${op.scheduledOperationId} references operationIndex ${op.operationIndex}, but job '${op.jobId}' has ${job.operations.length} operation(s).`,
            path: ["schedule", "machines"],
            source: "schedule",
            jobId: op.jobId,
            operationIndex: op.operationIndex,
          }),
        );
        continue;
      }

      const machine = machinesById.get(op.machineId);
      if (!machine) {
        issues.push(
          makeIssue({
            code: "SCHEDULE_UNKNOWN_REFERENCE",
            message: `Operation ${op.scheduledOperationId} references unknown machine '${op.machineId}'.`,
            path: ["schedule", "machines"],
            source: "schedule",
            jobId: op.jobId,
            operationIndex: op.operationIndex,
            machineId: op.machineId,
          }),
        );
        continue;
      }

      const expectedId = makeOperationId(op.jobId, op.operationIndex);
      if (op.scheduledOperationId !== expectedId) {
        // A schedule whose identity fields disagree with each other (the
        // right operation COUNT but the wrong operation identities) must
        // never pass as consistent - downstream code keys on this id.
        issues.push(
          makeIssue({
            code: "SCHEDULE_SCHEMA_INVALID",
            message: `Operation with jobId '${op.jobId}' and operationIndex ${op.operationIndex} carries scheduledOperationId '${op.scheduledOperationId}', expected '${expectedId}'.`,
            path: ["schedule", "machines"],
            source: "schedule",
            jobId: op.jobId,
            operationIndex: op.operationIndex,
          }),
        );
      }
      if (placedByExpectedId.has(expectedId)) {
        if (!duplicateIdsReported.has(expectedId)) {
          issues.push(
            makeIssue({
              code: "SCHEDULE_DUPLICATE_OPERATION",
              message: `Operation ${expectedId} appears more than once in the schedule.`,
              path: ["schedule", "machines"],
              source: "schedule",
              jobId: op.jobId,
              operationIndex: op.operationIndex,
            }),
          );
          duplicateIdsReported.add(expectedId);
        }
        continue; // don't let a duplicate corrupt the precedence/overlap pass below
      }

      if (Math.abs(op.endTime - op.startTime - operation.processingTime) > EPSILON) {
        issues.push(
          makeIssue({
            code: "SCHEDULE_DURATION_MISMATCH",
            message: `Operation ${expectedId} runs for ${op.endTime - op.startTime}, but the problem specifies processingTime ${operation.processingTime}.`,
            path: ["schedule", "machines"],
            source: "schedule",
            jobId: op.jobId,
            operationIndex: op.operationIndex,
          }),
        );
      }

      if (machine.workcenterId !== operation.workcenterId) {
        issues.push(
          makeIssue({
            code: "SCHEDULE_INELIGIBLE_MACHINE",
            message: `Operation ${expectedId} requires workcenter '${operation.workcenterId}', but was assigned to machine '${op.machineId}' in workcenter '${machine.workcenterId}'.`,
            path: ["schedule", "machines"],
            source: "schedule",
            jobId: op.jobId,
            operationIndex: op.operationIndex,
            machineId: op.machineId,
            workcenterId: operation.workcenterId,
          }),
        );
      }

      if (op.startTime < machine.release - EPSILON) {
        issues.push(
          makeIssue({
            code: "SCHEDULE_RELEASE_VIOLATION",
            message: `Operation ${expectedId} starts at ${op.startTime}, before machine '${op.machineId}' becomes available at ${machine.release}.`,
            path: ["schedule", "machines"],
            source: "schedule",
            jobId: op.jobId,
            operationIndex: op.operationIndex,
            machineId: op.machineId,
          }),
        );
      }
      if (op.operationIndex === 0 && op.startTime < job.release - EPSILON) {
        issues.push(
          makeIssue({
            code: "SCHEDULE_RELEASE_VIOLATION",
            message: `Operation ${expectedId} starts at ${op.startTime}, before job '${op.jobId}' is released at ${job.release}.`,
            path: ["schedule", "machines"],
            source: "schedule",
            jobId: op.jobId,
            operationIndex: op.operationIndex,
          }),
        );
      }

      placedByExpectedId.set(expectedId, {
        jobId: op.jobId,
        operationIndex: op.operationIndex,
        machineId: op.machineId,
        startTime: op.startTime,
        endTime: op.endTime,
      });
    }
  }

  // --- Missing operations: every (job, operationIndex) the problem expects,
  // that never appeared as a valid placement above. ---
  for (const job of problem.jobs) {
    job.operations.forEach((_operation, operationIndex) => {
      const expectedId = makeOperationId(job.jobId, operationIndex);
      if (!placedByExpectedId.has(expectedId)) {
        issues.push(
          makeIssue({
            code: "SCHEDULE_MISSING_OPERATION",
            message: `Operation ${expectedId} is required by the problem but does not appear (validly placed) in the schedule.`,
            path: ["schedule", "machines"],
            source: "schedule",
            jobId: job.jobId,
            operationIndex,
          }),
        );
      }
    });
  }

  // --- Job precedence: consecutive operations of the same job, by index. ---
  const byJob = new Map<string, Placed[]>();
  for (const placed of placedByExpectedId.values()) {
    const list = byJob.get(placed.jobId) ?? [];
    list.push(placed);
    byJob.set(placed.jobId, list);
  }
  for (const [jobId, ops] of byJob) {
    ops.sort((a, b) => a.operationIndex - b.operationIndex);
    for (let i = 1; i < ops.length; i++) {
      const prev = ops[i - 1]!;
      const cur = ops[i]!;
      if (cur.startTime < prev.endTime - EPSILON) {
        issues.push(
          makeIssue({
            code: "SCHEDULE_PRECEDENCE_VIOLATION",
            message: `Job '${jobId}' operation ${cur.operationIndex} starts at ${cur.startTime}, before operation ${prev.operationIndex} finishes at ${prev.endTime}.`,
            path: ["schedule", "machines"],
            source: "schedule",
            jobId,
            operationIndex: cur.operationIndex,
          }),
        );
      }
    }
  }

  // --- Machine overlap: no two operations on the same machine may overlap. ---
  const byMachine = new Map<string, Placed[]>();
  for (const placed of placedByExpectedId.values()) {
    const list = byMachine.get(placed.machineId) ?? [];
    list.push(placed);
    byMachine.set(placed.machineId, list);
  }
  for (const [machineId, ops] of byMachine) {
    ops.sort((a, b) => a.startTime - b.startTime);
    for (let i = 1; i < ops.length; i++) {
      const prev = ops[i - 1]!;
      const cur = ops[i]!;
      if (cur.startTime < prev.endTime - EPSILON) {
        issues.push(
          makeIssue({
            code: "SCHEDULE_MACHINE_OVERLAP",
            message: `Machine '${machineId}' has overlapping operations: job '${prev.jobId}' op ${prev.operationIndex} (${prev.startTime}-${prev.endTime}) and job '${cur.jobId}' op ${cur.operationIndex} (${cur.startTime}-${cur.endTime}).`,
            path: ["schedule", "machines"],
            source: "schedule",
            machineId,
          }),
        );
      }
    }
  }

  return issues;
}
