# Custom Python algorithms

This document describes the `schedule(system, parameters, context)` contract
for user-authored scheduling algorithms, the execution model behind it, and
its current limitations. It is the reference for anyone writing a custom
algorithm, and for whoever builds the visual editor and run UI on top of the
API in `app/execution/custom-execution-engine.ts`.

LEKIN Lab includes a visual Algorithm Studio with Python syntax highlighting,
starter examples, an inspector for the current problem input, contract
validation, execution controls, captured output, and result integration with
the Gantt chart and performance views. `CustomAlgorithmEngine` remains the
browser-side execution boundary behind that interface.

---

## 1. The `schedule(system, parameters, context)` contract

```python
def schedule(system, parameters, context):
    # your scheduling logic
    return schedule
```

- **`system`** - a real, validated `lekinpy.System` built from the current
  problem. It has already passed `system.validate()` before your function is
  called, so you can rely on every job referencing a real workcenter, every
  operation having a positive processing time, and no duplicate ids.
- **`parameters`** - a plain Python `dict` of JSON-serializable values you (or
  the caller) provided. Empty `{}` if none were supplied. Never assume a key
  is present - use `.get(...)` with a default, as the example algorithms do.
- **`context`** - see §3 below.
- **Return value** - a real `lekinpy.Schedule` instance (see §2). Anything
  else is rejected with `CUSTOM_ALGORITHM_INVALID_RESULT`.

Your function must be named exactly `schedule` and defined at the top level
of your script (not nested inside another function or class). It must accept
exactly three positional arguments - `def schedule(system, parameters,
context):` or an equivalent signature such as `def schedule(a, b, c=None):`
(extra required positional parameters beyond three, or fewer than three,
fail validation). It may be a normal `def` or an `async def` - see §4.

The available `lekinpy` objects (`System`, `Job`, `Operation`, `Machine`,
`Workcenter`, `Schedule`, `MachineSchedule`, `ScheduledOperation`) are
importable with `from lekinpy import ...`, exactly like any other Python
script using the library. There is nothing web-specific to learn: you never
see JSON, camelCase field names, React, TypeScript, Web Workers, or Pyodide
messaging - all of that lives entirely outside your function.

## 2. Beginner job-selection rules and valid return values

For the shortest path to a working custom rule, subclass
`SchedulingAlgorithm` and use its existing `dynamic_schedule()` engine. Your
only scheduling decision is a function that receives the jobs released at the
current dispatch time and returns one of them:

```python
from lekinpy.algorithms import SchedulingAlgorithm
from lekinpy.schedule import Schedule


class MyRule(SchedulingAlgorithm):
    metadata = {
        "id": "my-rule",
        "display_name": "My Rule",
        "supports_multi_operation": True,
        "version": "1.0.0",
    }

    def schedule(self, system):
        def pick(available_jobs):
            return min(
                available_jobs,
                key=lambda job: (job.due, job.job_id),
            )

        total_time, machines = self.dynamic_schedule(system, pick)
        return Schedule("My Rule", total_time, machines)


def schedule(system, parameters, context):
    return MyRule().schedule(system)
```

`dynamic_schedule()` automatically validates the system, tracks release times
and machine availability, finds machines in each operation's workcenter,
respects operation precedence, computes start/end times, builds every
`ScheduledOperation` and `MachineSchedule`, and returns the total time plus
machine schedules. The top-level three-argument function is the browser
entrypoint and returns the completed `Schedule`.

This is deliberately a **job-level** dispatcher, matching the built-in SPT,
EDD, and WSPT algorithms. Once `pick()` returns a job, every operation of that
job is scheduled in order before `pick()` is called again. It is not an
operation-level interleaving engine.

The Algorithm Studio includes beginner starters for SPT, EDD, WSPT, a custom
composite tuple rule, and a blank job-rule scaffold that leaves only
`pick(available_jobs)` to implement. Its input inspector shows the actual
current jobs, operations, workcenters, machines, snake_case Python attributes,
and the JSON-shaped construction payload. A separate blank full-scheduler
template is available for advanced algorithms that construct every schedule
record directly.

### Building a complete schedule manually

Advanced algorithms that do not fit `dynamic_schedule()` still use the full
contract. There is no "return a plain dict/list and we'll figure it out." They
build and return a real `lekinpy.Schedule`:

