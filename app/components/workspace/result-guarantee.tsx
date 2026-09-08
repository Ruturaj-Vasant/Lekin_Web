import type { ScheduleGuarantee } from "../../../lib/presentation/schedule-guarantee";

export function ResultGuarantee({ guarantee }: { guarantee: ScheduleGuarantee | null }) {
  if (!guarantee) return null;
  return <section className={`result-guarantee guarantee-${guarantee.kind}`} aria-label="Result guarantee">
    <span className="guarantee-icon" aria-hidden="true">{guarantee.kind === "optimal" ? "✓" : guarantee.kind === "manual" ? "↔" : "≈"}</span>
    <div><strong>{guarantee.title}</strong><p>{guarantee.description}</p></div>
  </section>;
}
