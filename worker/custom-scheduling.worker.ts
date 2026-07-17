/// <reference lib="webworker" />

import { loadPyodide, type PyodideInterface } from "pyodide";
import type {
  CustomWorkerRequest,
  CustomWorkerResponse,
  CustomWorkerProgressStage,
  CustomWorkerValidationIssue,
} from "./custom-scheduling-protocol";
import type { ValidationErrorCode } from "../lib/schema/codes";
import type { LekinpyScheduleDict } from "../lib/adapter/translate";
import { LEKINPY_WHEEL_PATH, verifyWheel } from "./wheel-integrity";

/**
 * The disposable custom-algorithm worker. One instance handles exactly one
 * request (a "validate" or a "run"), then the caller (CustomAlgorithmEngine
 * in app/execution/custom-execution-engine.ts) terminates it. This worker
 * never processes a second request - see docs/CUSTOM_PYTHON_ALGORITHMS.md
 * "Worker isolation and lifecycle" for why disposability, not message-queue
 * reuse, is the isolation boundary here.
 */

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

function post(message: CustomWorkerResponse) {
  self.postMessage(message);
}

function progress(runId: string, stage: CustomWorkerProgressStage) {
  post({ type: "progress", runId, stage });
}

/**
 * Static AST-only signature/entrypoint/syntax check - no exec(), and
 * crucially no lekinpy import, so "validate" never needs the wheel loaded.
 * See docs/CUSTOM_PYTHON_ALGORITHMS.md for why this is deliberately static
 * (running arbitrary top-level code just to validate it would require
 * lekinpy to already be installed, defeating the fast validate-without-
 * wheel path, and would execute code the user hasn't asked to run yet).
 */
const VALIDATE_PYTHON = String.raw`
import ast
import json

issues = []

def _issue(code, message, line=None, column=None):
    entry = {"code": code, "message": message}
    if line is not None:
        entry["line"] = line
    if column is not None:
        entry["column"] = column
    issues.append(entry)

def _accepts_three_positional(args: ast.arguments) -> bool:
    # A keyword-only parameter without a default makes schedule(a, b, c)
    # uncallable no matter how the positional parameters line up - the
    # runtime signature.bind() check would reject it, so validate must too.
    if any(default is None for default in (args.kw_defaults or [])):
        return False
    posonly = len(getattr(args, "posonlyargs", []) or [])
    normal = len(args.args)
    total_positional = posonly + normal
    has_vararg = args.vararg is not None
    defaults = len(args.defaults)
    min_required = total_positional - defaults
    if has_vararg:
        return min_required <= 3
    return min_required <= 3 <= total_positional

tree = None
try:
    tree = ast.parse(custom_source, filename="<custom-algorithm>")
except SyntaxError as exc:
    _issue(
        "CUSTOM_ALGORITHM_SYNTAX_ERROR",
        f"{exc.msg} (line {exc.lineno}, column {(exc.offset or 0)})",
        exc.lineno,
        exc.offset,
    )

if tree is not None:
    entrypoint = None
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == "schedule":
            entrypoint = node
            # Keep scanning - a later top-level 'def schedule' shadows an
            # earlier one at runtime, so the LAST one is what actually runs.

    if entrypoint is None:
        _issue(
            "CUSTOM_ALGORITHM_MISSING_ENTRYPOINT",
            "No top-level 'def schedule(...)' function was found. Define def schedule(system, parameters, context): ...",
        )
    elif not _accepts_three_positional(entrypoint.args):
        _issue(
            "CUSTOM_ALGORITHM_INVALID_SIGNATURE",
            "schedule(...) must accept exactly three positional arguments: (system, parameters, context).",
            entrypoint.lineno,
        )

json.dumps({"valid": len(issues) == 0, "issues": issues})
`;

let runtimePromise: Promise<PyodideInterface> | null = null;

function getRuntime(runId: string): Promise<PyodideInterface> {
  if (runtimePromise) return runtimePromise;
  runtimePromise = (async () => {
    progress(runId, "loading-runtime");
    return await loadPyodide({ indexURL: PYODIDE_INDEX_URL });
  })().catch((error) => {
    runtimePromise = null;
    throw error;
  });
  return runtimePromise;
}

async function installLekinpy(runtime: PyodideInterface, runId: string): Promise<void> {
  progress(runId, "verifying-wheel");
  await verifyWheel();
  progress(runId, "installing-wheel");
  await runtime.loadPackage("micropip");
  const micropip = runtime.pyimport("micropip");
  try {
    const wheelUrl = new URL(LEKINPY_WHEEL_PATH, self.location.origin).href;
    await micropip.install(wheelUrl, { deps: false });
  } finally {
    micropip.destroy();
  }
}

