import { describe, expect, it } from "vitest";
import {
  addJob,
  addMachine,
  addOperation,
  addWorkcenter,
  createDefaultJob,
  moveOperation,
  nextAvailableId,
  problemEditorReducer,
  removeJob,
  removeMachine,
  removeOperation,
  removeWorkcenter,
  updateJob,
  updateMachine,
  updateOperation,
} from "./problem-editor";
import { validateProblemDefinition } from "../schema/problem";
import type { ProblemDefinition } from "../schema/problem";

function emptyProblem(): ProblemDefinition {
  return { schemaVersion: "1.0.0", problemId: "p", name: "n", jobs: [], workcenters: [], machines: [] };
}

function problemWithOneWorkcenterAndMachine(): ProblemDefinition {
  let p = emptyProblem();
  p = addWorkcenter(p, { workcenterId: "WC1", release: 0, status: "active", machineIds: [] });
  p = addMachine(p, { machineId: "M1", workcenterId: "WC1", release: 0, status: "active" });
  return p;
}

describe("nextAvailableId", () => {
  it("never collides across repeated calls against a growing id list", () => {
    let ids: string[] = [];
    for (let i = 0; i < 20; i++) {
      const id = nextAvailableId(ids, "J-");
      expect(ids).not.toContain(id);
      ids = [...ids, id];
    }
    expect(new Set(ids).size).toBe(20);
  });

  it("fills a gap left by a deleted id rather than always incrementing past it", () => {
    expect(nextAvailableId(["J-1", "J-3"], "J-")).toBe("J-2");
  });
});

