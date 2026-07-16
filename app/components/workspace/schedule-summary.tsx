import type { Metrics } from "../../../lib/schema/schedule";

const SUMMARY_FIELDS: Array<{
  key: keyof Pick<Metrics, "timeStart" | "makespan" | "maxTardiness" | "tardyJobCount" | "totalCompletionTime" | "totalTardiness" | "weightedCompletionTime" | "weightedTardiness">;
  symbol: string;
  label: string;
}> = [
  { key: "timeStart", symbol: "Time", label: "Schedule start" },
  { key: "makespan", symbol: "C_max", label: "Makespan" },
  { key: "maxTardiness", symbol: "T_max", label: "Maximum tardiness" },
  { key: "tardyJobCount", symbol: "ΣU_j", label: "Tardy jobs" },
  { key: "totalCompletionTime", symbol: "ΣC_j", label: "Total completion" },
  { key: "totalTardiness", symbol: "ΣT_j", label: "Total tardiness" },
  { key: "weightedCompletionTime", symbol: "ΣwC_j", label: "Weighted completion" },
  { key: "weightedTardiness", symbol: "ΣwT_j", label: "Weighted tardiness" },
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
          <article key={field.key}>
            <span>{field.symbol}</span>
            <strong>{metrics ? metrics[field.key] : "-"}</strong>
            <small>{field.label}</small>
          </article>
        ))}
      </div>
    </section>
  );
}
