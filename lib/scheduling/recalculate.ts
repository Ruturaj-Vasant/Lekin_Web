import type { ProblemDefinition } from "../schema/problem";
import type { MachineSchedule, Metrics, Schedule, ScheduledOperation } from "../schema/schedule";
import { makeOperationId } from "../schema/schedule";
import type { ManualScheduleEdit, ManualStartConstraints } from "../schema/manual-edit";
import { applyConstraintDelta } from "../schema/manual-edit";
import { computeMetrics } from "./metrics";
import {
  applyMove,
  buildJobPrecedenceEdges,
  buildMachineSequenceEdges,
  queuesFromMachines,
  topoSortOrFindCycle,
  type MachineQueues,
} from "./graph";

/** ARCHITECTURE.md §4.6 — Wording contract for rejection explanations. */
export interface DragRejection {
  operationId: string;
  targetMachineId: string;
  reasonCode: "INELIGIBLE_WORKCENTER" | "CYCLIC_PRECEDENCE";
  message: string;
  cyclePath?: string[];
}

export type DropCheckResult = { valid: true; order: string[] } | { valid: false; rejection: DragRejection };

interface OperationInfo {
  jobId: string;
  operationIndex: number;
  workcenterId: string;
  processingTime: number;
  status: string;
  jobRelease: number;
}

function buildOperationLookup(problem: ProblemDefinition): Map<string, OperationInfo> {
  const lookup = new Map<string, OperationInfo>();
  for (const job of problem.jobs) {
    job.operations.forEach((op, operationIndex) => {
      lookup.set(makeOperationId(job.jobId, operationIndex), {
        jobId: job.jobId,
        operationIndex,
        workcenterId: op.workcenterId,
        processingTime: op.processingTime,
        status: op.status,
        jobRelease: job.release,
      });
    });
  }
  return lookup;
}

/**
 * ARCHITECTURE.md §4.4 — the two hard-reject cases, checked in order:
 *  1. Workcenter/eligibility mismatch (O(1), no graph needed).
 *  2. Cyclic precedence (§4.3's Kahn's-algorithm check on the *proposed*
 *     graph, i.e. the graph resulting from actually applying the move).
 * Returns the resulting topological order on success so recalculate() can
 * reuse it without recomputing (§4.5 step 2).
 */
export function checkDropValidity(
  schedule: Schedule,
  problem: ProblemDefinition,
  scheduledOperationId: string,
  toMachineId: string,
  toSequencePosition: number,
): DropCheckResult {
  const operationLookup = buildOperationLookup(problem);
  const info = operationLookup.get(scheduledOperationId);
  if (!info) {
    throw new Error(`No problem-definition data for scheduled operation '${scheduledOperationId}'`);
  }

  const targetMachine = problem.machines.find((m) => m.machineId === toMachineId);
  if (!targetMachine || targetMachine.workcenterId !== info.workcenterId) {
    return {
      valid: false,
      rejection: {
        operationId: scheduledOperationId,
        targetMachineId: toMachineId,
        reasonCode: "INELIGIBLE_WORKCENTER",
        message: `Operation ${scheduledOperationId} cannot run on ${toMachineId} because ${toMachineId} is not in workcenter ${info.workcenterId} (operation ${scheduledOperationId} requires ${info.workcenterId}).`,
      },
    };
  }

  const queues = applyMove(
    queuesFromMachines(schedule.machines),
    scheduledOperationId,
    toMachineId,
    toSequencePosition,
  );
  const nodes = Object.values(queues).flat();
  const edges = [...buildJobPrecedenceEdges(problem), ...buildMachineSequenceEdges(queues)];
  const topo = topoSortOrFindCycle(nodes, edges);

  if (!topo.ok) {
    const cyclePath = [...topo.cycle, topo.cycle[0]!];
    return {
      valid: false,
      rejection: {
        operationId: scheduledOperationId,
        targetMachineId: toMachineId,
        reasonCode: "CYCLIC_PRECEDENCE",
        message: `Moving ${scheduledOperationId} to ${toMachineId} would create a scheduling cycle: ${cyclePath.join(" → ")}. This move is not possible.`,
        cyclePath: topo.cycle,
      },
    };
  }

  return { valid: true, order: topo.order };
}

export interface RecalculateResult {
  schedule: Schedule;
  metrics: Metrics;
  manualStartConstraints: ManualStartConstraints;
}

