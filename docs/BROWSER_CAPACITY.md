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
| 25 | 100 | 20 | 10 | 53 ms | 49 to 54 ms | 6,275 |
| 50 | 250 | 30 | 15 | 85 ms | 76 to 96 ms | 15,660 |
| 80 | 400 | 40 | 20 | 189 ms | 118 to 141 ms | 26,772 |
| 100 | 500 | 50 | 25 | 316 ms | 167 to 178 ms | 36,206 |

The first run on a newly loaded page took 1.5 to 3.4 seconds when it overlapped unfinished background preparation. Once preparation completed, subsequent scheduling and Gantt updates took 49 to 178 ms. The execution runtime displayed by the app now measures the algorithm phase separately from Pyodide and wheel initialization. A precise start-time edit on the richer 500-operation Gantt recalculated and rendered in 102 ms.

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
