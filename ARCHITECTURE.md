# LEKIN Lab — Web Architecture (v1.3)

**Revision note (v1.1)**: v1's §4 claimed that any workcenter-eligible
`(machine, position)` drop could always be resolved by pushing later
operations forward. That claim was wrong — machine-sequence constraints
and job-precedence constraints can form a genuine cycle (a manual reorder
on one machine plus job precedence on another can require operation A to
finish before B, B before C, and C before A). §4 is rewritten around an
explicit precedence graph with cycle detection, per user review. §1.3
(metrics), §1.7 (manual edits), §2.3 (wheel hosting), and §3.1 (lookup
claim) also received smaller corrections from the same review.

**Revision note (v1.2)**: v1.1's §1.4 described two validation layers in
prose (Zod collects everything client-side, `system.validate()` is a
singular last-mile check) but `ExecutionResult` still only carried a
singular `validationError` — which didn't actually give the frontend one
consistent shape regardless of which layer caught the problem. §1.4 and
§1.6 are revised to a unified `validationIssues: ValidationIssue[]` (with
`code`/`path`/`source`/`severity`), and §2.2's adapter step order now
explicitly includes running Zod before Pyodide ever loads. Adopted from a
concrete proposal reviewed during this session (credited inline where
relevant).

**Revision note (v1.3)**: v1.2's graph recalculation omitted the target
machine's own release time, even though `lekinpy` initializes machine
availability from `Machine.release`. It also stored a requested manual start
time only on the edit that introduced it, so a later unrelated edit could
recalculate the whole graph and accidentally erase intentional idle time.
§1.7, §3, and §4 now define persistent manual-start constraints with exact
undo/redo and clearing semantics, include machine release in every node's
lower bound, and add regression requirements for both cases.

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
  machineUtilization?: Record<string, number>; // machineId -> busyTime / availableTime.
                                  // NOT present in lekinpy at all (not even inside
                                  // display_summary) — purely web-computed. PRODUCT_SPEC
                                  // §4 already marks this "(when supported)".
                                  // DENOMINATOR, precisely: availableTime =
                                  // makespan - machine.release (time from when the
                                  // machine actually becomes available to the end of
                                  // the whole schedule), NOT the raw makespan — a
                                  // machine with a late release would otherwise be
                                  // penalized for time it was never available to use.
                                  // If makespan <= machine.release (machine never
                                  // used, or a degenerate/empty schedule), omit that
                                  // machineId from the map rather than dividing by
                                  // zero or reporting a misleading 0%.
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

**Empty/partial-data behavior**, made explicit (not specified by
`PRODUCT_SPEC.md`, and easy to get wrong at the boundaries):
- **Empty schedule** (no `ScheduledOperation`s at all — e.g. an unexecuted
  problem, or a `System` with jobs but nothing scheduled yet): every
  aggregate metric is `0` (`makespan: 0`, `maxTardiness: 0`, etc.), never
  `NaN` or a thrown error. `machineUtilization` is an empty object (every
  machine's denominator is 0, so every machine is correctly omitted per
  the rule above).
- **A job present in the `ProblemDefinition` but with no
  `ScheduledOperation`s in this particular `Schedule`** (e.g. it was added
  to the editor after the last execution ran, or a manual-edit bug
  desynced them): `lekinpy`'s own `display_summary()` silently *excludes*
  such jobs from every aggregate — it iterates `system.jobs`, does
  `job_ops = ops_by_job.get(job.job_id)`, and skips entirely when that's
  empty. `Metrics` must replicate this exact behavior for numeric
  consistency with the library. **Product-level addition beyond what
  `display_summary` does**: the UI should separately surface a warning
  when this happens (e.g. in `ValidationState`, §3), since silently
  excluding a job from every metric with no visible signal is a real trap
  for a user — `lekinpy` accepts that silently, the web app shouldn't.

### 1.4 Validation

