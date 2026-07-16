# Decisions Log — lekin-web

Append-only log of changes made to `lekin-web`, in order, with reasoning.
Read this whole file at the start of every new session before doing any work.
Never delete or rewrite past entries — if a decision is later reversed, add a
new entry saying so and why, rather than editing the old one.

Each entry should follow this format:

```
## [YYYY-MM-DD] <short title>
- Branch: <branch name>
- Phase: <Phase 1 / 2 / 3 / 4, per the master prompt roadmap>
- What changed:
- Why:
- Alternatives considered / tradeoffs:
- Tests added:
- Status: (in review / merged / reverted)
```

---

## [YYYY-MM-DD] Repo created (placeholder)
- Branch: n/a
- Phase: n/a
- What changed: Created empty `lekin-web` repo as a placeholder. No
  implementation started — waiting on `lekin-library` Phase 0 to complete
  first, since the web app is built against its finished interface.
- Why: Keep the two repos separate from day one so `lekin-library` stays a
  clean, standalone package and `lekin-web` only ever depends on a pinned
  version of it via the shared JSON schema.
- Alternatives considered / tradeoffs: n/a
- Tests added: none yet
- Status: merged

<!-- Add new entries below this line, most recent last. -->

## [2026-07-15] ARCHITECTURE.md v1: schema, execution adapter, component boundaries, drag-and-drop logic
- Branch: `docs/architecture-v1`
- Phase: 1 (architecture precedes any implementation)
- What changed:
  - Pre-work verification: confirmed `lekin-library` Phase 0 (all 7 items)
    is actually merged to `master` (PR #1, commit `3f6dd28`) and, as of
    this session, tagged `v0.2.0` with `pyproject.toml`/`__init__.py`
    version bumped from the stale `0.1.0`. Read the real merged source of
    `schedule.py`, `job.py`, `machine.py`, `system.py`,
    `algorithms/base.py` directly rather than trusting
    `MASTER_PROMPT_v2.md`/`PRODUCT_SPEC.md`'s descriptions.
  - `git init`'d this repo (it had no `.git` before this session), pushed
    to `git@github.com:Ruturaj-Vasant/Lekin_Web.git` on `main`.
  - Wrote `ARCHITECTURE.md`: the real versioned shared schema
    (`ProblemDefinition`/`Job`/`Operation`/`Workcenter`/`Machine`/
    `AlgorithmDefinition`/`ExecutionRequest`/`ExecutionResult`/
    `ScheduledOperation`/`Schedule`/`Metrics`/`ValidationError`/
    `ManualScheduleEdit`), the browser execution adapter's internal step
    order (policy check before Pyodide loads, validate-first, translation
    boundary), component state-ownership boundaries, and the
    drag-and-drop validation/recalculation contract — no UI/component
    code.
- Why: `MASTER_PROMPT_v2.md`'s division of responsibility puts schema and
  structure under Claude, visual/component implementation under Codex,
  with Codex building against this document plus `PRODUCT_SPEC.md`.
- Alternatives considered / tradeoffs:
  - Found the real `lekinpy` shape differs from `PRODUCT_SPEC.md` §15/17's
    placeholder JSON in several real ways — no `Metrics` are ever returned
    as data (only printed by `display_summary()`), `System.validate()`
    raises one error at a time rather than collecting a list, `Operation`
    has no id field or eligible-machine restriction, `Machine` has no
    parent-workcenter field. Chose to treat metrics computation and
    single-error validation as web-side responsibilities for v1 rather
    than reopening `lekin-library` scope (Phase 0 was scoped to exactly 7
    items and is closed) — flagged both as library-enhancement candidates
    in `ARCHITECTURE.md` §6 instead.
  - Found that `PRODUCT_SPEC.md` §13's eight-item drag validation list
    collapses, given lekinpy's actual constraint model (no hard deadlines,
    no machine-capacity concept beyond sequential queuing), into one real
    hard-reject case (workcenter eligibility) plus a recalculation pass
    that always succeeds. Documented this rather than implementing eight
    independent pass/fail gates that don't reflect how the underlying
    library actually behaves.
  - Picked Zod as the schema-validation tool (§17's open question) over
    Pydantic-generated/JSON-Schema-generated options, specifically to
    avoid introducing Pydantic into `lekin-library` merely to enable
    codegen — `MASTER_PROMPT_v2.md` is explicit the library should have no
    knowledge a website exists.
  - Left the question of where the pinned `.whl` file is actually hosted
    for Pyodide to fetch unresolved — flagged in `ARCHITECTURE.md` §2.3 as
    a concrete Phase 1 blocker rather than assumed away.
- Tests added: none (architecture document only, no code).
- Status: in review — awaiting user review before Codex starts building
  against it.

## [2026-07-15] ARCHITECTURE.md v1.1: fix a real infeasibility gap in the drag-and-drop model
- Branch: `docs/architecture-v1`
- Phase: 1 (still pre-implementation)
- What changed: user review of v1 rejected it as-is and found a genuine
  correctness bug, not a style nit — revised §4 (drag-and-drop) and made
  four smaller corrections (§1.3, §1.7, §2.3, §3.1) in response. See
  `ARCHITECTURE.md`'s own revision note at the top for the full technical
  detail; summarized here:
  - **The critical fix**: v1 claimed any workcenter-eligible
    `(machine, position)` drop could always be resolved by pushing later
    operations forward. False — the user gave a concrete counterexample
    (two jobs, two machines, manual machine orders combined with job
    precedence forming `J1-O0 → J1-O1 → J2-O0 → J2-O1 → J1-O0`, a genuine
    cycle). This is the classic job-shop disjunctive-graph problem (fixed
    job-precedence arcs + chosen machine-sequence arcs can cycle); v1
    missed it because its "walk each affected queue once" recalculation
    procedure also couldn't correctly handle an operation constrained by
    both its job-predecessor and its machine-predecessor simultaneously.
    §4 now models both edge types as one directed graph, runs Kahn's
    algorithm for combined cycle-detection + topological ordering before
    accepting any drop, adds a `CYCLIC_PRECEDENCE` hard-reject case
    alongside the existing workcenter-eligibility one, and recalculates by
    walking the topological order (taking the max over *all* incoming
    edges per node) rather than three separate queue/job passes.
  - Added optional `requestedStartTime` to `ManualScheduleEdit` so
    PRODUCT_SPEC §12's "drag it earlier/later" (genuine idle-time
    placement) is supported alongside pure queue reordering, rather than
    silently only supporting one of the two.
  - Corrected the multi-error-validation framing from the prior session
    discussion: Zod already collects every problem-editor violation in one
    pass with zero `lekin-library` changes needed — the earlier answer
    conflated that with `system.validate()`'s single-error execution-time
    check, which is a separate, narrower thing that's correctly singular.
  - Resolved the wheel-hosting open question (§2.3) rather than leaving it
    open: a version-stamped same-origin static asset
    (`public/vendor/lekinpy-0.2.0-py3-none-any.whl`) with a checksum and a
    documented replace process, per the user's specific recommendation.
  - Fixed an inaccurate O(1)-lookup claim (§3.1) — arrays alone don't
    provide O(1) access; `ProblemEditorState` needs derived id-indexed
    `Map`s alongside the arrays.
  - Specified `machineUtilization`'s denominator precisely
    (`makespan - machine.release`, not raw `makespan`) and `Metrics`'
    exact behavior for empty schedules and jobs missing from a given
    schedule (§1.3).
