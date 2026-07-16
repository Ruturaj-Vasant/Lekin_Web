# LEKIN Lab — Web Product & Design Specification

This is the permanent source of truth for the **web application** (`lekin-web`)
specifically. For cross-project overview, phase status, and working
conventions shared with `lekin-library`, see `Lekin/MASTER_PROMPT.md` — read
that first. This file assumes that context and does not repeat it.

Repository this is built on: https://github.com/mpinedo170/Lekin_Python

Before making architectural or implementation decisions, inspect the current
state of `lekin-library` directly and verify its actual capabilities, data
models, algorithms, file formats, dependencies, and limitations. Do not
assume documentation and implementation are perfectly aligned — verify.

---

## 1. Product vision

LEKIN Lab is an interactive, browser-based platform for students, professors,
researchers, operations-research practitioners, and developers experimenting
with scheduling algorithms.

Users create scheduling problems, run available scheduling algorithms,
inspect the generated schedules, manually modify schedules through
drag-and-drop, and immediately observe how schedule-performance metrics
change.

It should feel like **Figma for scheduling and operations research** — a
professional engineering application running in the browser, not a
university website, admin dashboard, or generic AI-styled SaaS interface.

## 2. Core product principles

The application must be: interactive, visually clear, easy to experiment
with, technically correct, modular, inexpensive to operate initially,
extensible for future algorithms and backend computation, and usable without
requiring an account in the first version.

The scheduling visualization stays the central focus. The UI supports
experimentation rather than forcing users through complicated forms or
multi-step workflows.

## 3. Initial user experience

No registration or sign-in required in the first version. On open, the user
chooses one of:

1. Create a new scheduling problem.
2. Open an example problem.
3. Import an existing LEKIN or JSON file.

After choosing, the user enters the main scheduling workspace. The
experience stays inside a single-page application without unnecessary page
reloads.

## 4. Application structure

Two primary surfaces:

### 4.1 Landing screen

Minimal. Contains: LEKIN Lab name, one-line explanation, "Create New
Problem," "Open Example," "Import LEKIN or JSON File." No marketing
sections, testimonials, illustrations, pricing, or unnecessary navigation.

### 4.2 Main workspace

Feels like a browser-based desktop application.

**Top navigation**: LEKIN Lab identity, project name, New, Import, Save
locally, Export, Undo, Redo, Help.

**Left configuration panel**: collapsible sections for Jobs, Operations,
Workcenters, Machines, Algorithms, algorithm-specific parameters. Supports
inline editing; collapsible so the canvas can use more space.

**Main scheduling canvas**: interactive Gantt chart, machine/workcenter
rows, time axis, operation labels, zooming, horizontal navigation, selection
states, drag-and-drop editing, valid/invalid movement feedback.

**Metrics area**, displayed close to the Gantt chart: makespan (C_max),
maximum tardiness (T_max), number of tardy jobs (ΣU_j), total completion
time (ΣC_j), total tardiness (ΣT_j), weighted completion time (ΣwC_j),
weighted tardiness (ΣwT_j), machine utilization (when supported).

**Detail tabs**: Machine Sequence, Job Details, Algorithm Comparison,
Validation Messages, Execution Information.

## 5. Scheduling problem creation

**Jobs** may contain: unique job ID, release time, due date, weight/priority,
optional color, one or more ordered operations.

**Operations** may contain: unique operation ID or index, parent job ID,
required workcenter, processing time, sequence position, status, optional
eligible-machine restrictions.

**Workcenters** may contain: unique workcenter ID, name, release/availability
time, status, one or more machines.

**Machines** may contain: unique machine ID, parent workcenter ID,
release/availability time, status.

The UI allows rows to be added, duplicated, edited, and removed directly.
Avoid modal windows for every small change.

## 6. Algorithm execution and compatibility

Initial platform exposes: FCFS, SPT, EDD, WSPT. The application must verify
— against the actual current library, not assumed capability — whether each
algorithm supports: single-operation jobs, multi-operation jobs, parallel
machines, multiple workcenters, release times, due dates, weights.

**The UI must never imply support the underlying implementation doesn't
provide.** If an algorithm only supports single-operation jobs, show a clear
compatibility label before execution, e.g.: *"SPT currently supports
single-operation jobs only."* This is not a cosmetic detail — it directly
follows from the real bugs found in the library (§16 below) and must reflect
whatever state Phase 0 of the library refactor actually leaves things in,
not the aspirational end state.

