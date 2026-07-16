import type { Metrics } from "../../../lib/schema/schedule";
import type { ReactNode } from "react";

const SUMMARY_FIELDS: Array<{
  key: keyof Pick<Metrics, "timeStart" | "makespan" | "maxTardiness" | "tardyJobCount" | "totalCompletionTime" | "totalTardiness" | "weightedCompletionTime" | "weightedTardiness">;
  symbol: ReactNode;
  label: string;
}> = [
  { key: "timeStart", symbol: "Time", label: "Schedule start" },
  { key: "makespan", symbol: <>C<sub>max</sub></>, label: "Makespan" },
  { key: "maxTardiness", symbol: <>T<sub>max</sub></>, label: "Maximum tardiness" },
  { key: "tardyJobCount", symbol: <>ΣU<sub>j</sub></>, label: "Tardy jobs" },
  { key: "totalCompletionTime", symbol: <>ΣC<sub>j</sub></>, label: "Total completion" },
  { key: "totalTardiness", symbol: <>ΣT<sub>j</sub></>, label: "Total tardiness" },
  { key: "weightedCompletionTime", symbol: <>ΣwC<sub>j</sub></>, label: "Weighted completion" },
  { key: "weightedTardiness", symbol: <>ΣwT<sub>j</sub></>, label: "Weighted tardiness" },
];

export function ScheduleSummary({ metrics }: { metrics: Metrics | null }) {
  return (
    <section className="schedule-summary" aria-labelledby="schedule-summary-title">
      <header>
        <div>
          <span className="section-kicker">Performance</span>
          <h2 id="schedule-summary-title">Schedule summary</h2>
        </div>
        <p>All values reported by <code>schedule.display_summary(system)</code></p>
      </header>
      <div className="summary-grid">
        {SUMMARY_FIELDS.map((field) => (
          <article key={field.key} data-metric={field.key}>
            <span>{field.symbol}</span>
            <strong>{metrics ? metrics[field.key] : "-"}</strong>
            <small>{field.label}</small>
          </article>
        ))}
      </div>
    </section>
  );
}
