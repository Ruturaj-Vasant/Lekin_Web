import { describe, expect, it } from "vitest";
import { checkDropValidity, isNoOpEdit, recalculate, type DragRejection } from "./recalculate";
import { applyConstraintDelta, type ManualScheduleEdit, type ManualStartConstraints } from "../schema/manual-edit";
import type { ProblemDefinition } from "../schema/problem";
import type { Schedule } from "../schema/schedule";

// --- Fixture 1: two jobs, two single-machine workcenters, no cross-machine choice ---
function basicProblem(): ProblemDefinition {
  return {
    schemaVersion: "1.0.0",
    problemId: "p",
    name: "basic",
    jobs: [
      {
        jobId: "A",
        release: 0,
        due: 100,
        weight: 1,
        operations: [
          { operationIndex: 0, operationId: "A-O0", workcenterId: "WC1", processingTime: 5, status: "pending" },
          { operationIndex: 1, operationId: "A-O1", workcenterId: "WC2", processingTime: 3, status: "pending" },
        ],
      },
      {
        jobId: "B",
        release: 0,
        due: 100,
        weight: 1,
        operations: [
          { operationIndex: 0, operationId: "B-O0", workcenterId: "WC1", processingTime: 4, status: "pending" },
        ],
      },
    ],
    workcenters: [
      { workcenterId: "WC1", release: 0, status: "active", machineIds: ["M1"] },
      { workcenterId: "WC2", release: 0, status: "active", machineIds: ["M2"] },
    ],
    machines: [
      { machineId: "M1", workcenterId: "WC1", release: 0, status: "active" },
      { machineId: "M2", workcenterId: "WC2", release: 0, status: "active" },
    ],
  };
}

function basicSchedule(): Schedule {
  // M1: A-O0 [0,5) then B-O0 [5,9) ; M2: A-O1 [5,8) (waits on A-O0)
  return {
    scheduleId: "s1",
    algorithmId: "fcfs",
    scheduleType: "FCFS",
    time: 9,
    machines: [
      {
        machineId: "M1",
        workcenterId: "WC1",
        operations: [
          { scheduledOperationId: "A-O0", jobId: "A", operationIndex: 0, workcenterId: "WC1", machineId: "M1", startTime: 0, endTime: 5, sequencePosition: 0, status: "pending", source: "algorithm", manuallyModified: false },
          { scheduledOperationId: "B-O0", jobId: "B", operationIndex: 0, workcenterId: "WC1", machineId: "M1", startTime: 5, endTime: 9, sequencePosition: 1, status: "pending", source: "algorithm", manuallyModified: false },
        ],
      },
      {
        machineId: "M2",
        workcenterId: "WC2",
        operations: [
          { scheduledOperationId: "A-O1", jobId: "A", operationIndex: 1, workcenterId: "WC2", machineId: "M2", startTime: 5, endTime: 8, sequencePosition: 0, status: "pending", source: "algorithm", manuallyModified: false },
        ],
      },
    ],
  };
}

function edit(overrides: Partial<ManualScheduleEdit> & { from: ManualScheduleEdit["from"]; to: ManualScheduleEdit["to"]; scheduledOperationId: string }): ManualScheduleEdit {
  return {
    editId: "e1",
    scheduleId: "s1",
    timestamp: "2026-07-15T00:00:00.000Z",
    ...overrides,
  };
}

