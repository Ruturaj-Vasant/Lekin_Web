# Browser capacity limits

LEKIN Lab is intended for interactive research problems, not unbounded batch processing. The browser execution policy uses these hard ceilings:

| Dimension | Hard ceiling | Recommended working range |
| --- | ---: | ---: |
| Jobs | 100 | Up to 80 |
| Operations | 500 | Up to 400 |
| Machines | 50 | Up to 40 |
| Workcenters | 25 | Up to 20 |
| Imported file | 5 MB | Under 1 MB |

The recommended range leaves headroom for slower computers, other open tabs, detailed editing, and future UI additions. The hard ceiling remains available for stress studies and is enforced before Pyodide runs.

## Benchmark evidence

Measured on 2026-07-16 in headless Chromium on an Apple Silicon Mac using Node 22.23.1. Each case was imported through the real file picker, validated by the application, scheduled through the real Pyodide Web Worker with all four algorithms, and checked for the expected number of rendered Gantt bars.

| Jobs | Operations | Machines | Workcenters | Import and initial render | Warm algorithm and Gantt update | DOM elements |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 25 | 100 | 20 | 10 | 66 ms | 37 to 60 ms | 4,484 |
| 50 | 250 | 30 | 15 | 83 ms | 71 to 81 ms | 11,374 |
| 80 | 400 | 40 | 20 | 169 ms | 106 to 117 ms | 19,964 |
| 100 | 500 | 50 | 25 | 283 ms | 152 to 154 ms | 27,655 |

The first run on a newly loaded page took 2.4 to 4.4 seconds because it includes downloading and initializing Pyodide and installing the pinned lekinpy wheel. That cold-start cost did not grow materially with problem size. Once initialized, scheduling itself took 7 to 30 ms across the tested cases. A precise start-time edit on the 500-operation schedule recalculated and rendered in 79 ms.

These figures are measurements from one machine, not guarantees for every browser or device. That is why the recommended range is lower than the tested hard ceiling.

## Reproducing the benchmark

Use the repository-required Node version, then run:

```sh
npm run benchmark:browser
```

The benchmark source is `scripts/benchmarks/browser-capacity.spec.ts`. It is kept outside the normal Playwright directory so routine end-to-end runs stay fast.

Regenerate the large importable example with:

```sh
npm run example:large
```

The generated `examples/large-browser-study-500-operations.lekin.json` file sits exactly at all four count ceilings and is suitable for manual stress testing.
