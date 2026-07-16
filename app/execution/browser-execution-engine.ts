import { checkExecutionPolicy, DEFAULT_BROWSER_EXECUTION_POLICY } from "../../lib/adapter/policy";
import { fromLekinpyScheduleDict, toLekinpySystemPayload } from "../../lib/adapter/translate";
import { validateExecutionRequest } from "../../lib/adapter/validate-request";
import { getAlgorithmDefinition } from "../../lib/registry/algorithms";
import { computeMetrics } from "../../lib/scheduling/metrics";
import type { ExecutionRequest, ExecutionResult } from "../../lib/schema/algorithm";
import { hasBlockingError, makeIssue } from "../../lib/schema/issue";
import type { WorkerRequest, WorkerResponse, ExecutionProgress } from "../../worker/scheduling-protocol";

export type ExecutionProgressListener = (stage: ExecutionProgress) => void;
export type SchedulerPreparationState = "idle" | Exclude<ExecutionProgress, "running"> | "ready" | "error";

type PendingExecution = {
  request: ExecutionRequest;
  resolve: (result: ExecutionResult) => void;
  timer: ReturnType<typeof setTimeout> | null;
  onProgress?: ExecutionProgressListener;
};

type PendingPreparation = {
  executionId: string;
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
  listeners: Set<ExecutionProgressListener>;
};

function baseResult(request: ExecutionRequest): Omit<ExecutionResult, "status"> {
  return {
    executionId: request.executionId,
    executionMode: "browser",
    algorithmId: request.algorithmId,
    algorithmVersion: getAlgorithmDefinition(request.algorithmId)?.libraryMetadata.version ?? "unknown",
    lekinpyVersion: "0.2.0",
    schemaVersion: "1.0.0",
    runtimeMs: 0,
    schedule: null,
    metrics: null,
    validationIssues: [],
    policyViolation: null,
    warnings: [],
  };
}

export class BrowserExecutionEngine {
  private worker: Worker | null = null;
  private pending = new Map<string, PendingExecution>();
  private startedAt = new Map<string, number>();
  private preparation: PendingPreparation | null = null;
  private prepared = false;

  prepare(onProgress?: ExecutionProgressListener): Promise<void> {
    if (this.prepared) return Promise.resolve();
    if (this.preparation) {
      if (onProgress) this.preparation.listeners.add(onProgress);
      return this.preparation.promise;
    }

    this.ensureWorker();
    const executionId = `prepare-${crypto.randomUUID()}`;
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<void>((done, failed) => {
      resolve = done;
      reject = failed;
    });
    this.preparation = {
      executionId,
      promise,
      resolve,
      reject,
      listeners: new Set(onProgress ? [onProgress] : []),
    };
    this.worker!.postMessage({ type: "prepare", executionId });
    return promise;
  }

  execute(request: ExecutionRequest, onProgress?: ExecutionProgressListener): Promise<ExecutionResult> {
    const algorithm = getAlgorithmDefinition(request.algorithmId);
    if (!algorithm) {
      const validationIssues = validateExecutionRequest(request.problem, request.algorithmId);
      return Promise.resolve({ ...baseResult(request), status: "invalid", validationIssues });
    }

    const policyViolation = checkExecutionPolicy(request.problem, algorithm);
    if (policyViolation) {
      return Promise.resolve({ ...baseResult(request), status: "rejected", policyViolation });
    }

    const validationIssues = validateExecutionRequest(request.problem, request.algorithmId);
    if (hasBlockingError(validationIssues)) {
      return Promise.resolve({ ...baseResult(request), status: "invalid", validationIssues });
    }

    if (this.pending.size > 0) {
      return Promise.resolve({ ...baseResult(request), status: "error", warnings: ["Another browser execution is already running."] });
    }

    return new Promise((resolve) => {
      this.ensureWorker();
      this.pending.set(request.executionId, { request, resolve, timer: null, onProgress });
      const message: WorkerRequest = {
        type: "execute",
        executionId: request.executionId,
        algorithmId: request.algorithmId,
        system: toLekinpySystemPayload(request.problem),
      };
      this.worker!.postMessage(message);
    });
  }