describe("recalculate - non-cyclic single-machine reorder", () => {
  it("recalculates start/end times correctly when reordering one machine's queue", () => {
    const problem = basicProblem();
    const schedule = basicSchedule();
    const theEdit = edit({
      scheduledOperationId: "B-O0",
      from: { machineId: "M1", sequencePosition: 1, requestedStartTime: null },
      to: { machineId: "M1", sequencePosition: 0, requestedStartTime: null },
    });

    const check = checkDropValidity(schedule, problem, "B-O0", "M1", 0);
    expect(check.valid).toBe(true);

    const { schedule: next } = recalculate(schedule, theEdit, {}, problem);
    const m1 = next.machines.find((m) => m.machineId === "M1")!;
    const bOp = m1.operations.find((o) => o.scheduledOperationId === "B-O0")!;
    const aOp = m1.operations.find((o) => o.scheduledOperationId === "A-O0")!;
    expect(bOp.startTime).toBe(0);
    expect(bOp.endTime).toBe(4);
    expect(aOp.startTime).toBe(4); // pushed by B-O0 now occupying the machine first
    expect(aOp.endTime).toBe(9);

    // downstream cross-machine operation shifts too
    const m2 = next.machines.find((m) => m.machineId === "M2")!;
    const a1 = m2.operations.find((o) => o.scheduledOperationId === "A-O1")!;
    expect(a1.startTime).toBe(9);
    expect(a1.endTime).toBe(12);
  });
});

describe("recalculate - cross-machine move, no cycle", () => {
  it("recalculates correctly when an operation moves to a different eligible machine", () => {
    const problem = basicProblem();
    problem.workcenters[0]!.machineIds = ["M1", "M1b"];
    problem.machines.push({ machineId: "M1b", workcenterId: "WC1", release: 0, status: "active" });
    const schedule = basicSchedule();

    const theEdit = edit({
      scheduledOperationId: "B-O0",
      from: { machineId: "M1", sequencePosition: 1, requestedStartTime: null },
      to: { machineId: "M1b", sequencePosition: 0, requestedStartTime: null },
    });
    const check = checkDropValidity(schedule, problem, "B-O0", "M1b", 0);
    expect(check.valid).toBe(true);

    const { schedule: next } = recalculate(schedule, theEdit, {}, problem);
    const m1b = next.machines.find((m) => m.machineId === "M1b")!;
    expect(m1b.operations[0]!.startTime).toBe(0);
    expect(m1b.operations[0]!.endTime).toBe(4);
    // M1 no longer has B-O0, so A-O0 is unaffected
    const m1 = next.machines.find((m) => m.machineId === "M1")!;
    expect(m1.operations.map((o) => o.scheduledOperationId)).toEqual(["A-O0"]);
    expect(m1.operations[0]!.startTime).toBe(0);
  });
});

