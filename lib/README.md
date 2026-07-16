# `lib/` - pure logic layer

Everything under `lib/` is framework-agnostic TypeScript: no React, no DOM,
no Pyodide/Worker I/O. It's unit-tested in isolation (`npm run test:unit`,
Vitest, Node environment) and is meant to be **consumed, not reimplemented**,
by the React/Worker code in `app/`, `components/`, and `worker/`.

This split (Claude owns `lib/`, Codex owns everything that touches the DOM,
React, or browser APIs) is a working-division decision, not an
`ARCHITECTURE.md` requirement - see `lekin-web_DECISIONS.md` for the
reasoning. `ARCHITECTURE.md` itself remains the authoritative contract for
every shape and behavior below; this file is just an index of where each
piece of that contract actually lives in code.

## Layout

- **`lib/schema/`** - ARCHITECTURE.md §1. Zod schemas + TS types for every
  shared shape (`ProblemDefinition`, `Schedule`, `Metrics`,
  `ValidationIssue`, `AlgorithmDefinition`, `ExecutionRequest`/`Result`,
  `ManualScheduleEdit`, `ManualStartConstraints`). `validateProblemDefinition()`
  is the multi-error, client-side validation layer (§1.4) - collects every
  problem in one pass, no `lekin-library` involvement.
- **`lib/registry/`** - §1.5. `ALGORITHM_REGISTRY`, the web-owned superset
  over lekinpy's four built-in algorithms. `verify.test.ts` is the
  registry-drift guard (opt-in - see its header comment for how to run it
  against a real `lekin-library` checkout).
- **`lib/scheduling/`** - §4.2–§4.5 and §1.3. `graph.ts` builds the
  precedence graph and runs Kahn's-algorithm cycle detection;
  `recalculate.ts` is `checkDropValidity()` (§4.4, the two hard-reject
  checks) and `recalculate()` (§4.5, the topological placement pass,
  machine-release-aware, persistent-constraint-aware); `metrics.ts` is
  `computeMetrics()` (§1.3, mirroring `lekinpy`'s `display_summary()`).
  `recalculate.test.ts` covers every case in §4.7's required test list,
  including the exact two-job/two-machine cycle counterexample.
- **`lib/adapter/`** - §2.2's pure logic: `policy.ts` (`checkExecutionPolicy`,
  step 1), `validate-request.ts` (`validateExecutionRequest`, step 2),
  `translate.ts` (`toLekinpySystemPayload`/`fromLekinpyScheduleDict`, the
  snake_case↔camelCase / flat↔nested translation boundary, steps 4 and 7).
  **What's deliberately NOT here**: actually loading Pyodide, calling
  `micropip.install()` on the pinned wheel (`public/vendor/`), spinning up
  the Web Worker, or invoking the translated payloads against real Python -
  that I/O/environment glue is Worker-side code, consuming these pure
  functions rather than reimplementing their logic.

## How the pieces compose (a sketch, not implemented here)

```
BrowserExecutionAdapter.execute(request)
  1. checkExecutionPolicy(problem, algorithm)        // lib/adapter/policy
  2. validateExecutionRequest(problem, algorithmId)  // lib/adapter/validate-request
  3. [Worker] load Pyodide + wheel
  4. toLekinpySystemPayload(problem)                 // lib/adapter/translate
     -> [Worker] construct System, call system.validate(), run algorithm
  5. fromLekinpyScheduleDict(dict, ...)               // lib/adapter/translate
  6. computeMetrics(schedule, problem)                 // lib/scheduling/metrics
```

```
On an accepted drag-and-drop:
  checkDropValidity(schedule, problem, opId, toMachine, toPos)  // lib/scheduling/recalculate
    -> if valid: recalculate(schedule, edit, constraints, problem)
```

## Running tests

```
npm run test:unit                                  # hermetic, no Python needed
npm run test:types                                 # strict typecheck scoped to lib/
LEKINPY_SOURCE=../lekin-library npm run test:unit -- lib/registry/verify.test.ts  # opt-in drift guard
```