  cancel(executionId: string): void {
    const pending = this.pending.get(executionId);
    if (!pending) return;
    this.resetWorker();
    pending.resolve({
      ...baseResult(pending.request),
      status: "error",
      runtimeMs: this.elapsed(executionId),
      warnings: ["Execution was cancelled."],
    });
    this.cleanup(executionId);
  }

  dispose(): void {
    this.resetWorker(new Error("Execution engine was disposed."));
    for (const [executionId, pending] of this.pending) {
      pending.resolve({ ...baseResult(pending.request), status: "error", warnings: ["Execution engine was disposed."] });
      this.cleanup(executionId);
    }
  }

  private ensureWorker() {
    if (this.worker) return;
    this.worker = new Worker(new URL("../../worker/scheduling.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => this.handleMessage(event.data);
    this.worker.onerror = (event) => {
      const message = event.message || "The scheduling worker stopped unexpectedly.";
      this.failPreparation(new Error(message));
      for (const [executionId, pending] of this.pending) {
        pending.resolve({ ...baseResult(pending.request), status: "error", runtimeMs: this.elapsed(executionId), warnings: [message] });
        this.cleanup(executionId);
      }
      this.resetWorker();
    };
  }

  private handleMessage(message: WorkerResponse) {
    if (this.preparation?.executionId === message.executionId) {
      if (message.type === "progress") {
        for (const listener of this.preparation.listeners) listener(message.stage);
      } else if (message.type === "prepared") {
        this.prepared = true;
        this.preparation.resolve();
        this.preparation = null;
      } else if (message.type === "error") {
        this.failPreparation(new Error(message.message));
      }
      return;
    }
    if (message.type === "prepared") return;
    const pending = this.pending.get(message.executionId);
    if (!pending) return;

    if (message.type === "progress") {
      pending.onProgress?.(message.stage);
      if (message.stage === "running" && pending.timer === null) {
        this.startedAt.set(message.executionId, performance.now());
        pending.timer = setTimeout(() => this.timeout(message.executionId), DEFAULT_BROWSER_EXECUTION_POLICY.maxEstimatedRuntimeMs);
      }
      return;
    }

    const runtimeMs = this.elapsed(message.executionId);
    if (message.type === "completed") {
      const schedule = fromLekinpyScheduleDict(
        message.schedule,
        `schedule-${message.executionId}`,
        pending.request.algorithmId,
      );
      pending.resolve({
        ...baseResult(pending.request),
        status: "completed",
        algorithmVersion: message.algorithmVersion,
        lekinpyVersion: message.lekinpyVersion,
        runtimeMs,
        schedule,
        metrics: computeMetrics(schedule, pending.request.problem),
        validationIssues: validateExecutionRequest(pending.request.problem, pending.request.algorithmId)
          .filter((issue) => issue.severity === "warning"),
      });
    } else if (message.type === "validation-error") {
      pending.resolve({
        ...baseResult(pending.request),
        status: "invalid",
        runtimeMs,
        validationIssues: [makeIssue({ code: message.code, message: message.message, path: [], source: "library" })],
      });
    } else {
      pending.resolve({ ...baseResult(pending.request), status: "error", runtimeMs, warnings: [message.message] });
    }
    this.cleanup(message.executionId);
  }

  private timeout(executionId: string) {
    const pending = this.pending.get(executionId);
    if (!pending) return;
    this.resetWorker();
    pending.resolve({
      ...baseResult(pending.request),
      status: "error",
      runtimeMs: this.elapsed(executionId),
      warnings: [`Execution exceeded the ${DEFAULT_BROWSER_EXECUTION_POLICY.maxEstimatedRuntimeMs} ms browser limit.`],
    });
    this.cleanup(executionId);
  }

  private elapsed(executionId: string): number {
    return Math.max(0, Math.round(performance.now() - (this.startedAt.get(executionId) ?? performance.now())));
  }

  private cleanup(executionId: string) {
    const pending = this.pending.get(executionId);
    if (pending?.timer) clearTimeout(pending.timer);
    this.pending.delete(executionId);
    this.startedAt.delete(executionId);
  }

  private failPreparation(error: Error) {
    this.preparation?.reject(error);
    this.preparation = null;
    this.prepared = false;
  }

  private resetWorker(preparationError = new Error("Scheduler preparation was interrupted.")) {
    this.worker?.terminate();
    this.worker = null;
    this.failPreparation(preparationError);
    this.prepared = false;
  }
}