## 7. Algorithm plugin and registry system

Don't hard-code every algorithm throughout the frontend. Create an algorithm
registry/manifest. Each algorithm exposes metadata, e.g.:

```json
{
  "id": "spt",
  "displayName": "Shortest Processing Time",
  "shortName": "SPT",
  "description": "Prioritizes the available job with the shortest processing time.",
  "version": "0.1.0",
  "problemTypes": ["single-operation", "parallel-machine"],
  "supportsMultipleOperations": false,
  "supportsReleaseTimes": true,
  "supportsWeights": false,
  "browserCompatible": true,
  "backendRequired": false,
  "estimatedComplexity": "O(n log n)",
  "defaultBrowserOperationLimit": 500,
  "parameters": []
}
```

The registry determines: which algorithms appear in the interface,
descriptions shown, compatibility, configurable parameters, browser
execution eligibility, recommended problem-size limits, whether backend
execution is required.

Adding an approved algorithm later should require minimal or no changes to
the main workspace UI. Possible mechanisms: JSON manifest, Python registry,
decorators, abstract base classes, Python entry points — use the simplest
reliable option for the current architecture while preserving future
extensibility. (This is the same plugin contract referenced in
`MASTER_PROMPT.md` Phase 0 item 5 on the library side — the two must stay
compatible.)

## 8. Browser-first execution model

Run small computations locally in the browser whenever technically
practical: Pyodide, WebAssembly, PyScript, or a browser-compatible JS/TS
execution layer are the candidate technologies.

Do not assume Streamlit is a static browser application — it normally
requires a running Python server. Pydantic may be used for schemas and
validation but is not a browser execution engine.

Preferred first-version flow:

```
User input
    ↓
Shared validation schema
    ↓
Browser execution eligibility check
    ↓
Run scheduling algorithm locally
    ↓
Return structured schedule
    ↓
Render Gantt chart and metrics
```

Browser computation should not require a permanent backend for supported
small problems.

## 9. Browser execution limits

Do not base the limit only on job count. Consider: number of jobs, total
operations, number of machines, number of workcenters, selected algorithm,
estimated algorithmic complexity, estimated memory usage, expected execution
time, imported file size.

Example execution-policy configuration (values are illustrative, not final —
freeze real numbers only after benchmarking on representative browsers):

```json
{
  "browserExecution": {
    "enabled": true,
    "maxJobs": 100,
    "maxOperations": 500,
    "maxMachines": 50,
    "maxWorkcenters": 25,
    "maxEstimatedRuntimeMs": 3000,
    "maxInputFileSizeMb": 5
  }
}
```

## 10. Behavior when the browser limit is exceeded

The first version has no backend computation. When input exceeds the
browser execution policy:

1. Do not freeze the browser.
2. Do not begin an unsafe computation.
3. Stop before running the algorithm.
4. Clearly explain which limit was exceeded.
5. Show the user how to reduce the problem.
6. Preserve the problem definition so their work isn't lost.

Example message: *"This problem contains 720 operations, while the current
browser limit is 500 operations. Large-problem server execution is planned
for a future version. Reduce the problem size or export it for later
execution."* Never a generic "Something went wrong."

## 11. Future hybrid execution architecture

Architecture must allow backend execution later without a frontend redesign:

```
User input
    ↓
Shared validation schema
    ↓
Execution policy
    ↓
Small problem → Browser execution
Large problem → Backend execution API
    ↓
Both return the same schedule schema
    ↓
Same frontend visualization
```

The frontend should not care whether a schedule was generated in the
browser or on a server. Both environments return the same versioned result
format, e.g.:

```json
{
  "executionId": "exec_123",
  "executionMode": "browser",
  "algorithmId": "edd",
  "algorithmVersion": "0.1.0",
  "schemaVersion": "1.0",
  "status": "completed",
  "runtimeMs": 42,
  "schedule": {},
  "metrics": {},
  "warnings": []
}
```

Future server execution may support: hundreds/thousands of jobs,
long-running optimization algorithms, solver-based algorithms, batch
comparisons, queued execution, downloadable results, saved execution
history. Do not implement this backend in the initial release unless
explicitly requested — prepare interfaces and schemas for it now.

