import type { ProblemDefinition } from "../schema/problem";
import { makeOperationId } from "../schema/schedule";

/**
 * ARCHITECTURE.md §4.2 - The precedence graph.
 *
 * Nodes: every ScheduledOperation, keyed by scheduledOperationId.
 * Two edge types, combined into one graph:
 *   - job-precedence edges: fixed, derived from ProblemDefinition
 *   - machine-sequence edges: mutable, derived from the current queue order
 * An edge A -> B means "A must finish before B can start."
 */
export interface Edge {
  from: string;
  to: string;
}

/** machineId -> ordered scheduledOperationIds (its current queue). */
export type MachineQueues = Record<string, string[]>;

export function buildJobPrecedenceEdges(problem: ProblemDefinition): Edge[] {
  const edges: Edge[] = [];
  for (const job of problem.jobs) {
    for (let i = 0; i < job.operations.length - 1; i++) {
      edges.push({
        from: makeOperationId(job.jobId, i),
        to: makeOperationId(job.jobId, i + 1),
      });
    }
  }
  return edges;
}

export function buildMachineSequenceEdges(queues: MachineQueues): Edge[] {
  const edges: Edge[] = [];
  for (const queue of Object.values(queues)) {
    for (let i = 0; i < queue.length - 1; i++) {
      edges.push({ from: queue[i]!, to: queue[i + 1]! });
    }
  }
  return edges;
}

export type TopoResult = { ok: true; order: string[] } | { ok: false; cycle: string[] };

/**
 * ARCHITECTURE.md §4.3 - Kahn's algorithm: combined cycle detection +
 * topological ordering in one O(V + E) pass, not two separate steps. On
 * failure, a follow-up DFS restricted to the unprocessed subgraph recovers
 * one concrete cycle path for the rejection message (§4.6).
 */
export function topoSortOrFindCycle(nodes: Iterable<string>, edges: Edge[]): TopoResult {
  const nodeList = [...nodes];
  const successors = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  for (const node of nodeList) {
    successors.set(node, []);
    inDegree.set(node, 0);
  }
  for (const edge of edges) {
    if (!successors.has(edge.from) || !inDegree.has(edge.to)) {
      throw new Error(`Edge references a node not in the node set: ${edge.from} -> ${edge.to}`);
    }
    successors.get(edge.from)!.push(edge.to);
    inDegree.set(edge.to, inDegree.get(edge.to)! + 1);
  }

  const ready: string[] = nodeList.filter((node) => inDegree.get(node) === 0);
  const order: string[] = [];
  const processed = new Set<string>();

  while (ready.length > 0) {
    const node = ready.shift()!;
    order.push(node);
    processed.add(node);
    for (const next of successors.get(node) ?? []) {
      const remaining = inDegree.get(next)! - 1;
      inDegree.set(next, remaining);
      if (remaining === 0) ready.push(next);
    }
  }

  if (order.length === nodeList.length) {
    return { ok: true, order };
  }

  const remaining = new Set(nodeList.filter((node) => !processed.has(node)));
  return { ok: false, cycle: extractCycle(remaining, successors) };
}

/** Standard DFS cycle extraction, restricted to the unprocessed subgraph. */
function extractCycle(remaining: Set<string>, successors: Map<string, string[]>): string[] {
  const visited = new Set<string>();
  const stack: string[] = [];
  const onStack = new Set<string>();

  function dfs(node: string): string[] | null {
    visited.add(node);
    stack.push(node);
    onStack.add(node);
    for (const next of successors.get(node) ?? []) {
      if (!remaining.has(next)) continue;
      if (onStack.has(next)) {
        const start = stack.indexOf(next);
        return stack.slice(start);
      }
      if (!visited.has(next)) {
        const found = dfs(next);
        if (found) return found;
      }
    }
    stack.pop();
    onStack.delete(node);
    return null;
  }

  for (const node of remaining) {
    if (!visited.has(node)) {
      const found = dfs(node);
      if (found) return found;
    }
  }
  // Unreachable if `remaining` genuinely contains a cycle (Kahn's algorithm
  // guarantees it does whenever `remaining` is non-empty).
  return [...remaining];
}

export function queuesFromMachines(
  machines: ReadonlyArray<{ machineId: string; operations: ReadonlyArray<{ scheduledOperationId: string }> }>,
): MachineQueues {
  const queues: MachineQueues = {};
  for (const machine of machines) {
    queues[machine.machineId] = machine.operations.map((op) => op.scheduledOperationId);
  }
  return queues;
}

/**
 * Removes `scheduledOperationId` from wherever it currently sits and
 * inserts it into `toMachineId`'s queue at `toSequencePosition` (clamped
 * to a valid index). Does not mutate the input.
 */
export function applyMove(
  queues: MachineQueues,
  scheduledOperationId: string,
  toMachineId: string,
  toSequencePosition: number,
): MachineQueues {
  const next: MachineQueues = {};
  for (const [machineId, ids] of Object.entries(queues)) {
    next[machineId] = ids.filter((id) => id !== scheduledOperationId);
  }
  if (!(toMachineId in next)) next[toMachineId] = [];
  const target = next[toMachineId]!;
  const clamped = Math.max(0, Math.min(toSequencePosition, target.length));
  target.splice(clamped, 0, scheduledOperationId);
  return next;
}
