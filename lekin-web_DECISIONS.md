# Decisions Log - lekin-web

Append-only log of changes made to `lekin-web`, in order, with reasoning.
Read this whole file at the start of every new session before doing any work.
Never delete or rewrite past entries - if a decision is later reversed, add a
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
  implementation started - waiting on `lekin-library` Phase 0 to complete
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
    drag-and-drop validation/recalculation contract - no UI/component
    code.
- Why: `MASTER_PROMPT_v2.md`'s division of responsibility puts schema and
  structure under Claude, visual/component implementation under Codex,
  with Codex building against this document plus `PRODUCT_SPEC.md`.
- Alternatives considered / tradeoffs:
  - Found the real `lekinpy` shape differs from `PRODUCT_SPEC.md` §15/17's
    placeholder JSON in several real ways - no `Metrics` are ever returned
    as data (only printed by `display_summary()`), `System.validate()`
    raises one error at a time rather than collecting a list, `Operation`
    has no id field or eligible-machine restriction, `Machine` has no
    parent-workcenter field. Chose to treat metrics computation and
    single-error validation as web-side responsibilities for v1 rather
    than reopening `lekin-library` scope (Phase 0 was scoped to exactly 7
    items and is closed) - flagged both as library-enhancement candidates
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
    codegen - `MASTER_PROMPT_v2.md` is explicit the library should have no
    knowledge a website exists.
  - Left the question of where the pinned `.whl` file is actually hosted
    for Pyodide to fetch unresolved - flagged in `ARCHITECTURE.md` §2.3 as
    a concrete Phase 1 blocker rather than assumed away.
- Tests added: none (architecture document only, no code).
- Status: in review - awaiting user review before Codex starts building
  against it.

## [2026-07-15] ARCHITECTURE.md v1.1: fix a real infeasibility gap in the drag-and-drop model
- Branch: `docs/architecture-v1`
- Phase: 1 (still pre-implementation)
- What changed: user review of v1 rejected it as-is and found a genuine
  correctness bug, not a style nit - revised §4 (drag-and-drop) and made
  four smaller corrections (§1.3, §1.7, §2.3, §3.1) in response. See
  `ARCHITECTURE.md`'s own revision note at the top for the full technical
  detail; summarized here:
  - **The critical fix**: v1 claimed any workcenter-eligible
    `(machine, position)` drop could always be resolved by pushing later
    operations forward. False - the user gave a concrete counterexample
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
    pass with zero `lekin-library` changes needed - the earlier answer
    conflated that with `system.validate()`'s single-error execution-time
    check, which is a separate, narrower thing that's correctly singular.
  - Resolved the wheel-hosting open question (§2.3) rather than leaving it
    open: a version-stamped same-origin static asset
    (`public/vendor/lekinpy-0.2.0-py3-none-any.whl`) with a checksum and a
    documented replace process, per the user's specific recommendation.
  - Fixed an inaccurate O(1)-lookup claim (§3.1) - arrays alone don't
    provide O(1) access; `ProblemEditorState` needs derived id-indexed
    `Map`s alongside the arrays.
  - Specified `machineUtilization`'s denominator precisely
    (`makespan - machine.release`, not raw `makespan`) and `Metrics`'
    exact behavior for empty schedules and jobs missing from a given
    schedule (§1.3).
- Why: the cycle case is a real, not hypothetical, failure mode the moment
  drag-and-drop ships - any user reordering two machines whose jobs also
  share cross-machine precedence could hit it. Catching this before Codex
  builds anything against the recalculation contract avoids a rebuild
  after the fact.
- Alternatives considered / tradeoffs: none recorded here - this entry
  documents an external review's findings and this session's response to
  them, not a original design choice with rejected alternatives.
- Tests added: none (still architecture-only); §4.7 was added specifying
  the required test coverage once this is implemented, including the
  exact cycle counterexample as a named regression case.
- Status: in review - awaiting user re-review and approval before Codex
  starts building against it.

## [2026-07-15] ARCHITECTURE.md v1.2: unify validation into validationIssues: ValidationIssue[]
- Branch: `docs/architecture-v1`
- Phase: 1 (still pre-implementation)
- What changed: adopted a concrete proposal (Codex, reviewed mid-session)
  closing a gap the v1.1 revision left open - §1.4's "two validation
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
    before running the algorithm - avoids paying for a Pyodide spin-up on
    input already known to be invalid.
- Why: a unified issue shape is simpler for the Validation Messages tab to
  render (one list, filter by `severity`) and gives every issue enough
  context (`path`) to jump to the offending editor field, which the prior
  `jobId`/`operationIndex`/`workcenterId`/`machineId`-only shape didn't
  reliably provide for editor-level (non-library) issues.
- Alternatives considered / tradeoffs: considered separate
  `validationErrors`/`validationWarnings` arrays instead of one array with
  `severity` - went with the single array (matching the proposal's stated
  preference) since it avoids the risk of an issue being miscategorized
  into the wrong array and keeps "is execution blocked" a single
  `.some(i => i.severity === "error")` check.
- Tests added: none (still architecture-only).
- Status: in review - awaiting user re-review and approval before Codex
  starts building against it.

## Observed, not yet actioned
<!-- Anything noticed while working that's out of scope for the current
     item - note it here instead of fixing it inline, so it isn't lost. -->
- `ARCHITECTURE.md` §2.3: no decision yet on where the built `lekinpy`
  wheel is hosted/fetched from for Pyodide's `micropip.install()`. Needs
  resolving before the execution adapter can actually be implemented.
  **RESOLVED 2026-07-15** - see the v1.1 entry above; versioned same-origin
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
- Status: approved and merged to `main` in architecture merge `6861d5c`.

