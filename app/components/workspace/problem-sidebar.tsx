import type { Dispatch } from "react";
import type { ProblemEditorAction } from "../../../lib/editor/problem-editor";
import type { ProblemDefinition } from "../../../lib/schema/problem";
import type { ValidationIssue } from "../../../lib/schema/issue";
import type { ExecutionProgress } from "../../../worker/scheduling-protocol";

type Props = {
  problem: ProblemDefinition;
  dispatch: Dispatch<ProblemEditorAction>;
  algorithmId: string;
  running: boolean;
  canRun: boolean;
  progress: ExecutionProgress | null;
  validationIssues: ValidationIssue[];
  onAlgorithmChange: (id: string) => void;
  onRun: () => void;
  onCancel: () => void;
  onCollapse: () => void;
};

function matches(
  issue: ValidationIssue,
  filter: { jobId?: string; operationIndex?: number; workcenterId?: string; machineId?: string },
): boolean {
  if (filter.jobId !== undefined && issue.jobId !== filter.jobId) return false;
  if (filter.operationIndex !== undefined && issue.operationIndex !== filter.operationIndex) return false;
  if (filter.workcenterId !== undefined && issue.workcenterId !== filter.workcenterId) return false;
  if (filter.machineId !== undefined && issue.machineId !== filter.machineId) return false;
  return true;
}

function IssuesFor({
  issues,
  filter,
}: {
  issues: ValidationIssue[];
  filter: { jobId?: string; operationIndex?: number; workcenterId?: string; machineId?: string };
}) {
  const matched = issues.filter((issue) => matches(issue, filter));
  if (matched.length === 0) return null;
  return (
    <ul className="field-issues">
      {matched.map((issue, index) => (
        <li key={`${issue.code}-${index}`} className={issue.severity === "warning" ? "issue-warning" : undefined}>
          {issue.message}
        </li>
      ))}
    </ul>
  );
}

/** Job-level-only issues (e.g. EMPTY_OPERATIONS, DUPLICATE_JOB_ID) - deliberately
 * excludes anything that already has its own operationIndex, which renders
 * under that specific operation row instead (see IssuesFor above). */
function JobLevelIssues({ issues, jobId }: { issues: ValidationIssue[]; jobId: string }) {
  const matched = issues.filter((issue) => issue.jobId === jobId && issue.operationIndex === undefined);
  if (matched.length === 0) return null;
  return (
    <ul className="field-issues">
      {matched.map((issue, index) => (
        <li key={`${issue.code}-${index}`} className={issue.severity === "warning" ? "issue-warning" : undefined}>
          {issue.message}
        </li>
      ))}
    </ul>
  );
}

function IssueBadge({ issues, filter }: { issues: ValidationIssue[]; filter: { jobId?: string } | { workcenterId?: string } | { machineId?: string } }) {
  const count = issues.filter((issue) => matches(issue, filter) && issue.severity === "error").length;
  if (count === 0) return null;
  return <em className="issue-badge">{count}</em>;
}

