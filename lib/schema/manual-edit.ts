import { z } from "zod";

/** ARCHITECTURE.md §1.7 (v1.3) — Manual edits and persistent constraints. */

const PlacementSchema = z.object({
  machineId: z.string(),
  sequencePosition: z.number(),
  requestedStartTime: z.number().nullable(),
});

export const ManualScheduleEditSchema = z.object({
  editId: z.string(),
  scheduleId: z.string(),
  scheduledOperationId: z.string(),
  timestamp: z.string(),
  from: PlacementSchema,
  to: PlacementSchema,
});
export type ManualScheduleEdit = z.infer<typeof ManualScheduleEditSchema>;

/**
 * WEB-ONLY, owned by ScheduleEditorState. Keyed by scheduledOperationId.
 * Absence means "start as early as the graph permits" — this is editing
 * intent, not an observed schedule result, so it's kept separate from
 * ScheduledOperation.startTime (ARCHITECTURE.md §1.7).
 */
export type ManualStartConstraints = Record<string, number>;
export const ManualStartConstraintsSchema = z.record(z.string(), z.number());

/**
 * Applies one accepted edit's constraint delta to a constraints map,
 * without mutating the input (ARCHITECTURE.md §4.5 step 1).
 */
export function applyConstraintDelta(
  constraints: ManualStartConstraints,
  scheduledOperationId: string,
  requestedStartTime: number | null,
): ManualStartConstraints {
  const next = { ...constraints };
  if (requestedStartTime === null) {
    delete next[scheduledOperationId];
  } else {
    next[scheduledOperationId] = requestedStartTime;
  }
  return next;
}