- Why: the cycle case is a real, not hypothetical, failure mode the moment
  drag-and-drop ships — any user reordering two machines whose jobs also
  share cross-machine precedence could hit it. Catching this before Codex
  builds anything against the recalculation contract avoids a rebuild
  after the fact.
- Alternatives considered / tradeoffs: none recorded here — this entry
  documents an external review's findings and this session's response to
  them, not a original design choice with rejected alternatives.
- Tests added: none (still architecture-only); §4.7 was added specifying
  the required test coverage once this is implemented, including the
  exact cycle counterexample as a named regression case.
- Status: in review — awaiting user re-review and approval before Codex
  starts building against it.

## [2026-07-15] ARCHITECTURE.md v1.2: unify validation into validationIssues: ValidationIssue[]
- Branch: `docs/architecture-v1`
- Phase: 1 (still pre-implementation)
- What changed: adopted a concrete proposal (Codex, reviewed mid-session)
  closing a gap the v1.1 revision left open — §1.4's "two validation
  layers" note was correct in prose, but `ExecutionResult` still carried a
  singular `validationError`, so the frontend had no single consistent
  shape to read regardless of which layer (Zod vs. `system.validate()`)
  caught a problem.
  - Replaced `ValidationError` with `ValidationIssue`: added `code`
    (stable `ValidationErrorCode` union, SCREAMING_SNAKE_CASE, shared
    vocabulary across both layers), `path` (Zod-issue-path style, e.g.
    `["jobs", 2, "operations", 1, "processingTime"]`, for the editor to
    highlight the exact field), `source: "schema" | "library" | "schedule"`,
    and `severity: "error" | "warning"`.
  - `ExecutionResult.validationError: ValidationError | null` →
    `validationIssues: ValidationIssue[]`.
  - Added web-only structural checks the Zod schema must cover beyond what
    `lekinpy` itself enforces: the `Machine.workcenterId`/
    `Workcenter.machineIds` consistency invariant (§3.1, now actually
    checked rather than just asserted), invalid operation indices, NaN/
    Infinity values, malformed RGB tuples, unknown algorithm ids, and
    `UNSUPPORTED_ALGORITHM_PROBLEM_COMBINATION` (ties PRODUCT_SPEC §6's
    compatibility-label requirement to an actual blocking check rather
    than UI-only advisory text).
  - Added a warnings list (severity: "warning", never blocks execution):
    due-before-release, unusually large weight, unusually long processing
    time, unclear status values, approaching (not yet exceeding) a
    browser limit.
  - §2.2's adapter step order now explicitly runs the Zod check
    (`validateExecutionRequest`) before Pyodide loads at all, not just
    before running the algorithm — avoids paying for a Pyodide spin-up on
    input already known to be invalid.
