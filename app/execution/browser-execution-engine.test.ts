import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowserExecutionEngine } from "./browser-execution-engine";
import { SAMPLE_PROBLEM } from "./sample-problem";

describe("BrowserExecutionEngine pre-worker gates", () => {
  it("returns invalid before constructing a Worker for an unknown algorithm", async () => {
    const engine = new BrowserExecutionEngine();
    const result = await engine.execute({ executionId: "invalid", problem: SAMPLE_PROBLEM, algorithmId: "unknown" });
    expect(result.status).toBe("invalid");
    expect(result.validationIssues.some((issue) => issue.code === "UNKNOWN_ALGORITHM_ID")).toBe(true);
  });

  it("returns every schema issue before constructing a Worker", async () => {
    const problem = structuredClone(SAMPLE_PROBLEM);
    problem.jobs[0]!.operations[0]!.processingTime = 0;
    const engine = new BrowserExecutionEngine();
    const result = await engine.execute({ executionId: "bad-problem", problem, algorithmId: "fcfs" });
    expect(result.status).toBe("invalid");
    expect(result.validationIssues.some((issue) => issue.code === "NON_POSITIVE_PROCESSING_TIME")).toBe(true);
  });
});

describe("BrowserExecutionEngine preparation", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("prepares once, shares the in-flight promise, and reports readiness", async () => {
    const workers: FakeWorker[] = [];
    class FakeWorker {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      messages: Array<{ type: string; executionId: string }> = [];
      constructor() {
        workers.push(this);
      }
      postMessage(message: { type: string; executionId: string }) {
        this.messages.push(message);
      }
      terminate() {}
    }
    vi.stubGlobal("Worker", FakeWorker);

    const engine = new BrowserExecutionEngine();
    const stages: string[] = [];
    const first = engine.prepare((stage) => stages.push(stage));
    const second = engine.prepare();
    expect(second).toBe(first);
    expect(workers).toHaveLength(1);
    expect(workers[0]!.messages).toHaveLength(1);

    const executionId = workers[0]!.messages[0]!.executionId;
    workers[0]!.onmessage?.({ data: { type: "progress", executionId, stage: "loading-runtime" } } as MessageEvent);
    workers[0]!.onmessage?.({ data: { type: "prepared", executionId } } as MessageEvent);
    await first;

    expect(stages).toEqual(["loading-runtime"]);
    await expect(engine.prepare()).resolves.toBeUndefined();
    expect(workers[0]!.messages).toHaveLength(1);
    engine.dispose();
  });
});
