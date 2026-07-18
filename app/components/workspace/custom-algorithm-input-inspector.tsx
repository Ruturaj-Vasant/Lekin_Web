"use client";

import { useMemo, useState } from "react";
import { buildJsonInputPreview, buildPythonInputPreview } from "../../../lib/editor/custom-algorithm-inspector";
import type { ProblemDefinition } from "../../../lib/schema/problem";

type InspectorTab = "tables" | "python" | "json";

const TABLE_PREVIEW_LIMIT = 8;

export function CustomAlgorithmInputInspector({ problem, parametersText }: {
  problem: ProblemDefinition;
  parametersText: string;
}) {
  const [tab, setTab] = useState<InspectorTab>("tables");
  const [showAll, setShowAll] = useState(false);
  const pythonPreview = useMemo(
    () => buildPythonInputPreview(problem, parametersText),
    [problem, parametersText],
  );
  const jsonPreview = useMemo(
    () => buildJsonInputPreview(problem, parametersText),
    [problem, parametersText],
  );
  const operationCount = problem.jobs.reduce((total, job) => total + job.operations.length, 0);
  const visibleJobs = showAll ? problem.jobs : problem.jobs.slice(0, TABLE_PREVIEW_LIMIT);
  const visibleWorkcenters = showAll ? problem.workcenters : problem.workcenters.slice(0, TABLE_PREVIEW_LIMIT);
  const hasHiddenRows = problem.jobs.length > TABLE_PREVIEW_LIMIT || problem.workcenters.length > TABLE_PREVIEW_LIMIT;

  return (
    <details className="custom-input-inspector" open>
      <summary>
        <span>
          <b>Inspect the input your code receives</b>
          <small>Generated from the current problem in the left panel</small>
        </span>
        <span className="custom-input-counts">
          {problem.jobs.length} jobs · {operationCount} operations · {problem.machines.length} machines
        </span>
      </summary>

      <div className="custom-inspector-body">
        <div className="custom-inspector-tabs" role="tablist" aria-label="Custom algorithm input views">
          {(["tables", "python", "json"] as const).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={tab === item}
              onClick={() => setTab(item)}
            >
              {item === "tables" ? "Readable tables" : item === "python" ? "Python attributes" : "JSON payload"}
            </button>
          ))}
        </div>

        {tab === "tables" && (
          <div className="custom-input-tables" role="tabpanel">
            <section>
              <h4>Jobs and operations</h4>
              <div className="custom-input-table-wrap">
                <table>
                  <thead><tr><th>Job</th><th>Release</th><th>Due</th><th>Weight</th><th>Ordered operations</th></tr></thead>
                  <tbody>
                    {visibleJobs.map((job) => (
                      <tr key={job.jobId}>
                        <td><b>{job.jobId}</b></td>
                        <td>{job.release}</td>
                        <td>{job.due}</td>
                        <td>{job.weight}</td>
                        <td>
                          <div className="custom-route-list">
                            {job.operations.map((operation) => (
                              <span key={operation.operationId}>
                                O{operation.operationIndex + 1}: {operation.workcenterId} · {operation.processingTime}u
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h4>Workcenters and machines</h4>
              <div className="custom-resource-grid">
                {visibleWorkcenters.map((workcenter) => {
                  const machines = problem.machines.filter((machine) => machine.workcenterId === workcenter.workcenterId);
                  return (
                    <article key={workcenter.workcenterId}>
                      <b>{workcenter.workcenterId}</b>
                      <span>Release {workcenter.release}</span>
                      <p>{machines.map((machine) => `${machine.machineId} (release ${machine.release})`).join(", ") || "No machines"}</p>
                    </article>
                  );
                })}
              </div>
            </section>

            {hasHiddenRows && (
              <button className="custom-show-input" type="button" onClick={() => setShowAll((value) => !value)}>
                {showAll ? "Show compact preview" : "Show every job and workcenter"}
              </button>
            )}
          </div>
        )}

        {tab === "python" && (
          <div className="custom-input-code" role="tabpanel">
            <p>This uses the real lekinpy attribute names available to Python. It is a readable preview, not code you need to copy.</p>
            <pre>{pythonPreview}</pre>
          </div>
        )}

        {tab === "json" && (
          <div className="custom-input-code" role="tabpanel">
            <p>This is the exact snake_case construction payload used at the browser-to-Python boundary. Your function receives a real <code>System</code>, not this JSON object.</p>
            <pre>{jsonPreview}</pre>
          </div>
        )}
      </div>
    </details>
  );
}