- Why: a unified issue shape is simpler for the Validation Messages tab to
  render (one list, filter by `severity`) and gives every issue enough
  context (`path`) to jump to the offending editor field, which the prior
  `jobId`/`operationIndex`/`workcenterId`/`machineId`-only shape didn't
  reliably provide for editor-level (non-library) issues.
- Alternatives considered / tradeoffs: considered separate
  `validationErrors`/`validationWarnings` arrays instead of one array with
  `severity` — went with the single array (matching the proposal's stated
  preference) since it avoids the risk of an issue being miscategorized
  into the wrong array and keeps "is execution blocked" a single
  `.some(i => i.severity === "error")` check.
- Tests added: none (still architecture-only).
- Status: in review — awaiting user re-review and approval before Codex
  starts building against it.

## Observed, not yet actioned
<!-- Anything noticed while working that's out of scope for the current
     item — note it here instead of fixing it inline, so it isn't lost. -->
- `ARCHITECTURE.md` §2.3: no decision yet on where the built `lekinpy`
  wheel is hosted/fetched from for Pyodide's `micropip.install()`. Needs
  resolving before the execution adapter can actually be implemented.
  **RESOLVED 2026-07-15** — see the v1.1 entry above; versioned same-origin
  static asset under `public/vendor/`, with checksum + documented replace
  process.
- `ARCHITECTURE.md` §6.2: manual-edit recalculation currently reimplements
  `lekinpy`'s `_assign_single_operation` placement rule on the web side
  (now generalized to a two-edge-type precedence graph, per the v1.1
  entry above) because no `SchedulingAlgorithm` accepts a partially-fixed
  schedule as input. Noted as a `lekin-library` enhancement candidate, not
  actioned.

## [2026-07-15] ARCHITECTURE.md v1.3: machine releases and persistent manual-start constraints
- Branch: `docs/architecture-v1`
- Phase: 1 (final architecture review before implementation)
- What changed:
  - Added `machine.release` to every scheduled operation's recalculation
    lower bound, matching `lekinpy`'s real machine-availability behavior.
  - Added `ManualStartConstraints`, owned by `ScheduleEditorState`, so an
    intentional requested start time persists across later unrelated edits
    and full graph recalculations.
  - Changed `ManualScheduleEdit.from`/`to` to snapshot the old and new
    requested-start constraint alongside machine and sequence position.
  - Defined exact semantics: queue-only moves preserve a constraint, time
    drags replace it, "start as early as possible" clears it, and undo/redo
    restores the complete old/new placement intent.
  - Updated the recalculation contract to accept and return the persistent
    constraint map and the `ProblemDefinition` needed to read machine release
    times.
  - Expanded §4.7's required tests for machine release, persistence across
    edits, undo/redo, clearing, hidden constraints, and same-slot no-ops.