```ts
type ValidationErrorCode =
  // Mirrored 1:1 from lekinpy.exceptions.LekinValidationError subclasses —
  // these fire from EITHER validation layer (source distinguishes which):
  | "EMPTY_OPERATIONS"
  | "NON_POSITIVE_PROCESSING_TIME"
  | "EMPTY_MACHINE_LIST"
  | "DUPLICATE_JOB_ID"
  | "DUPLICATE_MACHINE_ID"
  | "DUPLICATE_WORKCENTER_ID"
  | "MISSING_WORKCENTER_REFERENCE"
  // Web/editor-only structural checks — lekinpy has no equivalent, because
  // these are either purely-web-derived-field consistency checks (§1.1,
  // §3.1) or import/UX concerns lekinpy has no reason to care about:
  | "INCONSISTENT_MACHINE_WORKCENTER"   // Machine.workcenterId disagrees
                                          // with which Workcenter.machineIds
                                          // actually lists it (§3.1's
                                          // invariant, now actually checked
                                          // rather than just asserted)
  | "INVALID_OPERATION_INDEX"           // operationIndex doesn't match the
                                          // operation's real position in
                                          // job.operations
  | "INVALID_NUMERIC_VALUE"             // NaN/Infinity in any numeric field
  | "INVALID_RGB"                        // rgb tuple out of range/malformed
  | "UNKNOWN_ALGORITHM_ID"              // ExecutionRequest.algorithmId isn't
                                          // in the registry (§1.5)
  | "UNSUPPORTED_ALGORITHM_PROBLEM_COMBINATION" // e.g. a multi-operation job
                                          // against an algorithm whose
                                          // libraryMetadata.supportsMultiOperation
                                          // is false — this is PRODUCT_SPEC
                                          // §6's compatibility-label
                                          // requirement, enforced as a
                                          // blocking check here rather than
                                          // left as UI-only advisory text
  // Warnings — severity: "warning", never block execution:
  | "DUE_BEFORE_RELEASE"
  | "UNUSUALLY_LARGE_WEIGHT"
  | "UNUSUALLY_LONG_PROCESSING_TIME"
  | "UNCLEAR_STATUS"
  | "APPROACHING_BROWSER_LIMIT";

interface ValidationIssue {
  code: ValidationErrorCode;
  message: string;                 // Human-readable. For source: "library", this
                                  // is the lekinpy exception's own str() surfaced
                                  // verbatim (already human-readable by Phase 0
                                  // item 4's design). For source: "schema", written
                                  // directly by the Zod schema's error map.
  path: Array<string | number>;    // Points into ProblemDefinition/ExecutionRequest,
                                  // Zod-issue-path style, e.g.
                                  // ["jobs", 2, "operations", 1, "processingTime"] —
                                  // what the editor uses to highlight the exact
                                  // field. Empty array for issues that don't map to
                                  // one specific field (e.g. a library-side
                                  // exception with no structured path).
  source: "schema" | "library" | "schedule"; // "schema" = caught by Zod on
                                  // ProblemDefinition/ExecutionRequest before
                                  // Pyodide loads. "library" = system.validate()
                                  // raised (§2.2 step 5) — reaching this in normal
                                  // editor use should be rare, and is itself a
                                  // signal the Zod schema has a gap worth
                                  // investigating, not just a user-facing message.
                                  // "schedule" = reserved for a post-recalculation
                                  // (§4.5) feasibility issue, if one is ever needed.
  severity: "error" | "warning";   // Only "error" blocks execution (§1.6).
  jobId?: string;
  operationIndex?: number;
  workcenterId?: string;
  machineId?: string;
}
```

**Two validation layers, one unified issue shape.** Both layers produce the
same `ValidationIssue[]`, so the UI (the Validation Messages tab, §3) never
branches on which layer caught a problem:

1. **Problem-editor validation (Zod, client-side, multi-error, `source: "schema"`).**
   The `ProblemDefinitionSchema` mirrors `lekinpy`'s construction-time and
   add-time rules, plus the web-only structural checks above, and runs
   entirely in TypeScript, never touching `lekinpy`. Cross-record checks
   (duplicate ids, missing workcenter references, the
   `Machine.workcenterId`/`Workcenter.machineIds` consistency invariant)
   belong in `superRefine()`, since Zod's per-field validators can't see
   across the whole tree. `.safeParse()` collects *every* violation in one
   pass by default — no `lekin-library` change of any kind is needed for
   the editor and the JSON-import flow (§18) to show every problem at
   once. **`UNSUPPORTED_ALGORITHM_PROBLEM_COMBINATION` is checked
   separately from `ProblemDefinitionSchema` itself** — it depends on both
   the problem *and* the selected `algorithmId`, so it's a property of the
   `ExecutionRequest`, not of `ProblemDefinition` alone. A composing
   function, `validateExecutionRequest(problem, algorithmId): ValidationIssue[]`,
   runs the schema check and this compatibility check together and returns
   one combined list.
