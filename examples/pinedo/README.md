# Pinedo examples

These files transcribe the numerical problem data published on the
[ProcessScheduler Pinedo examples page](https://processscheduler.github.io/pinedo/),
which cites Michael L. Pinedo's *Scheduling: Theory, Algorithms, and Systems*,
4th edition.

The `.lekin.json` files can be imported into LEKIN. They preserve the jobs,
processing times, release times, due dates, weights, machines, and operation
routes that the current LEKIN problem schema can express. They do not claim
that LEKIN's built-in dispatching rules reproduce the source page's optimized
solutions.

| Example | Import file | Current compatibility |
| --- | --- | --- |
| 2.3.2, scheduling anomaly | None | Not faithfully representable. It requires arbitrary precedence edges between separate jobs and a non-delay constraint. The extracted source data is in `source-catalog.json`. |
| 3.2.5, maximum lateness | `pinedo-3.2.5-maximum-lateness.lekin.json` | The complete input is representable. LEKIN reports tardiness metrics, but does not have a built-in maximum-lateness optimizer. |
| 3.3.3, number of tardy jobs | `pinedo-3.3.3-tardy-jobs.lekin.json` | The complete input and tardy-job metric are representable. The built-ins are dispatching rules, not an exact optimizer for this objective. |
| 3.4.5, total tardiness | `pinedo-3.4.5-total-tardiness.lekin.json` | The complete input and total-tardiness metric are representable. The built-ins do not guarantee the optimum. |
| 3.6.3, weighted tardiness | `pinedo-3.6.3-weighted-tardiness.lekin.json` | The complete input and weighted-tardiness metric are representable. The built-ins do not guarantee the optimum. |
| 4.1.5, earliness and tardiness | `pinedo-4.1.5-earliness-tardiness.lekin.json` | The input is representable. Earliness and the combined objective are not currently calculated. |
| 4.2.3, completion time with deadlines | `pinedo-4.2.3-deadlines.lekin.json` | The input is representable. LEKIN treats due dates as soft targets and does not enforce hard deadlines. |
| 6.1.1, four-machine flow shop | `pinedo-6.1.1-flow-shop.lekin.json` | The route and processing times map directly to four one-machine workcenters. The source has no due dates or weights, so neutral LEKIN values were added. |

## Added values

LEKIN requires every job to have a due date and weight. When the source omits
weights, the import uses `1`. Example 6.1.1 also omits due dates, so its imports
use `84`, the total workload across all jobs, as a neutral required value. These
added fields are not part of the source problem.

`source-catalog.json` is the complete extracted data catalog. It is for
reference and provenance, not for importing into LEKIN.

To regenerate all files after changing the extraction script, run:

```bash
npm run example:pinedo
```
