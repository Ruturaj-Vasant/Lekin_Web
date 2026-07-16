import type { Metrics } from "../../../lib/schema/schedule";

export function MetricsRow({ metrics, jobCount }: { metrics: Metrics | null; jobCount: number }) {
  const utilization = metrics?.machineUtilization ? Object.values(metrics.machineUtilization) : [];
  const average = utilization.length ? utilization.reduce((sum, value) => sum + value, 0) / utilization.length : 0;
  const items = metrics ? [
    { label: "Makespan", value: String(metrics.makespan), unit: "u" },
    { label: "Max tardiness", value: String(metrics.maxTardiness), unit: "u" },
    { label: "Total tardiness", value: String(metrics.totalTardiness), unit: "u" },
    { label: "Tardy jobs", value: String(metrics.tardyJobCount), unit: ` / ${jobCount}` },
    { label: "Total completion", value: String(metrics.totalCompletionTime), unit: "u" },
    { label: "Avg. utilization", value: (average * 100).toFixed(0), unit: "%" },
  ] : [
    { label: "Makespan", value: "-" }, { label: "Max tardiness", value: "-" },
    { label: "Total tardiness", value: "-" }, { label: "Tardy jobs", value: "-" },
    { label: "Total completion", value: "-" }, { label: "Avg. utilization", value: "-" },
  ];
  return (
    <section className="metrics" aria-label="Schedule metrics">
      {items.map((metric) => (
        <article key={metric.label}>
          <span>{metric.label}</span>
          <strong>{metric.value}{metric.unit && <small>{metric.unit}</small>}</strong>
        </article>
      ))}
    </section>
  );
}