describe("checkDropValidity - hard rejects", () => {
  it("rejects a workcenter-ineligible drop", () => {
    const problem = basicProblem();
    const schedule = basicSchedule();
    const result = checkDropValidity(schedule, problem, "A-O0", "M2", 0);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.rejection.reasonCode).toBe("INELIGIBLE_WORKCENTER");
      expect(result.rejection.message).toContain("A-O0");
      expect(result.rejection.message).toContain("M2");
    }
  });

  it("detects and rejects the exact two-job/two-machine cycle from the architecture review", () => {
    const problem: ProblemDefinition = {
      schemaVersion: "1.0.0",
      problemId: "p2",
      name: "cycle",
      jobs: [
        {
          jobId: "J1",
          release: 0,
          due: 100,
          weight: 1,
          operations: [
            { operationIndex: 0, operationId: "J1-O0", workcenterId: "WC1", processingTime: 5, status: "pending" },
            { operationIndex: 1, operationId: "J1-O1", workcenterId: "WC2", processingTime: 5, status: "pending" },
          ],
        },
        {
          jobId: "J2",
          release: 0,
          due: 100,
          weight: 1,
          operations: [
            { operationIndex: 0, operationId: "J2-O0", workcenterId: "WC2", processingTime: 5, status: "pending" },
            { operationIndex: 1, operationId: "J2-O1", workcenterId: "WC1", processingTime: 5, status: "pending" },
          ],
        },
      ],
      workcenters: [
        { workcenterId: "WC1", release: 0, status: "active", machineIds: ["M1"] },
        { workcenterId: "WC2", release: 0, status: "active", machineIds: ["M2"] },
      ],
      machines: [
        { machineId: "M1", workcenterId: "WC1", release: 0, status: "active" },
        { machineId: "M2", workcenterId: "WC2", release: 0, status: "active" },
      ],
    };
    // Starting schedule: M1: [J1-O0], M2: [J1-O1, J2-O0]  (J2-O1 unplaced is impossible in
    // a real schedule, so seed with J2-O1 already on M1 after J1-O0, then attempt the move
    // that completes the cycle: put J2-O1 before J1-O0 on M1 while J1-O1 is already before J2-O0 on M2.)
    const schedule: Schedule = {
      scheduleId: "s2",
      algorithmId: "fcfs",
      scheduleType: "FCFS",
      time: 20,
      machines: [
        {
          machineId: "M1",
          workcenterId: "WC1",
          operations: [
            { scheduledOperationId: "J1-O0", jobId: "J1", operationIndex: 0, workcenterId: "WC1", machineId: "M1", startTime: 0, endTime: 5, sequencePosition: 0, status: "pending", source: "algorithm", manuallyModified: false },
            { scheduledOperationId: "J2-O1", jobId: "J2", operationIndex: 1, workcenterId: "WC1", machineId: "M1", startTime: 15, endTime: 20, sequencePosition: 1, status: "pending", source: "algorithm", manuallyModified: false },
          ],
        },
        {
          machineId: "M2",
          workcenterId: "WC2",
          operations: [
            { scheduledOperationId: "J1-O1", jobId: "J1", operationIndex: 1, workcenterId: "WC2", machineId: "M2", startTime: 5, endTime: 10, sequencePosition: 0, status: "pending", source: "algorithm", manuallyModified: false },
            { scheduledOperationId: "J2-O0", jobId: "J2", operationIndex: 0, workcenterId: "WC2", machineId: "M2", startTime: 10, endTime: 15, sequencePosition: 1, status: "pending", source: "algorithm", manuallyModified: false },
          ],
        },
      ],
    };

    // Move J2-O1 to before J1-O0 on M1 -> M1: [J2-O1, J1-O0], M2 unchanged: [J1-O1, J2-O0]
    // Combined: J1-O0->J1-O1 (job), J1-O1->J2-O0 (machine M2), J2-O0->J2-O1 (job), J2-O1->J1-O0 (machine M1) = cycle
    const result = checkDropValidity(schedule, problem, "J2-O1", "M1", 0);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      const rejection: DragRejection = result.rejection;
      expect(rejection.reasonCode).toBe("CYCLIC_PRECEDENCE");
      expect(rejection.cyclePath).toBeDefined();
      expect(rejection.cyclePath!.length).toBeGreaterThanOrEqual(2);
      expect(rejection.message).toContain("cycle");
    }
  });
});

