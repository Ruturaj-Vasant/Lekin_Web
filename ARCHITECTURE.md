# LEKIN Lab — Web Architecture (v1)

Owner: Claude, per the division of responsibility in `MASTER_PROMPT_v2.md`.
This is the schema, execution-adapter, component-boundary, and
drag-and-drop-logic contract for `lekin-web`. It does not contain UI code,
styling, or layout — that is Codex's job, built against this document plus
`PRODUCT_SPEC.md`.

**Pinned dependency**: `lekinpy` `v0.2.0` (tag `v0.2.0`, commit `adf6e07` on
`lekin-library`'s `master`). Every schema and behavior claim below was
verified by reading `lekinpy`'s actual source at that commit, not by
assuming `PRODUCT_SPEC.md`'s placeholder shapes are correct. Where they
differ, both the difference and the resolution are called out explicitly —
see §6 (Reconciliation with PRODUCT_SPEC.md).

`SCHEMA_VERSION` for everything in this document: `"1.0.0"`. This version
tracks the *web JSON contract*, and is independent of `lekinpy`'s own
package version (tracked separately, per-result, as `lekinpyVersion` — see
§1.6).

---

## 1. Shared schema

Presented as TypeScript interfaces (the recommended concrete validation
tooling is Zod — see §6.4) with an explicit note on every field: whether it
maps 1:1 to a real `lekinpy` field, or is web-derived/web-only.

### 1.1 Problem domain

```ts
interface Operation {
  operationIndex: number;        // == the operation's position in job.operations.
                                  // This IS lekinpy's actual identity for an
                                  // operation — lekinpy has no operation_id field;
                                  // base.py's _assign_single_operation identifies
                                  // an operation via job.operations.index(operation).
                                  // operationIndex must be assigned by list position
                                  // and never reordered independently of the array.
  operationId: string;           // WEB-DERIVED, never sent to lekinpy: `${jobId}-O${operationIndex}`.
                                  // Used for React keys, drag payloads, and addressing
                                  // in ManualScheduleEdit / ScheduledOperation records.
  workcenterId: string;          // == lekinpy Operation.workcenter (str).
                                  // This is the operation's REQUIRED workcenter, and
                                  // also the ENTIRE "eligible machine" concept lekinpy
                                  // has: any machine belonging to this workcenter is
                                  // eligible. There is no finer per-operation machine
                                  // whitelist/blacklist anywhere in the library.
  processingTime: number;        // == lekinpy Operation.processing_time (float).
                                  // Must be > 0 — lekinpy raises
                                  // NonPositiveProcessingTimeError at construction
                                  // otherwise; enforce the same check client-side
                                  // before ever calling into the adapter.
  status: string;                // == lekinpy Operation.status. Free-form string;
                                  // lekinpy does not constrain its values.
}

interface Job {
  jobId: string;                 // == lekinpy Job.job_id. Must be unique within a
                                  // ProblemDefinition (DuplicateJobIdError).
  release: number;                // == lekinpy Job.release
  due: number;                    // == lekinpy Job.due
  weight: number;                 // == lekinpy Job.weight
  rgb?: [number, number, number]; // == lekinpy Job.rgb. OPTIONAL AND ADVISORY:
                                  // see §1.7 — the web layer should not rely on
                                  // lekinpy's own random rgb assignment for display.
  operations: Operation[];        // Must be non-empty — lekinpy raises
                                  // EmptyOperationsError otherwise. operationIndex
                                  // for each entry == its index in this array.
}

interface Machine {
  machineId: string;              // == lekinpy Machine.name. lekinpy has no separate
                                  // id field — `name` IS the identity, and must be
                                  // globally unique across the whole problem, not just
                                  // within one workcenter (DuplicateMachineIdError).
  workcenterId: string;           // WEB-DERIVED ONLY. lekinpy's Machine class has NO
                                  // parent-workcenter field — the relationship exists
                                  // solely via containment in Workcenter.machines,
                                  // reconstructed at runtime by
                                  // SchedulingAlgorithm.prepare() into an internal
                                  // machine_workcenter_map. This field must be kept
                                  // consistent with Workcenter.machineIds (§1.1) by
                                  // the ProblemEditor — see §3.1's normalization note.
  release: number;                // == lekinpy Machine.release
  status: string;                 // == lekinpy Machine.status
}

interface Workcenter {
  workcenterId: string;           // == lekinpy Workcenter.name (name IS the id; must
                                  // be globally unique — DuplicateWorkcenterIdError).
  release: number;                 // == lekinpy Workcenter.release
  status: string;                  // == lekinpy Workcenter.status
  rgb?: [number, number, number];  // == lekinpy Workcenter.rgb
  machineIds: string[];            // Ordered list of Machine.machineId in this
                                  // workcenter. Must contain at least one entry
                                  // (EmptyMachineListError). The Machine objects
                                  // themselves live in ProblemDefinition.machines
                                  // (flat), not nested here — see §3.1.
}

interface ProblemDefinition {
  schemaVersion: "1.0.0";
  problemId: string;
  name: string;
  jobs: Job[];
  workcenters: Workcenter[];
  machines: Machine[];             // Flat; each machine.workcenterId points back
                                  // into workcenters[]. See §3.1 for why this is
                                  // flattened relative to lekinpy's nested shape.
}
```

### 1.2 Scheduled results

```ts
interface ScheduledOperation {
  scheduledOperationId: string;  // WEB-DERIVED: same value as operationId
                                  // (`${jobId}-O${operationIndex}`). lekinpy's
                                  // ScheduledOperation has no id field at all. Safe
                                  // as a unique key because a feasible schedule
                                  // places each (jobId, operationIndex) pair exactly
                                  // once across the whole Schedule.
  jobId: string;                  // == lekinpy ScheduledOperation.job_id
  operationIndex: number;         // == lekinpy ScheduledOperation.operation_index
  workcenterId: string | null;    // == lekinpy ScheduledOperation.workcenter
  machineId: string;              // == lekinpy ScheduledOperation.machine
  startTime: number;               // == lekinpy .start_time
  endTime: number;                 // == lekinpy .end_time
  sequencePosition: number;        // == lekinpy .sequence_position (0-based index
                                  // within this machine's operation queue)
  status: string | null;           // == lekinpy .status
  source: "algorithm" | "manual";  // WEB-ONLY. Every record straight out of a fresh
                                  // ExecutionResult is "algorithm"; the recalculation
                                  // engine (§4) sets a record to "manual" only when
                                  // ITS OWN placement changed as a direct or cascaded
                                  // consequence of a ManualScheduleEdit.
  manuallyModified: boolean;       // WEB-ONLY. Kept distinct from `source` because a
                                  // manual edit can, after an undo/redo round trip,
                                  // leave an operation back at its original
                                  // algorithm-computed (machine, position) — this
                                  // flag answers "was this ever touched," `source`
                                  // answers "what produced its current placement."
}

interface MachineSchedule {
  machineId: string;               // == lekinpy MachineSchedule.machine
  workcenterId: string | null;     // == lekinpy MachineSchedule.workcenter
  operations: ScheduledOperation[]; // == lekinpy MachineSchedule.operations, kept in
                                  // sequencePosition order (index in this array ==
                                  // sequencePosition, redundantly, same as lekinpy).
}

interface Schedule {
  scheduleId: string;               // WEB-ONLY id (uuid), since lekinpy's Schedule has
                                  // none. Assigned once per ExecutionResult and
                                  // carried through every ManualScheduleEdit applied
                                  // on top of it.
  algorithmId: string;              // WEB-ONLY — the registry id (e.g. "fcfs") that
                                  // produced this schedule. NOT parsed from
                                  // scheduleType below; set directly from the
                                  // ExecutionRequest that produced it.
  scheduleType: string;             // == lekinpy Schedule.schedule_type (e.g. "FCFS"
                                  // — kept verbatim for LEKIN-format export fidelity;
                                  // do not use for programmatic branching).
  time: number;                     // == lekinpy Schedule.time, AS COMPUTED BY THE
                                  // ALGORITHM AT EXECUTION TIME ONLY. Becomes stale
                                  // the moment any ManualScheduleEdit is applied —
                                  // after that, Metrics.makespan (§1.3) is the live
                                  // value. UI code must not read `time` post-edit.
  rgb?: [number, number, number];   // == lekinpy Schedule.rgb
  machines: MachineSchedule[];      // == lekinpy Schedule.machines
}
```

### 1.3 Metrics

```ts
interface Metrics {
  // ENTIRELY WEB-COMPUTED. lekinpy never returns these as data —
  // Schedule.display_summary() only print()s them to stdout; there is no
  // compute_metrics() or equivalent anywhere in the library. This is the
  // single largest gap between PRODUCT_SPEC.md's assumed ExecutionResult
  // shape and reality. The formulas below are copied exactly from
  // display_summary()'s implementation (lekinpy/schedule.py) so results
  // match what the library would have printed, byte for byte in value.
  // Recomputed by a pure function, client-side, after every execution AND
  // after every accepted manual edit (see §4).
  makespan: number;                // C_max = max(endTime) across every job's
                                  // ScheduledOperations
  maxTardiness: number;            // T_max = max(max(0, jobEnd - job.due))
  tardyJobCount: number;           // ΣU_j = count of jobs where tardiness > 0
  totalCompletionTime: number;     // ΣC_j = sum(jobEnd)
  totalTardiness: number;          // ΣT_j = sum(max(0, jobEnd - job.due))
  weightedCompletionTime: number;  // ΣwC_j = sum(jobEnd * job.weight)
  weightedTardiness: number;       // ΣwT_j = sum(tardiness * job.weight)
  machineUtilization?: Record<string, number>; // machineId -> busyTime / makespan.
                                  // NOT present in lekinpy at all (not even inside
                                  // display_summary). PRODUCT_SPEC §4 already marks
                                  // this "(when supported)" — treat it as a genuinely
                                  // optional, purely-web-computed addition, not a
                                  // library-backed value.
}
```

Where `jobEnd = max(so.endTime for so in thatJob's ScheduledOperations)`,
matching `display_summary`'s `end = max(so.end_time for so in job_ops)`
exactly (not `sorted-by-operationIndex last element` — `display_job_details`
uses that alternate approach, and the two agree only because a feasible
schedule always has monotonically increasing end times along a job's
operation order; **`Metrics` must replicate `display_summary`'s min/max
approach specifically**, since that's the method PRODUCT_SPEC §4's Metrics
Area is named after).

### 1.4 Validation

```ts
interface ValidationError {
  // Mirrors lekinpy.exceptions.LekinValidationError subclasses — ONE AT A
  // TIME. See §4.2's "Validation model" note for why this can't yet be a
  // true multi-error batch despite the field name's plural-sounding home
  // (ExecutionResult.validationError is deliberately singular — see §1.6).
  type:
    | "EmptyOperationsError"
    | "NonPositiveProcessingTimeError"
    | "EmptyMachineListError"
    | "DuplicateJobIdError"
    | "DuplicateMachineIdError"
    | "DuplicateWorkcenterIdError"
    | "MissingWorkcenterError";
  message: string;                 // The exception's own str(), surfaced verbatim —
                                  // already written to be human-readable per Phase 0
                                  // item 4's design (e.g. "Job 'J3' has an operation
                                  // referencing unknown workcenter 'WC9'. Known
                                  // workcenters: ['WC1', 'WC2']").
  jobId?: string;
  operationIndex?: number;
  workcenterId?: string;
  machineId?: string;
}
```

### 1.5 Algorithm registry

```ts
interface AlgorithmDefinition {
  // Web-owned superset. `libraryMetadata` is the ONLY part that must stay
  // byte-identical (mod snake_case -> camelCase) to the pinned lekinpy
  // build's SchedulingAlgorithm.metadata dict — everything else is
  // descriptive/policy data lekinpy has no concept of (its plugin contract
  // is deliberately minimal by design: id, display_name,
  // supports_multi_operation, version — nothing else. See item 5 in
  // lekin-library_DECISIONS.md).
  id: string;                      // == libraryMetadata.id — the join key
  libraryMetadata: {
    id: string;                    // == metadata["id"]
    displayName: string;           // == metadata["display_name"]
    supportsMultiOperation: boolean; // == metadata["supports_multi_operation"]
    version: string;               // == metadata["version"] — the ALGORITHM's own
                                  // version (currently "1.0.0" for all four
                                  // built-ins), NOT lekinpy's package version.
  };
  shortName: string;
  description: string;
  problemTypes: string[];
  supportsReleaseTimes: boolean;
  supportsWeights: boolean;
  browserCompatible: boolean;
  backendRequired: boolean;
  estimatedComplexity: string;
  defaultBrowserOperationLimit: number;
  parameters: AlgorithmParameter[]; // Empty array for all four built-ins today —
                                  // no shipped algorithm accepts runtime parameters.
}

interface AlgorithmParameter {
  name: string;
  label: string;
  type: "number" | "string" | "boolean" | "enum";
  default: unknown;
  options?: unknown[];
}
```

Registry-drift guard (recommended, not yet built): a dev-time or CI script
that loads the pinned `lekinpy` wheel, instantiates each of
`FCFSAlgorithm`/`SPTAlgorithm`/`EDDAlgorithm`/`WSPTAlgorithm`, and asserts
every registry entry's `libraryMetadata` matches the real
`.metadata` dict exactly. Without it, nothing catches the registry going
stale the next time `lekin-library` is retagged. There is no
auto-discovery to fall back on — that was explicitly rejected in item 5
("no decorators or entry-point magic yet").

### 1.6 Execution

```ts
interface ExecutionRequest {
  executionId: string;
  problem: ProblemDefinition;
  algorithmId: string;
  parameters?: Record<string, unknown>; // Unused today — no built-in algorithm
                                  // defines any AlgorithmParameter. Reserved.
}

interface ExecutionResult {
  executionId: string;
  executionMode: "browser" | "backend"; // "backend" is Phase 3; the field exists
                                  // now so the frontend never has to branch on it
                                  // later (PRODUCT_SPEC §11's "same schema" rule).
  algorithmId: string;
  algorithmVersion: string;         // == AlgorithmDefinition.libraryMetadata.version
                                  // at execution time
  lekinpyVersion: string;            // == lekinpy.__version__ of the pinned wheel
                                  // actually used (e.g. "0.2.0"). NEW vs.
                                  // PRODUCT_SPEC §11's example — needed so a saved
                                  // result is traceable to the exact library build,
                                  // now that lekinpy versions actually move (v0.2.0
                                  // exists; PRODUCT_SPEC's example predates that).
  schemaVersion: "1.0.0";
  status: "completed" | "rejected" | "invalid" | "error";
  runtimeMs: number;
  schedule: Schedule | null;         // null unless status === "completed"
  metrics: Metrics | null;           // null unless status === "completed"
  validationError: ValidationError | null; // set iff status === "invalid"
  policyViolation: PolicyViolation | null; // set iff status === "rejected"
  warnings: string[];
}

interface PolicyViolation {
  limitName:
    | "maxJobs" | "maxOperations" | "maxMachines" | "maxWorkcenters"
    | "maxEstimatedRuntimeMs" | "maxInputFileSizeMb";
  limitValue: number;
  actualValue: number;
  message: string; // Pre-formatted per PRODUCT_SPEC §10's exact wording contract —
                    // see §2.2 below.
}
```

`status` meanings, in the order the adapter actually checks them (§2.2):
`"rejected"` — execution-policy limit exceeded, the algorithm never ran at
all, no Pyodide invocation happened. `"invalid"` — `System.validate()`
raised before scheduling started. `"error"` — an unexpected exception
during `schedule()` itself (a real bug, not a validation failure).
`"completed"` — normal success.

### 1.7 Manual edits

```ts
interface ManualScheduleEdit {
  // WEB-ONLY — no lekinpy equivalent exists. Represents one accepted
  // drag-and-drop action as structured intent, per PRODUCT_SPEC §14: "every
  // manual edit is represented as structured state, not just changed pixel
  // coordinates."
  editId: string;
  scheduleId: string;                // which Schedule this applies to
  scheduledOperationId: string;      // the operation that was moved
  timestamp: string;                  // ISO 8601
  from: { machineId: string; sequencePosition: number };
  to: { machineId: string; sequencePosition: number };
  // startTime/endTime are NOT part of the edit's input — they are OUTPUTS
  // of recalculation (§4), never inputs. The edit only records WHERE the
  // user dropped the operation (machine + queue position), matching §14's
  // "treat the user's move as a new machine-sequence constraint" strategy.
}
```

### Color assignment note (applies to Job.rgb / Workcenter.rgb, §1.1)

`Job._available_colors` / `Workcenter._available_colors` in lekinpy are
process-global lists, shuffled once at class-definition time and `.pop()`'d
on every construction that doesn't supply an explicit `rgb`. That's fragile
across a browser session (the list exhausts after ~512 pops within one
Pyodide worker's lifetime, and colors aren't stable across separate
executions of the "same" problem). It also isn't the muted palette
PRODUCT_SPEC §21 wants for the Gantt chart (Dusty Blue, Sage Green,
Terracotta, etc.) — lekinpy's RNG ranges over the full saturated
`(0,64,128,192)³` color cube.

**Resolution**: the web layer assigns display colors itself — a
deterministic function of `jobId` into the §21 muted palette (or a
user override), owned by the Gantt/problem-editor state, never by relying
on `lekinpy`'s `rgb` output for rendering. The `rgb` field is preserved in
the schema only so `.job`/`.seq` round-trips and exports stay faithful to
whatever the library actually produced — it is not the rendering source of
truth. (Architecture-level note; the actual palette mapping is Codex's
implementation.)

---

## 2. Browser execution adapter

### 2.1 Interface

```ts
interface ExecutionEngine {
  execute(request: ExecutionRequest): Promise<ExecutionResult>;
  cancel(executionId: string): void;
}
```

One interface, implemented today only by `BrowserExecutionAdapter`
(Pyodide-backed). A future `BackendExecutionAdapter` (Phase 3) implements
the same interface — the rest of the app never branches on execution mode,
per PRODUCT_SPEC §11.

### 2.2 `BrowserExecutionAdapter.execute()` — step order

1. **Execution policy check — pure TS/JS, no Pyodide.** Count
   jobs/operations/machines/workcenters directly from the `ProblemDefinition`
   already in memory and compare against the selected
   `AlgorithmDefinition`'s limits (`defaultBrowserOperationLimit`, and the
   global `browserExecution` policy from PRODUCT_SPEC §9). If exceeded:
   return `status: "rejected"` immediately, **before Pyodide is ever
   loaded**. The problem definition is untouched (it already lives in
   `ProblemEditorState`, §3.1) so PRODUCT_SPEC §10 point 6 ("preserve the
   problem definition") is automatically satisfied — there's nothing to
   lose. `PolicyViolation.message` follows PRODUCT_SPEC §10's exact
   contract: name the limit, the actual count, and how to reduce it — e.g.
   *"This problem contains 720 operations, while the current browser limit
   is 500 operations. Reduce the problem size or export it for later
   execution."* Never a generic failure string.
2. **Load/reuse the Pyodide runtime + pinned wheel.** Lazy singleton, one
   Web Worker (see §2.4), loads `lekinpy` `v0.2.0` once and caches it across
   executions in the same session.
3. **Translate `ProblemDefinition` → a `lekinpy.System`.** This is the
   camelCase→snake_case and flat→nested translation boundary (§3.1): group
   `machines` by `workcenterId`, construct `Workcenter(name=..., machines=[Machine(...), ...])`
   for each, `add_workcenter` them, construct `Job(...)` with nested
   `Operation(...)` objects and `add_job` them.
4. **Validate first, standalone.** Call `system.validate()` before touching
   any algorithm. If it raises, catch the specific
   `LekinValidationError` subclass, map its class name + message directly
   into a `ValidationError` (§1.4), return `status: "invalid"` — cheap,
   fails fast, no wasted scheduling work.
5. **Instantiate and run.** `ALGORITHM_CLASSES[algorithmId]().schedule(system)`,
   wrapped in a try/except for unexpected errors → `status: "error"`.
   Measure wall-clock time for `runtimeMs`.
6. **Translate the result back.** `Schedule.to_dict()` → the web `Schedule`
   shape (§1.2): snake_case → camelCase, add derived `scheduledOperationId`
   per record, tag every record `source: "algorithm"`,
   `manuallyModified: false`. Compute `Metrics` (§1.3) via the pure
   client-side function. Assemble into `ExecutionResult`,
   `status: "completed"`.

### 2.3 Open question: where does the wheel live?

`lekinpy` is not published to PyPI (`pyproject.toml` has no publish target
configured, and `dist/lekinpy-0.2.0-py3-none-any.whl` is a local,
git-ignored build artifact today). Pyodide's `micropip.install()` needs a
URL. This needs a decision before the adapter can actually be built:
host the wheel as a static asset checked into `lekin-web` (simplest, but
means re-copying it by hand on every `lekin-library` version bump), or
publish it somewhere fetchable (a GitHub Release artifact on
`lekin-library`, or a private package index). Not resolved here —
flagging it as a concrete Phase 1 blocker, not a Phase 2+ concern.

### 2.4 Performance & safety (PRODUCT_SPEC §25)

Pyodide runs inside a **Web Worker**, not the main thread. The adapter's
`execute()`/`cancel()` are the only surface the rest of the app sees;
internally they `postMessage` to/from the worker. `cancel()` terminates and
respawns the worker (Pyodide has no cooperative cancellation primitive).
A timeout matching the policy's `maxEstimatedRuntimeMs` races the actual
execution and triggers the same cancellation path, surfaced as
`status: "error"` with a specific "execution timed out" warning rather than
hanging.

---

## 3. Component boundaries

State ownership only — no rendering, layout, or styling decisions (Codex's
scope). "Owns" = source of truth, mutated directly. "Reads" = subscribes to
another module's state without owning it.

| Module | Owns | Reads | Triggers |
|---|---|---|---|
| **ProblemEditorState** | `ProblemDefinition` (jobs, operations, workcenters, machines — flat, normalized by id, see §3.1), unsaved-edit/dirty flag, import/export status | — | Nothing automatically. Editing the problem does **not** re-run execution — the user explicitly re-runs (PRODUCT_SPEC has no "live recompute on every keystroke" requirement). |
| **ExecutionState** | Selected `algorithmId`, the current `ExecutionRequest`, the list of `ExecutionResult`s (one per run — this is what makes algorithm comparison, §19, possible without re-running), execution status (`idle`\|`running`\|`rejected`\|`invalid`\|`error`\|`completed`) | `ProblemEditorState.problem` (read-only, snapshotted into each `ExecutionRequest` at run time) | Calls `ExecutionEngine.execute()` |
| **ScheduleEditorState** (Gantt canvas) | The *active* `Schedule` (one `ExecutionResult.schedule` plus every `ManualScheduleEdit` applied on top of it, §4), the undo/redo stack of `ManualScheduleEdit`s, current selection (selected `scheduledOperationId`), in-progress drag state (candidate machine/position, valid/invalid highlight set — transient, not persisted), viewport (zoom/pan — view-only) | `ExecutionState` (to pick which `ExecutionResult` is "active" when the user switches algorithms in the comparison tab) | Recalculation (§4) on every accepted drop |
| **MetricsPanel** | Nothing of its own | `ScheduleEditorState`'s active `Schedule` | Recomputes `Metrics` (pure function, §1.3) on every change to the active schedule — not separately stateful |
| **ValidationState** | Current `ValidationError \| null` (problem-level, from the last `execute()` call) and current schedule-feasibility issues (post-edit, if recalculation ever needs to surface one — see §4's note on why this is rare) | `ExecutionState`, `ScheduleEditorState` | — |
| **DetailTabs** | Only the "Algorithm Comparison" tab has its own state: which `ExecutionResult`s are selected for side-by-side comparison. Machine Sequence, Job Details, and Validation Messages tabs are pure read views over `ScheduleEditorState` / `ValidationState` — they own nothing. | `ScheduleEditorState`, `ValidationState`, `ExecutionState` | — |

### 3.1 Normalization note

`ProblemDefinition.machines` is flat (indexed by `machineId`), not nested
inside `workcenters[].machines` the way `lekinpy`'s `Workcenter` class
requires it at construction time. This is a deliberate choice: a flat,
by-id-indexed entity table is what the problem editor actually needs for
O(1) lookup/edit/delete of a single machine or job without walking nested
arrays, and it's the natural shape for React state and form binding.

The cost of this choice is that **the flat→nested transform is real work**,
and it belongs entirely to the `BrowserExecutionAdapter` (§2.2 step 3) —
not duplicated anywhere else. `ProblemEditorState` is responsible for one
invariant the adapter depends on: every `Machine.workcenterId` must match
exactly one `Workcenter.machineIds` entry containing that `machineId` (kept
consistent on every add/edit/delete/move-machine-between-workcenters
operation in the editor, not just checked at execution time).

---

## 4. Drag-and-drop interaction logic

### 4.1 What a "drop" actually is

The drop target is **`(targetMachineId, targetSequencePosition)`** — an
insertion index into that machine's operation queue — **not** a raw
timestamp. This matches PRODUCT_SPEC §12's own action list ("reorder
operations on the same machine, move it to another eligible machine") and
§14's recalculation strategy ("treat the user's move as a new
machine-sequence constraint"). The Gantt canvas may track the cursor
continuously during drag (Codex's rendering concern), but only snaps to
discrete valid `(machine, position)` slots — the exact start/end times a
drop produces are always an *output* of recalculation, never a value the
user sets directly.

### 4.2 Validation: what's actually a hard reject

PRODUCT_SPEC §13 lists eight things a drag validates against: job release
time, operation precedence, machine availability, workcenter eligibility,
eligible machine assignment, processing duration, machine capacity,
operation overlap, and dependent downstream operations. Given the real
constraint model in `lekinpy` v0.2.0, these collapse into two categories:

**Hard reject (checked before any recalculation is attempted):**
- **Workcenter/eligibility mismatch**: `operation.workcenterId !== targetMachine.workcenterId`.
  This is categorically impossible regardless of timing — the only such
  case in the current model, because eligibility in lekinpy has no finer
  granularity than "any machine in the required workcenter" (§1.1).
- Defensive/no-op cases: dropping onto the operation's own current
  `(machine, position)` is a silent no-op (no edit recorded, no
  recalculation triggered) — not a rejection, just nothing happens.

**Resolved by recalculation, not rejected (release time, precedence, machine
availability, overlap, downstream cascade):** all of these are handled by
the deterministic forward-simulation in §4.3, which **always succeeds**
given the current library's constraint model. This is a genuine finding,
not an approximation: `lekinpy` has no hard deadlines (`due` only affects
the *tardiness metric*, never feasibility — nothing stops a job from
finishing late) and no machine-capacity concept beyond "one operation at a
time in sequence" (which the queue-position model satisfies by
construction). So any `(machine, position)` pair that clears the
eligibility check can always be resolved into a feasible schedule by
pushing later operations forward — there is no case in the current model
where recalculation itself fails. **PRODUCT_SPEC §13's eight-item list
should be read as "eight things the system enforces," not "eight
independent pass/fail gates a drop can fail at drop time"** — see §6.3.

### 4.3 Recalculation algorithm (triggered on every accepted drop)

Pure function: `recalculate(schedule: Schedule, edit: ManualScheduleEdit): { schedule: Schedule; metrics: Metrics }`.

1. Remove the moved `ScheduledOperation` from its source machine's queue;
   insert it into the target machine's queue at `to.sequencePosition`.
2. Walk the target machine's queue **from the insertion point forward**,
   in position order. For each operation in that range, recompute:
   `startTime = max(previousOpEndTimeSameJob, machineAvailableTimeFromPriorQueueSlot)`,
   `endTime = startTime + processingTime` — the exact same rule as
   `lekinpy`'s `_assign_single_operation` (base.py), reimplemented here
   because no existing `SchedulingAlgorithm.schedule()` entry point accepts
   a partially-fixed schedule as input (they only ever compute from
   scratch via a job-selector function — see §6.2, this is a real library
   gap, not a web-side shortcut).
3. If the source machine changed, walk the source machine's queue **from
   the vacated point forward** the same way (its downstream operations may
   now start earlier).
4. For the moved job specifically, walk its own remaining operations
   (`operationIndex + 1, +2, ...`) in order — each one's `startTime` lower
   bound is its own predecessor's new `endTime`, which may itself now sit
   on a third machine whose queue also needs the same forward pass applied
   from that point. This terminates because each operation belongs to
   exactly one machine queue and one job sequence, and both are walked at
   most once per affected chain.
5. Recompute `Metrics` (§1.3) from the fully updated `ScheduledOperation`
   set.
6. Mark every `ScheduledOperation` actually touched by steps 2–4 (not just
   the moved one) `source: "manual"`, `manuallyModified: true` — this is
   what lets the UI distinguish "you moved this" from "this shifted
   because of what you moved" without a separate diff pass.

### 4.4 Wording contract for rejection explanations

(Data contract only — visual styling, placement, and animation are
Codex's.) A rejection is a plain data object:

```ts
interface DragRejection {
  operationId: string;
  targetMachineId: string;
  reasonCode: "INELIGIBLE_WORKCENTER"; // the only reason code today — see §4.2
  message: string;
}
```

Template: `"Operation {operationId} cannot run on {targetMachineId} because {targetMachineId} is not in workcenter {requiredWorkcenterId} (operation {operationId} requires {requiredWorkcenterId})."`

Rules: always name the specific operation and the specific blocking fact —
never a generic "Invalid move" or "Something went wrong" (same standard
PRODUCT_SPEC §10 sets for the browser-limit case). `reasonCode` is a typed
enum specifically so this can grow (e.g. if a future library change adds a
real precedence-based hard-reject case) without changing the shape
consumers read.

---

## 5. Versioning & translation boundary summary

- **`SCHEMA_VERSION = "1.0.0"`** — the web JSON contract defined in §1.
  Bump it whenever any interface in §1 changes shape.
- **`lekinpyVersion`** — per-`ExecutionResult`, the exact pinned library
  build that produced it (`"0.2.0"` today). Independent of `SCHEMA_VERSION`.
- **The only place snake_case ↔ camelCase and flat ↔ nested translation
  happens is `BrowserExecutionAdapter`** (§2.2 steps 3 and 6). No other
  module should construct or parse raw `lekinpy` dict shapes.

---

## 6. Reconciliation with PRODUCT_SPEC.md

Per `PRODUCT_SPEC.md` §33: "design implementation defers to
`ARCHITECTURE.md`... flag back rather than quietly reinterpreting either
document." These are called out explicitly rather than silently resolved:

### 6.1 §7 and §15/17 JSON examples are illustrative, not literal
`PRODUCT_SPEC.md`'s JSON examples for algorithm metadata (§7) and
`ScheduledOperation`/`Schedule`/`ExecutionResult` (§15/17) use camelCase
fields and structure that don't match `lekinpy`'s real output (§1 above is
the authoritative shape now). §1 resolves this by treating the registry
and the execution-result schema as **web-owned supersets**, not
pass-throughs. **Recommend**: update `PRODUCT_SPEC.md` §15/17's examples to
either point at this document or be regenerated from it, so they stop
drifting from what's actually implemented.

### 6.2 No library hook exists for manual-edit recalculation
PRODUCT_SPEC §14 assumes recalculation is straightforward; in practice,
every `SchedulingAlgorithm.schedule()` only ever computes a schedule from
scratch — none accept a partially-fixed/pinned assignment as input. §4.3
above works around this with a web-owned reimplementation of
`_assign_single_operation`'s placement rule. **Flagging as a
library-enhancement candidate** (not a Phase 1 blocker, since §4.3 is
implementable now): a future `lekin-library` addition — e.g. a
`recompute_from_fixed_points()` method on `System` or `Schedule` — would
let the web layer stop duplicating that placement rule.

### 6.3 §13's validation list is real but not a set of independent gates
See §4.2. All eight listed constraints are genuinely enforced — but given
`lekinpy`'s actual constraint model (no hard deadlines, no machine capacity
beyond sequential queuing), only workcenter eligibility can ever produce an
outright rejection; everything else is guaranteed resolvable by
recalculation. **Recommend**: a clarifying note in `PRODUCT_SPEC.md` §13
so this isn't read as implying eight independent binary pass/fail checks
at drop time.

### 6.4 §17's validation-tooling question is now decided
§17 lists Pydantic/JSON Schema/Zod/generated-shared-schemas as candidates
without picking one. **Decision made here**: Zod, as the single source of
truth on the TypeScript side (native to the browser runtime, good React
form DX, no codegen step). This is *not* generated from `lekinpy`'s Python
classes — `lekinpy` isn't Pydantic-based and MASTER_PROMPT_v2.md is
explicit that the library "should have no knowledge that a website
exists," so introducing Pydantic there purely to enable codegen would be
scope creep. **Recommend**: adopt this explicitly in `PRODUCT_SPEC.md` §17
rather than leaving the tooling question open.

### 6.5 Metrics and multi-error validation are web-side for v1
Per the earlier discussion (not litigated again here): `Metrics` is
computed client-side (§1.3) and validation surfaces one error at a time
(§1.4), both flagged as `lekin-library` enhancement candidates rather than
Phase 0 rework. `PRODUCT_SPEC.md` §15's `validation: { errors: [] }` shape
should be read as "one ValidationError, wrapped," not a batch, until/unless
`lekin-library` adds a collect-all-errors mode.

### 6.6 Fields PRODUCT_SPEC.md §5 assumed exist on the library models
`Operation.operationId` and per-operation eligible-machine restrictions,
and `Machine.workcenterId`, are not real `lekinpy` fields (§1.1). §1 adds
them as explicit web-derived fields. **Recommend**: correct §5 to note
these are web-side additions, not library-native.

---

## 7. Where this document is authoritative vs. where PRODUCT_SPEC.md still is

This document owns: schema shapes, the execution adapter's internal steps,
state ownership boundaries, and drag-and-drop validation/recalculation
logic. `PRODUCT_SPEC.md` still owns: product scope and phasing, visual
design direction (§20–22), UX flows and copy tone, and everything not
contradicted above. Where the two now conflict (§6), this document's
resolution is intended to win going forward, pending your review.
