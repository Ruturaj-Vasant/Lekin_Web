import type { ProblemDefinition } from "../../../lib/schema/problem";
import type { ExecutionProgress } from "../../../worker/scheduling-protocol";

type Props = { problem: ProblemDefinition; algorithmId: string; running: boolean; progress: ExecutionProgress | null; onAlgorithmChange: (id: string) => void; onRun: () => void; onCancel: () => void };

export function ProblemSidebar({ problem, algorithmId, running, progress, onAlgorithmChange, onRun, onCancel }: Props) {
  const operationCount = problem.jobs.reduce((total, job) => total + job.operations.length, 0);
  const setupSections = [["Operations", operationCount], ["Workcenters", problem.workcenters.length], ["Machines", problem.machines.length]];
  return (
    <aside className="sidebar" aria-label="Problem setup">
      <div className="side-heading">
        <span>Problem setup</span>
        <button type="button" aria-label="Collapse problem setup panel">‹</button>
      </div>
      <label className="field-label">
        Problem name
        <input value={problem.name} readOnly />
      </label>
      <details open>
        <summary><span>Jobs <em>{problem.jobs.length}</em></span><b aria-hidden="true">⌄</b></summary>
        <div className="job-list">
          {problem.jobs.map((job) => (
            <button className="job-row" type="button" key={job.jobId}>
              <i style={{ background: job.rgb ? `rgb(${job.rgb.join(",")})` : undefined }} aria-hidden="true" />
              <span><strong>{job.jobId}</strong><small>Due {job.due} · Weight {job.weight}</small></span>
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
          <select value={algorithmId} onChange={(event) => onAlgorithmChange(event.target.value)} disabled={running}>
            <option value="spt">SPT — Shortest processing time</option>
            <option value="fcfs">FCFS — First come, first served</option>
            <option value="edd">EDD — Earliest due date</option>
            <option value="wspt">WSPT — Weighted SPT</option>
          </select>
        </label>
      </details>
      <button className="run-button" type="button" onClick={running ? onCancel : onRun}>{running ? "■ Cancel execution" : "▶ Run schedule"}</button>
      <p className="local-note">{progress ? progress.replaceAll("-", " ") : "Runs locally in your browser"}</p>
    </aside>
  );
}
