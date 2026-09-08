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

export function ScheduleSummary({ metrics, optimalMakespan = false }: { metrics: Metrics | null; optimalMakespan?: boolean }) {
  return (
    <section className="schedule-summary" aria-labelledby="schedule-summary-title">
      <header>
        <div>
          <span className="section-kicker">Performance</span>
          <h2 id="schedule-summary-title">Schedule summary</h2>
        </div>
        <p>{metrics ? "Lower is better for completion and tardiness measures." : "Run a schedule to see performance measures."}</p>
      </header>
      <div className="summary-grid">
        {SUMMARY_FIELDS.map((field) => (
          <article key={field.key} data-metric={field.key} className={field.key === "makespan" && optimalMakespan ? "metric-optimal" : undefined}>
            <span>{field.symbol}</span>
            <strong>{metrics ? metrics[field.key] : "-"}</strong>
            <small>{field.label}</small>
            {field.key === "makespan" && optimalMakespan && <em className="metric-certification">Proven minimum</em>}
          </article>
        ))}
      </div>
    </section>
  );
}