const RUN_PYTHON = String.raw`
import asyncio
import contextlib
import importlib.util
import inspect
import json
import shutil
import sys
import time
import traceback

import lekinpy
from lekinpy.system import System
from lekinpy.job import Job, Operation
from lekinpy.machine import Machine, Workcenter
from lekinpy.exceptions import LekinValidationError

# Best-effort removal of micropip before any user code runs: it was only
# ever needed to install the pinned lekinpy wheel (see installLekinpy in
# this worker), and leaving it importable would let an 'async def schedule'
# await micropip.install(...) for arbitrary PyPI packages. Removing both
# the installed files and the sys.modules entries makes 'import micropip'
# raise ImportError. This is a robustness/policy measure, NOT a security
# boundary - Pyodide's JS interop (the 'js' and 'pyodide_js' modules)
# remains reachable, as docs/CUSTOM_PYTHON_ALGORITHMS.md section 8 states.
_micropip_spec = importlib.util.find_spec("micropip")
if _micropip_spec is not None and _micropip_spec.submodule_search_locations:
    for _loc in list(_micropip_spec.submodule_search_locations):
        shutil.rmtree(_loc, ignore_errors=True)
for _name in [m for m in list(sys.modules) if m == "micropip" or m.startswith("micropip.")]:
    del sys.modules[_name]


def _stable_rgb(value):
    raw = value.encode("utf-8")
    return tuple((sum((i + 1) * b for i, b in enumerate(raw)) + offset) % 256 for offset in (47, 113, 191))


class _BoundedWriter:
    """A file-like sink that stops accumulating past 'limit' characters
    instead of growing without bound, per the execution policy's captured-
    output cap. Still reports every write's length (as real file objects
    must), it just stops retaining the bytes once the cap is hit."""

    def __init__(self, limit):
        self.limit = limit
        self._parts = []
        self._length = 0
        self.truncated = False

    def write(self, s):
        if not self.truncated:
            remaining = self.limit - self._length
            if remaining <= 0:
                self.truncated = True
            elif len(s) > remaining:
                self._parts.append(s[:remaining])
                self._length = self.limit
                self.truncated = True
            else:
                self._parts.append(s)
                self._length += len(s)
        return len(s)

    def flush(self):
        return None

    def getvalue(self):
        return "".join(self._parts)


class ExecutionContext:
    """The context argument passed to a custom schedule(system, parameters,
    context) function. See docs/CUSTOM_PYTHON_ALGORITHMS.md for the exact
    contract and the documented cancellation deviation: should_stop()/
    time_remaining() are wall-clock deadline based only. There is no live
    mid-loop signal for an externally-requested cancellation while this
    function is running synchronously - Pyodide's single JS thread cannot
    process the postMessage that would carry that signal until control
    returns to the event loop, which a tight synchronous Python loop never
    does. A user-requested cancel is instead delivered as hard Worker
    termination (see CustomAlgorithmEngine.cancelCustomAlgorithm), which
    works regardless of whether this function cooperates."""

    def __init__(self, deadline_monotonic, report_progress_js, report_incumbent_js, schedule_class):
        self._deadline = deadline_monotonic
        self._report_progress_js = report_progress_js
        self._report_incumbent_js = report_incumbent_js
        self._schedule_class = schedule_class

    def time_remaining(self):
        return max(0.0, self._deadline - time.monotonic())

    def should_stop(self):
        return self.time_remaining() <= 0.0

    @staticmethod
    def _coerce_message(message, limit=2000):
        # Coerced to a bounded str before crossing into JS: a non-str
        # message (dict, list, arbitrary object) would otherwise cross the
        # Pyodide FFI as a PyProxy and fail postMessage's structured clone,
        # and an unbounded str would defeat the policy's per-run output
        # bounding.
        if message is None:
            return None
        return str(message)[:limit]

    def report_progress(self, progress, message=None):
        try:
            p = float(progress)
        except (TypeError, ValueError):
            raise TypeError("report_progress(progress=...) must be a number") from None
        p = min(1.0, max(0.0, p))
        self._report_progress_js(p, self._coerce_message(message))

    def report_incumbent(self, schedule, objective=None, message=None):
        if not isinstance(schedule, self._schedule_class):
            raise TypeError("report_incumbent(schedule=...) must be a real lekinpy.Schedule instance")
        obj = float(objective) if objective is not None else None
        self._report_incumbent_js(json.dumps(schedule.to_dict()), obj, self._coerce_message(message))


def _fail(code, message, traceback_text, stdout_writer, stderr_writer):
    return {
        "kind": "custom-error",
        "code": code,
        "message": message,
        "traceback": traceback_text,
        "stdout": stdout_writer.getvalue(),
        "stdout_truncated": stdout_writer.truncated,
        "stderr": stderr_writer.getvalue(),
        "stderr_truncated": stderr_writer.truncated,
    }


async def _run():
    # The budget starts NOW - aligned (as closely as possible) with the JS
    # hard-kill timer, which arms when the "running" stage was posted just
    # before this script started. Computing it here rather than after the
    # user's top-level code executes means a script that burns seconds at
    # import time cannot be promised more time by should_stop()/
    # time_remaining() than the JS timer will actually allow.
    deadline = time.monotonic() + time_limit_seconds
    stdout_writer = _BoundedWriter(max_stdout_chars)
    stderr_writer = _BoundedWriter(max_stderr_chars)

    try:
        payload = json.loads(system_payload_json)
        system = System()
        for wc in payload["workcenters"]:
            machines = [Machine(m["name"], m["release"], m["status"]) for m in wc["machines"]]
            system.add_workcenter(
                Workcenter(wc["name"], wc["release"], wc["status"], machines, _stable_rgb(wc["name"]))
            )
        for job in payload["jobs"]:
            operations = [Operation(op["workcenter"], op["processing_time"], op["status"]) for op in job["operations"]]
            rgb = tuple(job["rgb"]) if job["rgb"] is not None else _stable_rgb(job["job_id"])
            system.add_job(Job(job["job_id"], job["release"], job["due"], job["weight"], operations, rgb))
        system.validate()
    except LekinValidationError as exc:
        return {"kind": "problem-invalid", "exception": type(exc).__name__, "message": str(exc)}
    except Exception as exc:
        return {"kind": "error", "message": f"Failed to construct the problem: {type(exc).__name__}: {exc}"}

    if random_seed_json != "null":
        try:
            import random

            random.seed(json.loads(random_seed_json))
        except Exception:
            pass

    try:
        compiled = compile(custom_source, "<custom-algorithm>", "exec")
    except SyntaxError as exc:
        return _fail(
            "CUSTOM_ALGORITHM_SYNTAX_ERROR",
            f"{exc.msg} (line {exc.lineno}, column {(exc.offset or 0)})",
            None,
            stdout_writer,
            stderr_writer,
        )

    namespace = {"__name__": "__custom_algorithm__"}
    try:
        with contextlib.redirect_stdout(stdout_writer), contextlib.redirect_stderr(stderr_writer):
            exec(compiled, namespace)
    except Exception as exc:
        return _fail(
            "CUSTOM_ALGORITHM_RUNTIME_ERROR",
            f"Error while loading your script: {type(exc).__name__}: {exc}",
            traceback.format_exc(),
            stdout_writer,
            stderr_writer,
        )

    fn = namespace.get("schedule")
    if fn is None or not callable(fn):
        return _fail(
            "CUSTOM_ALGORITHM_MISSING_ENTRYPOINT",
            "No callable 'schedule' function was found. Define def schedule(system, parameters, context): ...",
            None,
            stdout_writer,
            stderr_writer,
        )

    try:
        inspect.signature(fn).bind(None, None, None)
    except TypeError as exc:
        return _fail(
            "CUSTOM_ALGORITHM_INVALID_SIGNATURE",
            f"schedule{inspect.signature(fn)} cannot be called as schedule(system, parameters, context): {exc}",
            None,
            stdout_writer,
            stderr_writer,
        )

    parameters = json.loads(parameters_json)
    context = ExecutionContext(deadline, _report_progress_js, _report_incumbent_js, lekinpy.Schedule)

    try:
        with contextlib.redirect_stdout(stdout_writer), contextlib.redirect_stderr(stderr_writer):
            if inspect.iscoroutinefunction(fn):
                schedule_result = await fn(system, parameters, context)
            else:
                schedule_result = fn(system, parameters, context)
    except Exception as exc:
        return _fail(
            "CUSTOM_ALGORITHM_RUNTIME_ERROR",
            f"{type(exc).__name__}: {exc}",
            traceback.format_exc(),
            stdout_writer,
            stderr_writer,
        )

    if not isinstance(schedule_result, lekinpy.Schedule):
        got = type(schedule_result).__name__
        return _fail(
            "CUSTOM_ALGORITHM_INVALID_RESULT",
            f"schedule(...) must return a lekinpy.Schedule instance, got {got}.",
            None,
            stdout_writer,
            stderr_writer,
        )

    return {
        "kind": "completed",
        "schedule": schedule_result.to_dict(),
        "lekinpy_version": lekinpy.__version__,
        "stdout": stdout_writer.getvalue(),
        "stdout_truncated": stdout_writer.truncated,
        "stderr": stderr_writer.getvalue(),
        "stderr_truncated": stderr_writer.truncated,
    }


_final_result = await _run()
json.dumps(_final_result)
`;

