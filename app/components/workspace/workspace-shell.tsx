"use client";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { ExecutionResult } from "../../../lib/schema/algorithm";
import { validateProblemDefinition, type ProblemDefinition } from "../../../lib/schema/problem";
import { hasBlockingError } from "../../../lib/schema/issue";
import { validateExecutionRequest } from "../../../lib/adapter/validate-request";
import { problemEditorReducer } from "../../../lib/editor/problem-editor";
import { isResultStale, type ResultContext } from "../../../lib/editor/result-staleness";
import { recordComparisonResult, comparisonResultsFor, removeComparisonResult, type ComparisonHistory } from "../../../lib/editor/comparison-history";
import type { ManualStartConstraints } from "../../../lib/schema/manual-edit";
import type { DragRejection } from "../../../lib/scheduling/recalculate";
import { checkDropValidity, isNoOpEdit, recalculate } from "../../../lib/scheduling/recalculate";
import type { ExecutionProgress } from "../../../worker/scheduling-protocol";
import { saveProject, setLastActiveProjectId } from "../../../lib/persistence/local-project-store";
import { BrowserExecutionEngine, type SchedulerPreparationState } from "../../execution/browser-execution-engine";
import { createBlankProblem } from "../../execution/blank-problem";
import { getBrowserLocalStorage } from "../../persistence/browser-storage";
import { Brand } from "../brand";
import { DetailTabs } from "./detail-tabs";
import { GanttChart } from "./gantt-chart";
import { ProblemSidebar } from "./problem-sidebar";
import { ScheduleSummary } from "./schedule-summary";
import { downloadProblemFile, readProblemFile } from "../../import-export/browser-problem-files";
import { CustomAlgorithmEngine } from "../../execution/custom-execution-engine";
import { DEFAULT_CUSTOM_ALGORITHM_TEMPLATE } from "../../execution/custom-algorithm-templates";
import type { CustomProgressEvent, CustomRunResult, CustomValidationResult } from "../../../lib/custom-algorithm/types";
import { parseCustomParameters } from "../../../lib/editor/custom-algorithm-input";
import { CustomAlgorithmPanel } from "./custom-algorithm-panel";

