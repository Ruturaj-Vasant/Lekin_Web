import type { Job, Machine, Operation, ProblemDefinition, Workcenter } from "../schema/problem";
import { makeOperationId } from "../schema/schedule";

/**
 * Pure ProblemDefinition state-transition functions for the Problem Editor
 * milestone. Framework-independent (no React) so every transition is
 * unit-testable in isolation, matching the project's established pattern
 * (lib/scheduling/recalculate.ts) of keeping state logic out of components.
 *
 * Scope decision (documented in lekin-web_DECISIONS.md): identity fields
 * (Job.jobId, Workcenter.workcenterId, Machine.machineId) are set at
 * creation time and are NOT editable afterward - only settable via the
 * "add" functions below. This removes an entire class of cascade-rename
 * ambiguity (what happens to every Operation.workcenterId /
 * Machine.workcenterId reference when an id is renamed) without reducing
 * what a user can actually configure: every non-identity field (release,
 * due, weight, status, rgb, processingTime, and *which* workcenter/machine
 * something is assigned to) remains freely editable.
 *
 * ARCHITECTURE.md §3.1 explicitly requires the editor to keep
 * `Machine.workcenterId` and `Workcenter.machineIds` consistent "on every
 * add/edit/delete/move-machine-between-workcenters operation" -- that
 * invariant is actively maintained here (see addMachine/removeMachine/
 * updateMachine/removeWorkcenter below), not left for validation to catch.
 * By contrast, Operation.workcenterId -> Workcenter references are NOT
 * actively maintained on workcenter deletion (ARCHITECTURE.md never asks
 * for that), so deleting a workcenter still referenced by an operation is
 * exactly the "deleting referenced entities" scenario the live
 * MISSING_WORKCENTER_REFERENCE validation is meant to catch and surface.
 */

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