## 12. Interactive Gantt chart

The most important product feature. Each displayed operation should include
or reference: operation ID, job ID, operation number, machine ID,
workcenter ID, start time, end time, processing time, sequence position,
feasibility status, whether it was algorithm-generated or manually moved.

Users can: select an operation, drag it earlier/later, reorder operations
on the same machine, move it to another eligible machine in the same
workcenter, inspect operation details, undo, redo, reset to the original
algorithm-generated schedule.

## 13. Drag-and-drop validation

A drag must not simply alter the visual chart — every movement is validated
against scheduling constraints, at minimum: job release time, operation
precedence, machine availability, workcenter eligibility, eligible machine
assignment, processing duration, machine capacity, operation overlap,
dependent downstream operations.

Flow:

```
User begins dragging
    ↓
Highlight valid destination machines and positions
    ↓
Show a ghost preview
    ↓
User drops operation
    ↓
Validate proposed move
    ↓
Invalid → Reject and explain
Valid → Apply and recalculate affected schedule
```

Invalid targets should be visually distinct but not aggressively styled.
Example explanation: *"Operation J3-O2 cannot start at time 8 because J3-O1
finishes at time 11."*

## 14. Schedule recalculation after manual changes

After a valid manual move, recalculate: operation start/end times, affected
machine sequence, downstream operations in the same job, operations
displaced on the affected machine, job completion times, tardiness,
weighted metrics, makespan, utilization.

For the initial version, prefer correctness over optimized incremental
computation. Safe initial strategy:

1. Treat the user's move as a new machine-sequence constraint.
2. Recalculate the affected schedule deterministically.
3. Validate the resulting schedule.
4. Update the Gantt chart and metrics.

Incremental recalculation is a later optimization once correctness is
established. Every manual edit is represented as structured state, not just
changed pixel coordinates.

## 15. Authoritative schedule data model

The current library does not preserve enough operation-level information
for interactive editing (this is exactly what Phase 0, item 1 in
`MASTER_PROMPT.md` fixes). The web app's data model should mirror that fix:

```json
{
  "scheduledOperationId": "J1-O2",
  "jobId": "J1",
  "operationId": "O2",
  "operationIndex": 1,
  "workcenterId": "WC2",
  "machineId": "M3",
  "startTime": 8,
  "endTime": 13,
  "processingTime": 5,
  "sequencePosition": 2,
  "source": "algorithm",
  "manuallyModified": false
}
```

The schedule itself:

```json
{
  "schemaVersion": "1.0",
  "scheduleId": "schedule_001",
  "algorithmId": "fcfs",
  "scheduledOperations": [],
  "machineSequences": {},
  "metrics": {},
  "validation": {
    "feasible": true,
    "errors": [],
    "warnings": []
  }
}
```

The Gantt chart, metrics, export functions, and drag-and-drop logic must all
use this authoritative data — never reconstruct operation timing from job
IDs alone when accurate timestamps already exist.

## 16. Known library limitations to account for