export function WorkspaceShell({ initialProblem, onClose, executionEngine, schedulerPreparation }: {
  initialProblem: ProblemDefinition;
  onClose: () => void;
  executionEngine: BrowserExecutionEngine;
  schedulerPreparation: SchedulerPreparationState;
}) {
  const activeExecution = useRef<string | null>(null);
  const [customExecutionEngine] = useState(() => new CustomAlgorithmEngine());
  const importInput = useRef<HTMLInputElement | null>(null);
  const [problem, dispatch] = useReducer(problemEditorReducer, initialProblem);
  const [algorithmId, setAlgorithmId] = useState("spt");
  const [result, setResult] = useState<ExecutionResult | null>(null);
  // What (problem, algorithmId) `result` was actually computed for, so a
  // stale result can be cleared the instant either changes. Adjusted
  // directly during render (React's documented pattern for resetting state
  // when a dependency changes: https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes)
  // rather than in a useEffect, which would cause an extra cascading render
  // and trips the react-hooks/set-state-in-effect lint rule.
  const [resultFor, setResultFor] = useState<ResultContext | null>(null);
  const [comparisonHistory, setComparisonHistory] = useState<ComparisonHistory | null>(null);
  const [progress, setProgress] = useState<ExecutionProgress | "cancelling" | null>(null);
  const [running, setRunning] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [manualBaseResult, setManualBaseResult] = useState<ExecutionResult | null>(null);
  const [manualStartConstraints, setManualStartConstraints] = useState<ManualStartConstraints>({});
  const [undoStack, setUndoStack] = useState<Array<{ result: ExecutionResult; constraints: ManualStartConstraints }>>([]);
  const [redoStack, setRedoStack] = useState<Array<{ result: ExecutionResult; constraints: ManualStartConstraints }>>([]);
  const [dragMessage, setDragMessage] = useState<string | null>(null);
  const [manualProblem, setManualProblem] = useState(problem);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [customName, setCustomName] = useState(DEFAULT_CUSTOM_ALGORITHM_TEMPLATE.name);
  const [customSource, setCustomSource] = useState(DEFAULT_CUSTOM_ALGORITHM_TEMPLATE.source);
  const [customParametersText, setCustomParametersText] = useState("{}");
  const [customTimeLimitSeconds, setCustomTimeLimitSeconds] = useState(5);
  const [customTrusted, setCustomTrusted] = useState(false);
  const [customValidation, setCustomValidation] = useState<CustomValidationResult | null>(null);
  const [customValidating, setCustomValidating] = useState(false);
  const [customRunResult, setCustomRunResult] = useState<CustomRunResult | null>(null);
  const [customProgressEvents, setCustomProgressEvents] = useState<CustomProgressEvent[]>([]);
  const [customIncumbentCount, setCustomIncumbentCount] = useState(0);

  if (result !== null && isResultStale(resultFor, problem, algorithmId)) {
    setResult(null);
    setResultFor(null);
  }
  if (manualProblem !== problem) {
    setManualProblem(problem);
    setManualBaseResult(null);
    setManualStartConstraints({});
    setUndoStack([]);
    setRedoStack([]);
    setDragMessage(null);
  }

  // PRODUCT_SPEC.md §24: automatically save the active ProblemDefinition
  // after edits. Runs on mount too, so simply opening/creating a project
  // (with no edits yet) already becomes the one restored after a refresh.
  useEffect(() => {
    const storage = getBrowserLocalStorage();
    if (!storage) return;
    const saved = saveProject(storage, problem);
    if (saved.ok) {
      setLastActiveProjectId(storage, problem.problemId);
    } else {
      queueMicrotask(() => setSaveFeedback(`Autosave failed: ${saved.error}`));
    }
  }, [problem]);

  useEffect(() => {
    if (!saveFeedback) return;
    const timer = setTimeout(() => setSaveFeedback(null), 2500);
    return () => clearTimeout(timer);
  }, [saveFeedback]);

  useEffect(() => () => customExecutionEngine.dispose(), [customExecutionEngine]);

  function saveLocally() {
    const storage = getBrowserLocalStorage();
    if (!storage) {
      setSaveFeedback("Local storage is unavailable in this browser.");
      return;
    }
    const result = saveProject(storage, problem);
    if (result.ok) {
      setLastActiveProjectId(storage, problem.problemId);
      setSaveFeedback("Saved locally.");
    } else {
      setSaveFeedback(`Could not save: ${result.error}`);
    }
  }

  const customParameters = useMemo(() => parseCustomParameters(customParametersText), [customParametersText]);
  const validationIssues = useMemo(() => {
    const problemIssues = algorithmId === "custom"
      ? validateProblemDefinition(problem)
      : validateExecutionRequest(problem, algorithmId);
    return algorithmId === "custom" && customValidation
      ? [...problemIssues, ...customValidation.issues]
      : problemIssues;
  }, [problem, algorithmId, customValidation]);
  const canRunProblem = !hasBlockingError(validationIssues);
  const customTimeLimitValid = Number.isFinite(customTimeLimitSeconds) && customTimeLimitSeconds >= 1 && customTimeLimitSeconds <= 20;
  const canRunCustom = canRunProblem
    && customValidation?.valid === true
    && customParameters.ok
    && customTimeLimitValid
    && customName.trim().length > 0
    && customTrusted;
  const canRun = algorithmId === "custom" ? canRunCustom : canRunProblem;
  const comparisonResults = comparisonResultsFor(comparisonHistory, problem);

  async function run() {
    if (!canRun) return;
    if (algorithmId === "custom") {
      await runCustom();
      return;
    }
    const executionId = crypto.randomUUID();
    activeExecution.current = executionId;
    setRunning(true);
    setProgress("loading-runtime");
    setResult(null);
    const next = await executionEngine.execute({ executionId, problem, algorithmId }, setProgress);
    if (activeExecution.current !== executionId) return;
    setResult(next);
    setResultFor({ problem, algorithmId });
    setComparisonHistory((prev) => recordComparisonResult(prev, problem, next));
    setManualBaseResult(next.status === "completed" ? next : null);
    setManualProblem(problem);
    setManualStartConstraints({});
    setUndoStack([]);
    setRedoStack([]);
    setDragMessage(null);
    setRunning(false);
    setProgress(null);
    activeExecution.current = null;
  }

  async function runCustom() {
    if (!customParameters.ok || !canRunCustom) return;
    const executionId = crypto.randomUUID();
    activeExecution.current = executionId;
    setRunning(true);
    setProgress("loading-runtime");
    setResult(null);
    setCustomRunResult(null);
    setCustomProgressEvents([]);
    setCustomIncumbentCount(0);
    const next = await customExecutionEngine.runCustomAlgorithm({
      runId: executionId,
      source: customSource,
      problem,
      parameters: customParameters.value,
      algorithmName: customName.trim(),
      limits: { timeLimitMs: customTimeLimitSeconds * 1000 },
      onProgress: (event) => setCustomProgressEvents((current) => [...current, event]),
      onIncumbent: () => setCustomIncumbentCount((count) => count + 1),
    });
    if (activeExecution.current !== executionId) return;
    setCustomRunResult(next);
    setResult(next.result);
    setResultFor(next.result ? { problem, algorithmId: "custom" } : null);
    if (next.result) setComparisonHistory((previous) => recordComparisonResult(previous, problem, next.result!));
    setManualBaseResult(next.result?.status === "completed" ? next.result : null);
    setManualProblem(problem);
    setManualStartConstraints({});
    setUndoStack([]);
    setRedoStack([]);
    setDragMessage(null);
    setRunning(false);
    setProgress(null);
    activeExecution.current = null;
  }

  async function validateCustomSource() {
    setCustomValidating(true);
    setCustomValidation(null);
    const checked = await customExecutionEngine.validateCustomAlgorithm(customSource);
    setCustomValidation(checked);
    setCustomValidating(false);
  }

  function cancel() {
    if (activeExecution.current && algorithmId === "custom") {
      customExecutionEngine.cancelCustomAlgorithm(activeExecution.current);
      setProgress("cancelling");
      return;
    }
    if (activeExecution.current) executionEngine.cancel(activeExecution.current);
    activeExecution.current = null;
    setRunning(false);
    setProgress(null);
  }

  function abandonActiveExecution() {
    if (activeExecution.current) {
      executionEngine.cancel(activeExecution.current);
      customExecutionEngine.cancelCustomAlgorithm(activeExecution.current);
    }
    activeExecution.current = null;
    setRunning(false);
    setProgress(null);
  }

  function replaceProblem(nextProblem: ProblemDefinition) {
    abandonActiveExecution();
    dispatch({ type: "replaceProblem", problem: nextProblem });
    setAlgorithmId("spt");
    setResult(null);
    setResultFor(null);
    setComparisonHistory(null);
    setManualBaseResult(null);
    setManualStartConstraints({});
    setUndoStack([]);
    setRedoStack([]);
    setDragMessage(null);
    setSidebarCollapsed(false);
    setCustomRunResult(null);
    setCustomProgressEvents([]);
    setCustomIncumbentCount(0);
  }

  function createNewProblem() {
    replaceProblem(createBlankProblem());
  }

  async function importProblemFile(file: File) {
    const imported = await readProblemFile(file);
    if (imported.ok) {
      replaceProblem(imported.problem);
      setSaveFeedback(`Imported ${imported.problem.name}.`);
    } else {
      setSaveFeedback(`Import failed: ${imported.message}`);
    }
  }

  function selectComparisonResult(selected: ExecutionResult) {
    setAlgorithmId(selected.algorithmId);
    setResult(selected);
    setResultFor({ problem, algorithmId: selected.algorithmId });
    setManualBaseResult(selected.status === "completed" ? selected : null);
    setManualProblem(problem);
    setManualStartConstraints({});
    setUndoStack([]);
    setRedoStack([]);
    setDragMessage(null);
  }

  function changeAlgorithm(id: string) {
    setAlgorithmId(id);
    setManualBaseResult(null);
    setManualStartConstraints({});
    setUndoStack([]);
    setRedoStack([]);
    setDragMessage(null);
  }

  function invalidateCustomResult({ sourceChanged = false }: { sourceChanged?: boolean } = {}) {
    setResult(null);
    setResultFor(null);
    setCustomRunResult(null);
    setCustomProgressEvents([]);
    setCustomIncumbentCount(0);
    setManualBaseResult(null);
    setManualStartConstraints({});
    setUndoStack([]);
    setRedoStack([]);
    setDragMessage(null);
    if (sourceChanged) {
      setCustomValidation(null);
      setCustomTrusted(false);
      setComparisonHistory((history) => removeComparisonResult(history, problem, "custom"));
    }
  }

  function customRunDisabledReason(): string | null {
    if (hasBlockingError(validationIssues)) return "Fix the problem validation errors first.";
    if (!customSource.trim()) return "Add Python source code.";
    if (!customValidation?.valid) return "Validate the Python contract first.";
    if (!customParameters.ok) return "Fix the parameters JSON.";
    if (!customTimeLimitValid) return "Choose a time limit from 1 to 20 seconds.";
    if (!customName.trim()) return "Name the algorithm.";
    if (!customTrusted) return "Confirm that you trust this code.";
    return null;
  }

  function findScheduledOperation(scheduledOperationId: string) {
    return result?.schedule?.machines.flatMap((machine) => machine.operations).find(
      (operation) => operation.scheduledOperationId === scheduledOperationId,
    );
  }

  function checkManualMove(scheduledOperationId: string, machineId: string, sequencePosition: number): DragRejection | null {
    if (!result?.schedule) return null;
    const checked = checkDropValidity(result.schedule, problem, scheduledOperationId, machineId, sequencePosition);
    return checked.valid ? null : checked.rejection;
  }

  function moveScheduledOperation(
    scheduledOperationId: string,
    machineId: string,
    sequencePosition: number,
    requestedStartTime: number | null,
  ): { accepted: boolean; message: string; scheduledStartTime?: number } {
    if (!result?.schedule || !result.metrics) return { accepted: false, message: "Run an algorithm before editing the schedule." };
    const operation = findScheduledOperation(scheduledOperationId);
    if (!operation) return { accepted: false, message: `Operation ${scheduledOperationId} is not in the active schedule.` };
    const edit = {
      editId: crypto.randomUUID(),
      scheduleId: result.schedule.scheduleId,
      scheduledOperationId,
      timestamp: new Date().toISOString(),
      from: { machineId: operation.machineId, sequencePosition: operation.sequencePosition, requestedStartTime: manualStartConstraints[scheduledOperationId] ?? null },
      to: { machineId, sequencePosition, requestedStartTime },
    };
    if (isNoOpEdit(edit, manualStartConstraints)) return { accepted: false, message: "The operation is already in that position." };
    const checked = checkDropValidity(result.schedule, problem, scheduledOperationId, machineId, sequencePosition);
    if (!checked.valid) {
      setDragMessage(checked.rejection.message);
      return { accepted: false, message: checked.rejection.message };
    }
    const recalculated = recalculate(result.schedule, edit, manualStartConstraints, problem);
    const nextResult: ExecutionResult = {
      ...result,
      schedule: { ...recalculated.schedule, time: recalculated.metrics.makespan },
      metrics: recalculated.metrics,
    };
    setUndoStack((past) => [...past, { result, constraints: manualStartConstraints }]);
    setRedoStack([]);
    setManualStartConstraints(recalculated.manualStartConstraints);
    setResult(nextResult);
    setResultFor({ problem, algorithmId: nextResult.algorithmId });
    const scheduledStartTime = nextResult.schedule?.machines.flatMap((item) => item.operations).find(
      (item) => item.scheduledOperationId === scheduledOperationId,
    )?.startTime;
    const message = requestedStartTime !== null && scheduledStartTime !== undefined
      ? scheduledStartTime === requestedStartTime
        ? `Moved ${scheduledOperationId} from time ${operation.startTime} to ${scheduledStartTime}.`
        : `Requested start ${requestedStartTime}; scheduled at ${scheduledStartTime} after precedence, machine order, and release constraints were recalculated.`
      : `Moved ${scheduledOperationId} to ${machineId}, position ${sequencePosition + 1}.`;
    setDragMessage(message);
    return { accepted: true, message, scheduledStartTime };
  }

  function undoManualEdit() {
    const previous = undoStack.at(-1);
    if (!previous || !result) return;
    setRedoStack((future) => [...future, { result, constraints: manualStartConstraints }]);
    setUndoStack((past) => past.slice(0, -1));
    setResult(previous.result);
    setManualStartConstraints(previous.constraints);
    setDragMessage("Undid the last manual schedule edit.");
  }

  function redoManualEdit() {
    const next = redoStack.at(-1);
    if (!next || !result) return;
    setUndoStack((past) => [...past, { result, constraints: manualStartConstraints }]);
    setRedoStack((future) => future.slice(0, -1));
    setResult(next.result);
    setManualStartConstraints(next.constraints);
    setDragMessage("Redid the manual schedule edit.");
  }

  function resetManualEdits() {
    if (!manualBaseResult || !result) return;
    setUndoStack((past) => [...past, { result, constraints: manualStartConstraints }]);
    setRedoStack([]);
    setResult(manualBaseResult);
    setManualStartConstraints({});
    setDragMessage("Restored the original algorithm schedule.");
  }

  const stateLabel = running
    ? "Running locally"
    : result?.status === "completed"
      ? "Valid schedule"
      : customRunResult && algorithmId === "custom"
        ? customRunResult.status.replaceAll("_", " ")
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
          <span className={`engine-state engine-${schedulerPreparation}`}>
            {schedulerPreparation === "ready"
              ? "Engine ready"
              : schedulerPreparation === "error"
                ? "Engine retrying"
                : "Engine preparing"}
          </span>
        </div>
        <div className="app-actions">
          <button type="button" onClick={createNewProblem}>＋ New</button>
          <button type="button" onClick={() => importInput.current?.click()}>⇧ Import</button>
          <input
            ref={importInput}
            type="file"
            accept=".json,.lekin.json,application/json"
            aria-label="Import a LEKIN JSON file"
            hidden
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) void importProblemFile(file);
              event.currentTarget.value = "";
            }}
          />
          <button type="button" onClick={saveLocally}>⤓ Save locally</button>
          {saveFeedback && (
            <span className="save-feedback" role="status">{saveFeedback}</span>
          )}
          <button type="button" onClick={() => {
            downloadProblemFile(problem);
            setSaveFeedback("Problem exported.");
          }}>↓ Export</button>
        </div>
      </header>
      <div className={`app-body${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
        {sidebarCollapsed ? (
          <aside className="sidebar-rail" aria-label="Problem setup collapsed">
            <button type="button" aria-label="Expand problem setup panel" onClick={() => setSidebarCollapsed(false)}>›</button>
            <span>Problem setup</span>
          </aside>
        ) : (
          <ProblemSidebar
            problem={problem}
            dispatch={dispatch}
            algorithmId={algorithmId}
            running={running}
            canRun={canRun}
            progress={progress}
            validationIssues={validationIssues}
            onAlgorithmChange={changeAlgorithm}
            onRun={run}
            onCancel={cancel}
            onCollapse={() => setSidebarCollapsed(true)}
            runLabel={algorithmId === "custom"
              ? canRunCustom ? "▶ Run custom algorithm" : customRunDisabledReason() ?? undefined
              : undefined}
            localNote={algorithmId === "custom" ? "Custom Python runs in a disposable local worker" : undefined}
            showRunButton={algorithmId !== "custom"}
          />
        )}
        <div className="canvas">
          <div className="canvas-head">
            <div>
              <span className="breadcrumb">Workspace / {problem.name}</span>
              <h1>Schedule overview</h1>
              <p>
                {running
                  ? progress?.replaceAll("-", " ")
                  : result
                    ? `${algorithmId === "custom" ? customName : result.algorithmId.toUpperCase()} · Last run ${result.runtimeMs} ms`
                    : "Edit the problem, choose an algorithm, and run it in your browser"}
              </p>
            </div>
            <span className={(result && result.status !== "completed") || (customRunResult && customRunResult.status !== "completed") ? "valid-pill error-pill" : "valid-pill"}>
              {running ? "…" : result?.status === "completed" || customRunResult?.status === "completed" ? "✓" : "○"} {stateLabel}
            </span>
          </div>
          {result?.warnings.map((warning) => (
            <p className="execution-error" key={warning}>
              {warning}
            </p>
          ))}
          {algorithmId === "custom" && (
            <CustomAlgorithmPanel
              problem={problem}
              name={customName}
              source={customSource}
              parametersText={customParametersText}
              parametersError={customParameters.ok ? null : customParameters.message}
              timeLimitSeconds={customTimeLimitSeconds}
              trusted={customTrusted}
              validation={customValidation}
              validating={customValidating}
              running={running}
              canRun={canRunCustom}
              runDisabledReason={customRunDisabledReason()}
              runResult={customRunResult}
              progressEvents={customProgressEvents}
              incumbentCount={customIncumbentCount}
              onNameChange={setCustomName}
              onSourceChange={(source) => {
                setCustomSource(source);
                invalidateCustomResult({ sourceChanged: true });
              }}
              onParametersChange={(parameters) => {
                setCustomParametersText(parameters);
                invalidateCustomResult();
              }}
              onTimeLimitChange={(seconds) => {
                setCustomTimeLimitSeconds(seconds);
                invalidateCustomResult();
              }}
              onTrustedChange={setCustomTrusted}
              onValidate={() => void validateCustomSource()}
              onRun={() => void runCustom()}
              onCancel={cancel}
            />
          )}
          <GanttChart
            schedule={result?.schedule ?? null}
            problem={problem}
            dragMessage={dragMessage}
            manualStartConstraints={manualStartConstraints}
            canUndo={undoStack.length > 0}
            canRedo={redoStack.length > 0}
            canReset={Boolean(manualBaseResult) && undoStack.length > 0}
            onUndo={undoManualEdit}
            onRedo={redoManualEdit}
            onReset={resetManualEdits}
            onCheckMove={checkManualMove}
            onMoveOperation={moveScheduledOperation}
          />
          <ScheduleSummary metrics={result?.metrics ?? null} />
          <DetailTabs
            result={result}
            validationIssues={validationIssues}
            problem={problem}
            comparisonResults={comparisonResults}
            onSelectComparisonResult={selectComparisonResult}
            customAlgorithmName={customName}
          />
        </div>
      </div>
    </main>
  );
}