## [2026-07-15] Pin the lekinpy v0.2.0 wheel per ARCHITECTURE.md §2.3
- Branch: `chore/pin-lekinpy-wheel`
- Phase: 1 (unblocks the execution adapter, not yet built)
- What changed:
  - Executed §2.3's already-decided (v1.1) wheel-hosting process for the
    first time: checked out `lekin-library`'s `v0.2.0` tag in detached
    HEAD (resolves to commit `a3fee48` - the annotated tag object's own
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
    line (`adf6e07` → `a3fee48`) - the original hash I recorded no longer
    resolves in `lekin-library` (likely rewritten by history changes on
    that repo, e.g. matplotlib becoming a core dependency and other
    commits landing after the fact); the tag itself still points at the
    same logical commit (same message, same content), just a different
    hash. Updated §2.3 from "Decision" to "Done" now that the asset
    actually exists.
- Why: this was the last fully-specified, non-UI, cross-repo prerequisite
  blocking the execution adapter (§2). No decision left to make here -
  §2.3 (v1.1) already fixed the path convention, checksum requirement, and
  replace process; this entry just executes it.
- Alternatives considered / tradeoffs: none - implementation of an already
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
- Status: merged to `main` in merge commit `0c9cf9a`.

## [2026-07-15] Phase 1 UI foundation: landing screen and workspace shell
- Branch: `feat/workspace-shell`
- Phase: 1, first visual implementation milestone
- What changed:
  - Replaced the generic starter preview with the LEKIN Lab landing screen and
    a responsive, desktop-first scheduling workspace shell.
  - Established the approved neutral visual system: warm off-white canvas,
    white work surfaces, restrained NYU violet accents, compact typography,
    muted semantic colors, and dense research-tool information hierarchy.
  - Added static but representative views for problem setup, algorithm choice,
    schedule metrics, a read-only machine Gantt chart, machine sequence, and
    the remaining detail tabs so later functionality has clear component
    boundaries to plug into.
  - Added only safe shell interactions: entering/leaving the workspace,
    selecting detail tabs, expanding setup sections, and invoking the native
    file chooser. No scheduling result is fabricated by an execution adapter.
  - Updated project metadata, favicon, package identity, and README.
- Boundary deliberately preserved: this branch does not implement Pyodide,
  schema/registry wiring, schedule execution, persistence, or Gantt
  drag-and-drop. Those remain separate milestones governed by
  `ARCHITECTURE.md`.
- Verification: ESLint passes; the production vinext build completes; the
  development server returns HTTP 200 and server-renders the LEKIN landing
  content.
- Independent review before merge:
  - Confirmed the branch contains no Pyodide, schema/registry wiring,
    scheduling execution, persistence, or drag-and-drop behavior.
  - Removed unused starter database, authentication-helper, sample API, and
    generic icon files plus their Drizzle dependencies. The Sites build and
    Worker adapter remain because they are the actual deployment path.
  - Added the generated `.vite/` dependency cache to `.gitignore`; without
    this, running the local server caused ESLint to scan generated vendor
    bundles and report thousands of irrelevant findings.
  - Re-ran lint and the production build after cleanup.
- Status: merged to `main` in merge commit `ed67632`.

## [2026-07-15] Isolate the browser UI shell for parallel core development
- Branch: `feat/browser-ui-shell`
- Phase: 1, React/browser integration foundation
- What changed:
  - Split the original monolithic `app/page.tsx` into focused landing,
    workspace, problem-sidebar, metrics, Gantt, and detail-tab components.
  - Moved representative schedule data into an explicitly presentation-only
    fixture module. It does not define or duplicate the shared schema and is
    intended to be replaced by `ExecutionResult` once the core adapter lands.
  - Added button types, navigation labels, tab semantics, selected-tab state,
    and descriptive labels around chart controls and imported files.
- Why: Claude is implementing framework-independent schema, registry, adapter,
  and scheduling logic in parallel. Keeping this branch entirely under
  `app/components/` gives the browser work a stable integration surface while
  preventing either branch from editing the other's files.
- Tests added: none; this is behavior-preserving component decomposition.
- Status: integrated with the reviewed core branch, verified as a combined
  build, and merged to `main` in merge commit `6f8eb4b`.

## [2026-07-15] lib/: schema, registry, recalculation engine, adapter core
- Branch: `feat/scheduling-core-lib`
- Phase: 1, first non-UI implementation milestone
- What changed:
  - Adopted a code-ownership split for the remaining implementation work:
    Claude owns `lib/` (pure TypeScript, no React/DOM/Pyodide dependency,
    unit-testable in Node); Codex owns everything touching the DOM, React,
    or browser APIs (`app/`, `components/`, `worker/`, the actual
    Pyodide/Web Worker plumbing). This keeps the two of us in different
    files by construction. See `lib/README.md` for the full map and the
    intended composition (adapter step order, drag-and-drop call sequence).
  - `lib/schema/`: Zod schemas + TS types for every ARCHITECTURE.md §1
    shape. `validateProblemDefinition()` implements the multi-error,
    client-side validation layer (§1.4) - structural type-shape check via
    Zod, then plain-function business-rule checks (duplicates,
    cross-references, positivity, `Machine.workcenterId`/
    `Workcenter.machineIds` consistency, `operationIndex` correctness,
    rgb range, NaN/Infinity) and a separate non-blocking warnings pass
    (due-before-release, unusually large weight/processing time, unclear
    status), all collected in one call.
  - `lib/registry/algorithms.ts`: the four built-in algorithms'
    `AlgorithmDefinition`s. `libraryMetadata` for each was verified
    directly against `lekin-library`'s `lekinpy/algorithms/*.py` at commit
    `a3fee48` (tag `v0.2.0`), not assumed. `verify.test.ts` is the
    registry-drift guard from §1.5 - opt-in (needs a local Python +
    `lekin-library` checkout via `LEKINPY_SOURCE`), and I ran it for real
    against the actual pinned library (all 4 passed), then deliberately
    broke one entry to confirm the guard actually catches drift before
    restoring it.
  - `lib/scheduling/`: `graph.ts` (the precedence graph - job edges fixed
    from `ProblemDefinition`, machine edges from the current queue order -
    and Kahn's-algorithm cycle detection/topological sort in one pass,
    §4.2/§4.3), `recalculate.ts` (`checkDropValidity()` for the two
    hard-reject cases and `recalculate()` for the topological placement
    pass, §4.4/§4.5), `metrics.ts` (`computeMetrics()`, §1.3, mirroring
    `display_summary()`'s exact min/max-over-a-job's-ops approach and its
    silent-exclusion-of-unscheduled-jobs behavior, with the precise
    `makespan - machine.release` utilization denominator from the v1.1
    revision).
  - `lib/adapter/`: `policy.ts` (`checkExecutionPolicy`, producing
    PRODUCT_SPEC §10's exact rejection wording), `validate-request.ts`
    (`validateExecutionRequest`, composing the Zod problem check with the
    `UNSUPPORTED_ALGORITHM_PROBLEM_COMBINATION` check, which needs both
    the problem and the selected algorithm id together), `translate.ts`
    (the snake_case/flat <-> camelCase/nested translation boundary,
    §2.2/§5 - `toLekinpySystemPayload`/`fromLekinpyScheduleDict`).
  - Added `zod` and `vitest` as dependencies; a `vitest.config.ts` scoped
    to `lib/**/*.test.ts`; a new `test:unit` script (left the existing
    `test` script, which runs lint+build, untouched so this doesn't change
    Codex's existing tooling assumptions).
- Why: this is the pure-logic layer the React/adapter-glue work depends on
  - in particular the recalculation engine, which went through two rounds
  of real correctness corrections during architecture review (the
  workcenter-eligibility-only claim, then the missing machine-release-time
  and non-persistent-constraint gaps) and was judged worth implementing
  directly rather than handing off as a spec, to minimize a third round of
  translation error.
- Alternatives considered / tradeoffs:
  - Considered doing all business-rule validation via Zod's
    `.superRefine()`/`ctx.addIssue()` API directly on `ProblemDefinitionSchema`.
    Rejected in favor of plain TypeScript functions run after a
    structural-only Zod parse succeeds: this keeps every `ValidationIssue`'s
    `code`/`path`/context fields under exact control instead of
    reverse-engineering them from Zod's own generic issue format, and is
    far more readable/testable as one linear pass over already-typed data.
  - `checkDropValidity()`'s topological order and `recalculate()`'s own
    topological pass are computed independently (not literally threaded
    through a shared call), even though ARCHITECTURE.md §4.5 step 2 notes
    they're "one computation shared between validation and recalculation."
    Recomputing is cheap at this scale (documented cost analysis in §4.3)
    and keeps `recalculate()` a self-contained pure function instead of
    requiring callers to pass through an opaque topo-order handle from a
    prior `checkDropValidity()` call. `recalculate()` still defensively
    re-checks for a cycle and throws if a caller ever invokes it with an
    edit that wasn't actually accepted first.
  - The registry-drift guard shells out to a real `python3` process rather
    than trying to run lekinpy's logic in-browser/in-Pyodide for the
    check - simpler, and this test only needs to run at dev-time/CI, never
    in the shipped app.
- Tests added: 50 passing (`npm run test:unit`), plus 4 opt-in
  (`lib/registry/verify.test.ts`, requires `LEKINPY_SOURCE`) - covering
  every case in §4.7's required list including the exact two-job/
  two-machine cycle counterexample from the architecture review, the
  dual-incoming-edge max() regression case, machine-release-time,
  persistent-constraint survival/undo/redo/clearing/hidden-then-revealed,
  and the full multi-error validation/policy/translation surface.
  Independent review added eight regression tests and runtime Zod schemas for `ValidationIssue`,
  `ExecutionResult`, and `ManualStartConstraints`; corrected empty-schedule
  utilization to the specified `{}`; implemented and tested the §4.7 true
  no-op guard; and added a reproducible `test:types` command scoped to the
  framework-independent layer. Full-project `tsc --noEmit` currently reports
  pre-existing missing Cloudflare Worker ambient types, so the earlier claim
  that it was globally clean was corrected rather than repeated.
- Status: independently reviewed, corrected, and merged to `main` in
  merge commit `a41c3ac`.

## [2026-07-16] Real-execution fixture and contract tests (framework-independent)
- Branch: `test/real-execution-fixture`
- Phase: 1, verification milestone - coordinates with Codex's separate
  browser/Pyodide/Web Worker integration work but does not implement or
  edit it (`app/`, `app/components/`, `worker/`, React state, browser APIs,
  drag-and-drop UI untouched; `main` untouched).
- Pre-work verification (per this task's explicit instructions): read
  `MASTER_PROMPT_v2.md`, `PRODUCT_SPEC.md`, `ARCHITECTURE.md` (full, v1.3 -
  unchanged since the last review except one clarifying sentence on the
  `.sha256` file's raw-digest format in §2.3), and this file, in full, then
  confirmed directly rather than assumed: `main` was at `d2c1266` (exactly
  the specified commit); `feat/scheduling-core-lib` and
  `feat/browser-ui-shell` were both already merged; `lib/schema`,
  `lib/registry`, `lib/adapter`, `lib/scheduling` all present;
  `public/vendor/lekinpy-0.2.0-py3-none-any.whl` + `.sha256` present and
  self-consistent (recomputed the digest directly, matched the committed
  file); `app/components/workspace/problem-sidebar.tsx` and `gantt-chart.tsx`
  still reference presentation-only `demo-data`; `lekin-library` still
  pinned at tag `v0.2.0` / commit `a3fee48` with no uncommitted source
  changes (only the pre-existing stale tracked `__pycache__` noise). No
  inconsistency found - proceeded.
- What changed:
  - `test/fixtures/real-execution/problem.ts`: one authored
    `ProblemDefinition` (the INPUT, never a handwritten expected
    schedule) - 3 jobs (2-3 operations each), 3 workcenters, 4 machines
    including two eligible machines at WC1 (`M1`, `M1b`), differing job
    releases/due dates/weights, and two nonzero machine release times
    (`M1b`=3, `M3`=1), specifically shaped so FCFS/SPT/EDD/WSPT pick
    genuinely different first jobs to dispatch (documented inline with the
    reasoning per algorithm).
  - `scripts/fixtures/run_lekinpy_fixture.py`: verifies the pinned wheel's
    SHA-256 against the committed `.sha256` before doing anything else;
    extracts the wheel into a fresh temp directory and imports `lekinpy`
    only from there (never a global/ambient install - this is the exact
    failure mode `lekin-library_DECISIONS.md` already documents once, a
    stale global install silently shadowing local source); after import,
    verifies both `lekinpy.__version__` AND that the resolved module's
    `__file__` actually resolves inside that extracted directory (a
    version-string match alone wouldn't catch a same-numbered shadowing
    install elsewhere on `sys.path`); builds a fresh `System` per
    algorithm (mutation from one algorithm run would otherwise corrupt the
    next); runs FCFS/SPT/EDD/WSPT; dumps raw `Schedule.to_dict()` +
    `metadata` per algorithm plus `lekinpy.__version__` as JSON to stdout.
  - `scripts/fixtures/generate-real-execution-fixture.ts`: orchestrates -
    validates the sample problem with `lib/schema` (must be zero-error),
    translates it with the real `toLekinpySystemPayload()`, shells out to
    the Python script above, translates each raw result back with the
    real `fromLekinpyScheduleDict()`, computes `Metrics` with the real
    `computeMetrics()`, cross-checks each algorithm's live metadata
    against `lib/registry`'s `ALGORITHM_REGISTRY` (abort on any mismatch),
    and writes `test/fixtures/real-execution/fixture.json`. Supports
    `--check` (regenerate into memory, deep-compare against the committed
    file sans the `generatedAt` timestamp, exit non-zero on any
    difference) for reproducibility verification without mutating the
    repo.
  - `lib/fixtures/real-execution.contract.test.ts`: 43 tests reading the
    committed fixture - translation-shape checks (payload field names
    exactly match `lekinpy`'s real constructor parameters), per-algorithm
    invariants (every operation scheduled exactly once, job precedence,
    no machine overlap, machine/job release times respected, duration ==
    `processingTime`) run across all four algorithms via
    `describe.each`, exact reproduction checks (`fromLekinpyScheduleDict()`
    on the stored raw dict reproduces the stored `webSchedule`;
    `computeMetrics()` on the stored schedule reproduces the stored
    `Metrics`; stored `libraryMetadata` matches the live registry),
    deliberate-drift-detection checks (a mutated raw dict/schedule/registry
    entry is asserted to actually stop matching, proving the equality
    checks above aren't vacuous), and JSON-round-trip validity.
  - `package.json`: added `fixture:generate` and `fixture:check` scripts
    (both `tsx scripts/fixtures/generate-real-execution-fixture.ts`, with
    `--check` for the latter); left `test`/`test:unit`/`test:types`
    untouched.
- Why: Codex's browser/Pyodide integration needs a stable, authoritative
  ground truth to build and debug against - real `lekinpy` output, not
  hand-written fixtures that could silently encode the same misconceptions
  the architecture review already twice caught in the recalculation logic.
  Generating the fixture from the actual pinned wheel (with checksum/
  version/import-path guards) makes it reproducible and tamper-evident
  rather than a one-time manual capture.
- Alternatives considered / tradeoffs:
  - Considered running the Python step against whatever `lekinpy` a
    developer's environment happens to have installed. Rejected per the
    task's explicit instruction and the project's own prior incident
    (`lekin-library_DECISIONS.md`'s stale-global-install entry) - the
    wheel-extraction-plus-`__file__`-check approach is the only one that
    actually guarantees the fixture reflects the pinned wheel and not
    ambient state.
  - Considered generating the fixture directly from TypeScript via a
    Pyodide-in-Node harness instead of shelling out to real CPython.
    Rejected: heavier, slower, and further from what the browser will
    actually run than just invoking the same CPython the wheel targets;
    shelling out to `python3` is simpler and the checksum/version/path
    guards give an equivalent provenance guarantee without it.
  - Considered a single flat `problem` + `schedules` fixture file without
    the raw `lekinpy` dict alongside the translated `webSchedule`. Kept
    both so the contract tests can prove `fromLekinpyScheduleDict()`
    itself is correct (raw -> translated), not just assume it.
- Tests added/run:
  - 43 new contract tests (`lib/fixtures/real-execution.contract.test.ts`).
  - `npm run test:unit`: 93 passed, 4 opt-in skipped (up from 50 passed
    before this branch).
  - `npm run test:types`: clean. Full-project `npx tsc --noEmit -p
    tsconfig.json` also re-checked: only the pre-existing, already-
    documented `worker/index.ts` Cloudflare ambient-type errors, no new
    errors from anything added on this branch.
  - `eslint lib/` and `eslint scripts/fixtures test/fixtures`: both clean;
    sanity-checked eslint was actually scanning the new files by
    temporarily introducing an unused variable and confirming it was
    flagged, then removing it.
  - Live registry-drift guard (`LEKINPY_SOURCE=../lekin-library npx vitest
    run lib/registry/verify.test.ts`): 4/4 passed against the real pinned
    library.
  - `npm run fixture:check`: passed - the committed fixture is exactly
    what a fresh run against the pinned wheel produces right now.
  - Manually verified both required failure modes fail clearly and exit
    non-zero: corrupted the committed `.sha256` (checksum-mismatch path)
    and passed a wrong `--expected-version` directly to the Python script
    (version-mismatch path); both produced explicit, specific error
    messages naming the mismatch, not a silent or generic failure. The
    `.sha256` file was restored immediately after and reverified clean
    (`git status`/digest recheck) before continuing.
- Discrepancies found between the real library and `ARCHITECTURE.md`:
  none. The translation boundary (`toLekinpySystemPayload`'s field names/
  nesting), the four algorithms' `libraryMetadata`, and every recalculation
  invariant `ARCHITECTURE.md` documents (precedence, no-overlap, machine/
  job release floors, duration == processingTime) all matched the real
  pinned library's actual behavior exactly on this run - no architecture
  update needed.
- Status: merged to `main` as part of the combined Phase 1 integration.

## [2026-07-15] Combined Phase 1 integration audit
- Branch: `main`
- Merged: `test/real-execution-fixture` (`ea2a481`) and
  `feat/browser-execution-adapter` (`6c33946`). The only merge conflict was
  this persistent log; both source entries were preserved. Application code,
  fixture tooling, package scripts, and dependencies combined without a
  source conflict.
- Combined verification, run after both merges:
  - clean dependency installation under Node `22.23.1`;
  - 98 unit/contract tests passed, with four intentionally opt-in registry
    tests skipped by the general run;
  - all four registry-drift tests then passed live against
    `../lekin-library`;
  - the committed real-execution fixture exactly matched a fresh execution
    against the pinned lekinpy wheel;
  - library-layer TypeScript checking, ESLint, and the production vinext
    build all passed;
  - the production server returned the application, pinned wheel, and raw
    checksum successfully over localhost.
- Remaining verification limitation: no controllable browser was available
  in this session, so clicking Run and observing the Pyodide Worker result
  still needs one manual browser smoke test. This is the only uncompleted
  integration check; it is not represented as passing.
- Dependency audit note: `npm ci` currently reports 13 transitive findings
  (2 low, 5 moderate, 6 high). No automatic `npm audit fix` was applied
  because forced dependency upgrades could change the vinext/Pyodide stack;
  triage should be a separate reviewed maintenance item.
- Delivery: pushed to `origin/main` and published as an owner-only Sites
  deployment at `https://lekin-lab-workbench.rvt2018.chatgpt.site`.
- Status: both completed feature branches are merged to `main`; combined
  non-browser verification and private publication are complete.

## [2026-07-15] Make algorithm changes visible in the built-in sample
- Branch: `fix/distinct-algorithm-sample`
- Finding: rerunning with another algorithm was not stuck. Independent
  execution showed FCFS, SPT, EDD, and WSPT all produced the exact same
  29-unit schedule for the original sample because its release ordering and
  dispatch priorities never created a meaningful choice.
- Change: reshaped the same three-job/eight-operation sample using the proven
  real-execution fixture pattern: disagreeing release times, due dates,
  weights, and first-operation durations; parallel WC-CUT machines; and a
  nonzero finishing-machine release. Identifiers and UI colors remain stable.
- Why: the default sample is a teaching and verification surface. Selecting a
  different algorithm must produce a visibly different sequence when the
  algorithms genuinely make different decisions, or a correct rerun looks
  like broken state management.
- Verification: all 98 unit/contract tests, type checks, fixture reproduction,
  lint, and production build passed. The real Playwright rerun executed all
  four algorithms on port 3000 and proved the FCFS and EDD rendered schedules
  differ from SPT while cancellation still works.
- Status: verified and merged to `main`.

## [2026-07-15] Playwright end-to-end browser test foundation
- Branch: `test/e2e-playwright` (not merged)
- Phase: cross-cutting browser verification
- What changed:
  - Added Playwright Test with a Chromium project and a production-server
    harness. The suite builds and starts the vinext application itself, uses
    one deterministic worker, and retains traces, screenshots, and video only
    when a test fails. `PLAYWRIGHT_BASE_URL` can target an already-running
    server, which allowed the exact localhost instance reported by a user to
    be distinguished from a clean-build result.
  - Added fast tests for landing content, sample-workspace navigation,
    algorithm registry options, empty-result states, detail tabs, return
    navigation, and keyboard activation.
  - Added a real-not mocked-browser execution test. It cold-loads Pyodide in
    the Web Worker, observes the pinned wheel and checksum requests, executes
    SPT, FCFS, EDD, and WSPT, and checks the rendered eight operations,
    non-empty metrics, validation state, and execution details after every
    run. A separate test verifies cancellation returns the UI to a runnable
    state.
  - Added explicit `fixme` specifications for the product flows that do not
    exist yet: editing, import/export, persistence, comparisons, and Gantt
    drag-and-drop. These serve as a visible acceptance backlog and prevent the
    test report from implying those controls are functional.
- Why: unit and fixture tests establish scheduling correctness, but they do
  not prove that the production bundle, Worker, CDN runtime, wheel integrity
  check, React state, and rendered results compose successfully in a browser.
- Verification:
  - The first run correctly exposed three overly strict text locators while
    simultaneously proving that real SPT execution completed and rendered a
    makespan of 29 with all eight operations. The locators were corrected to
    assert the status component rather than a text-node implementation detail.
  - Final run: 6 implemented browser flows passed; 6 future product flows were
    explicitly skipped as `fixme`; all four algorithms executed through real
    Pyodide with no browser console or page errors.
  - Follow-up diagnosis found a stale localhost production process serving
    HTML whose hashed JavaScript asset no longer existed after another build
    replaced `dist/`. The same tests failed against that exact server before
    workspace navigation, then passed 2/2 against a clean isolated `main`
    server on the same port after restart.
  - The algorithm-rerun check now fingerprints rendered bar labels and
    positions and asserts that FCFS and EDD visibly differ from SPT for the
    comparison sample; changing only the execution label is no longer enough
    for this test to pass.
- Status: test foundation complete on its feature branch; awaiting the
  Problem Editor branch so the first two `fixme` flows can be implemented.

## [2026-07-15] Browser execution adapter and first real schedule rendering
- Branch: `feat/browser-execution-adapter`
- Phase: 1, browser execution integration (not merged)
- What changed:
  - Added a module Web Worker that lazily loads pinned Pyodide `314.0.2`,
    verifies the vendored lekinpy `0.2.0` wheel against its checked-in
    SHA-256 digest, installs it without unused scientific dependencies,
    constructs a real `lekinpy.System`, validates it, and runs FCFS, SPT,
    EDD, or WSPT entirely in the browser.
  - Added `BrowserExecutionEngine` as the browser boundary around the pure
    `lib/` policy, validation, translation, and metrics functions. It owns
    Worker lifecycle, progress, cancellation, the execution-only timeout,
    library-exception mapping, and completed `ExecutionResult` assembly.
  - Replaced the presentation-only `demo-data.ts` schedule with a typed
    `ProblemDefinition` sample. The algorithm selector and Run button now
    invoke the adapter; metrics, Gantt bars, machine sequences, validation,
    and execution details render from the returned real result.
  - Editing, persistence, comparison history, and drag-and-drop remain out
    of scope for this branch and are still later milestones.
- Why: this is the smallest end-to-end slice that changes the workspace from
  a visual mockup into a real local scheduler while keeping all scheduling
  logic in the already-reviewed framework-independent layer.
- Reliability checks:
  - 55 unit tests pass; four opt-in registry drift tests remain skipped
    unless a local source path is supplied.
  - `test:types` and ESLint pass.
  - Production build passes under Node `22.23.1`, satisfying the repository's
    declared `node >=22.13.0` requirement. Node `20.17.0` cannot build the
    current vinext toolchain because it lacks `fs.promises.glob`.
  - The checked-in wheel digest matches the wheel bytes, and the wheel was
    independently installed and used to produce a one-operation SPT schedule.
  - An automated in-browser execution check was attempted, but no browser
    runtime was available in this session; the Worker/Pyodide network path
    therefore still requires a manual browser smoke test before merge.
- Status: merged to `main` as part of the combined Phase 1 integration.

## [2026-07-16] Real Problem Editor
- Branch: `feat/problem-editor`
- Phase: 1, editable-problem milestone
- Ownership note: this branch touches `app/components/workspace/*.tsx` and
  `app/globals.css`, not just `lib/`. That crosses the Claude-owns-`lib/`/
  Codex-owns-`app/` split used since `feat/scheduling-core-lib` (see that
  entry and `lib/README.md`) - flagging explicitly since it's a deliberate
  deviation for this task, not an oversight. Checked first: no other
  worktree was active and `main` had not moved since the last session, so
  there was no live collision risk. All actual state-transition logic
  (everything except JSX and CSS) still lives in `lib/editor/`, pure and
  unit-tested, matching the project's established pattern regardless of
  which side of the boundary touched it this time.
- Pre-work verification: read `MASTER_PROMPT_v2.md`, `PRODUCT_SPEC.md`,
  `ARCHITECTURE.md` (unchanged since the last full read), and this file, in
  full. Confirmed directly: `main` at `51e6192`, clean, matching
  `origin/main`; no other worktrees active; `app/execution/sample-problem.ts`
  held the only `ProblemDefinition`, imported as a fixed constant into
  `WorkspaceShell`; `ProblemSidebar` was 100% read-only/decorative for
  jobs/operations/workcenters/machines - no forms, no dispatch, "＋ Add job"
  had no handler. No inconsistency found - proceeded.
- What changed:
  - `lib/editor/problem-editor.ts`: pure `ProblemDefinition` state
    transitions - `addJob`/`updateJob`/`removeJob`,
    `addOperation`/`updateOperation`/`removeOperation`/`moveOperation`,
    `addWorkcenter`/`updateWorkcenter`/`removeWorkcenter`,
    `addMachine`/`updateMachine`/`removeMachine`, plus
    `problemEditorReducer` (a thin action-dispatch layer over all of the
    above, so `app/` only needs `useReducer(problemEditorReducer, ...)` and
    JSX - no state-transition logic lives in a component).
    `operationIndex`/`operationId` are recomputed from array position on
    every add/remove/move (`reindexOperations`), per ARCHITECTURE.md §1.1.
  - Scope decision: **entity ids (`jobId`/`workcenterId`/`machineId`) are
    set at creation time and not editable afterward** - only settable via
    the `add*` functions. This removes the entire cascade-rename question
    (what happens to every reference when an id changes) without reducing
    what's actually configurable: every non-identity field, and *which*
    workcenter/machine something is assigned to, remains freely editable.
  - ARCHITECTURE.md §3.1 explicitly requires the editor to keep
    `Machine.workcenterId`/`Workcenter.machineIds` consistent "on every
    add/edit/delete/move-machine-between-workcenters operation" - actively
    maintained here, not left for validation: `addMachine` appends to both
    sides; `removeMachine` cleans the machine out of its workcenter's
    `machineIds`; `updateMachine` changing `workcenterId` relocates the
    machine between both workcenters' lists (the literal
    "move-machine-between-workcenters" case named in §3.1);
    `removeWorkcenter` cascade-removes its member machines (no sensible
    default reassignment exists, and leaving them dangling would violate
    the same invariant). By contrast, `Operation.workcenterId` references
    are deliberately **not** cascaded on workcenter deletion - §3.1 never
    asks for that - so deleting a workcenter still referenced by an
    operation is exactly the "deleting referenced entities" scenario live
    `MISSING_WORKCENTER_REFERENCE` validation is meant to catch and surface,
    not silently repair.
  - `lib/editor/result-staleness.ts`: `isResultStale()`, a pure predicate
    comparing what `(problem, algorithmId)` a stored `ExecutionResult` was
    actually computed for against the live values (reference inequality -
    every editor mutation returns a new `ProblemDefinition` object, so this
    needs no deep-equality or hashing).
  - `app/components/workspace/workspace-shell.tsx`: replaced the fixed
    `SAMPLE_PROBLEM` constant with `useReducer(problemEditorReducer,
    SAMPLE_PROBLEM)` (SAMPLE_PROBLEM is now only the *initial* value); live
    validation via `useMemo(() => validateExecutionRequest(problem,
    algorithmId), [problem, algorithmId])`; `run()` now passes the live
    `problem`, not the constant; stale-result clearing is adjusted
    *during render* (`if (isResultStale(...)) { setResult(null); ... }`)
    rather than in a `useEffect` - ESLint's `react-hooks/set-state-in-effect`
    rule caught the effect-based version (calling `setState` synchronously
    in an effect causes an extra cascading render); switched to React's own
    documented "adjusting state when a dependency changes" pattern instead,
    which is also what makes `isResultStale` a plain, DOM-free unit-testable
    function rather than logic buried in an effect body.
  - `app/components/workspace/problem-sidebar.tsx`: real forms - Jobs
    section with nested Operations (workcenter select, processing-time
    input, reorder ↑/↓, delete, per-operation and per-job inline issue
    lists via `IssuesFor`/`JobLevelIssues`, both matching on the
    `ValidationIssue` object's own `jobId`/`operationIndex` fields rather
    than parsing its `path`); Workcenters and Machines sections with
    add/edit/delete and per-row issue badges (`IssueBadge`, counting only
    `severity: "error"`); "＋ Add machine" disabled when no workcenter
    exists yet (rather than creating an immediately-dangling machine); all
    editing controls `disabled={running}`, matching the existing algorithm
    selector's pattern; Run button `disabled={!running && !canRun}`,
    relabeled "Fix validation errors to run" when blocked.
  - `app/components/workspace/detail-tabs.tsx`: now takes a
    `validationIssues: ValidationIssue[]` prop (the live ones) instead of
    reading `result?.validationIssues` for the Validation tab and its badge
    count - "live" per the task, always present (not just after a run
    attempt), and each row now labels itself Error/Warning.
  - `app/globals.css`: additive rules only (`.entity-row`,
    `.entity-fields`, `.operation-row`, `.field-issues`, `.issue-badge`,
    `.remove-button`, etc.), reusing the existing `--violet`/`--warning`/
    `--muted`/`--line` variables and the same font-size/spacing scale as
    `.field-label`/`.job-row`; no existing rule or breakpoint changed.
- Why: this is the smallest slice that turns "run a fixed sample problem"
  into "define and run your own problem," while keeping every actual
  state-transition rule in `lib/`, pure and tested, so the form components
  stay thin JSX wiring - consistent with how the execution adapter and
  recalculation engine were built.
- Alternatives considered / tradeoffs:
  - Considered allowing entity-id rename with cascading reference updates.
    Rejected for this branch: real complexity (every `Operation`/`Machine`
    reference would need updating, and mid-rename states are ambiguous) for
    a capability the task didn't explicitly require; delete-and-recreate
    already covers the same end state. Documented as a known limitation
    below, not silently dropped.
  - Considered leaving `removeWorkcenter` non-cascading (matching
    `removeMachine`'s "let validation catch it" philosophy) for
    consistency. Rejected because ARCHITECTURE.md §3.1's invariant is
    explicit and unconditional for Machine/Workcenter specifically - cascade
    is what "kept consistent on every ... delete ... operation" requires
    here, even though the *symmetric-looking* Operation/Workcenter case
    correctly stays non-cascading (§3.1 doesn't cover it).
  - Considered testing `isResultStale`'s usage inside `WorkspaceShell`
    directly with a React component-testing setup. No `@testing-library/*`
    or `jsdom`/`happy-dom` is installed (checked `package.json`/
    `package-lock.json` first - only present as vitest's own optional peer
    deps, not actually installed); adding a full component-testing stack
    for one behavior was judged out of proportion to this task. Extracted
    the decision into a plain, thoroughly unit-tested pure function instead
    and left the one-line render-time call as thin, obviously-correct
    wiring - same tradeoff already made for the rest of this branch's state
    logic.
- Tests added: 23 new (`lib/editor/problem-editor.test.ts`,
  `lib/editor/result-staleness.test.ts`) covering every required critical
  flow: duplicate ids (both "the editor's own id generation never produces
  one" and "if one arises anyway, live validation still catches it, proven
  directly rather than only inferred"), missing workcenter references
  (deleting a still-referenced workcenter), empty operations (removing a
  job's last operation), non-positive processing time, deleting referenced
  entities (the workcenter-deletion case above, plus the §3.1
  machine/workcenter cascade tests), operation reindexing (add/remove-from-
  middle/move, each asserting both `operationIndex` and `operationId`),
  and stale-result clearing (no-result / same-reference / any-edit /
  algorithm-only-change, all via `isResultStale`).
- Verification, run under Node `v22.23.1` (the required `>=22.13.0`; the
  default Node in this environment, `v20.17.0`, cannot build the vinext
  toolchain per the existing documented limitation above - used
  `/opt/homebrew/Cellar/node@22/22.23.1/bin` directly, since the `node@22`
  Homebrew `opt` symlink was pointing at the wrong Cellar path):
  - `npm run test:unit`: 121 passed, 4 opt-in skipped (up from 98 before
    this branch).
  - `npm run test:types`: clean.
  - `npm run fixture:check`: passed - unaffected by this branch, reverified
    anyway since it shares the `lib/schema`/`lib/adapter` modules this
    branch's forms now write through.
  - Live registry-drift guard (`LEKINPY_SOURCE=../lekin-library`): 4/4
    passed.
  - `npm test` (`lint && build`) under Node `22.23.1`: both passed; the
    production `vinext build` completes (the `pyodide.mjs` Node-builtin
    externalization warnings are pre-existing/benign, unrelated to this
    branch).
  - `npx tsc --noEmit -p tsconfig.json` (full project, not just `lib/`):
    only the pre-existing, already-documented `worker/index.ts` Cloudflare
    ambient-type errors - no new errors from anything on this branch.
  - `eslint` across every changed area (`lib/editor`, all four touched
    `app/components/workspace/*.tsx`): clean. Caught one real issue along
    the way (`react-hooks/set-state-in-effect` on the first version of the
    stale-result-clearing logic), fixed per ESLint's own recommended
    pattern rather than suppressed.
- Known limitations (not implemented, matching the task's explicit
  exclusions plus what fell out of the scope decisions above):
  - No id rename/cascade-rename - delete and recreate instead.
  - No persistence, import/export, comparison history, or drag-and-drop -
    unchanged from before this branch; the app-bar's Import/Export/New
    buttons remain inert, as they already were.
  - No React-component-level test for `WorkspaceShell`'s render-time
    stale-result reset specifically (the underlying decision function is
    fully tested; the one-line call site is not, per the tradeoff above).
  - `lekin-library` untouched, as required.
- Status: implemented on `feat/problem-editor`, not merged, not pushed, not
  deleted - ready for independent Codex review.

## [2026-07-16] Independent Problem Editor review and browser acceptance
- Branch: `feat/problem-editor`
- Integration reviewed: merged current `main` (including the corrected
  comparison sample) and `test/e2e-playwright` into the editor branch. The
  only source conflict was this persistent log; all historical entries were
  retained.
- Review result: the pure reducer and React wiring match the documented
  scope. The live `ProblemDefinition` is passed to the execution adapter;
  machine/workcenter membership is updated on both sides; operation order
  changes reindex identifiers; blocking validation controls Run; and an
  existing result is cleared immediately when either the problem or selected
  algorithm changes.
- Review correction: operation and machine workcenter selects, plus entity
  delete buttons, did not have entity-specific accessible names. Added those
  names so screen-reader/keyboard users and browser automation can identify
  the exact operation, job, workcenter, or machine being changed. No domain
  behavior changed.
- Browser acceptance added:
  - create and edit a fourth job, add/reorder/remove operations, observe
    `EMPTY_OPERATIONS` and `NON_POSITIVE_PROCESSING_TIME` inline and in the
    Validation tab, repair the problem, then execute it through real Pyodide
    and render all nine operations;
  - add a workcenter, observe `EMPTY_MACHINE_LIST`, add and move a machine
    into it, delete it, delete a referenced workcenter, and observe the
    expected `MISSING_WORKCENTER_REFERENCE` blocking state;
  - execute a schedule, edit processing time, prove the old Gantt/metrics
    clear immediately, rerun, change algorithms, prove the result clears
    again, and rerun to a real FCFS result.
  These replace the first two editor `fixme` placeholders. Import/export,
  persistence, comparison history, and Gantt drag-and-drop remain explicit
  skipped backlog items because those product capabilities do not exist yet.
- Independent verification under Node 22:
  - 121 unit/contract tests passed; four opt-in tests skipped in the general
    run, then the same four registry-drift tests passed live against
    `../lekin-library`;
  - library TypeScript checking, ESLint, fixture reproduction, and the
    production vinext build passed;
  - 9 implemented Chromium end-to-end flows passed, including all four real
    lekinpy algorithms, cancellation, editor validation, custom-problem
    execution, and stale-result reruns; four not-yet-built product flows were
    explicitly skipped;
  - visual QA at 1440×1000 confirmed the real Gantt renders eight operations
    across four machine lanes with the expected metrics and machine sequence
    table, without clipping or overlap.
- Delivery: merged to `main` as `071f106`, pushed to `origin/main`, and
  published privately at `https://lekin-lab-workbench.rvt2018.chatgpt.site`.
  The merge commit contains no co-author trailer.
- Status: independently accepted, merged, pushed, and published.

## [2026-07-16] Remove em dashes from authored project text
- Scope: all authored LEKIN web source, tests, architecture/product
  documentation, and this persistent log. Dependencies, generated builds,
  test artifacts, Git metadata, and binary files remain untouched.
- Decision: use the regular hyphen character in place of em dashes across the
  project, including visible UI copy and empty metric placeholders.
- Verification plan: scan the authored workspace for the Unicode em dash,
  then run unit tests, type checks, lint, the production build, and browser
  acceptance tests before delivery.
- Verification: authored-source scan returned zero em dash characters; 121
  unit tests passed with four opt-in skips; TypeScript, ESLint, production
  build, and all 9 implemented Chromium acceptance flows passed (four
  not-yet-built product flows remain explicitly skipped).
- Delivery: merged to `main` and pushed to `origin/main`. The hosted build was
  refreshed from the same verified source.
- Status: verified, merged, pushed, and published.

## [2026-07-15] Surface already-computed results data (Job Details, Machine Sequence, weighted metrics)
- Branch: `feat/results-detail`, created from `main` (not from
  `feat/problem-editor`, which had already been independently reviewed and
  merged; this is an unrelated concern about the results/detail tabs).
- Trigger: PRODUCT_SPEC.md section 4.2 names both the metrics area (7
  aggregate figures) and the detail tabs (Machine Sequence, Job Details,
  Algorithm Comparison, Validation Messages, Execution Information) as
  required surfaces, mirroring `lekinpy`'s `display_summary()`,
  `display_job_details()`, and `display_machine_details()`. Several fields
  were already computed by `computeMetrics()`/present on `ScheduledOperation`
  but never rendered: `weightedCompletionTime`, `weightedTardiness`,
  per-machine `machineUtilization`, per-operation `startTime`/`endTime`, and
  any real per-job breakdown (the Job Details tab previously showed a single
  aggregate sentence).
- What changed:
  - `lib/results/job-summary.ts` (new): `buildJobSummaries(schedule,
    problem)` returns one row per problem job (release, due, weight,
    completion time, tardiness, its operations sorted by `operationIndex`
    regardless of machine iteration order). A job with zero
    `ScheduledOperation`s in the schedule reports `completionTime`/
    `tardiness` as `null` and `scheduled: false`, matching
    `computeMetrics()`'s existing silent-exclusion behavior rather than
    showing a misleading 0. Covered by `lib/results/job-summary.test.ts`
    (5 tests: tardy job, unscheduled job, zero-not-negative tardiness,
    cross-machine operation sorting, one row per problem job independent of
    schedule content).
  - `app/components/workspace/detail-tabs.tsx`: Machine Sequence now shows
    each machine's release time, computed utilization percent, and each
    operation chip's start-end time (previously job/operation id only). Job
    Details now renders `buildJobSummaries()` as a real per-job block
    (release/due/weight/completion/tardiness/not-scheduled, then its
    operations with machine and start-end time) instead of a one-line count.
    Execution tab appends weighted completion time and weighted tardiness.
    Takes a new required `problem` prop (used for machine release lookup and
    job summaries).
  - `app/components/workspace/workspace-shell.tsx`: passes `problem` to
    `DetailTabs`.
  - `app/globals.css` (additive only): `.job-summary-row`/`.job-summary-head`
    for the new per-job block layout; added `flex-wrap:wrap` and vertical
    padding to the existing `.sequence-table>div` row so the added
    start-end/release/utilization text and the growing operation-chip lists
    wrap instead of clipping against `.details-card`'s `overflow:hidden`
    (pre-existing risk for any machine with several operations, not
    introduced by this change, just made more likely by the added text).
- Scope decisions:
  - Algorithm Comparison tab is untouched (explicitly a later milestone;
    there is nothing computed yet to surface there).
  - Top-line `MetricsRow` (the 4 always-visible cards near the Gantt chart)
    is unchanged. The two still-missing aggregate figures
    (`weightedCompletionTime`, `weightedTardiness`) were added to the
    Execution tab instead of as new top-line cards, to avoid restructuring
    `.metrics`'s fixed 4-column grid and its two breakpoint overrides, which
    are Codex's visual-layer work. `maxTardiness` was already surfaced (as
    part of the "Late jobs" card's note) before this change.
  - Per-machine `machineUtilization` (as opposed to the already-shown
    average) is shown per-row in Machine Sequence rather than as additional
    top-line cards, for the same reason.
- Concurrent-edit note: while implementing this, another process was found
  live-editing ~30 unrelated files directly in this same `lekin-web`
  checkout (matching the em-dash-removal decision above going from
  "verification pending" to "verified and ready to merge" mid-session).
  Confirmed with the project owner that this was expected. To avoid bundling
  that unrelated, uncommitted work into this commit, only the files listed
  above (plus this entry) were staged and committed; every other modified
  file was left exactly as the concurrent process had it, untouched.
- Verification, under Node 22.23.1 (`>=22.13.0` required; system default is
  v20.17.0):
  - `npm run test:unit`: 126 passed, 4 opt-in skipped (up from 121; the 5 new
    `job-summary.test.ts` cases);
  - `npm run test:types`: clean;
  - full-project `tsc --noEmit`: only the pre-existing, unrelated
    `worker/index.ts` Cloudflare ambient-type errors (`Fetcher`,
    `D1Database`), untouched by this branch;
  - `npm test` (ESLint + production `vinext build`): passed;
  - `e2e/*.spec.ts` were checked for any dependency on the old tab text or
    `.sequence-table` shape: none found, so not run against this branch
    (they require a live Pyodide/Chromium environment not exercised here);
  - scanned all new/changed files for the Unicode em dash per the prior
    entry's convention: none found.
- Known limitations: no comparison across algorithm runs (unchanged, out of
  scope); Job Details and Machine Sequence are read-only display, no
  drag-and-drop or manual-edit affordance (unchanged, later milestone).
- Status: implemented on `feat/results-detail`, not merged, not pushed, not
  deleted.

## [2026-07-16] Independent review of result detail views
- Reviewed commit: `f25d9a9` from `feat/results-detail`, integrated on top of
  current `main` so the em dash cleanup and result-detail work were tested as
  one prospective release.
- Review result: `buildJobSummaries()` derives completion and non-negative
  tardiness correctly, preserves every problem job (including an explicit
  not-scheduled state), and presents operations in job order even when the
  schedule groups them by machine. Machine release/utilization and weighted
  metrics are read from the existing typed problem/result data rather than
  recomputed in the React component.
- Review gap corrected: the feature had five pure helper tests but no browser
  coverage for the new user-visible fields. Added a production-browser test
  that runs the real SPT algorithm through Pyodide and checks exact known
  values from the sample fixture: M-01 at 69% utilization, J-103 O2 at 2-7,
  J-101 completion at 13, J-101 O1 on M-01B at 3-7, weighted completion 75,
  and weighted tardiness 0.
- Verification: 126 unit/contract tests passed with four opt-in skips; all
  four live registry-drift checks passed; the real fixture reproduced; type
  checks, ESLint, and the production build passed. The complete Chromium
  acceptance suite passed with 10 implemented flows and four explicitly
  unbuilt product flows skipped.
- Remaining product scope: weighted metrics are now visible in Execution but
  are not yet promoted into the always-visible top Metrics row. Algorithm
  comparison, persistence/import-export, and Gantt drag editing remain later
  milestones.
- Delivery: merged to `main` as `780d5f7` and pushed to `origin/main`; no
  co-author trailer was added.
- Status: independently accepted, merged, pushed, and ready to publish.

## [2026-07-16] Resize Problem Editor entity controls
- Branch: `fix/sidebar-control-sizing`, created from clean current `main`.
- Trigger: Jobs, Workcenters, and Machines were functionally editable but the
  original 272 px setup panel forced their labels, selects, numeric fields,
  status fields, and delete actions into cramped rows.
- Change: made the setup panel responsive from 300-360 px on normal desktop
  widths and 280 px on compact desktop widths; arranged the three job numeric
  fields as equal columns; gave operation and machine workcenter selectors
  explicit usable minimum widths; slightly widened duration inputs; moved flat
  entity IDs onto a clear first line; and anchored workcenter/machine delete
  actions in a consistent 24 px target so they no longer consume input width.
- Scope: visual sizing and layout only. Editor state, validation, execution,
  scheduling, schemas, and the mobile breakpoint are unchanged.
- Browser acceptance: added a measured 1280x900 layout test that requires a
  setup panel of at least 300 px, minimum widths for all Job/Workcenter/Machine
  controls, and zero horizontal sidebar overflow. The test and all three
  existing Problem Editor browser flows pass against a production build.
- Repository audit: before the change, local and remote branch lists both
  contained only `main`; every previously completed feature/review branch was
  already merged and removed.
- Delivery: merged to `main` and pushed to `origin/main` with no co-author
  trailer; the private hosted build was refreshed from the same source.
- Status: verified, merged, pushed, and published.

## [2026-07-16] Screenshot-driven Problem Editor correction and complete schedule summary
- Branch: `fix/editor-layout-summary`, created from clean current `main`.
- Trigger: visual review of the expanded Job editor showed that the preceding
  minimum-width adjustment did not solve the underlying composition problems.
  Job metadata ran together, operation controls wrapped unpredictably, action
  buttons detached from their operations, and the overall form appeared like
  a collection of compressed inline controls rather than an intentional editor.
- Problem Editor correction:
  - changed job headings into distinct ID, operation-count, due, and weight
    regions;
  - changed every operation into a labeled card with a heading/action row and
    a separate Workcenter/Duration field row;
  - changed Workcenter and Machine entries into consistent cards with named
    fields and fixed action targets;
  - made operation numbering human-facing and one-based;
  - replaced the decorative collapse affordance with working collapse and
    expand behavior that leaves a narrow labeled rail.
- Schedule Summary: added a separate section below the Gantt chart containing
  every aggregate printed by `schedule.display_summary(system)`: `Time`,
  `C_max`, `T_max`, `ΣU_j`, `ΣC_j`, `ΣT_j`, `ΣwC_j`, and `ΣwT_j`.
- Data-contract correction: the existing web Metrics type covered seven of the
  eight library summary values and omitted `Time`. Added `timeStart`, computed
  as the minimum start time across scheduled operations for known jobs, with
  zero for an empty schedule. Updated the architecture contract and regenerated
  the committed real-execution fixture from pinned lekinpy v0.2.0.
- Visual QA: inspected Chromium screenshots from the acceptance run at the real
  1280x720 browser viewport. The summary renders as a separate two-row grid,
  and the collapsed setup rail leaves the scheduling canvas usable. The editor
  acceptance test additionally measures field widths, verifies action/header
  alignment, asserts no horizontal overflow, and exercises collapse/expand.
- Verification under Node 22.23.1:
  - 126 unit and contract tests passed, with four opt-in tests skipped;
  - library TypeScript checks, ESLint, and the production build passed;
  - the committed execution fixture reproduced from pinned lekinpy v0.2.0;
  - all four live algorithm registry-drift checks passed;
  - the complete Chromium suite passed all 11 implemented user flows, with
    four explicitly unbuilt product flows skipped;
  - the repository-wide Unicode em dash scan and `git diff --check` passed.
- Status: independently verified and ready to merge, push, and publish.
