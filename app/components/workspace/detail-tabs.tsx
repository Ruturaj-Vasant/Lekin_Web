"use client";
import { useState, type ReactNode } from "react";
import type { ExecutionResult } from "../../../lib/schema/algorithm";

export function DetailTabs({ result }: { result: ExecutionResult | null }) {
  const [activeTab, setActiveTab] = useState("Machine sequence");
  const operations = result?.schedule?.machines.flatMap((machine) => machine.operations) ?? [];
  const content: Record<string, ReactNode> = {
    "Machine sequence": result?.schedule ? <div className="sequence-table">{result.schedule.machines.map((machine) => <div key={machine.machineId}><b>{machine.machineId}</b>{machine.operations.map((operation, index) => <span key={operation.scheduledOperationId} className="chip" style={{ background: "var(--violet)" }}>{index > 0 && "→ "}{operation.jobId} · O{operation.operationIndex + 1}</span>)}</div>)}</div> : <p className="tab-empty">Run a schedule to inspect machine sequences.</p>,
    "Job details": <p className="tab-empty">{operations.length ? `${new Set(operations.map((operation) => operation.jobId)).size} jobs and ${operations.length} operations were scheduled.` : "No scheduled jobs yet."}</p>,
    "Algorithm comparison": <p className="tab-empty">Run another algorithm to compare results in a later milestone.</p>,
    Validation: result?.validationIssues.length ? <ul className="issue-list">{result.validationIssues.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.code}: {issue.message}</li>)}</ul> : <p className="tab-empty success-text">✓ No validation errors.</p>,
    Execution: <p className="tab-empty">{result ? `${result.algorithmId.toUpperCase()} ${result.status} locally in ${result.runtimeMs} ms · lekinpy ${result.lekinpyVersion}` : "No execution has run."}</p>,
  };
  return <section className="details-card"><div className="tabs" role="tablist" aria-label="Schedule details">{Object.keys(content).map((name) => <button key={name} type="button" role="tab" aria-selected={activeTab === name} className={activeTab === name ? "active" : ""} onClick={() => setActiveTab(name)}>{name}{name === "Validation" && <span>{result?.validationIssues.length ?? 0}</span>}</button>)}</div><div role="tabpanel">{content[activeTab]}</div></section>;
}