```python
from lekinpy import Schedule, MachineSchedule, ScheduledOperation

ScheduledOperation(
    job_id="J1", operation_index=0, workcenter="WC1", machine="M1",
    start_time=0, end_time=5, sequence_position=0, status="pending",
)
MachineSchedule(workcenter="WC1", machine="M1", operations=[...])
Schedule(schedule_type="MY_ALGORITHM", time=total_time, machines=[...])
```

This is the exact same `Schedule`/`MachineSchedule`/`ScheduledOperation`
shape `lekinpy`'s own built-in `FCFSAlgorithm`/`SPTAlgorithm`/etc. produce.
See `examples/custom-algorithms/03_bounded_iterative_improvement.py` for an
advanced example that constructs candidate schedules directly.

**Reconciliation note**: earlier drafts of this feature considered inventing
a simpler custom return shape (e.g. a plain list of `(job_id, machine_id,
start, end)` tuples) to lower the barrier further. That was rejected: it
would require a second, parallel translation path, and `lekinpy`'s own
`Schedule` constructor is not actually hard to use directly, as the examples
show. Returning a real `lekinpy.Schedule` is the final contract.

**Never trusted merely for being the right type.** After your function
returns, LEKIN:

1. Confirms Python-side that the result actually is a `lekinpy.Schedule`
   instance (`CUSTOM_ALGORITHM_INVALID_RESULT` if not).
2. Translates it through the same trusted `fromLekinpyScheduleDict()` used
   for built-in algorithms.
3. Independently re-validates it from scratch against the problem
   (`lib/scheduling/validate-schedule.ts`) - every operation appears exactly
   once, no unknown job/operation/machine/workcenter, durations match,
   machine/workcenter eligibility is respected, job precedence is respected,
   no machine double-booking, release times are respected, every time is
   finite/nonnegative with start before end. See
   `examples/custom-algorithms/02_deliberately_invalid.py` for a real
   `Schedule` object that still gets rejected at this step, with a specific
   explanation naming the missing operations - not a generic failure.
4. Recomputes metrics (makespan, tardiness, etc.) with LEKIN's own trusted
   code - your algorithm's internal bookkeeping (if any) is never used for
   the metrics shown to a caller.

Only after all four steps does a run report `status: "completed"`.

## 3. The `context` object

```python
context.should_stop() -> bool
context.time_remaining() -> float   # seconds
context.report_progress(progress, message=None)
context.report_incumbent(schedule, objective=None, message=None)
```

- **`should_stop()`** - `True` once the run's time budget has been used up.
  Poll this in any loop that could run for a while, and return your best
  schedule so far when it flips.
- **`time_remaining()`** - seconds left in the current run's time budget
  (never negative).
- **`report_progress(progress, message=None)`** - `progress` is clamped to
  `[0, 1]`; `message` is an optional short human-readable string (coerced
  with `str()` and truncated to 2,000 characters before delivery, as is
  `report_incumbent`'s `message`). Delivered
  in order, but capped at a fixed count per run (`maxProgressMessages` in
  `lib/custom-algorithm/policy.ts`) - calls beyond the cap are silently
  dropped, not queued or erroring, so a tight loop calling this every
  iteration cannot flood the caller. Call it periodically, not on every
  iteration of a hot loop (see `03_bounded_iterative_improvement.py`).
- **`report_incumbent(schedule, objective=None, message=None)`** - `schedule`
  must be a real `lekinpy.Schedule`, the same as your final return value
  (`TypeError` if not). Every incumbent is independently validated exactly
  like the final result (§2, step 3) before it is ever exposed to a caller -
  an incumbent that fails validation is silently dropped (not surfaced, and
  does not fail the run), and is counted in the returned result's
  `diagnostics.invalidIncumbentUpdates`. Also capped per run
  (`maxIncumbentUpdates`).

### Important, precise limitation: `should_stop()` is deadline-based only

`should_stop()` and `time_remaining()` reflect **only the wall-clock time
budget**, computed once when your function starts. There is no live signal
for an externally-requested cancellation (a user clicking "Cancel" before
the deadline) that a currently-running, purely-synchronous `schedule(...)`
call can observe mid-loop.

This is a real constraint of the execution model, not an oversight:
`schedule(...)` runs inside a Web Worker via Pyodide, which is
single-threaded. While your Python code is executing synchronously, that
worker's JS thread cannot process any incoming message (including a
"cancel" request) - it only gets a chance to once your function returns
control to the caller. There is no workaround for this without
`SharedArrayBuffer` + `Atomics`, which requires cross-origin-isolation
(`COOP`/`COEP`) headers this deployment does not currently set. That is a
real option for a future milestone, not implemented here.

