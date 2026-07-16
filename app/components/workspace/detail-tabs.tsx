"use client";
import { useState, type ReactNode } from "react";
import type { ProblemDefinition } from "../../../lib/schema/problem";
import type { ExecutionResult } from "../../../lib/schema/algorithm";
import type { ValidationIssue } from "../../../lib/schema/issue";
import { buildJobSummaries } from "../../../lib/results/job-summary";

type Props = { result: ExecutionResult | null; validationIssues: ValidationIssue[]; problem: ProblemDefinition };

export function DetailTabs({ result, validationIssues, problem }: Props) {
  const [activeTab, setActiveTab] = useState("Machine sequence");
  const schedule = result?.schedule ?? null;
  const errorCount = validationIssues.filter((issue) => issue.severity === "error").length;
  const releaseByMachine = new Map(problem.machines.map((machine) => [machine.machineId, machine.release]));
  const utilization = result?.metrics?.machineUtilization ?? {};
  const content: Record<string, ReactNode> = {
    "Machine sequence": schedule ? (
      <div className="sequence-table">
        {schedule.machines.map((machine) => (
          <div key={machine.machineId}>
            <b>{machine.machineId}</b>
            <i>
              release {releaseByMachine.get(machine.machineId) ?? 0}
              {utilization[machine.machineId] !== undefined ? ` · ${(utilization[machine.machineId] * 100).toFixed(0)}% utilized` : ""}
            </i>
            {machine.operations.map((operation, index) => (
              <span key={operation.scheduledOperationId} className="chip" style={{ background: "var(--violet)" }}>
                {index > 0 && "→ "}
                {operation.jobId} · O{operation.operationIndex + 1} · {operation.startTime}–{operation.endTime}
              </span>
            ))}
          </div>
        ))}
      </div>
    ) : (
      <p className="tab-empty">Run a schedule to inspect machine sequences.</p>
    ),
    "Job details": schedule ? (
      <div className="sequence-table">
        {buildJobSummaries(schedule, problem).map((job) => (
          <div key={job.jobId} className="job-summary-row">
            <div className="job-summary-head">
              <b>{job.jobId}</b>
              <i>
                release {job.release} · due {job.due} · weight {job.weight}
                {job.scheduled
                  ? ` · completes ${job.completionTime}${job.tardiness && job.tardiness > 0 ? ` · tardy ${job.tardiness}` : " · on time"}`
                  : " · not scheduled"}
              </i>
            </div>
            {job.operations.map((operation) => (
              <span key={operation.scheduledOperationId} className="chip" style={{ background: "var(--blue)" }}>
                O{operation.operationIndex + 1} · {operation.machineId} · {operation.startTime}–{operation.endTime}
              </span>
            ))}
          </div>
        ))}
      </div>
    ) : (
      <p className="tab-empty">No scheduled jobs yet.</p>
    ),
    "Algorithm comparison": <p className="tab-empty">Run another algorithm to compare results in a later milestone.</p>,
    Validation: validationIssues.length ? (
      <ul className="issue-list">
        {validationIssues.map((issue, index) => (
          <li key={`${issue.code}-${index}`} className={issue.severity === "warning" ? "issue-warning" : undefined}>
            <b>{issue.severity === "warning" ? "Warning" : "Error"}</b> {issue.code}: {issue.message}
          </li>
        ))}
      </ul>
    ) : (
      <p className="tab-empty success-text">✓ No validation errors.</p>
    ),
    Execution: result ? (
      <p className="tab-empty">
        {result.algorithmId.toUpperCase()} {result.status} locally in {result.runtimeMs} ms · lekinpy {result.lekinpyVersion}
        {result.metrics ? ` · weighted completion ${result.metrics.weightedCompletionTime} · weighted tardiness ${result.metrics.weightedTardiness}` : ""}
      </p>
    ) : (
      <p className="tab-empty">No execution has run.</p>
    ),
  };
  return <section className="details-card"><div className="tabs" role="tablist" aria-label="Schedule details">{Object.keys(content).map((name) => <button key={name} type="button" role="tab" aria-selected={activeTab === name} className={activeTab === name ? "active" : ""} onClick={() => setActiveTab(name)}>{name}{name === "Validation" && <span>{errorCount}</span>}</button>)}</div><div role="tabpanel">{content[activeTab]}</div></section>;
}
