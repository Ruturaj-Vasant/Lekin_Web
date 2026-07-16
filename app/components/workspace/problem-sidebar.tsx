import { demoJobs } from "./demo-data";

const setupSections = [
  ["Operations", "8"],
  ["Workcenters", "3"],
  ["Machines", "4"],
];

export function ProblemSidebar() {
  return (
    <aside className="sidebar" aria-label="Problem setup">
      <div className="side-heading">
        <span>Problem setup</span>
        <button type="button" aria-label="Collapse problem setup panel">‹</button>
      </div>
      <label className="field-label">
        Problem name
        <input defaultValue="Sample job shop" />
      </label>
      <details open>
        <summary><span>Jobs <em>3</em></span><b aria-hidden="true">⌄</b></summary>
        <div className="job-list">
          {demoJobs.map((job) => (
            <button className="job-row" type="button" key={job.id}>
              <i className={job.color} aria-hidden="true" />
              <span><strong>{job.id}</strong><small>Due {job.due} · Weight {job.weight}</small></span>
              <b aria-hidden="true">›</b>
            </button>
          ))}
        </div>
        <button className="add-button" type="button">＋ Add job</button>
      </details>
      {setupSections.map(([name, count]) => (
        <details key={name}>
          <summary><span>{name} <em>{count}</em></span><b aria-hidden="true">⌄</b></summary>
          <p className="detail-copy">Select this section to configure {name.toLowerCase()}.</p>
        </details>
      ))}
      <details open>
        <summary><span>Algorithm</span><b aria-hidden="true">⌄</b></summary>
        <label className="field-label">
          Dispatching rule
          <select defaultValue="SPT">
            <option value="SPT">SPT — Shortest processing time</option>
            <option value="FCFS">FCFS — First come, first served</option>
            <option value="EDD">EDD — Earliest due date</option>
            <option value="WSPT">WSPT — Weighted SPT</option>
          </select>
        </label>
      </details>
      <button className="run-button" type="button">▶ Run schedule</button>
      <p className="local-note">Runs locally in your browser</p>
    </aside>
  );
}