export function nextAvailableId(existingIds: readonly string[], prefix: string): string {
  const existing = new Set(existingIds);
  let n = 1;
  while (existing.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

function reindexOperations(jobId: string, operations: readonly Operation[]): Operation[] {
  return operations.map((op, index) => ({
    ...op,
    operationIndex: index,
    operationId: makeOperationId(jobId, index),
  }));
}

// ---------------------------------------------------------------------------
// Factories (used by the "add" functions and exposed for the UI's default
// values / disabled-state decisions)
// ---------------------------------------------------------------------------

export function createDefaultOperation(jobId: string, operationIndex: number, defaultWorkcenterId: string): Operation {
  return {
    operationIndex,
    operationId: makeOperationId(jobId, operationIndex),
    workcenterId: defaultWorkcenterId,
    processingTime: 1,
    status: "pending",
  };
}

export function createDefaultJob(problem: ProblemDefinition): Job {
  const jobId = nextAvailableId(problem.jobs.map((j) => j.jobId), "J-");
  const defaultWorkcenterId = problem.workcenters[0]?.workcenterId ?? "";
  return {
    jobId,
    release: 0,
    due: 10,
    weight: 1,
    operations: [createDefaultOperation(jobId, 0, defaultWorkcenterId)],
  };
}

export function createDefaultWorkcenter(problem: ProblemDefinition): Workcenter {
  return {
    workcenterId: nextAvailableId(problem.workcenters.map((w) => w.workcenterId), "WC-"),
    release: 0,
    status: "active",
    machineIds: [],
  };
}

export function createDefaultMachine(problem: ProblemDefinition, workcenterId: string): Machine {
  return {
    machineId: nextAvailableId(problem.machines.map((m) => m.machineId), "M-"),
    workcenterId,
    release: 0,
    status: "active",
  };
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

export function addJob(problem: ProblemDefinition, job: Job): ProblemDefinition {
  return { ...problem, jobs: [...problem.jobs, job] };
}

export function updateJob(
  problem: ProblemDefinition,
  jobId: string,
  patch: Partial<Pick<Job, "release" | "due" | "weight" | "rgb">>,
): ProblemDefinition {
  return {
    ...problem,
    jobs: problem.jobs.map((job) => (job.jobId === jobId ? { ...job, ...patch } : job)),
  };
}

export function removeJob(problem: ProblemDefinition, jobId: string): ProblemDefinition {
  return { ...problem, jobs: problem.jobs.filter((job) => job.jobId !== jobId) };
}

// ---------------------------------------------------------------------------
// Operations (nested under a job) - operationIndex/operationId are always
// recomputed from array position after any add/remove/move, per
// ARCHITECTURE.md §1.1 ("operationIndex must be assigned by list position
// and never reordered independently of the array").
// ---------------------------------------------------------------------------

export function addOperation(problem: ProblemDefinition, jobId: string, defaultWorkcenterId: string): ProblemDefinition {
  return {
    ...problem,
    jobs: problem.jobs.map((job) => {
      if (job.jobId !== jobId) return job;
      const operations = [...job.operations, createDefaultOperation(jobId, job.operations.length, defaultWorkcenterId)];
      return { ...job, operations: reindexOperations(jobId, operations) };
    }),
  };
}

export function updateOperation(
  problem: ProblemDefinition,
  jobId: string,
  operationIndex: number,
  patch: Partial<Pick<Operation, "workcenterId" | "processingTime" | "status">>,
): ProblemDefinition {
  return {
    ...problem,
    jobs: problem.jobs.map((job) => {
      if (job.jobId !== jobId) return job;
      return {
        ...job,
        operations: job.operations.map((op) => (op.operationIndex === operationIndex ? { ...op, ...patch } : op)),
      };
    }),
  };
}

export function removeOperation(problem: ProblemDefinition, jobId: string, operationIndex: number): ProblemDefinition {
  return {
    ...problem,
    jobs: problem.jobs.map((job) => {
      if (job.jobId !== jobId) return job;
      const remaining = job.operations.filter((op) => op.operationIndex !== operationIndex);
      return { ...job, operations: reindexOperations(jobId, remaining) };
    }),
  };
}

/** Moves the operation currently at `fromIndex` to `toIndex`, reindexing both endpoints and everything between. */
export function moveOperation(problem: ProblemDefinition, jobId: string, fromIndex: number, toIndex: number): ProblemDefinition {
  return {
    ...problem,
    jobs: problem.jobs.map((job) => {
      if (job.jobId !== jobId) return job;
      const clampedTo = Math.max(0, Math.min(toIndex, job.operations.length - 1));
      if (fromIndex === clampedTo || fromIndex < 0 || fromIndex >= job.operations.length) return job;
      const reordered = [...job.operations];
      const [moved] = reordered.splice(fromIndex, 1);
      reordered.splice(clampedTo, 0, moved!);
      return { ...job, operations: reindexOperations(jobId, reordered) };
    }),
  };
}

// ---------------------------------------------------------------------------
// Workcenters
// ---------------------------------------------------------------------------

export function addWorkcenter(problem: ProblemDefinition, workcenter: Workcenter): ProblemDefinition {
  return { ...problem, workcenters: [...problem.workcenters, workcenter] };
}

export function updateWorkcenter(
  problem: ProblemDefinition,
  workcenterId: string,
  patch: Partial<Pick<Workcenter, "release" | "status" | "rgb">>,
): ProblemDefinition {
  return {
    ...problem,
    workcenters: problem.workcenters.map((wc) => (wc.workcenterId === workcenterId ? { ...wc, ...patch } : wc)),
  };
}

/**
 * Removes the workcenter AND cascade-removes its member machines (a machine
 * cannot exist without a valid workcenter per §3.1's invariant, and there is
 * no sensible default reassignment). Operations that referenced this
 * workcenter are deliberately left as-is -- see the module doc comment.
 */
export function removeWorkcenter(problem: ProblemDefinition, workcenterId: string): ProblemDefinition {
  return {
    ...problem,
    workcenters: problem.workcenters.filter((wc) => wc.workcenterId !== workcenterId),
    machines: problem.machines.filter((m) => m.workcenterId !== workcenterId),
  };
}

// ---------------------------------------------------------------------------
// Machines
// ---------------------------------------------------------------------------

export function addMachine(problem: ProblemDefinition, machine: Machine): ProblemDefinition {
  return {
    ...problem,
    machines: [...problem.machines, machine],
    workcenters: problem.workcenters.map((wc) =>
      wc.workcenterId === machine.workcenterId ? { ...wc, machineIds: [...wc.machineIds, machine.machineId] } : wc,
    ),
  };
}

export function updateMachine(
  problem: ProblemDefinition,
  machineId: string,
  patch: Partial<Pick<Machine, "release" | "status" | "workcenterId">>,
): ProblemDefinition {
  const current = problem.machines.find((m) => m.machineId === machineId);
  if (!current) return problem;

  const movingTo = patch.workcenterId !== undefined && patch.workcenterId !== current.workcenterId ? patch.workcenterId : null;

  return {
    ...problem,
    machines: problem.machines.map((m) => (m.machineId === machineId ? { ...m, ...patch } : m)),
    workcenters: movingTo
      ? problem.workcenters.map((wc) => {
          if (wc.workcenterId === current.workcenterId) {
            return { ...wc, machineIds: wc.machineIds.filter((id) => id !== machineId) };
          }
          if (wc.workcenterId === movingTo) {
            return { ...wc, machineIds: [...wc.machineIds, machineId] };
          }
          return wc;
        })
      : problem.workcenters,
  };
}

export function removeMachine(problem: ProblemDefinition, machineId: string): ProblemDefinition {
  return {
    ...problem,
    machines: problem.machines.filter((m) => m.machineId !== machineId),
    workcenters: problem.workcenters.map((wc) => ({
      ...wc,
      machineIds: wc.machineIds.filter((id) => id !== machineId),
    })),
  };
}

// ---------------------------------------------------------------------------
// Reducer - a thin, still-framework-independent dispatch layer over the
// functions above, so app/ only needs `useReducer(problemEditorReducer, ...)`
// plus JSX; every actual transition is defined and tested here.
// ---------------------------------------------------------------------------

export type ProblemEditorAction =
  | { type: "addJob" }
  | { type: "updateJob"; jobId: string; patch: Partial<Pick<Job, "release" | "due" | "weight" | "rgb">> }
  | { type: "removeJob"; jobId: string }
  | { type: "addOperation"; jobId: string }
  | {
      type: "updateOperation";
      jobId: string;
      operationIndex: number;
      patch: Partial<Pick<Operation, "workcenterId" | "processingTime" | "status">>;
    }
  | { type: "removeOperation"; jobId: string; operationIndex: number }
  | { type: "moveOperation"; jobId: string; fromIndex: number; toIndex: number }
  | { type: "addWorkcenter" }
  | { type: "updateWorkcenter"; workcenterId: string; patch: Partial<Pick<Workcenter, "release" | "status" | "rgb">> }
  | { type: "removeWorkcenter"; workcenterId: string }
  | { type: "addMachine"; workcenterId: string }
  | { type: "updateMachine"; machineId: string; patch: Partial<Pick<Machine, "release" | "status" | "workcenterId">> }
  | { type: "removeMachine"; machineId: string };

export function problemEditorReducer(problem: ProblemDefinition, action: ProblemEditorAction): ProblemDefinition {
  switch (action.type) {
    case "addJob":
      return addJob(problem, createDefaultJob(problem));
    case "updateJob":
      return updateJob(problem, action.jobId, action.patch);
    case "removeJob":
      return removeJob(problem, action.jobId);
    case "addOperation": {
      const defaultWorkcenterId = problem.workcenters[0]?.workcenterId ?? "";
      return addOperation(problem, action.jobId, defaultWorkcenterId);
    }
    case "updateOperation":
      return updateOperation(problem, action.jobId, action.operationIndex, action.patch);
    case "removeOperation":
      return removeOperation(problem, action.jobId, action.operationIndex);
    case "moveOperation":
      return moveOperation(problem, action.jobId, action.fromIndex, action.toIndex);
    case "addWorkcenter":
      return addWorkcenter(problem, createDefaultWorkcenter(problem));
    case "updateWorkcenter":
      return updateWorkcenter(problem, action.workcenterId, action.patch);
    case "removeWorkcenter":
      return removeWorkcenter(problem, action.workcenterId);
    case "addMachine":
      return addMachine(problem, createDefaultMachine(problem, action.workcenterId));
    case "updateMachine":
      return updateMachine(problem, action.machineId, action.patch);
    case "removeMachine":
      return removeMachine(problem, action.machineId);
    default:
      return problem;
  }
}