**What this means in practice:**

- If your algorithm finishes within its time budget, cancellation never
  matters.
- If your algorithm loops and checks `should_stop()`/`time_remaining()`
  periodically, it will stop itself cleanly once the time budget is used up
  - this is genuine, working, cooperative time-boxing.
- If a caller explicitly cancels a run (`cancelCustomAlgorithm(runId)`)
  before your algorithm decides to stop on its own, or your algorithm never
  checks `should_stop()` at all and runs past its time limit, LEKIN falls
  back to **hard termination**: the entire disposable Worker (and the
  Python interpreter inside it) is killed outright
  (`Worker.terminate()`). This works instantly regardless of what your code
  is doing - even a `while True: pass` loop that never calls `should_stop()`
  - because it does not depend on your code cooperating at all. The run then
  reports `status: "cancelled"` (user-initiated) or `status: "timed_out"`
  (deadline exceeded), never leaves a stuck run behind, and never blocks a
  later run.
- **Advanced**: if you define `async def schedule(...)` and periodically
  `await asyncio.sleep(0)` inside your loop, that specific yield point does
  let the worker's event loop process a pending cancellation signal before
  resuming your coroutine - real, live cooperative cancellation, not just
  deadline-based. This is an optional, more advanced technique; the
  synchronous contract above is the primary, beginner-friendly path and
  needs none of this.

## 4. Timeouts and cancellation, precisely

- Every run has a time limit (`limits.timeLimitMs` in `runCustomAlgorithm`,
  defaulting to `defaultTimeLimitMs` and capped at `maxTimeLimitMs` -
  `lib/custom-algorithm/policy.ts`).
