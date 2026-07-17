import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CustomAlgorithmEngine } from "./custom-execution-engine";
import { DEFAULT_CUSTOM_ALGORITHM_POLICY } from "../../lib/custom-algorithm/policy";
import { SAMPLE_PROBLEM } from "./sample-problem";
import type { CustomWorkerRequest, CustomWorkerResponse } from "../../worker/custom-scheduling-protocol";
import type { LekinpyScheduleDict } from "../../lib/adapter/translate";

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent<CustomWorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;
  messages: CustomWorkerRequest[] = [];

  constructor() {
    FakeWorker.instances.push(this);
  }

  postMessage(message: CustomWorkerRequest) {
    this.messages.push(message);
  }

  terminate() {
    this.terminated = true;
  }

  emit(message: CustomWorkerResponse) {
    this.onmessage?.({ data: message } as MessageEvent<CustomWorkerResponse>);
  }
}

function lastWorker(): FakeWorker {
  const worker = FakeWorker.instances[FakeWorker.instances.length - 1];
  if (!worker) throw new Error("no FakeWorker was constructed");
  return worker;
}

function feasibleScheduleDict(): LekinpyScheduleDict {
  const ops = SAMPLE_PROBLEM.jobs.flatMap((job) => job.operations.map((op) => ({ job, op })));
  // Build a trivially feasible one-machine-at-a-time schedule: run every
  // operation back to back on its first eligible machine, in job order.
  // (Feasibility, not realism, is all these tests need.)
  const machineByWorkcenter = new Map(SAMPLE_PROBLEM.machines.map((m) => [m.workcenterId, m] as const));
  const machineCursors = new Map<string, number>();
  const machinesOut = new Map<string, LekinpyScheduleDict["machines"][number]>();
  for (const m of SAMPLE_PROBLEM.machines) {
    machinesOut.set(m.machineId, { machine: m.machineId, workcenter: m.workcenterId, operations: [] });
  }
  const prevEndByJob = new Map<string, number>();
  for (const { job, op } of ops) {
    const machine = machineByWorkcenter.get(op.workcenterId)!;
    const cursor = Math.max(machineCursors.get(machine.machineId) ?? machine.release, prevEndByJob.get(job.jobId) ?? job.release);
    const start = cursor;
    const end = start + op.processingTime;
    machineCursors.set(machine.machineId, end);
    prevEndByJob.set(job.jobId, end);
    const ms = machinesOut.get(machine.machineId)!;
    ms.operations.push({
      job_id: job.jobId,
      operation_index: op.operationIndex,
      workcenter: op.workcenterId,
      machine: machine.machineId,
      start_time: start,
      end_time: end,
      sequence_position: ms.operations.length,
      status: op.status,
    });
  }
  return {
    schedule_type: "CUSTOM",
    time: Math.max(...[...machineCursors.values()]),
    rgb: null,
    machines: [...machinesOut.values()],
  };
}

