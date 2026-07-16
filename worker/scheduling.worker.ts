/// <reference lib="webworker" />

import { loadPyodide, type PyodideInterface } from "pyodide";
import type { WorkerRequest, WorkerResponse, ExecutionProgress } from "./scheduling-protocol";
import type { LekinpyScheduleDict } from "../lib/adapter/translate";
import type { ValidationErrorCode } from "../lib/schema/codes";
import { LEKINPY_WHEEL_PATH, verifyWheel } from "./wheel-integrity";

const PYODIDE_VERSION = "314.0.2";
const PYODIDE_INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

const VALIDATION_CODE_BY_EXCEPTION: Record<string, ValidationErrorCode> = {
  EmptyOperationsError: "EMPTY_OPERATIONS",
  NonPositiveProcessingTimeError: "NON_POSITIVE_PROCESSING_TIME",
  EmptyMachineListError: "EMPTY_MACHINE_LIST",
  DuplicateJobIdError: "DUPLICATE_JOB_ID",
  DuplicateMachineIdError: "DUPLICATE_MACHINE_ID",
  DuplicateWorkcenterIdError: "DUPLICATE_WORKCENTER_ID",
  MissingWorkcenterError: "MISSING_WORKCENTER_REFERENCE",
};

const PYTHON_EXECUTE = String.raw`
import json
import lekinpy
from lekinpy.system import System
from lekinpy.job import Job, Operation
from lekinpy.machine import Machine, Workcenter
from lekinpy.algorithms.fcfs import FCFSAlgorithm
from lekinpy.algorithms.spt import SPTAlgorithm
from lekinpy.algorithms.edd import EDDAlgorithm
from lekinpy.algorithms.wspt import WSPTAlgorithm
from lekinpy.exceptions import LekinValidationError

def stable_rgb(value):
    raw = value.encode("utf-8")
    return tuple((sum((i + 1) * b for i, b in enumerate(raw)) + offset) % 256 for offset in (47, 113, 191))

payload = json.loads(system_payload_json)
algorithms = {
    "fcfs": FCFSAlgorithm,
    "spt": SPTAlgorithm,
    "edd": EDDAlgorithm,
    "wspt": WSPTAlgorithm,
}

try:
    system = System()
    for wc in payload["workcenters"]:
        machines = [Machine(m["name"], m["release"], m["status"]) for m in wc["machines"]]
        system.add_workcenter(Workcenter(
            wc["name"], wc["release"], wc["status"], machines, stable_rgb(wc["name"])
        ))
    for job in payload["jobs"]:
        operations = [Operation(op["workcenter"], op["processing_time"], op["status"]) for op in job["operations"]]
        rgb = tuple(job["rgb"]) if job["rgb"] is not None else stable_rgb(job["job_id"])
        system.add_job(Job(job["job_id"], job["release"], job["due"], job["weight"], operations, rgb))

    system.validate()
    algorithm_class = algorithms[algorithm_id]
    algorithm = algorithm_class()
    schedule = algorithm.schedule(system)
    result = {
        "kind": "completed",
        "schedule": schedule.to_dict(),
        "lekinpyVersion": lekinpy.__version__,
        "algorithmVersion": algorithm.metadata["version"],
    }
except LekinValidationError as exc:
    result = {"kind": "validation-error", "exception": type(exc).__name__, "message": str(exc)}
except Exception as exc:
    result = {"kind": "error", "message": f"{type(exc).__name__}: {exc}"}

json.dumps(result)
`;

let runtimePromise: Promise<PyodideInterface> | null = null;

function post(message: WorkerResponse) {
  self.postMessage(message);
}

function progress(executionId: string, stage: ExecutionProgress) {
  post({ type: "progress", executionId, stage });
}

function getRuntime(executionId: string): Promise<PyodideInterface> {
  if (runtimePromise) return runtimePromise;
  runtimePromise = (async () => {
    progress(executionId, "loading-runtime");
    const runtime = await loadPyodide({ indexURL: PYODIDE_INDEX_URL });
    progress(executionId, "verifying-wheel");
    await verifyWheel();
    progress(executionId, "installing-wheel");
    await runtime.loadPackage("micropip");
    const micropip = runtime.pyimport("micropip");
    try {
      const wheelUrl = new URL(LEKINPY_WHEEL_PATH, self.location.origin).href;
      await micropip.install(wheelUrl, { deps: false });
    } finally {
      micropip.destroy();
    }
    return runtime;
  })().catch((error) => {
    runtimePromise = null;
    throw error;
  });
  return runtimePromise;
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (request.type !== "execute") return;

  try {
    const runtime = await getRuntime(request.executionId);
    progress(request.executionId, "running");
    runtime.globals.set("system_payload_json", JSON.stringify(request.system));
    runtime.globals.set("algorithm_id", request.algorithmId);
    try {
      const raw = await runtime.runPythonAsync(PYTHON_EXECUTE);
      const result = JSON.parse(String(raw)) as {
        kind: "completed" | "validation-error" | "error";
        schedule?: LekinpyScheduleDict;
        lekinpyVersion?: string;
        algorithmVersion?: string;
        exception?: string;
        message?: string;
      };
      if (result.kind === "completed") {
        post({
          type: "completed",
          executionId: request.executionId,
          schedule: result.schedule!,
          lekinpyVersion: result.lekinpyVersion!,
          algorithmVersion: result.algorithmVersion!,
        });
      } else if (result.kind === "validation-error") {
        const code = VALIDATION_CODE_BY_EXCEPTION[result.exception ?? ""] ?? "INVALID_NUMERIC_VALUE";
        post({
          type: "validation-error",
          executionId: request.executionId,
          code,
          message: result.message ?? "lekinpy rejected the problem.",
        });
      } else {
        post({ type: "error", executionId: request.executionId, message: result.message ?? "Execution failed." });
      }
    } finally {
      runtime.globals.delete("system_payload_json");
      runtime.globals.delete("algorithm_id");
    }
  } catch (error) {
    post({
      type: "error",
      executionId: request.executionId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

export {};