self.onmessage = async (event: MessageEvent<CustomWorkerRequest>) => {
  const request = event.data;
  const runId = request.runId;

  try {
    const runtime = await getRuntime(runId);

    if (request.type === "validate") {
      runtime.globals.set("custom_source", request.source);
      try {
        const raw = await runtime.runPythonAsync(VALIDATE_PYTHON);
        const parsed = JSON.parse(String(raw)) as { valid: boolean; issues: CustomWorkerValidationIssue[] };
        post({ type: "validated", runId, valid: parsed.valid, issues: parsed.issues });
      } finally {
        runtime.globals.delete("custom_source");
      }
      return;
    }

    // request.type === "run"
    await installLekinpy(runtime, runId);
    progress(runId, "running");

    let droppedProgressMessages = 0;
    let droppedIncumbentUpdates = 0;
    let progressCount = 0;
    let incumbentCount = 0;

    runtime.globals.set("custom_source", request.source);
    runtime.globals.set("system_payload_json", JSON.stringify(request.system));
    runtime.globals.set("parameters_json", request.parametersJson);
    runtime.globals.set("random_seed_json", request.randomSeedJson);
    runtime.globals.set("time_limit_seconds", request.timeLimitMs / 1000);
    runtime.globals.set("max_stdout_chars", request.maxStdoutChars);
    runtime.globals.set("max_stderr_chars", request.maxStderrChars);
    runtime.globals.set("_report_progress_js", (progressValue: number, message: string | null | undefined) => {
      progressCount += 1;
      if (progressCount > request.maxProgressMessages) {
        droppedProgressMessages += 1;
        return;
      }
      post({ type: "custom-progress", runId, progress: progressValue, message: message ?? null });
    });
    runtime.globals.set(
      "_report_incumbent_js",
      (scheduleJson: string, objective: number | null | undefined, message: string | null | undefined) => {
        incumbentCount += 1;
        if (incumbentCount > request.maxIncumbentUpdates) {
          droppedIncumbentUpdates += 1;
          return;
        }
        post({
          type: "custom-incumbent",
          runId,
          scheduleDict: JSON.parse(scheduleJson),
          objective: objective ?? null,
          message: message ?? null,
        });
      },
    );

    try {
      const raw = await runtime.runPythonAsync(RUN_PYTHON);
      const result = JSON.parse(String(raw)) as {
        kind: "completed" | "problem-invalid" | "custom-error" | "error";
        schedule?: LekinpyScheduleDict;
        lekinpy_version?: string;
        stdout?: string;
        stdout_truncated?: boolean;
        stderr?: string;
        stderr_truncated?: boolean;
        exception?: string;
        message?: string;
        code?: ValidationErrorCode;
        traceback?: string | null;
      };

      if (result.kind === "completed") {
        post({
          type: "completed",
          runId,
          scheduleDict: result.schedule!,
          lekinpyVersion: result.lekinpy_version!,
          stdout: result.stdout ?? "",
          stdoutTruncated: result.stdout_truncated ?? false,
          stderr: result.stderr ?? "",
          stderrTruncated: result.stderr_truncated ?? false,
          droppedProgressMessages,
          droppedIncumbentUpdates,
        });
      } else if (result.kind === "problem-invalid") {
        const code = VALIDATION_CODE_BY_EXCEPTION[result.exception ?? ""] ?? "INVALID_NUMERIC_VALUE";
        post({ type: "problem-invalid", runId, code, message: result.message ?? "lekinpy rejected the problem." });
      } else if (result.kind === "custom-error") {
        post({
          type: "custom-error",
          runId,
          code: result.code ?? "CUSTOM_ALGORITHM_RUNTIME_ERROR",
          message: result.message ?? "The custom algorithm failed.",
          traceback: result.traceback ?? null,
          stdout: result.stdout ?? "",
          stdoutTruncated: result.stdout_truncated ?? false,
          stderr: result.stderr ?? "",
          stderrTruncated: result.stderr_truncated ?? false,
          droppedProgressMessages,
          droppedIncumbentUpdates,
        });
      } else {
        post({ type: "error", runId, message: result.message ?? "Execution failed." });
      }
    } finally {
      runtime.globals.delete("custom_source");
      runtime.globals.delete("system_payload_json");
      runtime.globals.delete("parameters_json");
      runtime.globals.delete("random_seed_json");
      runtime.globals.delete("time_limit_seconds");
      runtime.globals.delete("max_stdout_chars");
      runtime.globals.delete("max_stderr_chars");
      runtime.globals.delete("_report_progress_js");
      runtime.globals.delete("_report_incumbent_js");
    }
  } catch (error) {
    post({ type: "error", runId, message: error instanceof Error ? error.message : String(error) });
  }
};

export {};
