import type { Metrics } from "../../../lib/schema/schedule";

export function MetricsRow({ metrics, jobCount }: { metrics: Metrics | null; jobCount: number }) {
  const utilization = metrics?.machineUtilization ? Object.values(metrics.machineUtilization) : [];
  const average = utilization.length ? utilization.reduce((sum, value) => sum + value, 0) / utilization.length : 0;
  const items = metrics ? [
    { label: "Makespan", value: String(metrics.makespan), unit: " time units", note: "Real lekinpy result" },
    { label: "Total completion", value: String(metrics.totalCompletionTime), note: `Tardiness ${metrics.totalTardiness}` },
    { label: "Avg. utilization", value: (average * 100).toFixed(1), unit: "%", note: `Across ${utilization.length} machines` },
    { label: "Late jobs", value: String(metrics.tardyJobCount), unit: ` / ${jobCount}`, note: `Max tardiness ${metrics.maxTardiness}` },
  ] : [
    { label: "Makespan", value: "-", note: "Run a schedule" }, { label: "Total completion", value: "-", note: "Awaiting result" },
    { label: "Avg. utilization", value: "-", note: "Awaiting result" }, { label: "Late jobs", value: "-", note: "Awaiting result" },
  ];
  return (
    <section className="metrics" aria-label="Schedule metrics">
      {items.map((metric) => (
        <article key={metric.label}>
          <span>{metric.label}</span>
          <strong>{metric.value}{metric.unit && <small>{metric.unit}</small>}</strong>
          <em className="neutral">{metric.note}</em>
        </article>
      ))}
    </section>
  );
}