- A run that does not report completion within roughly that time limit (plus
  a small fixed grace window, so a cooperating algorithm returning right at
  the deadline isn't unfairly raced against the hard kill) is terminated and
  reported as `status: "timed_out"`.
- The time limit deliberately excludes environment startup (Pyodide
  download/boot + wheel verify/install): the hard-kill timer only starts
  once the "running" stage is reached. Startup itself is separately bounded
  by `environmentStartupTimeoutMs` (policy, default 60 s) - if Pyodide never
  finishes booting (e.g. an unreachable CDN that hangs rather than fails),
  the run settles as `status: "runtime_failed"` instead of staying pending
  forever. The same startup bound applies to `validateCustomAlgorithm`.
- `cancelCustomAlgorithm(runId)` terminates the run's Worker immediately and
  reports `status: "cancelled"`. This does not wait for your code to
  cooperate (§3).
- Every run gets its **own, disposable Worker** - a fresh Pyodide instance,
  fresh Python interpreter state, fresh `lekinpy` install, every time. It is
  terminated the moment the run settles, success or failure. Two runs never
  share Python globals, a monkeypatch in one run cannot affect another, and
  a crashed or hung custom run cannot contaminate a later built-in algorithm
  run (which uses an entirely separate, trusted, long-lived worker - see
  `worker/scheduling.worker.ts` vs. `worker/custom-scheduling.worker.ts`).

## 5. How errors appear

A run never throws from the caller's perspective - `runCustomAlgorithm(...)`
always resolves to a `CustomRunResult` with a specific `status`:

| status | meaning |
|---|---|
| `completed` | Ran, returned a feasible `Schedule`, `result` is populated. |
| `cancelled` | `cancelCustomAlgorithm` was called before completion. |
| `timed_out` | Exceeded its time limit and was terminated. |
| `validation_failed` | Source, parameters, limits, or the problem itself failed validation before (or, rarely, during) execution - nothing ran, or execution was aborted before your code's result mattered. |
| `runtime_failed` | Your code raised an exception, or the worker itself crashed. |
| `invalid_result` | Your code returned something that isn't a real `Schedule`, or returned a real `Schedule` that failed independent feasibility validation. |

`issues: ValidationIssue[]` gives structured, stable-coded explanations
(`CUSTOM_ALGORITHM_SYNTAX_ERROR`, `CUSTOM_ALGORITHM_MISSING_ENTRYPOINT`,
`CUSTOM_ALGORITHM_INVALID_SIGNATURE`, `CUSTOM_ALGORITHM_SOURCE_TOO_LARGE`,
`CUSTOM_ALGORITHM_PARAMETERS_NOT_SERIALIZABLE`,
`CUSTOM_ALGORITHM_LIMITS_EXCEED_POLICY`, `CUSTOM_ALGORITHM_RUNTIME_ERROR`,
`CUSTOM_ALGORITHM_INVALID_RESULT`, `CUSTOM_ALGORITHM_TIMEOUT`, plus the
`SCHEDULE_*` codes from independent feasibility validation - see
`lib/schema/codes.ts`). A runtime exception's `message` is a concise,
human-readable summary (`f"{type(exc).__name__}: {exc}"`), never a raw
traceback dump - the full Python traceback is preserved separately in
`diagnostics.traceback` for advanced debugging, not thrown away, just not
the primary user-facing string.

`stdout`/`stderr` are captured (see §7) and always included, whatever the
outcome, so `print(...)` debugging works even in a failed run.

## 6. Reproducibility

Every result carries a `reproducibility` block:

```ts
{
  algorithmName: string;          // caller-supplied label, "Custom algorithm" by default
  sourceChecksum: string;         // sha256 of your source, hex
  lekinpyVersion: string;         // pinned lekinpy build used, e.g. "0.2.0"
  schemaVersion: string;          // web schema version, "1.0.0"
  parameters: Record<string, unknown>;
  randomSeed: number | string | null;
  timeLimitMs: number;
}
```

If you pass `randomSeed` to `runCustomAlgorithm`, LEKIN calls
`random.seed(randomSeed)` (Python's standard `random` module) before your
`schedule(...)` runs. This does **not** seed `numpy` or any other RNG - none
are preloaded in this milestone (see §8). If your algorithm uses only
`random`, the same seed against the same problem and source reproduces the
same result.

Custom source is **not** persisted automatically with a project. The Algorithm
Studio keeps it for the current workspace session and provides explicit
`.py` import and download actions.

## 7. Captured output

`print(...)` and anything written to `stderr` is captured and returned as
`stdout`/`stderr` strings, bounded (`maxStdoutChars`/`maxStderrChars` in the
policy) to prevent unbounded memory growth from a runaway loop. Once the cap
is hit, further output for that stream is silently discarded and
`stdoutTruncated`/`stderrTruncated` is set `true` - the captured prefix is
never corrupted or garbled, just cut off.

## 8. Security posture - read this before treating custom code as sandboxed

**A Web Worker is not a complete security sandbox, and this milestone does
not claim it is.** Custom Python submitted here is treated as **explicitly
trusted, local code** - the same trust level as a script you'd run in your
own local Python REPL - not as isolated untrusted code from a stranger. This
matches `PRODUCT_SPEC.md` §27's phased security model: this is still phase
"(1) approved built-in algorithms" plus a *trusted local authoring* path,
not yet "(3) untrusted uploaded algorithms," which explicitly still requires
containers, CPU/memory limits, disabled network access, and audit logs -
none of that exists here and none of it is implied.

Concretely:

- **Execution never happens automatically.** Importing, pasting, or loading
  source text does nothing by itself. The Algorithm Studio requires explicit
  trust acknowledgement and a Run action before calling
  `runCustomAlgorithm(...)`.
- **No supported package installation.** The worker installs only the
  pinned `lekinpy` wheel (`deps: false`, no dependency resolution) - see
  `worker/custom-scheduling.worker.ts`. `micropip` (which the worker itself
  uses for that one install) is then actively removed from the interpreter
  before any custom code runs, so `import micropip` raises `ImportError`.
  Only Python's standard library (whatever Pyodide's base CPython build
  includes) plus `lekinpy` are available. `import numpy`, `import requests`,
  or any other third-party package will fail with an `ImportError`,
  surfaced as `CUSTOM_ALGORITHM_RUNTIME_ERROR` - not silently downloaded.
  Note the removal is a policy/robustness measure, not a security boundary:
  Pyodide's JS interop (`js`, `pyodide_js` - the latter including
  `loadPackage`) remains reachable by determined code, per the last bullet
  below.
