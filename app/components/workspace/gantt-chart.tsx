import type { ProblemDefinition } from "../../../lib/schema/problem";
import type { Schedule } from "../../../lib/schema/schedule";

export function GanttChart({ schedule, problem }: { schedule: Schedule | null; problem: ProblemDefinition }) {
  const machineSchedules = schedule?.machines ?? problem.machines.map((machine) => ({ machineId: machine.machineId, workcenterId: machine.workcenterId, operations: [] }));
  const makespan = Math.max(1, ...machineSchedules.flatMap((machine) => machine.operations.map((operation) => operation.endTime)));
  const ticks = Array.from({ length: 8 }, (_, index) => Math.round((makespan * index) / 7));
  const colors = new Map(problem.jobs.map((job) => [job.jobId, job.rgb ? `rgb(${job.rgb.join(",")})` : "#57068c"]));
  return (
    <section className="gantt-card" aria-labelledby="gantt-title">
      <div className="card-head"><div><span className="section-kicker">Schedule</span><h2 id="gantt-title">Machine timeline</h2></div><span className="chart-status">{schedule ? `${schedule.time} time units` : "No schedule yet"}</span></div>
      <div className="legend">{problem.jobs.map((job) => <span key={job.jobId}><i style={{ background: colors.get(job.jobId) }} />{job.jobId}</span>)}<span className="legend-note">Time units</span></div>
      <div className="gantt" style={{ height: `${Math.max(190, 30 + machineSchedules.length * 72)}px` }}>
        <div className="machine-labels">{machineSchedules.map((machine) => <span key={machine.machineId}>{machine.machineId}<small>{machine.workcenterId ?? "Unassigned"}</small></span>)}</div>
        <div className="timeline">
          <div className="ticks">{ticks.map((tick, index) => <span key={`${tick}-${index}`}>{tick}</span>)}</div>
          <div className="grid">{machineSchedules.map((machine) => <div className="grid-row" key={machine.machineId} />)}</div>
          {machineSchedules.flatMap((machine, machineIndex) => machine.operations.map((operation) => (
            <div key={operation.scheduledOperationId} className="bar" style={{ background: colors.get(operation.jobId), left: `${(operation.startTime / makespan) * 100}%`, width: `${Math.max(1, ((operation.endTime - operation.startTime) / makespan) * 100)}%`, top: `${42 + machineIndex * 72}px` }} title={`${operation.jobId} operation ${operation.operationIndex + 1}: ${operation.startTime}–${operation.endTime}`}>
              <span>{operation.jobId} · O{operation.operationIndex + 1}</span><small>{operation.endTime - operation.startTime}u</small>
            </div>
          )))}
          {!schedule && <p className="gantt-empty">Choose an algorithm and run the sample problem.</p>}
        </div>
      </div>
    </section>
  );
}