export function ProblemSidebar({
  problem,
  dispatch,
  algorithmId,
  running,
  canRun,
  progress,
  validationIssues,
  onAlgorithmChange,
  onRun,
  onCancel,
  onCollapse,
}: Props) {
  return (
    <aside className="sidebar" aria-label="Problem setup">
      <div className="side-heading">
        <span>Problem setup</span>
        <button type="button" aria-label="Collapse problem setup panel" onClick={onCollapse}>‹</button>
      </div>

      <label className="field-label">
        Problem name
        <input value={problem.name} readOnly />
      </label>

      <details open>
        <summary>
          <span>
            Jobs <em>{problem.jobs.length}</em>
          </span>
          <b aria-hidden="true">⌄</b>
        </summary>
        <div className="job-list">
          {problem.jobs.map((job) => (
            <details key={job.jobId} className="entity-row">
              <summary>
                <span className="job-summary-title">
                  <strong>{job.jobId}</strong>
                  <small>{job.operations.length} operation{job.operations.length === 1 ? "" : "s"}</small>
                </span>
                <span className="job-summary-meta"><small>Due {job.due}</small><small>Weight {job.weight}</small></span>
                <IssueBadge issues={validationIssues} filter={{ jobId: job.jobId }} />
              </summary>

              <div className="entity-fields job-fields">
                <label className="field-label">
                  Release
                  <input
                    type="number"
                    value={job.release}
                    disabled={running}
                    onChange={(event) => dispatch({ type: "updateJob", jobId: job.jobId, patch: { release: Number(event.target.value) } })}
                  />
                </label>
                <label className="field-label">
                  Due
                  <input
                    type="number"
                    value={job.due}
                    disabled={running}
                    onChange={(event) => dispatch({ type: "updateJob", jobId: job.jobId, patch: { due: Number(event.target.value) } })}
                  />
                </label>
                <label className="field-label">
                  Weight
                  <input
                    type="number"
                    value={job.weight}
                    disabled={running}
                    onChange={(event) => dispatch({ type: "updateJob", jobId: job.jobId, patch: { weight: Number(event.target.value) } })}
                  />
                </label>
              </div>

              <div className="operation-list">
                {job.operations.map((operation, index) => (
                  <div className="operation-row" key={operation.operationId}>
                    <div className="operation-heading">
                      <strong>Operation {operation.operationIndex + 1}</strong>
                      <div className="operation-actions">
                        <button
                          type="button"
                          aria-label="Move operation earlier"
                          disabled={running || index === 0}
                          onClick={() => dispatch({ type: "moveOperation", jobId: job.jobId, fromIndex: index, toIndex: index - 1 })}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          aria-label="Move operation later"
                          disabled={running || index === job.operations.length - 1}
                          onClick={() => dispatch({ type: "moveOperation", jobId: job.jobId, fromIndex: index, toIndex: index + 1 })}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove ${job.jobId} operation ${operation.operationIndex}`}
                          disabled={running}
                          onClick={() => dispatch({ type: "removeOperation", jobId: job.jobId, operationIndex: operation.operationIndex })}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                    <div className="operation-fields">
                      <label className="field-label">
                        Workcenter
                        <select
                          value={operation.workcenterId}
                          disabled={running}
                          aria-label={`Workcenter for operation ${operation.operationIndex}`}
                          onChange={(event) =>
                            dispatch({
                              type: "updateOperation",
                              jobId: job.jobId,
                              operationIndex: operation.operationIndex,
                              patch: { workcenterId: event.target.value },
                            })
                          }
                        >
                          <option value="" disabled>Choose workcenter</option>
                          {problem.workcenters.map((wc) => <option key={wc.workcenterId} value={wc.workcenterId}>{wc.workcenterId}</option>)}
                        </select>
                      </label>
                      <label className="field-label operation-time-field">
                        Duration
                        <input
                          type="number"
                          className="operation-duration"
                          value={operation.processingTime}
                          disabled={running}
                          aria-label={`Processing time for operation ${operation.operationIndex}`}
                          onChange={(event) =>
                            dispatch({
                              type: "updateOperation",
                              jobId: job.jobId,
                              operationIndex: operation.operationIndex,
                              patch: { processingTime: Number(event.target.value) },
                            })
                          }
                        />
                      </label>
                    </div>
                    <IssuesFor issues={validationIssues} filter={{ jobId: job.jobId, operationIndex: operation.operationIndex }} />
                  </div>
                ))}
                <button
                  className="add-button"
                  type="button"
                  disabled={running}
                  onClick={() => dispatch({ type: "addOperation", jobId: job.jobId })}
                >
                  ＋ Add operation
                </button>
              </div>

              <JobLevelIssues issues={validationIssues} jobId={job.jobId} />
              <button
                className="remove-button"
                type="button"
                disabled={running}
                aria-label={`Delete job ${job.jobId}`}
                onClick={() => dispatch({ type: "removeJob", jobId: job.jobId })}
              >
                Delete job
              </button>
            </details>
          ))}
        </div>
        <button className="add-button" type="button" disabled={running} onClick={() => dispatch({ type: "addJob" })}>
          ＋ Add job
        </button>
      </details>

      <details open={problem.workcenters.length === 0}>
        <summary>
          <span>
            Workcenters <em>{problem.workcenters.length}</em>
          </span>
          <b aria-hidden="true">⌄</b>
        </summary>
        <div className="job-list">
          {problem.workcenters.map((wc) => (
            <div className="entity-row entity-row-flat" key={wc.workcenterId}>
              <div className="entity-card-heading">
                <strong>{wc.workcenterId}</strong>
                <button className="icon-delete" type="button" disabled={running} aria-label={`Delete workcenter ${wc.workcenterId}`} onClick={() => dispatch({ type: "removeWorkcenter", workcenterId: wc.workcenterId })}>✕</button>
              </div>
              <div className="entity-fields workcenter-fields">
                <label className="field-label">
                  Release
                  <input
                    type="number"
                    value={wc.release}
                    disabled={running}
                    onChange={(event) => dispatch({ type: "updateWorkcenter", workcenterId: wc.workcenterId, patch: { release: Number(event.target.value) } })}
                  />
                </label>
                <label className="field-label">
                  Status
                  <input
                    value={wc.status}
                    disabled={running}
                    onChange={(event) => dispatch({ type: "updateWorkcenter", workcenterId: wc.workcenterId, patch: { status: event.target.value } })}
                  />
                </label>
              </div>
              <IssuesFor issues={validationIssues} filter={{ workcenterId: wc.workcenterId }} />
            </div>
          ))}
        </div>
        <button className="add-button" type="button" disabled={running} onClick={() => dispatch({ type: "addWorkcenter" })}>
          ＋ Add workcenter
        </button>
      </details>

      <details>
        <summary>
          <span>
            Machines <em>{problem.machines.length}</em>
          </span>
          <b aria-hidden="true">⌄</b>
        </summary>
        <div className="job-list">
          {problem.machines.map((machine) => (
            <div className="entity-row entity-row-flat" key={machine.machineId}>
              <div className="entity-card-heading">
                <strong>{machine.machineId}</strong>
                <button className="icon-delete" type="button" disabled={running} aria-label={`Delete machine ${machine.machineId}`} onClick={() => dispatch({ type: "removeMachine", machineId: machine.machineId })}>✕</button>
              </div>
              <div className="entity-fields machine-fields">
                <label className="field-label machine-workcenter-field">
                  Workcenter
                  <select value={machine.workcenterId} disabled={running} aria-label={`Workcenter for machine ${machine.machineId}`} onChange={(event) => dispatch({ type: "updateMachine", machineId: machine.machineId, patch: { workcenterId: event.target.value } })}>
                    {problem.workcenters.map((wc) => <option key={wc.workcenterId} value={wc.workcenterId}>{wc.workcenterId}</option>)}
                  </select>
                </label>
                <label className="field-label">
                  Release
                  <input
                    type="number"
                    value={machine.release}
                    disabled={running}
                    onChange={(event) => dispatch({ type: "updateMachine", machineId: machine.machineId, patch: { release: Number(event.target.value) } })}
                  />
                </label>
                <label className="field-label">
                  Status
                  <input
                    value={machine.status}
                    disabled={running}
                    onChange={(event) => dispatch({ type: "updateMachine", machineId: machine.machineId, patch: { status: event.target.value } })}
                  />
                </label>
              </div>
              <IssuesFor issues={validationIssues} filter={{ machineId: machine.machineId }} />
            </div>
          ))}
        </div>
        <button
          className="add-button"
          type="button"
          disabled={running || problem.workcenters.length === 0}
          onClick={() => dispatch({ type: "addMachine", workcenterId: problem.workcenters[0]!.workcenterId })}
          title={problem.workcenters.length === 0 ? "Add a workcenter first" : undefined}
        >
          ＋ Add machine
        </button>
      </details>

      <details open>
        <summary>
          <span>Algorithm</span>
          <b aria-hidden="true">⌄</b>
        </summary>
        <label className="field-label">
          Dispatching rule
          <select value={algorithmId} onChange={(event) => onAlgorithmChange(event.target.value)} disabled={running}>
            <option value="spt">SPT - Shortest processing time</option>
            <option value="fcfs">FCFS - First come, first served</option>
            <option value="edd">EDD - Earliest due date</option>
            <option value="wspt">WSPT - Weighted SPT</option>
          </select>
        </label>
      </details>

      <button className="run-button" type="button" disabled={!running && !canRun} onClick={running ? onCancel : onRun}>
        {running ? "■ Cancel execution" : canRun ? "▶ Run schedule" : "Fix validation errors to run"}
      </button>
      <p className="local-note">{progress ? progress.replaceAll("-", " ") : "Runs locally in your browser"}</p>
    </aside>
  );
}