describe("recalculate - dual-constrained node takes the max of both edges", () => {
  it("an operation with both a job-predecessor and machine-predecessor uses max() of the two bounds, not either alone", () => {
    // A-O1 (job predecessor A-O0 ends at 5) is moved onto M1b behind a slow
    // unrelated operation C-O0 that ends at 20 -- the machine bound (20)
    // must win over the job bound (5).
    const problem = basicProblem();
    problem.workcenters[0]!.machineIds = ["M1", "M1b"];
    problem.machines.push({ machineId: "M1b", workcenterId: "WC2".replace("WC2", "WC1"), release: 0, status: "active" });
    // Give A-O1 a workcenter it can share with a slow machine op: reuse WC1 for A-O1 for this test.
    problem.jobs[0]!.operations[1]!.workcenterId = "WC1";

    const schedule: Schedule = {
      scheduleId: "s3",
      algorithmId: "fcfs",
      scheduleType: "FCFS",
      time: 20,
      machines: [
        {
          machineId: "M1",
          workcenterId: "WC1",
          operations: [
            { scheduledOperationId: "A-O0", jobId: "A", operationIndex: 0, workcenterId: "WC1", machineId: "M1", startTime: 0, endTime: 5, sequencePosition: 0, status: "pending", source: "algorithm", manuallyModified: false },
          ],
        },
        {
          machineId: "M1b",
          workcenterId: "WC1",
          operations: [
            { scheduledOperationId: "C-O0", jobId: "C", operationIndex: 0, workcenterId: "WC1", machineId: "M1b", startTime: 0, endTime: 20, sequencePosition: 0, status: "pending", source: "algorithm", manuallyModified: false },
          ],
        },
        { machineId: "M2", workcenterId: "WC2", operations: [] },
      ],
    };
    // problem needs a C job for buildOperationLookup to resolve C-O0
    problem.jobs.push({
      jobId: "C",
      release: 0,
      due: 100,
      weight: 1,
      operations: [{ operationIndex: 0, operationId: "C-O0", workcenterId: "WC1", processingTime: 20, status: "pending" }],
    });

    const theEdit = edit({
      scheduledOperationId: "A-O1",
      from: { machineId: "M2", sequencePosition: 0, requestedStartTime: null },
      to: { machineId: "M1b", sequencePosition: 1, requestedStartTime: null },
    });
    const check = checkDropValidity(schedule, problem, "A-O1", "M1b", 1);
    expect(check.valid).toBe(true);

    const { schedule: next } = recalculate(schedule, theEdit, {}, problem);
    const m1b = next.machines.find((m) => m.machineId === "M1b")!;
    const a1 = m1b.operations.find((o) => o.scheduledOperationId === "A-O1")!;
    // job bound = 5 (A-O0 end), machine bound = 20 (C-O0 end) -> must be 20, not 5
    expect(a1.startTime).toBe(20);
  });
});

describe("recalculate - machine release time", () => {
  it("never starts an operation before its machine's release time, even with no earlier job/machine predecessor", () => {
    const problem = basicProblem();
    problem.machines.find((m) => m.machineId === "M2")!.release = 10;
    const schedule = basicSchedule();
    // Move A-O1 to the same slot it's already in, but bump nothing else --
    // instead directly recalculate a no-op-position edit to exercise the
    // machine-release floor in isolation, using B moved out of the way first
    // is unnecessary; just assert via a same-machine requested-time-null edit.
    const theEdit = edit({
      scheduledOperationId: "A-O1",
      from: { machineId: "M2", sequencePosition: 0, requestedStartTime: null },
      to: { machineId: "M2", sequencePosition: 0, requestedStartTime: 0 }, // request time 0, below machine release
    });
    const { schedule: next } = recalculate(schedule, theEdit, {}, problem);
    const m2 = next.machines.find((m) => m.machineId === "M2")!;
    const a1 = m2.operations.find((o) => o.scheduledOperationId === "A-O1")!;
    expect(a1.startTime).toBeGreaterThanOrEqual(10);
  });
});

describe("recalculate - requestedStartTime semantics", () => {
  it("ignores a requestedStartTime earlier than the graph-derived lower bound", () => {
    const problem = basicProblem();
    const schedule = basicSchedule();
    const theEdit = edit({
      scheduledOperationId: "A-O1",
      from: { machineId: "M2", sequencePosition: 0, requestedStartTime: null },
      to: { machineId: "M2", sequencePosition: 0, requestedStartTime: 0 }, // A-O0 ends at 5; 0 < 5
    });
    const { schedule: next } = recalculate(schedule, theEdit, {}, problem);
    const a1 = next.machines.find((m) => m.machineId === "M2")!.operations[0]!;
    expect(a1.startTime).toBe(5); // true lower bound wins, not the requested 0
  });

  it("honors a requestedStartTime later than the graph-derived lower bound, producing idle time", () => {
    const problem = basicProblem();
    const schedule = basicSchedule();
    const theEdit = edit({
      scheduledOperationId: "A-O1",
      from: { machineId: "M2", sequencePosition: 0, requestedStartTime: null },
      to: { machineId: "M2", sequencePosition: 0, requestedStartTime: 20 },
    });
    const { schedule: next } = recalculate(schedule, theEdit, {}, problem);
    const a1 = next.machines.find((m) => m.machineId === "M2")!.operations[0]!;
    expect(a1.startTime).toBe(20);
    expect(a1.endTime).toBe(23);
  });
});

