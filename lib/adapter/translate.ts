import type { ProblemDefinition } from "../schema/problem";
import type { Schedule } from "../schema/schedule";
import { makeOperationId } from "../schema/schedule";

/**
 * ARCHITECTURE.md §2.2 steps 4 and 7 / §5 — the ONLY place snake_case <->
 * camelCase and flat <-> nested translation happens. Pure functions only;
 * actually invoking Pyodide with these payloads is the Worker-side glue
 * (not this module's job).
 */

export interface LekinpyMachinePayload {
  name: string;
  release: number;
  status: string;
}

export interface LekinpyWorkcenterPayload {
  name: string;
  release: number;
  status: string;
  machines: LekinpyMachinePayload[];
}

export interface LekinpyOperationPayload {
  workcenter: string;
  processing_time: number;
  status: string;
}

export interface LekinpyJobPayload {
  job_id: string;
  release: number;
  due: number;
  weight: number;
  rgb: [number, number, number] | null;
  operations: LekinpyOperationPayload[];
}

export interface LekinpySystemPayload {
  workcenters: LekinpyWorkcenterPayload[];
  jobs: LekinpyJobPayload[];
}

/**
 * ProblemDefinition -> lekinpy.System construction payload. Groups the
 * flat `machines` array by `workcenterId` into nested `Workcenter.machines`
 * lists (ARCHITECTURE.md §3.1's flat->nested transform).
 */
export function toLekinpySystemPayload(problem: ProblemDefinition): LekinpySystemPayload {
  const machinesByWorkcenter = new Map<string, LekinpyMachinePayload[]>();
  for (const machine of problem.machines) {
    const list = machinesByWorkcenter.get(machine.workcenterId) ?? [];
    list.push({ name: machine.machineId, release: machine.release, status: machine.status });
    machinesByWorkcenter.set(machine.workcenterId, list);
  }

  return {
    workcenters: problem.workcenters.map((wc) => ({
      name: wc.workcenterId,
      release: wc.release,
      status: wc.status,
      machines: machinesByWorkcenter.get(wc.workcenterId) ?? [],
    })),
    jobs: problem.jobs.map((job) => ({
      job_id: job.jobId,
      release: job.release,
      due: job.due,
      weight: job.weight,
      rgb: job.rgb ?? null,
      operations: job.operations.map((op) => ({
        workcenter: op.workcenterId,
        processing_time: op.processingTime,
        status: op.status,
      })),
    })),
  };
}

export interface LekinpyScheduledOperationDict {
  job_id: string;
  operation_index: number;
  workcenter: string | null;
  machine: string;
  start_time: number;
  end_time: number;
  sequence_position: number;
  status: string | null;
}

export interface LekinpyMachineScheduleDict {
  workcenter: string | null;
  machine: string;
  operations: LekinpyScheduledOperationDict[];
}

/** The exact shape of lekinpy's Schedule.to_dict() output. */
export interface LekinpyScheduleDict {
  schedule_type: string;
  time: number;
  rgb: [number, number, number] | null;
  machines: LekinpyMachineScheduleDict[];
}

/**
 * lekinpy Schedule.to_dict() output -> web Schedule (ARCHITECTURE.md §1.2).
 * Adds the derived scheduledOperationId and tags every record
 * `source: "algorithm"`, `manuallyModified: false` — this is always a
 * fresh algorithm result; manual edits are layered on afterward by
 * recalculate() (lib/scheduling/recalculate.ts).
 */
export function fromLekinpyScheduleDict(
  dict: LekinpyScheduleDict,
  scheduleId: string,
  algorithmId: string,
): Schedule {
  return {
    scheduleId,
    algorithmId,
    scheduleType: dict.schedule_type,
    time: dict.time,
    rgb: dict.rgb ?? undefined,
    machines: dict.machines.map((ms) => ({
      machineId: ms.machine,
      workcenterId: ms.workcenter,
      operations: ms.operations.map((op) => ({
        scheduledOperationId: makeOperationId(op.job_id, op.operation_index),
        jobId: op.job_id,
        operationIndex: op.operation_index,
        workcenterId: op.workcenter,
        machineId: op.machine,
        startTime: op.start_time,
        endTime: op.end_time,
        sequencePosition: op.sequence_position,
        status: op.status,
        source: "algorithm" as const,
        manuallyModified: false,
      })),
    })),
  };
}