Verify directly against the current state of `lekin-library` (don't assume):
SPT/EDD/WSPT may schedule only the first operation of each job; machine
schedules may store job IDs rather than operation-level records; display and
Gantt methods may reconstruct timings separately instead of reading stored
data; multi-operation schedules may not be represented reliably;
operation-to-machine assignments may not be preserved clearly; validation
may be incomplete; empty machine candidate lists may cause generic runtime
errors; duplicate IDs may not be prevented; invalid processing times may not
be rejected.

Do not hide these limitations in the website — surface real compatibility
status (§6) instead. Before implementing advanced interactive editing,
confirm the necessary library refactoring (Phase 0) is actually complete.

## 17. Shared schemas and validation

One consistent versioned schema across: frontend state, imported problems,
browser execution, future backend execution, saved projects, exported JSON,
schedule results. Schemas needed: `ProblemDefinition`, `Job`, `Operation`,
`Workcenter`, `Machine`, `AlgorithmDefinition`, `ExecutionRequest`,
`ExecutionResult`, `ScheduledOperation`, `Schedule`, `Metrics`,
`ValidationError`, `ManualScheduleEdit`.

Validation approach candidates: Pydantic (Python), JSON Schema, Zod
(TypeScript), or generated schemas shared between Python and TypeScript.
Avoid maintaining unrelated duplicate schemas manually.

## 18. Import and export

Eventually support: `.job`, `.mch`, `.seq`, LEKIN-compatible files, complete
JSON problem files, JSON schedule files, exported result summaries, Gantt
chart export.

First version priority: (1) JSON import/export, (2) current LEKIN-supported
formats already handled reliably by the library, (3) schedule export.

Imported files must be validated before use, with clear file-specific
errors (row, field, or line information where possible) — not a generic
failure message.

## 19. Algorithm comparison

Users select multiple compatible algorithms and compare: makespan,
tardiness, weighted tardiness, completion time, runtime, feasibility,
algorithm limitations. Users can switch the Gantt chart between results
without losing the scheduling problem. Manual drag-and-drop edits apply to
one selected schedule unless the user explicitly chooses otherwise.

## 20. Design direction

70% Figma, 20% Linear, 10% Apple Instruments — a professional engineering
workbench. Avoid: gradients, glassmorphism, neon colors, excessive shadows,
oversized rounded cards, decorative dashboards, heavy dark themes, generic
purple-blue AI styling, unnecessary illustrations.

## 21. Color palette

**Neutral interface**: Background `#FAF9F6`, main surfaces `#FFFFFF`,
borders `#E6E6EA`, primary text `#1A1A1A`, secondary text `#6B6B72`.

**Interface accents**: NYU Violet `#57068C`, Success `#2E7D5B`,
Warning/manual-change emphasis `#C45C3B`.

NYU Violet is used for: primary actions, selected tabs, active states,
focus indicators, links, selected-operation outlines — nothing else. The
interface remains approximately 95% neutral; do not let the overall
application read as purple.

**Gantt colors**: a separate muted job palette so job colors are never
confused with UI controls. Candidates: Dusty Blue, Sage Green, Terracotta,
Ochre, Soft Plum, Muted Teal, Warm Slate, Clay Brown. Ensure sufficient
contrast and include labels so color is never the only method of
identification.

## 22. Typography

Interface fonts (preferred): IBM Plex Sans, Geist, Source Sans 3.
Monospace (for machine IDs, durations, metrics): IBM Plex Mono, Geist Mono.
Compact, readable, professional — not decorative.

## 23. Interaction principles

Use: inline editing, collapsible panels, clear keyboard focus, restrained
animations, immediate validation, undo/redo, contextual help, sensible
defaults, example datasets.

Avoid: unnecessary modal windows, long setup wizards, hidden critical
controls, excessive notifications, animations that delay work.

Support both mouse and keyboard use where practical.

## 24. Local persistence

No login in the first version, so support local project persistence:
browser local storage for small project metadata, IndexedDB for larger
structured project data, downloadable JSON files. Do not promise permanent
cloud storage initially — clearly communicate that locally saved work stays
tied to the current browser unless exported.

## 25. Performance and safety

Browser execution should: run without blocking the main UI thread where
practical, show execution progress/loading state, enforce timeouts, allow
cancellation, avoid exhausting browser memory, validate input before
execution, fail gracefully. Consider Web Workers if compatible with the
chosen runtime. Benchmark on representative browsers before freezing
execution limits.

## 26. Accessibility

Support: keyboard navigation, visible focus indicators, sufficient
contrast, text labels in addition to color, accessible form controls,
screen-reader labels, reduced-motion preferences, usable table navigation.
Drag-and-drop needs an alternative keyboard/sequence-editing method where
practical.

## 27. Security boundaries

Approved algorithms in the repository run through the trusted execution
path. Do not execute arbitrary user-uploaded Python code in the main
application or an unrestricted browser environment.

Future custom algorithm support must distinguish: (1) approved built-in
algorithms, (2) trusted installed plugins, (3) untrusted uploaded
algorithms. Untrusted algorithms will eventually require: isolated
containers, CPU limits, memory limits, execution timeouts, disabled network
access, temporary filesystems, dependency restrictions, job queues, audit
logs. This is a future phase — do not implement it casually in the initial
version.

## 28. Recommended implementation phases (web-specific detail)

**Phase 1 — Browser-based MVP**: minimal landing screen, single-page
workspace, problem editor, example problems, JSON import/export, algorithm
selection, browser-side execution for supported small problems,
configurable execution limits, informative limit errors, static Gantt
chart, core metrics, local persistence, compatibility warnings.

**Phase 2 — Interactive scheduling**: operation-level schedule model,
drag-and-drop Gantt editing, feasibility validation, automatic
recalculation, undo/redo, reset to algorithm schedule, improved
machine-sequence editor, algorithm comparison.

**Phase 3 — Backend computation**: execution API, background workers, job
queue, large-problem routing, execution status, downloadable results,
server-side time/memory limits. Browser and backend execution must return
the same schema.

**Phase 4 — Extensible algorithm ecosystem**: formal plugin interface,
additional approved algorithms, algorithm parameter forms generated from
metadata, backend-only solvers, trusted plugin distribution, isolated
execution for untrusted custom algorithms.

**Phase 5 — Optional accounts and collaboration**: only if the product
actually requires it — authentication, cloud-saved projects, classroom
assignments, shared experiments, collaboration, execution history. Do not
add login merely because most web applications have it.

## 29. Explicitly out of scope for the first version

Unless specifically requested: authentication, payments, subscriptions,
social features, arbitrary uploaded Python execution, large backend
infrastructure, real-time multi-user collaboration, AI-generated scheduling
algorithms, mobile-first Gantt editing, complex solver marketplaces,
production-scale job queues.

## 30. Engineering expectations

Organize code into clear modules: domain schemas, problem editor, algorithm
registry, execution policy, browser execution adapter, future backend
adapter, scheduling-library adapter, Gantt visualization, schedule editing,
validation, metrics, import/export, local persistence, design system.

Do not combine scheduling logic directly with UI components. Do not
tightly couple browser execution to the frontend visualization. Use
adapters so execution technology can change later.

## 31. Required development approach

Before generating large amounts of source code:

1. Inspect the repository (current `lekin-library` state).
2. State assumptions.
3. Identify library changes required.
4. Confirm the shared schema.
5. Propose the frontend architecture.
6. Propose the browser execution method.
7. Define initial benchmark-based limits.
8. Define the schedule-editing model.
9. Define component structure.
10. Produce wireframes.
11. Create the implementation plan.
12. Then build the application incrementally.

Do not attempt to generate the complete production application in one
uncontrolled response.

## 32. Decisions that must remain consistent

Unless explicitly revised, preserve:

- The product is called LEKIN Lab.
- It is an interactive scheduling research platform.
- The main experience is a single-page workspace.
- No login is required initially.
- Small computations run in the browser.
- Browser execution is controlled by configurable limits.
- Problems exceeding limits receive an informative error in the first version.
- A future backend will execute larger problems.
- Browser and backend execution use identical schemas.
- Drag-and-drop schedule editing is a core product goal.
- Manual edits must be validated and must recalculate metrics.
- Algorithms are exposed through a registry or plugin model.
- The interface is neutral with NYU Violet as a restrained accent.
- The visual style is inspired by Figma, Linear, and Apple Instruments.
- Correctness and schedule feasibility matter more than decorative visual effects.

## 33. Instructions for any AI using this specification

- Treat it as the product source of truth for the web app.
- Do not remove requirements merely to simplify implementation.
- Clearly state when a requirement belongs to a later phase.
- Do not claim unsupported library functionality.
- Do not silently change the shared data model.
- Do not introduce login, backend infrastructure, or arbitrary code
  execution unless the relevant phase is being implemented.
- Preserve future extensibility without overengineering the MVP.
- Explain meaningful architectural trade-offs.
- Prefer a smaller correct system over a large unreliable system.
- Keep the UI streamlined and scheduling-focused.
- Update this specification when a product decision is intentionally
  changed — and log the change in `DECISIONS.md` when you do.
- **Design implementation defers to `ARCHITECTURE.md`.** If a visual
  requirement here can't be met without changing the shared schema or
  component boundaries defined there, flag it back rather than quietly
  reinterpreting either document.

When asked to implement a feature, first identify: (1) which phase it
belongs to, (2) which existing architecture modules it affects, (3) whether
it changes the shared schema, (4) whether it affects browser execution
limits, (5) whether it affects schedule correctness, (6) whether
documentation and tests must be updated.

This specification is referenced throughout planning, design,
implementation, testing, and future expansion of LEKIN Lab.
