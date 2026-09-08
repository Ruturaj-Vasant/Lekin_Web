import { describe, expect, it } from "vitest";
import fixture from "../../test/fixtures/real-execution/fixture.json";
import { ScheduleSchema } from "../schema/schedule";
import { TWO_MACHINE_FLOW_SHOP_PROBLEM } from "../../app/execution/two-machine-flow-shop";
import { createExampleProblem } from "../../app/examples/example-library";
import { johnsonLimitations, scheduleGuarantee } from "./schedule-guarantee";

const result = () => ({ status: "completed" as const, algorithmId: "johnson", schedule: ScheduleSchema.parse(fixture.flowShopResults.johnson.webSchedule) });
const problem = () => structuredClone(TWO_MACHINE_FLOW_SHOP_PROBLEM);

describe("result optimality claims", () => {
  it("certifies only makespan for an unedited two-stage Johnson result", () => {
    expect(scheduleGuarantee(problem(), result())).toMatchObject({ kind: "optimal", title: "Optimal makespan" });
    expect(scheduleGuarantee(problem(), result())?.description).toContain("Other performance measures are not covered");
  });
  it("does not use the exact schedule label as proof when a job is released late", () => {
    const input = problem();
    input.jobs[0]!.release = 7;
    expect(scheduleGuarantee(input, result())).toMatchObject({ kind: "heuristic" });
    expect(johnsonLimitations(input)).toContain("J1 has release time 7");
    expect(johnsonLimitations(input)).not.toContain("stages");
  });
  it("explains a longer route and release times independently", () => {
    const input = createExampleProblem("pinedo-6-1-1");
    input.jobs[0]!.release = 7;
    expect(scheduleGuarantee(input, result())?.kind).toBe("heuristic");
    expect(johnsonLimitations(input)).toContain("4 stages");
    expect(johnsonLimitations(input)).toContain("release time 7");
  });
  it.each(["manuallyModified", "source"])("removes certification after a manual edit indicated by %s", (flag) => {
    const edited = result();
    const operation = edited.schedule.machines[0]!.operations[0]!;
    if (flag === "source") operation.source = "manual";
    else operation.manuallyModified = true;
    expect(scheduleGuarantee(problem(), edited)?.kind).toBe("manual");
    expect(scheduleGuarantee(problem(), result())?.kind).toBe("optimal");
  });
  it.each(["fcfs", "spt", "edd", "wspt", "custom"])("never certifies %s merely because the input meets Johnson conditions", (algorithmId) => {
    expect(scheduleGuarantee(problem(), { ...result(), algorithmId })?.kind).toBe("heuristic");
  });
  it.each(["invalid", "error", "rejected"] as const)("has no guarantee for a %s result", (status) => {
    expect(scheduleGuarantee(problem(), { ...result(), status })).toBeNull();
  });
  it("has no guarantee before a run", () => {
    expect(scheduleGuarantee(problem(), null)).toBeNull();
    expect(scheduleGuarantee(problem(), { ...result(), schedule: null })).toBeNull();
  });
});
