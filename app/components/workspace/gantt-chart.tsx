import { demoBars, demoJobs } from "./demo-data";

const machines = [
  ["M-01", "Laser cutter"],
  ["M-02", "CNC mill"],
  ["M-03", "Finishing"],
];

export function GanttChart() {
  return (
    <section className="gantt-card" aria-labelledby="gantt-title">
      <div className="card-head">
        <div><span className="section-kicker">Schedule</span><h2 id="gantt-title">Machine timeline</h2></div>
        <div className="chart-tools" aria-label="Timeline zoom controls">
          <button type="button" aria-label="Zoom out">−</button><span>100%</span>
          <button type="button" aria-label="Zoom in">＋</button><button type="button">Fit</button>
        </div>
      </div>
      <div className="legend">
        {demoJobs.map((job) => <span key={job.id}><i className={job.color} aria-hidden="true" />{job.id}</span>)}
        <span className="legend-note">Time units</span>
      </div>
      <div className="gantt">
        <div className="machine-labels">
          {machines.map(([id, name]) => <span key={id}>{id}<small>{name}</small></span>)}
        </div>
        <div className="timeline">
          <div className="ticks">{[0, 5, 10, 15, 20, 25, 30, 35].map((tick) => <span key={tick}>{tick}</span>)}</div>
          <div className="grid">{machines.map(([id]) => <div className="grid-row" key={id} />)}</div>
          {demoBars.map((bar) => (
            <div
              key={`${bar.machine}-${bar.label}`}
              className={`bar ${bar.color}`}
              style={{ left: `${bar.left}%`, width: `${bar.width}%`, top: `${42 + bar.machine * 72}px` }}
            >
              <span>{bar.label}</span><small>{Math.round(bar.width / 4)}u</small>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