describe("recalculate - persistent manual-start constraints", () => {
  it("a requested-start constraint survives an unrelated later edit and full recalculation", () => {
    const problem = basicProblem();
    const schedule = basicSchedule();

    const firstEdit = edit({
      scheduledOperationId: "A-O1",
      from: { machineId: "M2", sequencePosition: 0, requestedStartTime: null },
      to: { machineId: "M2", sequencePosition: 0, requestedStartTime: 20 },
    });
    const first = recalculate(schedule, firstEdit, {}, problem);
    expect(first.manualStartConstraints["A-O1"]).toBe(20);
    expect(first.schedule.machines.find((m) => m.machineId === "M2")!.operations[0]!.startTime).toBe(20);

    // Now an unrelated edit: reorder M1 (B-O0 before A-O0). A-O1's constraint
    // must persist through this second, unrelated recalculation.
    const secondEdit = edit({
      scheduledOperationId: "B-O0",
      from: { machineId: "M1", sequencePosition: 1, requestedStartTime: null },
      to: { machineId: "M1", sequencePosition: 0, requestedStartTime: null },
    });
    const second = recalculate(first.schedule, secondEdit, first.manualStartConstraints, problem);
    expect(second.manualStartConstraints["A-O1"]).toBe(20);
    const a1 = second.schedule.machines.find((m) => m.machineId === "M2")!.operations[0]!;
    expect(a1.startTime).toBe(20); // did not collapse back to its earliest feasible time
  });

  it("undo restores the prior constraint; redo restores the new one", () => {
    const before: ManualStartConstraints = { "A-O1": 20 };
    const theEdit = edit({
      scheduledOperationId: "A-O1",
      from: { machineId: "M2", sequencePosition: 0, requestedStartTime: 20 },
      to: { machineId: "M2", sequencePosition: 0, requestedStartTime: 35 },
    });
    const after = applyConstraintDelta(before, theEdit.scheduledOperationId, theEdit.to.requestedStartTime);
    expect(after["A-O1"]).toBe(35);

    // undo: reapply `from`
    const undone = applyConstraintDelta(after, theEdit.scheduledOperationId, theEdit.from.requestedStartTime);
    expect(undone["A-O1"]).toBe(20);

    // redo: reapply `to`
    const redone = applyConstraintDelta(undone, theEdit.scheduledOperationId, theEdit.to.requestedStartTime);
    expect(redone["A-O1"]).toBe(35);
  });

  it("a queue-only move preserves an existing constraint; an explicit clear removes it", () => {
    const problem = basicProblem();
    const schedule = basicSchedule();
    const constraints: ManualStartConstraints = { "A-O1": 20 };

    // Queue-only move of a DIFFERENT operation: A-O1's own constraint is untouched.
    const queueOnlyEdit = edit({
      scheduledOperationId: "B-O0",
      from: { machineId: "M1", sequencePosition: 1, requestedStartTime: null },
      to: { machineId: "M1", sequencePosition: 0, requestedStartTime: null },
    });
    const afterQueueMove = recalculate(schedule, queueOnlyEdit, constraints, problem);
    expect(afterQueueMove.manualStartConstraints["A-O1"]).toBe(20);

    // Explicit "start as early as possible" on A-O1 itself: null clears it.
    const clearEdit = edit({
      scheduledOperationId: "A-O1",
      from: { machineId: "M2", sequencePosition: 0, requestedStartTime: 20 },
      to: { machineId: "M2", sequencePosition: 0, requestedStartTime: null },
    });
    const afterClear = recalculate(afterQueueMove.schedule, clearEdit, afterQueueMove.manualStartConstraints, problem);
    expect(afterClear.manualStartConstraints["A-O1"]).toBeUndefined();
  });

  it("a requested time hidden by a later predecessor bound stays stored and becomes effective once the predecessor moves earlier", () => {
    const problem = basicProblem();
    const schedule = basicSchedule();

    // Request A-O1 to start at 6 (just after A-O0's original end of 5) --
    // fine for now, but B-O0 will later be pushed to delay things.
    const requestEdit = edit({
      scheduledOperationId: "A-O1",
      from: { machineId: "M2", sequencePosition: 0, requestedStartTime: null },
      to: { machineId: "M2", sequencePosition: 0, requestedStartTime: 6 },
    });
    const afterRequest = recalculate(schedule, requestEdit, {}, problem);
    expect(afterRequest.schedule.machines.find((m) => m.machineId === "M2")!.operations[0]!.startTime).toBe(6);

    // Now push A-O0 later by reordering M1 so B-O0 runs first (0-4), A-O0 second (4-9).
    // A-O1's true lower bound becomes 9, which HIDES the stored request of 6.
    const pushEdit = edit({
      scheduledOperationId: "B-O0",
      from: { machineId: "M1", sequencePosition: 1, requestedStartTime: null },
      to: { machineId: "M1", sequencePosition: 0, requestedStartTime: null },
    });
    const afterPush = recalculate(afterRequest.schedule, pushEdit, afterRequest.manualStartConstraints, problem);
    expect(afterPush.manualStartConstraints["A-O1"]).toBe(6); // still stored
    const hidden = afterPush.schedule.machines.find((m) => m.machineId === "M2")!.operations[0]!;
    expect(hidden.startTime).toBe(9); // hidden by the stronger job-precedence bound

    // Now move A-O0 back to run first again (predecessor moves earlier) --
    // the stored request of 6 should become effective again.
    const restoreEdit = edit({
      scheduledOperationId: "A-O0",
      from: { machineId: "M1", sequencePosition: 1, requestedStartTime: null },
      to: { machineId: "M1", sequencePosition: 0, requestedStartTime: null },
    });
    const afterRestore = recalculate(afterPush.schedule, restoreEdit, afterPush.manualStartConstraints, problem);
    const revealed = afterRestore.schedule.machines.find((m) => m.machineId === "M2")!.operations[0]!;
    expect(afterRestore.manualStartConstraints["A-O1"]).toBe(6);
    expect(revealed.startTime).toBe(6); // A-O0 now ends at 5, so the stored request of 6 is the binding bound
  });
});