2. **Execution-time validation (`system.validate()`, `source: "library"`,
   the last-mile safety net).** Runs only inside `BrowserExecutionAdapter`
   (§2.2), immediately before scheduling, on the already-constructed
   `lekinpy.System`. Because the Zod layer is the primary gate, reaching
   this path in normal editor use should be rare — it exists to catch
   anything that slipped past Zod (e.g. a hand-crafted or legacy-format
   import that bypassed the editor's forms). It still only ever raises one
   exception at a time (that's `lekinpy`'s actual behavior, unchanged —
   **no batch-validation mode is being added to `lekin-library` for this**,
   since the editor's Zod layer already covers the case that matters:
   letting a user see every problem with their input at once, before
   Pyodide ever loads). The adapter maps that single exception into a
   **one-element** `validationIssues` array with `source: "library"`.

**Warnings never block execution** (`severity: "warning"`) — due date
before release time, an unusually large weight, an unusually long
processing time, an `status` value with unclear scheduling semantics
(free-form per `lekinpy`, so the schema can only flag values that look
like a typo, not enforce a closed set), and approaching (not yet
exceeding) a browser execution limit (§2.2's `PolicyViolation` remains the
hard-block case; this is the softer "you're close" advisory). Execution is
blocked exactly when `validationIssues.some(i => i.severity === "error")`.

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
  validationIssues: ValidationIssue[]; // non-empty (at least one severity:
                                  // "error") iff status === "invalid";
                                  // may still contain severity: "warning"
                                  // entries even when status === "completed"
                                  // (warnings never block execution, §1.4)
  policyViolation: PolicyViolation | null; // set iff status === "rejected"
  warnings: string[];                // OPERATIONAL warnings from the execution
                                  // engine itself (e.g. "execution timed out",
                                  // §2.4) — distinct from validationIssues'
                                  // severity: "warning" entries, which describe
                                  // problems with the DATA, not the run.
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
`"rejected"` — execution-policy limit exceeded, nothing else ran.
`"invalid"` — `validationIssues` contains at least one `severity: "error"`
entry, from either layer (§1.4); the algorithm never ran (and, if caught
by the Zod layer, Pyodide never even loaded). `"error"` — an unexpected
exception during `schedule()` itself, after both validation layers passed
(a real bug, not a validation failure). `"completed"` — normal success
(`validationIssues` may still be non-empty here if it contains only
warnings).

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
  from: {
    machineId: string;
    sequencePosition: number;
    requestedStartTime: number | null; // Previous persisted lower bound.
  };
  to: {
    machineId: string;
    sequencePosition: number;
    requestedStartTime: number | null; // New persisted lower bound. A number
                                  // creates/updates intentional idle time;
                                  // null explicitly clears the constraint.
  };
  // endTime is NEVER part of the edit's input — it's always an OUTPUT of
  // recalculation (§4.5), derived from startTime + processingTime.
}

