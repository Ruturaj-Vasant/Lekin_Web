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

## Observed, not yet actioned
<!-- Anything noticed while working that's out of scope for the current
     item — note it here instead of fixing it inline, so it isn't lost. -->
- `ARCHITECTURE.md` §2.3: no decision yet on where the built `lekinpy`
  wheel is hosted/fetched from for Pyodide's `micropip.install()`. Needs
  resolving before the execution adapter can actually be implemented.
- `ARCHITECTURE.md` §6.2: manual-edit recalculation currently reimplements
  `lekinpy`'s `_assign_single_operation` placement rule on the web side
  because no `SchedulingAlgorithm` accepts a partially-fixed schedule as
  input. Noted as a `lekin-library` enhancement candidate, not actioned.