describe("recalculate - no-op drop", () => {
  it("identifies the same slot and persisted constraint before an edit is recorded", () => {
    const theEdit = edit({
      scheduledOperationId: "A-O0",
      from: { machineId: "M1", sequencePosition: 0, requestedStartTime: null },
      to: { machineId: "M1", sequencePosition: 0, requestedStartTime: null },
    });
    expect(isNoOpEdit(theEdit, {})).toBe(true);
  });

  it("does not treat a same-slot constraint change or clear as a no-op", () => {
    const change = edit({
      scheduledOperationId: "A-O0",
      from: { machineId: "M1", sequencePosition: 0, requestedStartTime: null },
      to: { machineId: "M1", sequencePosition: 0, requestedStartTime: 10 },
    });
    expect(isNoOpEdit(change, {})).toBe(false);

    const clear = edit({
      scheduledOperationId: "A-O0",
      from: { machineId: "M1", sequencePosition: 0, requestedStartTime: 10 },
      to: { machineId: "M1", sequencePosition: 0, requestedStartTime: null },
    });
    expect(isNoOpEdit(clear, { "A-O0": 10 })).toBe(false);
  });

  it("uses the persisted constraint map as the no-op source of truth", () => {
    const unchanged = edit({
      scheduledOperationId: "A-O0",
      from: { machineId: "M1", sequencePosition: 0, requestedStartTime: 10 },
      to: { machineId: "M1", sequencePosition: 0, requestedStartTime: 10 },
    });
    expect(isNoOpEdit(unchanged, { "A-O0": 10 })).toBe(true);
    expect(isNoOpEdit(unchanged, {})).toBe(false);
  });
});
