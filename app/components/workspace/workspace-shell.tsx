"use client";
import { useEffect, useRef, useState } from "react";
import type { ExecutionResult } from "../../../lib/schema/algorithm";
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
  const [algorithmId, setAlgorithmId] = useState("spt");
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [progress, setProgress] = useState<ExecutionProgress | null>(null);
  const [running, setRunning] = useState(false);
  useEffect(() => () => engine.current?.dispose(), []);
  async function run() {
    engine.current ??= new BrowserExecutionEngine();
    const executionId = crypto.randomUUID(); activeExecution.current = executionId; setRunning(true); setProgress("loading-runtime"); setResult(null);
    const next = await engine.current.execute({ executionId, problem: SAMPLE_PROBLEM, algorithmId }, setProgress);
    if (activeExecution.current !== executionId) return;
    setResult(next); setRunning(false); setProgress(null); activeExecution.current = null;
  }
  function cancel() { if (activeExecution.current) engine.current?.cancel(activeExecution.current); activeExecution.current = null; setRunning(false); setProgress(null); }
  const stateLabel = running ? "Running locally" : result?.status === "completed" ? "Valid schedule" : result ? result.status : "Ready to run";
  return <main className="workspace"><header className="appbar"><Brand asButton onClick={onClose} /><span className="divider" /><div className="project"><small>Project</small><strong>{SAMPLE_PROBLEM.name}</strong><span>Local</span></div><div className="app-actions"><button type="button">＋ New</button><button type="button">⇧ Import</button><button type="button">↓ Export</button><span className="divider" /><button type="button">Help</button></div></header><div className="app-body">
    <ProblemSidebar problem={SAMPLE_PROBLEM} algorithmId={algorithmId} running={running} progress={progress} onAlgorithmChange={setAlgorithmId} onRun={run} onCancel={cancel} />
    <div className="canvas"><div className="canvas-head"><div><span className="breadcrumb">Workspace / {SAMPLE_PROBLEM.name}</span><h1>Schedule overview</h1><p>{running ? progress?.replaceAll("-", " ") : result ? `${result.algorithmId.toUpperCase()} · Last run ${result.runtimeMs} ms` : "Select an algorithm and run it in your browser"}</p></div><span className={result && result.status !== "completed" ? "valid-pill error-pill" : "valid-pill"}>{running ? "…" : result?.status === "completed" ? "✓" : "○"} {stateLabel}</span></div>
    {result?.warnings.map((warning) => <p className="execution-error" key={warning}>{warning}</p>)}
    <MetricsRow metrics={result?.metrics ?? null} jobCount={SAMPLE_PROBLEM.jobs.length} /><GanttChart schedule={result?.schedule ?? null} problem={SAMPLE_PROBLEM} /><DetailTabs result={result} /></div></div></main>;
}
