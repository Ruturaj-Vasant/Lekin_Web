import { z } from "zod";

/** ARCHITECTURE.md §1.2 - Scheduled results. */

export const ScheduledOperationSchema = z.object({
  scheduledOperationId: z.string(),
  jobId: z.string(),
  operationIndex: z.number(),
  workcenterId: z.string().nullable(),
  machineId: z.string(),
  startTime: z.number(),
  endTime: z.number(),
  sequencePosition: z.number(),
  status: z.string().nullable(),
  source: z.enum(["algorithm", "manual"]),
  manuallyModified: z.boolean(),
});
export type ScheduledOperation = z.infer<typeof ScheduledOperationSchema>;

export const MachineScheduleSchema = z.object({
  machineId: z.string(),
  workcenterId: z.string().nullable(),
  operations: z.array(ScheduledOperationSchema),
});
export type MachineSchedule = z.infer<typeof MachineScheduleSchema>;

const RgbTupleSchema = z.tuple([z.number(), z.number(), z.number()]);

export const ScheduleSchema = z.object({
  scheduleId: z.string(),
  algorithmId: z.string(),
  scheduleType: z.string(),
  time: z.number(),
  rgb: RgbTupleSchema.optional(),
  machines: z.array(MachineScheduleSchema),
});
export type Schedule = z.infer<typeof ScheduleSchema>;

/** ARCHITECTURE.md §1.3 - Metrics. */
export const MetricsSchema = z.object({
  timeStart: z.number(),
  makespan: z.number(),
  maxTardiness: z.number(),
  tardyJobCount: z.number(),
  totalCompletionTime: z.number(),
  totalTardiness: z.number(),
  weightedCompletionTime: z.number(),
  weightedTardiness: z.number(),
  machineUtilization: z.record(z.string(), z.number()).optional(),
});
export type Metrics = z.infer<typeof MetricsSchema>;

/** Derives scheduledOperationId/operationId consistently - ARCHITECTURE.md §1.1/§1.2. */
export function makeOperationId(jobId: string, operationIndex: number): string {
  return `${jobId}-O${operationIndex}`;
}