type ManualStartConstraints = Record<string, number>;
// WEB-ONLY, owned by ScheduleEditorState. Keyed by scheduledOperationId.
// Absence means "start as early as the graph permits." This is editing
// intent, not an observed schedule result, so it is deliberately separate
// from ScheduledOperation.startTime. See §4.1 and §4.5.
```

Every accepted edit snapshots both the old and new constraint in `from` and
`to`. A queue-only move preserves the operation's existing constraint by
copying it to `to.requestedStartTime`; a time drag supplies a new number; an
explicit "start as early as possible" action supplies `null`. Undo restores
the `from` machine/position and constraint, redo restores `to`. This makes
undo/redo deterministic without reconstructing intent from rendered times.

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
2. **`validateExecutionRequest(problem, algorithmId)` — pure TS/JS, still no
   Pyodide.** Runs the Zod `ProblemDefinitionSchema` (`.safeParse()`,
   collecting every issue) plus the algorithm-compatibility check (§1.4).
   If the result contains any `severity: "error"` entry: return
   `status: "invalid"`, `validationIssues` set to the full collected list,
   **before Pyodide is ever loaded** — the expensive runtime spin-up is
   wasted work if the input was already known-bad.
3. **Load/reuse the Pyodide runtime + pinned wheel.** Lazy singleton, one
   Web Worker (see §2.4), loads `lekinpy` `v0.2.0` once and caches it across
   executions in the same session. Only reached once step 2 has no
   blocking errors.
4. **Translate `ProblemDefinition` → a `lekinpy.System`.** This is the
   camelCase→snake_case and flat→nested translation boundary (§3.1): group
   `machines` by `workcenterId`, construct `Workcenter(name=..., machines=[Machine(...), ...])`
   for each, `add_workcenter` them, construct `Job(...)` with nested
   `Operation(...)` objects and `add_job` them.
5. **Validate again, library-side.** Call `system.validate()` before
   touching any algorithm. If it raises, catch the specific
   `LekinValidationError` subclass, map it into a **one-element**
   `validationIssues` array (`source: "library"`, §1.4), return
   `status: "invalid"`. Reaching this step with an actual violation should
   be rare given step 2 already ran — when it happens, treat it as a
   signal the Zod schema has a gap, not just a user-facing message.
6. **Instantiate and run.** `ALGORITHM_CLASSES[algorithmId]().schedule(system)`,
   wrapped in a try/except for unexpected errors → `status: "error"`.
   Measure wall-clock time for `runtimeMs`.
7. **Translate the result back.** `Schedule.to_dict()` → the web `Schedule`
   shape (§1.2): snake_case → camelCase, add derived `scheduledOperationId`
   per record, tag every record `source: "algorithm"`,
   `manuallyModified: false`. Compute `Metrics` (§1.3) via the pure
   client-side function. Carry forward any `severity: "warning"` issues
   from step 2. Assemble into `ExecutionResult`, `status: "completed"`.

### 2.3 Decision: the wheel is a versioned same-origin static asset

`lekinpy` is not published to PyPI (`pyproject.toml` has no publish target
configured, and `dist/lekinpy-0.2.0-py3-none-any.whl` is a local,
git-ignored build artifact today). Pyodide's `micropip.install()` needs a
URL. Resolved as follows, rather than left open:

- The built wheel is checked into `lekin-web` at a version-stamped path:
  `public/vendor/lekinpy-0.2.0-py3-none-any.whl`. `BrowserExecutionAdapter`
  loads it via `micropip.install('/vendor/lekinpy-0.2.0-py3-none-any.whl')`
  — same-origin, no external fetch, no dependency on GitHub's release CDN
  being reachable at runtime.
- A checksum file sits alongside it —
  `public/vendor/lekinpy-0.2.0-py3-none-any.whl.sha256` — and the adapter
  verifies it before `micropip.install()` (defense against a corrupted or
  silently-replaced asset).
- **Replace process, documented here so it's not tribal knowledge**: (1) on
  `lekin-library`, build the wheel from the tagged commit
  (`python -m build`), (2) copy the resulting `.whl` into
  `lekin-web/public/vendor/`, replacing the old version-stamped file (never
  overwrite in place — old and new versions can coexist under different
  filenames if a rollback is needed), (3) regenerate the `.sha256` file,
  (4) update the `PINNED_LEKINPY_VERSION` constant the adapter reads the
  filename/checksum from, (5) record the bump in `lekin-web_DECISIONS.md`.
  This is a manual, deliberate step tied to a specific `lekin-library` tag
  — there is no auto-sync, matching the "always work from a pinned
  version" rule in `MASTER_PROMPT_v2.md`.

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
| **ScheduleEditorState** (Gantt canvas) | The *active* `Schedule` (one `ExecutionResult.schedule` plus every `ManualScheduleEdit` applied on top of it, §4), `manualStartConstraints: ManualStartConstraints` (persistent requested lower bounds, §1.7/§4.1), the undo/redo stack of `ManualScheduleEdit`s (each snapshots its old/new constraint), current selection (selected `scheduledOperationId`), in-progress drag state (candidate machine/position/time, valid/invalid highlight set — transient, not persisted), viewport (zoom/pan — view-only) | `ExecutionState` (to pick which `ExecutionResult` is "active" when the user switches algorithms in the comparison tab) | Recalculation (§4) on every accepted drop |
| **MetricsPanel** | Nothing of its own | `ScheduleEditorState`'s active `Schedule` | Recomputes `Metrics` (pure function, §1.3) on every change to the active schedule — not separately stateful |
| **ValidationState** | The current `ValidationIssue[]` — either the live `validateExecutionRequest()` result as the user edits (`source: "schema"`), or the last `ExecutionResult.validationIssues` (§1.4/§1.6, either `source`), whichever is most recent — plus any drag `DragRejection`s the user should still see (§4.6) | `ExecutionState`, `ScheduleEditorState`, `ProblemEditorState` | — |
| **DetailTabs** | Only the "Algorithm Comparison" tab has its own state: which `ExecutionResult`s are selected for side-by-side comparison. Machine Sequence, Job Details, and Validation Messages tabs are pure read views over `ScheduleEditorState` / `ValidationState` — they own nothing. | `ScheduleEditorState`, `ValidationState`, `ExecutionState` | — |

### 3.1 Normalization note

`ProblemDefinition.machines` is flat (indexed by `machineId`), not nested
inside `workcenters[].machines` the way `lekinpy`'s `Workcenter` class
requires it at construction time. This is a deliberate choice: a flat
entity table is the natural shape for React state, form binding, and
serialization (JSON import/export, §18) — but the arrays themselves are
not what provide O(1) lookup. **`ProblemEditorState` maintains derived
in-memory index maps alongside the arrays** — `jobsById: Map<string, Job>`,
`machinesById: Map<string, Machine>`, `workcentersById: Map<string, Workcenter>`
— rebuilt (or incrementally updated) whenever the corresponding array
changes. The arrays remain the source of truth for stable ordering and
serialization; the maps are a derived, disposable lookup cache the editor
UI reads from for O(1) access. `ProblemDefinition` itself, as a wire
format, makes no lookup-complexity guarantee on its own.

The cost of this choice is that **the flat→nested transform is real work**,
and it belongs entirely to the `BrowserExecutionAdapter` (§2.2 step 4) —
not duplicated anywhere else. `ProblemEditorState` is responsible for one
invariant the adapter depends on: every `Machine.workcenterId` must match
exactly one `Workcenter.machineIds` entry containing that `machineId` (kept
consistent on every add/edit/delete/move-machine-between-workcenters
operation in the editor, not just checked at execution time).

---

## 4. Drag-and-drop interaction logic

### 4.1 What a "drop" actually is

The drop target is **`(targetMachineId, targetSequencePosition)`** — an
insertion index into that machine's operation queue — plus an **optional**
persisted `to.requestedStartTime` (§1.7) for intentional idle-time placement. This
matches PRODUCT_SPEC §12's action list ("reorder operations on the same
machine, move it to another eligible machine") and §14's recalculation
strategy ("treat the user's move as a new machine-sequence constraint").
The Gantt canvas may track the cursor continuously during drag (Codex's
rendering concern), but only snaps to discrete valid `(machine, position)`
slots — the exact start/end times a drop produces are always an *output*
of recalculation (§4.5), never a value the user sets directly, **except**
where `requestedStartTime` explicitly asks for later-than-minimum
placement (still validated, never used to start earlier than precedence
allows).

The requested time is a persistent lower-bound constraint, not a one-shot
hint. `ScheduleEditorState.manualStartConstraints` carries it across every
later recalculation. Queue-only moves preserve the existing value. A time
drag replaces it. "Start as early as possible" clears it. Undo/redo restores
the exact previous/next value recorded in the edit. A request earlier than
the current graph-derived lower bound remains stored even though it has no
visible effect yet; if a later edit removes that blocking dependency, the
requested lower bound still applies.

### 4.2 The precedence graph

Every drop is validated and recalculated against a single directed graph,
not by walking machine queues in isolation. This is the correction this
revision makes — see the revision note at the top of this document.

**Nodes**: every `ScheduledOperation` in the active `Schedule`, keyed by
`scheduledOperationId`.

**Two edge types, one graph:**
- **Job-precedence edges** — fixed, derived directly from
  `ProblemDefinition`, never change as a result of a drag: for each job,
  an edge from operation `i` to operation `i+1` for every consecutive pair
  in `operations[]`.
- **Machine-sequence edges** — mutable, derived from the *current* queue
  order on each machine: for each machine, an edge from the operation at
  `sequencePosition i` to the one at `i+1`, for every consecutive pair.
  These are exactly the edges a manual edit changes.

An edge `A → B` means "A must finish before B can start" — i.e. `B`'s
lower-bound start time is (at least) `A`'s end time. **An operation can
have both an incoming job-precedence edge and an incoming machine-sequence
edge simultaneously** (its own job predecessor, and whatever now sits
immediately before it in its machine's queue) — recalculation (§4.5) must
take the max over *all* incoming edges for a node, not walk job-chains and
machine-queues as two separate passes. That was the specific flaw in this
document's previous version.

### 4.3 Cycle detection (runs before every accepted drop)

Given a proposed drop, construct the **resulting** graph (job edges
unchanged; machine edges updated to reflect both the target machine's new
queue — with the operation inserted — and the source machine's new queue —
with it removed, if the machine changed) and run **Kahn's algorithm**:

1. Compute in-degree for every node.
2. Repeatedly remove a node with in-degree 0, decrementing its successors'
   in-degrees, appending removed nodes to an output list.
3. If every node gets removed, the output list **is** a valid topological
   order — proceed directly to recalculation (§4.5) using it. No second
   pass needed: cycle detection and topological ordering are the same
   O(V + E) computation, not two separate steps.
4. **If any nodes remain un-removable, the graph has a cycle** — reject the
   drop with `reasonCode: "CYCLIC_PRECEDENCE"` (§4.6). The remaining
   (unprocessed) nodes are exactly those involved in, or only reachable
   through, a cycle; a follow-up DFS restricted to that subgraph
   (tracking the recursion stack, standard cycle-extraction) recovers one
   concrete cycle path for the rejection message.

**Cost**: `V` = total operations in the problem, bounded by the browser
execution policy (§2.2, `maxOperations`, e.g. 500 today). `E` is small
(at most 2 incoming edges per node). This is cheap enough — sub-millisecond
at that scale — to run **live, for every candidate slot, while the user is
still dragging**, not just once at drop time. Recommend implementing it
that way: PRODUCT_SPEC §13's "highlight valid destination machines and
positions" should reflect real cycle-awareness during the drag, not just
the workcenter-eligibility check — there's no performance reason to
downgrade to a cheaper approximation at this scale.

### 4.4 Validation: what's actually a hard reject

Given the graph model above, there are exactly two hard-reject cases,
checked in this order:

1. **Workcenter/eligibility mismatch**: `operation.workcenterId !== targetMachine.workcenterId`.
   Categorically impossible regardless of timing or ordering — eligibility
   in `lekinpy` has no finer granularity than "any machine in the required
   workcenter" (§1.1). Checked first because it's O(1) and doesn't require
   building the graph at all.
2. **Cyclic precedence** (§4.3): the proposed `(machine, position)` would
   make the job-precedence + machine-sequence graph un-topologically-sortable.

Everything else PRODUCT_SPEC §13 lists — release time, ordinary
precedence, machine availability, processing duration, overlap, downstream
cascade — is real and enforced, but enforced by where recalculation (§4.5)
places operations in the (now confirmed acyclic) graph, not by a separate
pass/fail gate. `lekinpy` still has no hard deadlines (`due` only affects
the tardiness *metric*) and no machine-capacity concept beyond sequential
queuing, so **once a drop clears both hard-reject checks above,
recalculation is guaranteed to succeed** — a topological order always
exists for an acyclic graph, and walking it always produces a valid
start/end time for every node. Defensive/no-op case: dropping onto the
operation's own current `(machine, position)` with the same persisted
requested-start constraint is a silent no-op — no edit recorded, nothing
recalculated. A same-slot edit that changes or clears the requested-start
constraint is a real edit and triggers recalculation.

See §6.3 for how this revises PRODUCT_SPEC §13's eight-item list.

### 4.5 Recalculation algorithm (triggered on every accepted drop)

Pure function: `recalculate(schedule: Schedule, edit: ManualScheduleEdit, manualStartConstraints: ManualStartConstraints, problem: ProblemDefinition): { schedule: Schedule; metrics: Metrics; manualStartConstraints: ManualStartConstraints }`.

1. Apply the edit to the graph: remove the moved operation's old machine
   edges, insert it into the target machine's queue at
   `to.sequencePosition`, add its new machine edges. Job-precedence edges
   are untouched (they're fixed). Clone `manualStartConstraints` and either
   set the moved operation's entry to `to.requestedStartTime` or delete the
   entry when that value is `null`; never mutate the caller's map in place.
2. Run cycle detection (§4.3) on the result. (In practice this was already
   done to accept the drop in the first place — recalculation reuses that
   same topological order rather than recomputing it, so this is one
   computation shared between validation and recalculation, not two.)
3. Walk every node **in the topological order from step 2** (not
   "downstream of the moved operation" — a full topological walk, since a
   drop can, in principle, affect ordering anywhere reachable from it, and
   walking in true topological order is what correctly handles a node with
   both a job-predecessor and a machine-predecessor, per §4.2):
   ```
   for each node n in topological order:
     lowerBound = max(
       0,
       job.release        (only if n is its job's first operation),
       machine.release    (for the machine n is assigned to),
       every incoming edge's source node's endTime,
       manualStartConstraints[n.scheduledOperationId] ?? 0
                            (a requested time earlier than the other lower
                             bounds has no current visible effect, but stays
                             persisted for subsequent edits)
     )
     n.startTime = lowerBound
     n.endTime = n.startTime + n.processingTime
   ```
   This is the same placement rule as `lekinpy`'s `_assign_single_operation`
   (base.py), generalized to take the max over *all* incoming graph edges
   instead of separately over "previous op in this job" and "previous op
   on this machine" — reimplemented here because no existing
   `SchedulingAlgorithm.schedule()` entry point accepts a partially-fixed
   schedule as input (they only ever compute from scratch via a
   job-selector function — see §6.2, a real library gap, not a web-side
   shortcut).
   Applying `machine.release` to every assigned operation is intentional and
   harmlessly redundant after the first queue operation: later operations
   also inherit the preceding machine operation's end time through an
   incoming edge, while the explicit bound guarantees correctness even for
   an empty-prefix/newly moved first operation.
4. Recompute `Metrics` (§1.3) from the fully updated `ScheduledOperation`
   set.
5. Mark every `ScheduledOperation` whose `startTime`/`endTime`/`machineId`
   actually changed as a result of step 3 (not just the moved one)
   `source: "manual"`, `manuallyModified: true` — lets the UI distinguish
   "you moved this" from "this shifted because of what you moved," without
   a separate diff pass.

Note: unlike the previous (incorrect) version of this section, this
algorithm makes no claim that only "downstream" operations are touched, or
that each operation is visited "at most once per affected chain" via
separate job/machine passes — it visits every node exactly once, in
topological order, which is the only traversal that's correct when a node
can be constrained by both edge types at once.

### 4.6 Wording contract for rejection explanations

(Data contract only — visual styling, placement, and animation are
Codex's.) A rejection is a plain data object:

```ts
interface DragRejection {
  operationId: string;
  targetMachineId: string;
  reasonCode: "INELIGIBLE_WORKCENTER" | "CYCLIC_PRECEDENCE";
  message: string;
  cyclePath?: string[]; // scheduledOperationIds in cycle order, set only
                         // when reasonCode === "CYCLIC_PRECEDENCE"
}
```

Templates:
- `INELIGIBLE_WORKCENTER`: `"Operation {operationId} cannot run on {targetMachineId} because {targetMachineId} is not in workcenter {requiredWorkcenterId} (operation {operationId} requires {requiredWorkcenterId})."`
- `CYCLIC_PRECEDENCE`: `"Moving {operationId} to {targetMachineId} would create a scheduling cycle: {cyclePath joined by ' → '} → {cyclePath[0]}. This move is not possible."`
  — e.g. *"Moving J1-O0 to M1 would create a scheduling cycle: J1-O0 → J1-O1 → J2-O0 → J2-O1 → J1-O0. This move is not possible."*

Rules: always name the specific operation and the specific blocking fact
(for cycles, the actual cycle path, not just "this would create a cycle")
— never a generic "Invalid move" or "Something went wrong" (same standard
PRODUCT_SPEC §10 sets for the browser-limit case). `reasonCode` is a typed
enum specifically so it can grow further without changing the shape
consumers read.

### 4.7 Required test coverage

Specified here so whoever implements this (Codex or otherwise) has a
concrete acceptance bar, not just prose:

- A non-cyclic reorder on a single machine recalculates correctly (basic
  case, no cross-machine interaction).
- A cross-machine move that only involves job-precedence and one machine's
  queue (no cycle) recalculates correctly.
- **The exact two-job, two-machine cycle from this revision's review**
  (`M1: J2-O1 → J1-O0`, `M2: J1-O1 → J2-O0`, combined with
  `J1-O0 → J1-O1` and `J2-O0 → J2-O1`) is detected and rejected with
  `CYCLIC_PRECEDENCE`, and the *reported* `cyclePath` is an actual cycle in
  the graph.
- An operation with both an incoming job-precedence edge and an incoming
  machine-sequence edge, where the two give different lower bounds, ends
  up at `max()` of the two — not either one alone (the direct regression
  test for the flaw this revision fixes).
- A `requestedStartTime` earlier than the graph-derived lower bound is
  ignored (operation still starts at the true lower bound, not the
  requested one).
- A `requestedStartTime` later than the graph-derived lower bound produces
  genuine idle time before the operation starts, without affecting
  operations that don't depend on it.
- A machine released at time 10 never receives an operation starting before
  time 10, even when that operation has no earlier job or machine predecessor.
- A requested-start constraint survives an unrelated later edit and its full
  graph recalculation.
- Undo restores the prior requested-start constraint; redo restores the new
  one, together with the corresponding machine and queue position.
- A queue-only move preserves an existing requested-start constraint; an
  explicit "start as early as possible" edit clears it.
- A requested time currently hidden by a later predecessor bound remains
  stored and becomes effective if a subsequent edit moves that predecessor
  earlier.
- Dropping onto an operation's own current `(machine, position)` with the
  same persisted requested-start constraint is a no-op: no
  `ManualScheduleEdit` recorded, no recalculation triggered. Changing or
  clearing the constraint in the same slot is not a no-op.

---

## 5. Versioning & translation boundary summary

- **`SCHEMA_VERSION = "1.0.0"`** — the web JSON contract defined in §1.
  Bump it whenever any interface in §1 changes shape.
- **`lekinpyVersion`** — per-`ExecutionResult`, the exact pinned library
  build that produced it (`"0.2.0"` today). Independent of `SCHEMA_VERSION`.
- **The only place snake_case ↔ camelCase and flat ↔ nested translation
  happens is `BrowserExecutionAdapter`** (§2.2 steps 4 and 7). No other
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
scratch — none accept a partially-fixed/pinned assignment as input. §4.5
above works around this with a web-owned reimplementation of
`_assign_single_operation`'s placement rule, generalized to a graph with
two edge types (§4.2) rather than lekinpy's single job-precedence
dimension. **Flagging as a library-enhancement candidate** (not a Phase 1
blocker, since §4.5 is implementable now): a future `lekin-library`
addition — e.g. a `recompute_from_fixed_points()` method on `System` or
`Schedule` — would let the web layer stop duplicating that placement rule.

### 6.3 §13's validation list is real, and one item is stronger than v1 of this document claimed
See §4.4 (revised in this document's v1.1 — the original version of this
section incorrectly claimed *every* constraint besides workcenter
eligibility was always resolvable by recalculation). That claim missed a
real case: machine-sequence edges plus job-precedence edges can form a
genuine cycle (§4.2/§4.3 — a manual reorder on one machine combined with
job precedence routed through a different machine can require A before B,
B before C, and C before A). So there are **two** hard-reject cases, not
one: workcenter eligibility and cyclic precedence (`CYCLIC_PRECEDENCE`,
§4.6). Every other item PRODUCT_SPEC §13 lists (release time, ordinary
precedence, machine availability, overlap, downstream cascade) is real and
enforced, but resolved by where recalculation places operations once a
drop clears both hard-reject checks, not by a separate pass/fail gate.
**Recommend**: a clarifying note in `PRODUCT_SPEC.md` §13 describing both
hard-reject cases explicitly, so a future reader doesn't have to
re-derive the cycle case from first principles.

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

### 6.5 Metrics is web-side; multi-error validation is a unified web-side contract, not a lekinpy gap
`Metrics` is computed client-side (§1.3), flagged as a `lekin-library`
enhancement candidate rather than Phase 0 rework — unchanged from the
earlier discussion. **Validation's final shape (v1.2, unchanged in v1.3)**: `ExecutionResult`
carries `validationIssues: ValidationIssue[]` (§1.4/§1.6) — a single array
regardless of which layer produced an entry (`source: "schema"` for the
Zod problem-editor pass, which collects every violation in one pass with
zero `lekin-library` changes; `source: "library"` for the rare
one-element case where `system.validate()`'s single raised exception is
the only thing that caught a problem). `PRODUCT_SPEC.md` §15's
`validation: { errors: [] }` shape maps directly onto `validationIssues`
now — this is no longer a gap needing a `lekin-library` batch-validation
mode, it's a resolved web-side contract with a `severity` field
separating blocking errors from advisory warnings (due-before-release,
unusually large weight, etc. — see §1.4).

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
