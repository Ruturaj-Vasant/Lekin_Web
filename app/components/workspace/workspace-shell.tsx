"use client";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { ExecutionResult } from "../../../lib/schema/algorithm";
import { hasBlockingError } from "../../../lib/schema/issue";
import { validateExecutionRequest } from "../../../lib/adapter/validate-request";
import { problemEditorReducer } from "../../../lib/editor/problem-editor";
import { isResultStale, type ResultContext } from "../../../lib/editor/result-staleness";
import type { ExecutionProgress } from "../../../worker/scheduling-protocol";
import { BrowserExecutionEngine } from "../../execution/browser-execution-engine";
import { SAMPLE_PROBLEM } from "../../execution/sample-problem";
import { Brand } from "../brand";
import { DetailTabs } from "./detail-tabs";
import { GanttChart } from "./gantt-chart";
import { MetricsRow } from "./metrics-row";
import { ProblemSidebar } from "./problem-sidebar";

export function WorkspaceShell({ onClose }: { onClose: () => void }) {
  const engine = useRef<BrowserExecutionEngine | null>(null);
  const activeExecution = useRef<string | null>(null);
  const [problem, dispatch] = useReducer(problemEditorReducer, SAMPLE_PROBLEM);
  const [algorithmId, setAlgorithmId] = useState("spt");
  const [result, setResult] = useState<ExecutionResult | null>(null);
  // What (problem, algorithmId) `result` was actually computed for, so a
  // stale result can be cleared the instant either changes. Adjusted
  // directly during render (React's documented pattern for resetting state
  // when a dependency changes: https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes)
  // rather than in a useEffect, which would cause an extra cascading render
  // and trips the react-hooks/set-state-in-effect lint rule.
  const [resultFor, setResultFor] = useState<ResultContext | null>(null);
  const [progress, setProgress] = useState<ExecutionProgress | null>(null);
  const [running, setRunning] = useState(false);

  if (result !== null && isResultStale(resultFor, problem, algorithmId)) {
    setResult(null);
    setResultFor(null);
  }

  useEffect(() => () => engine.current?.dispose(), []);

  const validationIssues = useMemo(
    () => validateExecutionRequest(problem, algorithmId),
    [problem, algorithmId],
  );
  const canRun = !hasBlockingError(validationIssues);

  async function run() {
    if (!canRun) return;
    engine.current ??= new BrowserExecutionEngine();
    const executionId = crypto.randomUUID();
    activeExecution.current = executionId;
    setRunning(true);
    setProgress("loading-runtime");
    setResult(null);
    const next = await engine.current.execute({ executionId, problem, algorithmId }, setProgress);
    if (activeExecution.current !== executionId) return;
    setResult(next);
    setResultFor({ problem, algorithmId });
    setRunning(false);
    setProgress(null);
    activeExecution.current = null;
  }

  function cancel() {
    if (activeExecution.current) engine.current?.cancel(activeExecution.current);
    activeExecution.current = null;
    setRunning(false);
    setProgress(null);
  }

  const stateLabel = running
    ? "Running locally"
    : result?.status === "completed"
      ? "Valid schedule"
      : result
        ? result.status
        : !canRun
          ? "Fix validation errors"
          : "Ready to run";

  return (
    <main className="workspace">
      <header className="appbar">
        <Brand asButton onClick={onClose} />
        <span className="divider" />
        <div className="project">
          <small>Project</small>
          <strong>{problem.name}</strong>
          <span>Local</span>
        </div>
        <div className="app-actions">
          <button type="button">＋ New</button>
          <button type="button">⇧ Import</button>
          <button type="button">↓ Export</button>
          <span className="divider" />
          <button type="button">Help</button>
        </div>
      </header>
      <div className="app-body">
        <ProblemSidebar
          problem={problem}
          dispatch={dispatch}
          algorithmId={algorithmId}
          running={running}
          canRun={canRun}
          progress={progress}
          validationIssues={validationIssues}
          onAlgorithmChange={setAlgorithmId}
          onRun={run}
          onCancel={cancel}
        />
        <div className="canvas">
          <div className="canvas-head">
            <div>
              <span className="breadcrumb">Workspace / {problem.name}</span>
              <h1>Schedule overview</h1>
              <p>
                {running
                  ? progress?.replaceAll("-", " ")
                  : result
                    ? `${result.algorithmId.toUpperCase()} · Last run ${result.runtimeMs} ms`
                    : "Edit the problem, choose an algorithm, and run it in your browser"}
              </p>
            </div>
            <span className={result && result.status !== "completed" ? "valid-pill error-pill" : "valid-pill"}>
              {running ? "…" : result?.status === "completed" ? "✓" : "○"} {stateLabel}
            </span>
          </div>
          {result?.warnings.map((warning) => (
            <p className="execution-error" key={warning}>
              {warning}
            </p>
          ))}
          <MetricsRow metrics={result?.metrics ?? null} jobCount={problem.jobs.length} />
          <GanttChart schedule={result?.schedule ?? null} problem={problem} />
          <DetailTabs result={result} validationIssues={validationIssues} />
        </div>
      </div>
    </main>
  );
}