- Why:
  - v1.2 could place an operation before its machine became available because
    the graph formula omitted `Machine.release`.
  - A requested start time existed only on the edit that introduced it; the
    next full topological recalculation had no durable record of that intent
    and could collapse the operation back to its earliest feasible time.
- Alternatives considered / tradeoffs:
  - Considered storing `requestedStartTime` directly on
    `ScheduledOperation`. Rejected because it is manual editing intent, not
    an observed scheduling result; a separate constraint map keeps that
    distinction explicit and makes reset/undo behavior clearer.
  - Chose explicit old/new constraint snapshots in every edit rather than
    reconstructing them from rendered timestamps, which may be later than the
    request because of precedence or machine constraints.
- Tests added: none (architecture-only pass); the implementation acceptance
  tests are specified in §4.7.
- Status: in review — ready for final user approval before implementation.

## [2026-07-15] Pin the lekinpy v0.2.0 wheel per ARCHITECTURE.md §2.3
- Branch: `chore/pin-lekinpy-wheel`
- Phase: 1 (unblocks the execution adapter, not yet built)
- What changed:
  - Executed §2.3's already-decided (v1.1) wheel-hosting process for the
    first time: checked out `lekin-library`'s `v0.2.0` tag in detached
    HEAD (resolves to commit `a3fee48` — the annotated tag object's own
    SHA is `34c9cad`, distinct from the commit it points to; noted here
    since it's easy to confuse the two), ran a clean `python -m build
    --wheel`, verified the resulting wheel's contents (only `lekinpy/`
    package files and `.dist-info`, no `docs`/`examples`/`tests`, matching
    `pyproject.toml`'s exclusions) and that `__version__ == "0.2.0"`
    inside it.
  - Added `public/vendor/lekinpy-0.2.0-py3-none-any.whl` and
    `public/vendor/lekinpy-0.2.0-py3-none-any.whl.sha256`
    (`e374e3d33049513947a943383838227ec383a6f2e2e1356b85c9e8234c1eacea`)
    to this repo.
  - Fixed a stale commit hash in `ARCHITECTURE.md`'s "Pinned dependency"
    line (`adf6e07` → `a3fee48`) — the original hash I recorded no longer
    resolves in `lekin-library` (likely rewritten by history changes on
    that repo, e.g. matplotlib becoming a core dependency and other
    commits landing after the fact); the tag itself still points at the
    same logical commit (same message, same content), just a different
    hash. Updated §2.3 from "Decision" to "Done" now that the asset
    actually exists.
- Why: this was the last fully-specified, non-UI, cross-repo prerequisite
  blocking the execution adapter (§2). No decision left to make here —
  §2.3 (v1.1) already fixed the path convention, checksum requirement, and
  replace process; this entry just executes it.
- Alternatives considered / tradeoffs: none — implementation of an already
  approved decision, not a new design choice. Built from `lekin-library`'s
  tagged commit in detached HEAD specifically (rather than whatever
  `master` happened to be at) so the wheel's provenance is unambiguous and
  matches what `ARCHITECTURE.md` documents as pinned, even though `master`
  has since moved further ahead with docs/example-only changes that don't
  affect the installable package.
- Tests added: none (build/packaging step, not application code).
  Independent review verified the wheel's ZIP integrity and SHA-256 digest,
  installed it without dependencies into a clean virtual environment,
  confirmed `lekinpy.__version__ == "0.2.0"`, and successfully ran FCFS,
  SPT, EDD, and WSPT against a two-job/four-operation problem. All four
  algorithms scheduled all four operations with positive durations and
  serialized the result successfully. Every packaged Python source file was
  also compared byte-for-byte with the `v0.2.0` tag. The checksum format is
  now explicit in `ARCHITECTURE.md` so browser verification and future wheel
  replacement use the same contract.
- Status: independently tested and approved for merge.