/**
 * ARCHITECTURE.md §4.5 — Recalculation algorithm.
 *
 * Callers MUST call checkDropValidity() first and only invoke this for an
 * edit it accepted (`valid: true`) — this function assumes the resulting
 * graph is acyclic and throws if it isn't, rather than silently producing
 * a nonsensical schedule.
 */
export function recalculate(
  schedule: Schedule,
  edit: ManualScheduleEdit,
  manualStartConstraints: ManualStartConstraints,
  problem: ProblemDefinition,
): RecalculateResult {
  const queues: MachineQueues = applyMove(
    queuesFromMachines(schedule.machines),
    edit.scheduledOperationId,
    edit.to.machineId,
    edit.to.sequencePosition,
  );
  const nextConstraints = applyConstraintDelta(
    manualStartConstraints,
    edit.scheduledOperationId,
    edit.to.requestedStartTime,
  );

  const nodes = Object.values(queues).flat();
  const jobEdges = buildJobPrecedenceEdges(problem);
  const machineEdges = buildMachineSequenceEdges(queues);
  const topo = topoSortOrFindCycle(nodes, [...jobEdges, ...machineEdges]);
  if (!topo.ok) {
    throw new Error(
      `recalculate() was called with an edit that produces a cyclic schedule ` +
        `(cycle: ${topo.cycle.join(" -> ")}). Callers must call checkDropValidity() ` +
        `first and only invoke recalculate() for accepted, valid drops.`,
    );
  }

  const operationLookup = buildOperationLookup(problem);
  const machineOfNode = new Map<string, string>();
  for (const [machineId, ids] of Object.entries(queues)) {
    for (const id of ids) machineOfNode.set(id, machineId);
  }
  const releaseByMachine = new Map(problem.machines.map((m) => [m.machineId, m.release]));
  const workcenterByMachine = new Map(problem.machines.map((m) => [m.machineId, m.workcenterId]));

  const predecessors = new Map<string, string[]>();
  for (const node of nodes) predecessors.set(node, []);
  for (const edge of [...jobEdges, ...machineEdges]) {
    predecessors.get(edge.to)?.push(edge.from);
  }

  const computed = new Map<string, { startTime: number; endTime: number }>();
  for (const nodeId of topo.order) {
    const info = operationLookup.get(nodeId);
    if (!info) throw new Error(`No problem-definition data for scheduled operation '${nodeId}'`);
    const machineId = machineOfNode.get(nodeId)!;

    const bounds: number[] = [0];
    if (info.operationIndex === 0) bounds.push(info.jobRelease);
    bounds.push(releaseByMachine.get(machineId) ?? 0);
    for (const predecessorId of predecessors.get(nodeId) ?? []) {
      bounds.push(computed.get(predecessorId)!.endTime);
    }
    const requested = nextConstraints[nodeId];
    if (requested !== undefined) bounds.push(requested);

    const startTime = Math.max(...bounds);
    const endTime = startTime + info.processingTime;
    computed.set(nodeId, { startTime, endTime });
  }

  const previousById = new Map<string, ScheduledOperation>();
  for (const ms of schedule.machines) {
    for (const op of ms.operations) previousById.set(op.scheduledOperationId, op);
  }

  const newMachines: MachineSchedule[] = Object.entries(queues).map(([machineId, ids]) => ({
    machineId,
    workcenterId: workcenterByMachine.get(machineId) ?? null,
    operations: ids.map((id, sequencePosition) => {
      const info = operationLookup.get(id)!;
      const { startTime, endTime } = computed.get(id)!;
      const previous = previousById.get(id);
      const changed =
        !previous ||
        previous.startTime !== startTime ||
        previous.endTime !== endTime ||
        previous.machineId !== machineId;
      const scheduledOperation: ScheduledOperation = {
        scheduledOperationId: id,
        jobId: info.jobId,
        operationIndex: info.operationIndex,
        workcenterId: workcenterByMachine.get(machineId) ?? null,
        machineId,
        startTime,
        endTime,
        sequencePosition,
        status: info.status,
        source: changed ? "manual" : (previous?.source ?? "algorithm"),
        manuallyModified: changed ? true : (previous?.manuallyModified ?? false),
      };
      return scheduledOperation;
    }),
  }));

  const newSchedule: Schedule = { ...schedule, machines: newMachines };
  const metrics = computeMetrics(newSchedule, problem);

  return { schedule: newSchedule, metrics, manualStartConstraints: nextConstraints };
}