describe("CustomAlgorithmEngine", () => {
  beforeEach(() => {
    FakeWorker.instances = [];
    vi.stubGlobal("Worker", FakeWorker);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe("pre-worker gates", () => {
    it("rejects empty source without constructing a Worker", async () => {
      const engine = new CustomAlgorithmEngine();
      const result = await engine.runCustomAlgorithm({ source: "", problem: SAMPLE_PROBLEM });
      expect(result.status).toBe("validation_failed");
      expect(result.issues.some((i) => i.code === "CUSTOM_ALGORITHM_EMPTY_SOURCE")).toBe(true);
      expect(FakeWorker.instances).toHaveLength(0);
    });

    it("rejects a structurally invalid problem without constructing a Worker", async () => {
      const problem = structuredClone(SAMPLE_PROBLEM);
      problem.jobs[0]!.operations[0]!.processingTime = 0;
      const engine = new CustomAlgorithmEngine();
      const result = await engine.runCustomAlgorithm({ source: "def schedule(system, parameters, context):\n    return None\n", problem });
      expect(result.status).toBe("validation_failed");
      expect(result.issues.some((i) => i.code === "NON_POSITIVE_PROCESSING_TIME")).toBe(true);
      expect(FakeWorker.instances).toHaveLength(0);
    });
  });

  describe("validateCustomAlgorithm", () => {
    it("short-circuits on empty source without a worker", async () => {
      const engine = new CustomAlgorithmEngine();
      const result = await engine.validateCustomAlgorithm("");
      expect(result.valid).toBe(false);
      expect(result.reachedPythonCheck).toBe(false);
      expect(FakeWorker.instances).toHaveLength(0);
    });

    it("relays a valid Python-side check and terminates the worker", async () => {
      const engine = new CustomAlgorithmEngine();
      const promise = engine.validateCustomAlgorithm("def schedule(system, parameters, context):\n    return None\n");
      await Promise.resolve();
      const worker = lastWorker();
      worker.emit({ type: "validated", runId: (worker.messages[0] as { runId: string }).runId, valid: true, issues: [] });
      const result = await promise;
      expect(result.valid).toBe(true);
      expect(result.reachedPythonCheck).toBe(true);
      expect(worker.terminated).toBe(true);
    });

    it("relays an invalid-signature finding from Python", async () => {
      const engine = new CustomAlgorithmEngine();
      const promise = engine.validateCustomAlgorithm("def schedule(x):\n    return None\n");
      await Promise.resolve();
      const worker = lastWorker();
      worker.emit({
        type: "validated",
        runId: (worker.messages[0] as { runId: string }).runId,
        valid: false,
        issues: [{ code: "CUSTOM_ALGORITHM_INVALID_SIGNATURE", message: "bad signature" }],
      });
      const result = await promise;
      expect(result.valid).toBe(false);
      expect(result.issues[0]!.code).toBe("CUSTOM_ALGORITHM_INVALID_SIGNATURE");
    });
  });

  describe("successful run", () => {
    it("produces a completed ExecutionResult from a feasible schedule", async () => {
      const engine = new CustomAlgorithmEngine();
      const promise = engine.runCustomAlgorithm({ source: "def schedule(system, parameters, context):\n    return None\n", problem: SAMPLE_PROBLEM });
      await Promise.resolve();
      await Promise.resolve();
      const worker = lastWorker();
      const runId = (worker.messages[0] as { runId: string }).runId;
      worker.emit({
        type: "completed",
        runId,
        scheduleDict: feasibleScheduleDict(),
        lekinpyVersion: "0.2.0",
        stdout: "hello\n",
        stdoutTruncated: false,
        stderr: "",
        stderrTruncated: false,
        droppedProgressMessages: 0,
        droppedIncumbentUpdates: 0,
      });
      const result = await promise;
      expect(result.status).toBe("completed");
      expect(result.terminationReason).toBe("completed");
      expect(result.result?.status).toBe("completed");
      expect(result.result?.metrics).not.toBeNull();
      expect(result.stdout).toBe("hello\n");
      expect(worker.terminated).toBe(true);
    });

    it("rejects a schedule that fails independent feasibility validation (invalid_result)", async () => {
      const engine = new CustomAlgorithmEngine();
      const promise = engine.runCustomAlgorithm({ source: "def schedule(system, parameters, context):\n    return None\n", problem: SAMPLE_PROBLEM });
      await Promise.resolve();
      await Promise.resolve();
      const worker = lastWorker();
      const runId = (worker.messages[0] as { runId: string }).runId;
      const dict = feasibleScheduleDict();
      // WC-CUT has two eligible machines (M-01, M-01B); feasibleScheduleDict()
      // routes every WC-CUT operation to M-01B (the last-wins entry in its
      // workcenter->machine lookup), so M-01B - not machines[0] - is the one
      // that actually carries operations to drop here.
      dict.machines.find((m) => m.machine === "M-01B")!.operations = [];
      worker.emit({
        type: "completed",
        runId,
        scheduleDict: dict,
        lekinpyVersion: "0.2.0",
        stdout: "",
        stdoutTruncated: false,
        stderr: "",
        stderrTruncated: false,
        droppedProgressMessages: 0,
        droppedIncumbentUpdates: 0,
      });
      const result = await promise;
      expect(result.status).toBe("invalid_result");
      expect(result.terminationReason).toBe("invalid_return_value");
      expect(result.result).toBeNull();
      expect(result.issues.some((i) => i.code === "SCHEDULE_MISSING_OPERATION")).toBe(true);
    });
  });

  describe("custom-error mapping", () => {
    it.each([
      ["CUSTOM_ALGORITHM_SYNTAX_ERROR", "validation_failed", "validation_error"],
      ["CUSTOM_ALGORITHM_MISSING_ENTRYPOINT", "validation_failed", "validation_error"],
      ["CUSTOM_ALGORITHM_INVALID_SIGNATURE", "validation_failed", "validation_error"],
      ["CUSTOM_ALGORITHM_RUNTIME_ERROR", "runtime_failed", "runtime_exception"],
      ["CUSTOM_ALGORITHM_INVALID_RESULT", "invalid_result", "invalid_return_value"],
    ] as const)("maps %s to status %s", async (code, status, reason) => {
      const engine = new CustomAlgorithmEngine();
      const promise = engine.runCustomAlgorithm({ source: "def schedule(system, parameters, context):\n    return None\n", problem: SAMPLE_PROBLEM });
      await Promise.resolve();
      await Promise.resolve();
      const worker = lastWorker();
      const runId = (worker.messages[0] as { runId: string }).runId;
      worker.emit({
        type: "custom-error",
        runId,
        code,
        message: "boom",
        traceback: code === "CUSTOM_ALGORITHM_RUNTIME_ERROR" ? "Traceback...\nboom" : null,
        stdout: "",
        stdoutTruncated: false,
        stderr: "",
        stderrTruncated: false,
        droppedProgressMessages: 0,
        droppedIncumbentUpdates: 0,
      });
      const result = await promise;
      expect(result.status).toBe(status);
      expect(result.terminationReason).toBe(reason);
      if (code === "CUSTOM_ALGORITHM_RUNTIME_ERROR") {
        expect(result.diagnostics.traceback).toContain("boom");
      }
    });
  });

  describe("progress and incumbent transport", () => {
    it("delivers progress events in order to both the callback and the result", async () => {
      const engine = new CustomAlgorithmEngine();
      const received: number[] = [];
      const promise = engine.runCustomAlgorithm({
        source: "def schedule(system, parameters, context):\n    return None\n",
        problem: SAMPLE_PROBLEM,
        onProgress: (event) => received.push(event.progress),
      });
      await Promise.resolve();
      await Promise.resolve();
      const worker = lastWorker();
      const runId = (worker.messages[0] as { runId: string }).runId;
      worker.emit({ type: "custom-progress", runId, progress: 0.1, message: null });
      worker.emit({ type: "custom-progress", runId, progress: 0.5, message: "halfway" });
      worker.emit({ type: "custom-progress", runId, progress: 0.9, message: null });
      worker.emit({
        type: "completed",
        runId,
        scheduleDict: feasibleScheduleDict(),
        lekinpyVersion: "0.2.0",
        stdout: "",
        stdoutTruncated: false,
        stderr: "",
        stderrTruncated: false,
        droppedProgressMessages: 3,
        droppedIncumbentUpdates: 0,
      });
      const result = await promise;
      expect(received).toEqual([0.1, 0.5, 0.9]);
      expect(result.progress.map((p) => p.progress)).toEqual([0.1, 0.5, 0.9]);
      expect(result.diagnostics.droppedProgressMessages).toBe(3);
    });

    it("independently validates an incumbent and drops an infeasible one", async () => {
      const engine = new CustomAlgorithmEngine();
      const goodIncumbents: unknown[] = [];
      const promise = engine.runCustomAlgorithm({
        source: "def schedule(system, parameters, context):\n    return None\n",
        problem: SAMPLE_PROBLEM,
        onIncumbent: (event) => goodIncumbents.push(event),
      });
      await Promise.resolve();
      await Promise.resolve();
      const worker = lastWorker();
      const runId = (worker.messages[0] as { runId: string }).runId;

      const badDict = feasibleScheduleDict();
      badDict.machines.find((m) => m.machine === "M-01B")!.operations = [];
      worker.emit({ type: "custom-incumbent", runId, scheduleDict: badDict, objective: 42, message: null });

      const goodDict = feasibleScheduleDict();
      worker.emit({ type: "custom-incumbent", runId, scheduleDict: goodDict, objective: 10, message: "improving" });

      worker.emit({
        type: "completed",
        runId,
        scheduleDict: feasibleScheduleDict(),
        lekinpyVersion: "0.2.0",
        stdout: "",
        stdoutTruncated: false,
        stderr: "",
        stderrTruncated: false,
        droppedProgressMessages: 0,
        droppedIncumbentUpdates: 0,
      });
      const result = await promise;
      expect(goodIncumbents).toHaveLength(1);
      expect(result.diagnostics.invalidIncumbentUpdates).toBe(1);
    });
  });

  describe("cancellation and timeout", () => {
    it("cancelCustomAlgorithm terminates the worker and resolves status cancelled", async () => {
      const engine = new CustomAlgorithmEngine();
      const promise = engine.runCustomAlgorithm({ source: "def schedule(system, parameters, context):\n    return None\n", problem: SAMPLE_PROBLEM });
      await Promise.resolve();
      await Promise.resolve();
      const worker = lastWorker();
      const runId = (worker.messages[0] as { runId: string }).runId;
      engine.cancelCustomAlgorithm(runId);
      const result = await promise;
      expect(result.status).toBe("cancelled");
      expect(result.terminationReason).toBe("user_cancelled");
      expect(worker.terminated).toBe(true);
    });

    it("hard-terminates the worker after the time limit elapses even if the algorithm never responds", async () => {
      const engine = new CustomAlgorithmEngine();
      const promise = engine.runCustomAlgorithm({
        source: "def schedule(system, parameters, context):\n    return None\n",
        problem: SAMPLE_PROBLEM,
        limits: { timeLimitMs: 1000 },
      });
      await Promise.resolve();
      await Promise.resolve();
      const worker = lastWorker();
      const runId = (worker.messages[0] as { runId: string }).runId;
      // The hard-timeout timer only arms once "running" arrives (it must
      // not count Pyodide/wheel load time against the algorithm's own time
      // budget - see runOnWorker's comment) - mirror that here.
      worker.emit({ type: "progress", runId, stage: "running" });
      expect(worker.terminated).toBe(false);
      await vi.advanceTimersByTimeAsync(1301);
      const result = await promise;
      expect(result.status).toBe("timed_out");
      expect(result.terminationReason).toBe("timeout");
      expect(worker.terminated).toBe(true);
    });

    it("a completed message arriving right at the deadline still wins the grace window", async () => {
      const engine = new CustomAlgorithmEngine();
      const promise = engine.runCustomAlgorithm({
        source: "def schedule(system, parameters, context):\n    return None\n",
        problem: SAMPLE_PROBLEM,
        limits: { timeLimitMs: 1000 },
      });
      await Promise.resolve();
      await Promise.resolve();
      const worker = lastWorker();
      const runId = (worker.messages[0] as { runId: string }).runId;
      worker.emit({ type: "progress", runId, stage: "running" });
      await vi.advanceTimersByTimeAsync(1050);
      worker.emit({
        type: "completed",
        runId,
        scheduleDict: feasibleScheduleDict(),
        lekinpyVersion: "0.2.0",
        stdout: "",
        stdoutTruncated: false,
        stderr: "",
        stderrTruncated: false,
        droppedProgressMessages: 0,
        droppedIncumbentUpdates: 0,
      });
      const result = await promise;
      expect(result.status).toBe("completed");
    });
  });

  describe("environment startup timeout", () => {
    it("settles as runtime_failed when the worker never reaches the running stage", async () => {
      const engine = new CustomAlgorithmEngine();
      const promise = engine.runCustomAlgorithm({ source: "def schedule(system, parameters, context):\n    return None\n", problem: SAMPLE_PROBLEM });
      await Promise.resolve();
      await Promise.resolve();
      const worker = lastWorker();
      // No message ever arrives (a hung Pyodide bootstrap). The dedicated
      // startup timer - NOT the algorithm timer, which is never armed
      // before "running" - must settle the run.
      await vi.advanceTimersByTimeAsync(60_001);
      const result = await promise;
      expect(result.status).toBe("runtime_failed");
      expect(result.issues[0]!.message).toContain("did not start");
      expect(worker.terminated).toBe(true);
    });

    it("does not fire once the running stage has arrived", async () => {
      // A short startup ceiling and a longer algorithm limit, so the test
      // can cross the startup deadline while the run is legitimately mid-
      // algorithm.
      const engine = new CustomAlgorithmEngine({ ...DEFAULT_CUSTOM_ALGORITHM_POLICY, environmentStartupTimeoutMs: 1_000 });
      const promise = engine.runCustomAlgorithm({
        source: "def schedule(system, parameters, context):\n    return None\n",
        problem: SAMPLE_PROBLEM,
        limits: { timeLimitMs: 10_000 },
      });
      await Promise.resolve();
      await Promise.resolve();
      const worker = lastWorker();
      const runId = (worker.messages[0] as { runId: string }).runId;
      worker.emit({ type: "progress", runId, stage: "running" });
      // Cross the startup deadline while the (much longer) algorithm time
      // limit is still running - nothing must settle yet.
      await vi.advanceTimersByTimeAsync(2_000);
      worker.emit({
        type: "completed",
        runId,
        scheduleDict: feasibleScheduleDict(),
        lekinpyVersion: "0.2.0",
        stdout: "",
        stdoutTruncated: false,
        stderr: "",
        stderrTruncated: false,
        droppedProgressMessages: 0,
        droppedIncumbentUpdates: 0,
      });
      const result = await promise;
      expect(result.status).toBe("completed");
    });

    it("settles a hung validation instead of leaving it pending forever", async () => {
      const engine = new CustomAlgorithmEngine();
      const promise = engine.validateCustomAlgorithm("def schedule(system, parameters, context):\n    return None\n");
      await Promise.resolve();
      const worker = lastWorker();
      await vi.advanceTimersByTimeAsync(60_001);
      const result = await promise;
      expect(result.valid).toBe(false);
      expect(result.reachedPythonCheck).toBe(false);
      expect(result.issues[0]!.message).toContain("did not start");
      expect(worker.terminated).toBe(true);
    });

    it("dispose() also settles an in-flight validation", async () => {
      const engine = new CustomAlgorithmEngine();
      const promise = engine.validateCustomAlgorithm("def schedule(system, parameters, context):\n    return None\n");
      await Promise.resolve();
      const worker = lastWorker();
      engine.dispose();
      const result = await promise;
      expect(result.valid).toBe(false);
      expect(result.issues[0]!.message).toContain("disposed");
      expect(worker.terminated).toBe(true);
    });
  });

  describe("hostile or malformed worker messages", () => {
    it("treats a malformed completed scheduleDict as invalid_result instead of crashing the handler", async () => {
      const engine = new CustomAlgorithmEngine();
      const promise = engine.runCustomAlgorithm({ source: "def schedule(system, parameters, context):\n    return None\n", problem: SAMPLE_PROBLEM });
      await Promise.resolve();
      await Promise.resolve();
      const worker = lastWorker();
      const runId = (worker.messages[0] as { runId: string }).runId;
      worker.emit({
        type: "completed",
        runId,
        // Not a LekinpyScheduleDict at all - e.g. a Schedule subclass with
        // an overridden to_dict(), or a message forged via js.postMessage.
        scheduleDict: { garbage: true } as unknown as LekinpyScheduleDict,
        lekinpyVersion: "0.2.0",
        stdout: "",
        stdoutTruncated: false,
        stderr: "",
        stderrTruncated: false,
        droppedProgressMessages: 0,
        droppedIncumbentUpdates: 0,
      });
      const result = await promise;
      expect(result.status).toBe("invalid_result");
      expect(result.issues.some((i) => i.code === "SCHEDULE_SCHEMA_INVALID")).toBe(true);
      expect(worker.terminated).toBe(true);
    });

    it("counts a malformed incumbent dict as invalid and keeps the run alive", async () => {
      const engine = new CustomAlgorithmEngine();
      const incumbents: unknown[] = [];
      const promise = engine.runCustomAlgorithm({
        source: "def schedule(system, parameters, context):\n    return None\n",
        problem: SAMPLE_PROBLEM,
        onIncumbent: (event) => incumbents.push(event),
      });
      await Promise.resolve();
      await Promise.resolve();
      const worker = lastWorker();
      const runId = (worker.messages[0] as { runId: string }).runId;
      worker.emit({
        type: "custom-incumbent",
        runId,
        scheduleDict: null as unknown as LekinpyScheduleDict,
        objective: 1,
        message: null,
      });
      worker.emit({
        type: "completed",
        runId,
        scheduleDict: feasibleScheduleDict(),
        lekinpyVersion: "0.2.0",
        stdout: "",
        stdoutTruncated: false,
        stderr: "",
        stderrTruncated: false,
        droppedProgressMessages: 0,
        droppedIncumbentUpdates: 0,
      });
      const result = await promise;
      expect(result.status).toBe("completed");
      expect(incumbents).toHaveLength(0);
      expect(result.diagnostics.invalidIncumbentUpdates).toBe(1);
    });

    it("ignores messages carrying a different run's runId", async () => {
      const engine = new CustomAlgorithmEngine();
      const promise = engine.runCustomAlgorithm({ source: "def schedule(system, parameters, context):\n    return None\n", problem: SAMPLE_PROBLEM });
      await Promise.resolve();
      await Promise.resolve();
      const worker = lastWorker();
      const runId = (worker.messages[0] as { runId: string }).runId;
      worker.emit({
        type: "completed",
        runId: "some-other-run",
        scheduleDict: feasibleScheduleDict(),
        lekinpyVersion: "0.2.0",
        stdout: "",
        stdoutTruncated: false,
        stderr: "",
        stderrTruncated: false,
        droppedProgressMessages: 0,
        droppedIncumbentUpdates: 0,
      });
      expect(worker.terminated).toBe(false); // stale-id message settled nothing
      worker.emit({
        type: "completed",
        runId,
        scheduleDict: feasibleScheduleDict(),
        lekinpyVersion: "0.2.0",
        stdout: "",
        stdoutTruncated: false,
        stderr: "",
        stderrTruncated: false,
        droppedProgressMessages: 0,
        droppedIncumbentUpdates: 0,
      });
      const result = await promise;
      expect(result.status).toBe("completed");
    });

    it("rejects a second concurrent run reusing an in-flight runId instead of cross-wiring the two", async () => {
      const engine = new CustomAlgorithmEngine();
      const source = "def schedule(system, parameters, context):\n    return None\n";
      const first = engine.runCustomAlgorithm({ runId: "shared-id", source, problem: SAMPLE_PROBLEM });
      await Promise.resolve();
      await Promise.resolve();
      const firstWorker = lastWorker();
      const second = await engine.runCustomAlgorithm({ runId: "shared-id", source, problem: SAMPLE_PROBLEM });
      expect(second.status).toBe("validation_failed");
      expect(second.issues[0]!.message).toContain("already in progress");
      expect(FakeWorker.instances).toHaveLength(1); // no second worker was built
      // The original run is untouched and still completes normally.
      firstWorker.emit({
        type: "completed",
        runId: "shared-id",
        scheduleDict: feasibleScheduleDict(),
        lekinpyVersion: "0.2.0",
        stdout: "",
        stdoutTruncated: false,
        stderr: "",
        stderrTruncated: false,
        droppedProgressMessages: 0,
        droppedIncumbentUpdates: 0,
      });
      const result = await first;
      expect(result.status).toBe("completed");
    });
  });

  describe("run isolation", () => {
    it("uses a fresh Worker per run and never reuses one across two runs", async () => {
      const engine = new CustomAlgorithmEngine();
      const first = engine.runCustomAlgorithm({ source: "def schedule(system, parameters, context):\n    return None\n", problem: SAMPLE_PROBLEM });
      await Promise.resolve();
      await Promise.resolve();
      const firstWorker = lastWorker();
      firstWorker.emit({
        type: "completed",
        runId: (firstWorker.messages[0] as { runId: string }).runId,
        scheduleDict: feasibleScheduleDict(),
        lekinpyVersion: "0.2.0",
        stdout: "",
        stdoutTruncated: false,
        stderr: "",
        stderrTruncated: false,
        droppedProgressMessages: 0,
        droppedIncumbentUpdates: 0,
      });
      await first;

      const second = engine.runCustomAlgorithm({ source: "def schedule(system, parameters, context):\n    return None\n", problem: SAMPLE_PROBLEM });
      await Promise.resolve();
      await Promise.resolve();
      const secondWorker = lastWorker();
      expect(secondWorker).not.toBe(firstWorker);
      secondWorker.emit({
        type: "completed",
        runId: (secondWorker.messages[0] as { runId: string }).runId,
        scheduleDict: feasibleScheduleDict(),
        lekinpyVersion: "0.2.0",
        stdout: "",
        stdoutTruncated: false,
        stderr: "",
        stderrTruncated: false,
        droppedProgressMessages: 0,
        droppedIncumbentUpdates: 0,
      });
      await second;
      expect(FakeWorker.instances).toHaveLength(2);
      expect(firstWorker.terminated).toBe(true);
      expect(secondWorker.terminated).toBe(true);
    });
  });
});
