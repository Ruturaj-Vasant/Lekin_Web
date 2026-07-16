const metrics = [
  { label: "Makespan", value: "34", unit: " time units", note: "↓ 8.1% vs FCFS" },
  { label: "Total flow time", value: "69", note: "↓ 5.5% vs FCFS" },
  { label: "Avg. utilization", value: "72.4", unit: "%", note: "Across 3 machines", neutral: true },
  { label: "Late jobs", value: "0", unit: " / 3", note: "All due dates met", neutral: true },
];

export function MetricsRow() {
  return (
    <section className="metrics" aria-label="Schedule metrics">
      {metrics.map((metric) => (
        <article key={metric.label}>
          <span>{metric.label}</span>
          <strong>{metric.value}{metric.unit && <small>{metric.unit}</small>}</strong>
          <em className={metric.neutral ? "neutral" : undefined}>{metric.note}</em>
        </article>
      ))}
    </section>
  );
}