describe("addJob / createDefaultJob", () => {
  it("creates a job with one default operation, so it isn't immediately EMPTY_OPERATIONS-invalid", () => {
    const problem = problemWithOneWorkcenterAndMachine();
    const job = createDefaultJob(problem);
    expect(job.operations).toHaveLength(1);
    expect(job.operations[0]!.workcenterId).toBe("WC1"); // defaults to the first existing workcenter
  });

  it("two consecutive adds never produce duplicate job ids", () => {
    let problem = problemWithOneWorkcenterAndMachine();
    problem = addJob(problem, createDefaultJob(problem));
    problem = addJob(problem, createDefaultJob(problem));
    const ids = problem.jobs.map((j) => j.jobId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(validateProblemDefinition(problem).some((i) => i.code === "DUPLICATE_JOB_ID")).toBe(false);
  });

  it("if a duplicate id is ever produced by any other path, live validation still catches it (defense in depth)", () => {
    // addJob itself never manufactures a duplicate (see the test above);
    // this exercises the safety net that would catch one anyway -- e.g. a
    // future "duplicate row" action, or a hand-edited import -- so the
    // failure mode is a visible validation error, never silent data
    // corruption.
    let problem = problemWithOneWorkcenterAndMachine();
    const job = createDefaultJob(problem);
    problem = addJob(problem, job);
    problem = addJob(problem, { ...job, operations: [...job.operations] }); // same jobId, added again directly
    expect(validateProblemDefinition(problem).some((i) => i.code === "DUPLICATE_JOB_ID")).toBe(true);
  });
});

describe("updateJob / removeJob", () => {
  it("updateJob patches only the targeted job's editable fields", () => {
    let problem = problemWithOneWorkcenterAndMachine();
    problem = addJob(problem, createDefaultJob(problem));
    const jobId = problem.jobs[0]!.jobId;
    problem = updateJob(problem, jobId, { due: 42, weight: 3 });
    expect(problem.jobs[0]).toMatchObject({ due: 42, weight: 3 });
  });

  it("removeJob removes exactly that job and leaves others untouched", () => {
    let problem = problemWithOneWorkcenterAndMachine();
    problem = addJob(problem, createDefaultJob(problem));
    problem = addJob(problem, createDefaultJob(problem));
    const [first, second] = problem.jobs.map((j) => j.jobId);
    problem = removeJob(problem, first!);
    expect(problem.jobs.map((j) => j.jobId)).toEqual([second]);
  });
});

describe("operation reindexing (operationIndex/operationId consistency)", () => {
  function jobWithThreeOps(): { problem: ProblemDefinition; jobId: string } {
    let problem = problemWithOneWorkcenterAndMachine();
    problem = addJob(problem, createDefaultJob(problem)); // op0
    const jobId = problem.jobs[0]!.jobId;
    problem = addOperation(problem, jobId, "WC1"); // op1
    problem = addOperation(problem, jobId, "WC1"); // op2
    return { problem, jobId };
  }

  it("addOperation appends with a correctly derived operationIndex/operationId", () => {
    const { problem, jobId } = jobWithThreeOps();
    const ops = problem.jobs[0]!.operations;
    expect(ops.map((o) => o.operationIndex)).toEqual([0, 1, 2]);
    expect(ops.map((o) => o.operationId)).toEqual([`${jobId}-O0`, `${jobId}-O1`, `${jobId}-O2`]);
    expect(validateProblemDefinition(problem).some((i) => i.code === "INVALID_OPERATION_INDEX")).toBe(false);
  });

  it("removeOperation from the middle reindexes every operation after it, not just decrements", () => {
    const { problem, jobId } = jobWithThreeOps();
    const removed = removeOperation(problem, jobId, 1); // remove the middle one
    const ops = removed.jobs[0]!.operations;
    expect(ops).toHaveLength(2);
    expect(ops.map((o) => o.operationIndex)).toEqual([0, 1]);
    expect(ops.map((o) => o.operationId)).toEqual([`${jobId}-O0`, `${jobId}-O1`]);
    expect(validateProblemDefinition(removed).some((i) => i.code === "INVALID_OPERATION_INDEX")).toBe(false);
  });

  it("moveOperation reorders and reindexes both endpoints and everything between", () => {
    const { problem, jobId } = jobWithThreeOps();
    // give each op a distinguishing processingTime so we can track identity through the move
    let tagged = updateOperation(problem, jobId, 0, { processingTime: 10 });
    tagged = updateOperation(tagged, jobId, 1, { processingTime: 20 });
    tagged = updateOperation(tagged, jobId, 2, { processingTime: 30 });

    const moved = moveOperation(tagged, jobId, 0, 2); // move the first op (pt=10) to the end
    const ops = moved.jobs[0]!.operations;
    expect(ops.map((o) => o.processingTime)).toEqual([20, 30, 10]);
    expect(ops.map((o) => o.operationIndex)).toEqual([0, 1, 2]);
    expect(ops.map((o) => o.operationId)).toEqual([`${jobId}-O0`, `${jobId}-O1`, `${jobId}-O2`]);
  });

  it("removing the only operation of a job produces EMPTY_OPERATIONS on live validation", () => {
    let problem = problemWithOneWorkcenterAndMachine();
    problem = addJob(problem, createDefaultJob(problem));
    const jobId = problem.jobs[0]!.jobId;
    problem = removeOperation(problem, jobId, 0);
    expect(problem.jobs[0]!.operations).toHaveLength(0);
    expect(validateProblemDefinition(problem).some((i) => i.code === "EMPTY_OPERATIONS")).toBe(true);
  });

  it("a non-positive processingTime edit is caught by live validation", () => {
    let problem = problemWithOneWorkcenterAndMachine();
    problem = addJob(problem, createDefaultJob(problem));
    const jobId = problem.jobs[0]!.jobId;
    problem = updateOperation(problem, jobId, 0, { processingTime: 0 });
    expect(validateProblemDefinition(problem).some((i) => i.code === "NON_POSITIVE_PROCESSING_TIME")).toBe(true);
  });
});

describe("workcenter/machine consistency (ARCHITECTURE.md §3.1)", () => {
  it("addMachine keeps Machine.workcenterId and Workcenter.machineIds in sync", () => {
    let problem = emptyProblem();
    problem = addWorkcenter(problem, { workcenterId: "WC1", release: 0, status: "active", machineIds: [] });
    problem = addMachine(problem, { machineId: "M1", workcenterId: "WC1", release: 0, status: "active" });
    expect(problem.workcenters[0]!.machineIds).toEqual(["M1"]);
    expect(validateProblemDefinition(problem).some((i) => i.code === "INCONSISTENT_MACHINE_WORKCENTER")).toBe(false);
  });

  it("removeMachine cleans it out of its workcenter's machineIds", () => {
    let problem = problemWithOneWorkcenterAndMachine();
    problem = removeMachine(problem, "M1");
    expect(problem.machines).toHaveLength(0);
    expect(problem.workcenters[0]!.machineIds).toEqual([]);
    expect(validateProblemDefinition(problem).some((i) => i.code === "INCONSISTENT_MACHINE_WORKCENTER")).toBe(false);
  });

  it("updateMachine moving workcenterId relocates it between workcenters' machineIds (move-machine-between-workcenters)", () => {
    let problem = problemWithOneWorkcenterAndMachine();
    problem = addWorkcenter(problem, { workcenterId: "WC2", release: 0, status: "active", machineIds: [] });
    problem = updateMachine(problem, "M1", { workcenterId: "WC2" });
    const wc1 = problem.workcenters.find((w) => w.workcenterId === "WC1")!;
    const wc2 = problem.workcenters.find((w) => w.workcenterId === "WC2")!;
    expect(wc1.machineIds).toEqual([]);
    expect(wc2.machineIds).toEqual(["M1"]);
    expect(problem.machines[0]!.workcenterId).toBe("WC2");
    expect(validateProblemDefinition(problem).some((i) => i.code === "INCONSISTENT_MACHINE_WORKCENTER")).toBe(false);
  });

  it("removeWorkcenter cascade-removes its member machines, keeping the §3.1 invariant intact", () => {
    let problem = problemWithOneWorkcenterAndMachine();
    problem = removeWorkcenter(problem, "WC1");
    expect(problem.workcenters).toHaveLength(0);
    expect(problem.machines).toHaveLength(0); // cascade, not left dangling
    expect(validateProblemDefinition(problem).some((i) => i.code === "INCONSISTENT_MACHINE_WORKCENTER")).toBe(false);
  });
});

describe("deleting referenced entities surfaces live validation, rather than silently repairing or crashing", () => {
  it("deleting a workcenter still referenced by an operation produces MISSING_WORKCENTER_REFERENCE, not a crash or silent fix", () => {
    let problem = problemWithOneWorkcenterAndMachine();
    problem = addJob(problem, createDefaultJob(problem)); // operation references WC1
    expect(problem.jobs[0]!.operations[0]!.workcenterId).toBe("WC1");

    problem = removeWorkcenter(problem, "WC1");

    // the operation's reference is left as-is (no cascade into Operations) --
    // this is the deliberate scope boundary documented in problem-editor.ts
    expect(problem.jobs[0]!.operations[0]!.workcenterId).toBe("WC1");
    const issues = validateProblemDefinition(problem);
    expect(issues.some((i) => i.code === "MISSING_WORKCENTER_REFERENCE")).toBe(true);
  });
});

describe("problemEditorReducer", () => {
  it("updates the problem name without changing its identity or contents", () => {
    const problem = problemWithOneWorkcenterAndMachine();
    const next = problemEditorReducer(problem, { type: "updateProblemName", name: "Revised experiment" });
    expect(next).toEqual({ ...problem, name: "Revised experiment" });
    expect(next).not.toBe(problem);
  });

  it("dispatches every action type to its corresponding pure function", () => {
    let problem = emptyProblem();
    problem = problemEditorReducer(problem, { type: "addWorkcenter" });
    const workcenterId = problem.workcenters[0]!.workcenterId;

    problem = problemEditorReducer(problem, { type: "addMachine", workcenterId });
    const machineId = problem.machines[0]!.machineId;
    expect(problem.workcenters[0]!.machineIds).toEqual([machineId]);

    problem = problemEditorReducer(problem, { type: "addJob" });
    const jobId = problem.jobs[0]!.jobId;
    expect(problem.jobs[0]!.operations[0]!.workcenterId).toBe(workcenterId);

    problem = problemEditorReducer(problem, { type: "addOperation", jobId });
    expect(problem.jobs[0]!.operations).toHaveLength(2);

    problem = problemEditorReducer(problem, {
      type: "updateOperation",
      jobId,
      operationIndex: 1,
      patch: { processingTime: 7 },
    });
    expect(problem.jobs[0]!.operations[1]!.processingTime).toBe(7);

    problem = problemEditorReducer(problem, { type: "removeOperation", jobId, operationIndex: 0 });
    expect(problem.jobs[0]!.operations).toHaveLength(1);
    expect(problem.jobs[0]!.operations[0]!.operationIndex).toBe(0); // reindexed

    problem = problemEditorReducer(problem, { type: "updateJob", jobId, patch: { weight: 5 } });
    expect(problem.jobs[0]!.weight).toBe(5);

    problem = problemEditorReducer(problem, { type: "removeMachine", machineId });
    expect(problem.machines).toHaveLength(0);
    expect(problem.workcenters[0]!.machineIds).toEqual([]);

    problem = problemEditorReducer(problem, { type: "removeJob", jobId });
    expect(problem.jobs).toHaveLength(0);

    problem = problemEditorReducer(problem, { type: "removeWorkcenter", workcenterId });
    expect(problem.workcenters).toHaveLength(0);
  });

  it("unknown action types are a no-op (defensive default, not a throw)", () => {
    const problem = emptyProblem();
    // @ts-expect-error -- deliberately exercising the reducer's default branch
    const next = problemEditorReducer(problem, { type: "not-a-real-action" });
    expect(next).toBe(problem);
  });
});