- **Syntax/signature checks are not a security boundary.** The AST-based
  checks in `validateCustomAlgorithm` (§ worker's `VALIDATE_PYTHON` script)
  confirm your code parses and has a callable `schedule` with a usable
  signature. They do **not** analyze what the code actually does, and make
  no safety claim whatsoever - a syntactically valid script can still do
  anything a trusted local Python script can do.
- **What a Worker *does* isolate**: application responsiveness (a runaway
  custom algorithm cannot freeze the rest of the page, since it runs off
  the main thread) and state (Python globals, `lekinpy` install, module
  imports - all destroyed when the disposable worker terminates, so nothing
  leaks into another run or into the trusted built-in-algorithm worker).
- **What remains true or uncertain inside a Pyodide Worker, explicitly not
  hidden**: Pyodide's JS interop means Python code *can* reach JavaScript -
  beyond the proxy functions this worker deliberately sets
  (`_report_progress_js`, `_report_incumbent_js`, and the run's input
  globals), Pyodide itself always exposes the `js` module (the Worker's
  entire global scope, including `fetch` and `postMessage`) and the
  `pyodide_js` module (including `loadPackage`) to any Python code that
  imports them. Nothing blocks those. A Worker still has `fetch`, and Pyodide's
  own JS runtime has the same network/storage access any Worker script
  does - none of that is blocked or sandboxed away. `sys.path`, in-memory
  filesystem access (Pyodide's virtual FS), and CPU/memory are effectively
  unbounded beyond the time limit in §4. None of this is exploitable by
  *this milestone's* UI (there is no untrusted-input path that reaches
  execution without an explicit, deliberate `runCustomAlgorithm` call), but
  it must not be described as a hostile-code sandbox, and isn't.

## 9. Unsupported packages and native dependencies

Only `lekinpy` and Python's standard library are available. Explicitly
**not** supported in this milestone:

- Any third-party package not already part of the pinned Pyodide build
  (no `numpy`, `pandas`, `scipy`, etc., even though some of these exist as
  Pyodide-compatible wheels in principle - none are preloaded here).
- Native/compiled extensions beyond what Pyodide's base build already
  includes.
- `micropip.install(...)` - `micropip` is removed from the interpreter
  before custom code runs; `import micropip` raises `ImportError`. (A
  policy measure, not a security boundary - see §8.)
- Filesystem access beyond Pyodide's in-memory virtual filesystem (no real
  disk, no persistence between runs).
- Network access from custom code is not deliberately provided and is not a
  supported/tested path, even though nothing currently blocks a raw
  `fetch`-equivalent at the Pyodide/JS interop layer (see §8) - do not rely
  on it.

If your algorithm needs a package that isn't available, it will fail at
`import` time with a clear `ImportError`, reported as
`CUSTOM_ALGORITHM_RUNTIME_ERROR` - not a silent partial success.

## 10. Execution policy defaults

Centralized in `lib/custom-algorithm/policy.ts`
(`DEFAULT_CUSTOM_ALGORITHM_POLICY`), reused as-is by
`CustomAlgorithmEngine`:

| limit | default | meaning |
|---|---|---|
| `maxSourceBytes` | 200,000 | Max UTF-8 size of your source. |
| `defaultTimeLimitMs` | 5,000 | Time limit when none is requested. |
| `maxTimeLimitMs` | 20,000 | Hard ceiling on a requested time limit. |
| `environmentStartupTimeoutMs` | 60,000 | Ceiling on Pyodide/wheel bootstrap before a run or validation settles as failed (see §4). |
| `maxProgressMessages` | 200 | `report_progress` calls delivered per run; excess silently dropped. |
| `maxIncumbentUpdates` | 50 | `report_incumbent` calls delivered per run; excess silently dropped. |
| `maxStdoutChars` / `maxStderrChars` | 20,000 each | Captured output cap per stream. |

Problem-size limits (`maxJobs`/`maxOperations`/`maxMachines`/
`maxWorkcenters`) reuse the existing, benchmarked
`DEFAULT_BROWSER_EXECUTION_POLICY` from `lib/adapter/policy.ts` unchanged -
see `docs/BROWSER_CAPACITY.md`. Unlike that policy, the values in this table
are conservative defaults, **not** benchmarked the same way. A disposable
per-run Pyodide worker has different cold-start cost than the trusted
long-lived one, so revisit them when custom-algorithm usage has enough real
measurements.

## 11. Examples

See `examples/custom-algorithms/`:

1. `01_minimal_spt.py` - a short beginner SPT rule using the existing
   `SchedulingAlgorithm.dynamic_schedule()` engine.
2. `02_deliberately_invalid.py` - a real `Schedule` object that still gets
   rejected by independent feasibility validation (skips each job's last
   operation).
3. `03_bounded_iterative_improvement.py` - `should_stop()`,
   `report_progress()`, and `report_incumbent()` together in a small
   randomized local-search loop.
