"use client";
import type { ProblemDefinition } from "../../../lib/schema/problem";
import type { Schedule } from "../../../lib/schema/schedule";
import type { ScheduledOperation } from "../../../lib/schema/schedule";
import type { DragRejection } from "../../../lib/scheduling/recalculate";
import { useState, type DragEvent, type KeyboardEvent, type MouseEvent } from "react";

type DropCandidate = { machineId: string; sequencePosition: number; requestedStartTime: number; rejection: DragRejection | null };
type EditState = { operationId: string; machineId: string; sequencePosition: number; requestedStartTime: string; error: string | null };
type MoveResult = { accepted: boolean; message: string; scheduledStartTime?: number };

function timelineTicks(makespan: number, targetIntervals = 7): number[] {
  const step = Math.max(1, Math.ceil(makespan / targetIntervals));
  const ticks: number[] = [];
  for (let time = 0; time < makespan; time += step) ticks.push(time);
  ticks.push(makespan);
  return ticks;
}

type Props = {
  schedule: Schedule | null;
  problem: ProblemDefinition;
  dragMessage: string | null;
  manualStartConstraints: Record<string, number>;
  onCheckMove: (scheduledOperationId: string, machineId: string, sequencePosition: number) => DragRejection | null;
  onMoveOperation: (scheduledOperationId: string, machineId: string, sequencePosition: number, requestedStartTime: number | null) => MoveResult;
};

export function GanttChart({ schedule, problem, dragMessage, manualStartConstraints, onCheckMove, onMoveOperation }: Props) {
  const [draggedOperationId, setDraggedOperationId] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<DropCandidate | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const machineSchedules = schedule?.machines ?? problem.machines.map((machine) => ({ machineId: machine.machineId, workcenterId: machine.workcenterId, operations: [] }));
  const makespan = Math.max(1, ...machineSchedules.flatMap((machine) => machine.operations.map((operation) => operation.endTime)));
  const ticks = timelineTicks(makespan);
  const colors = new Map(problem.jobs.map((job) => [job.jobId, job.rgb ? `rgb(${job.rgb.join(",")})` : "#57068c"]));
  const draggedOperation = machineSchedules.flatMap((machine) => machine.operations).find(
    (operation) => operation.scheduledOperationId === draggedOperationId,
  );
  const draggedDefinition = draggedOperation
    ? problem.jobs.find((job) => job.jobId === draggedOperation.jobId)?.operations.find(
        (operation) => operation.operationIndex === draggedOperation.operationIndex,
      )
    : undefined;
  const editingOperation = edit
    ? machineSchedules.flatMap((machine) => machine.operations).find((operation) => operation.scheduledOperationId === edit.operationId)
    : undefined;
  const editingDefinition = editingOperation
    ? problem.jobs.find((job) => job.jobId === editingOperation.jobId)?.operations.find(
        (operation) => operation.operationIndex === editingOperation.operationIndex,
      )
    : undefined;
  const eligibleMachines = editingDefinition
    ? problem.machines.filter((machine) => machine.workcenterId === editingDefinition.workcenterId)
    : [];
  const targetQueueLength = edit
    ? (machineSchedules.find((machine) => machine.machineId === edit.machineId)?.operations.filter(
        (operation) => operation.scheduledOperationId !== edit.operationId,
      ).length ?? 0)
    : 0;

  function openEditor(operation: ScheduledOperation) {
    setEdit({
      operationId: operation.scheduledOperationId,
      machineId: operation.machineId,
      sequencePosition: operation.sequencePosition,
      requestedStartTime: String(manualStartConstraints[operation.scheduledOperationId] ?? operation.startTime),
      error: null,
    });
  }

  function applyEditor(requestedStartTime: number | null) {
    if (!edit) return;
    if (requestedStartTime !== null && (!Number.isInteger(requestedStartTime) || requestedStartTime < 0)) {
      setEdit({ ...edit, error: "Requested start time must be a whole number of 0 or greater." });
      return;
    }
    const sequencePosition = Math.min(edit.sequencePosition, targetQueueLength);
    const rejection = onCheckMove(edit.operationId, edit.machineId, sequencePosition);
    if (rejection) {
      setEdit({ ...edit, error: rejection.message });
      return;
    }
    const moved = onMoveOperation(edit.operationId, edit.machineId, sequencePosition, requestedStartTime);
    if (moved.accepted) setEdit(null);
    else setEdit({ ...edit, error: moved.message });
  }

  function editorKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") setEdit(null);
    if (event.key === "Tab") {
      const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
        "button:not(:disabled), input:not(:disabled), select:not(:disabled)",
      ));
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  function operationContextMenu(event: MouseEvent<HTMLDivElement>, operation: ScheduledOperation) {
    event.preventDefault();
    openEditor(operation);
  }
  function placement(event: DragEvent<HTMLDivElement>, machineId: string): DropCandidate | null {
    if (!draggedOperationId) return null;
    const bounds = event.currentTarget.closest(".timeline")?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    const requestedStartTime = Math.round(ratio * makespan);
    const machine = machineSchedules.find((item) => item.machineId === machineId);
    const otherOperations = (machine?.operations ?? []).filter((operation) => operation.scheduledOperationId !== draggedOperationId);
    const sequencePosition = otherOperations.filter((operation) => requestedStartTime >= (operation.startTime + operation.endTime) / 2).length;
    return { machineId, sequencePosition, requestedStartTime, rejection: onCheckMove(draggedOperationId, machineId, sequencePosition) };
  }

  function dragOver(event: DragEvent<HTMLDivElement>, machineId: string) {
    event.preventDefault();
    const next = placement(event, machineId);
    if (next) setCandidate(next);
  }

  function drop(event: DragEvent<HTMLDivElement>, machineId: string) {
    event.preventDefault();
    const next = placement(event, machineId);
    if (next && draggedOperationId) {
      onMoveOperation(draggedOperationId, next.machineId, next.sequencePosition, next.requestedStartTime);
    }
    setCandidate(null);
    setDraggedOperationId(null);
  }
  return (
    <section className={`gantt-card${draggedOperationId ? " drag-active" : ""}`} aria-labelledby="gantt-title">
      <div className="card-head"><div><span className="section-kicker">Schedule</span><h2 id="gantt-title">Machine timeline</h2></div><span className="chart-status">{schedule ? `${schedule.time} time units · Grab an operation and place it on a machine lane` : "No schedule yet"}</span></div>
      <div className="legend">{problem.jobs.map((job) => <span key={job.jobId}><i style={{ background: colors.get(job.jobId) }} />{job.jobId}</span>)}<span className="legend-note">Time units</span></div>
      <div className="gantt" style={{ height: `${Math.max(190, 30 + machineSchedules.length * 72)}px` }}>
        <div className="machine-labels">{machineSchedules.map((machine) => <span key={machine.machineId}>{machine.machineId}<small>{machine.workcenterId ?? "Unassigned"}</small></span>)}</div>
        <div className="timeline">
          <div className="ticks">{ticks.map((tick, index) => <span data-time={tick} className={index === 0 ? "tick-first" : index === ticks.length - 1 ? "tick-last" : undefined} style={{ left: `${(tick / makespan) * 100}%` }} key={tick}>{tick}</span>)}</div>
          <div className="grid">{ticks.map((tick) => <i data-time={tick} className="grid-line" style={{ left: `${(tick / makespan) * 100}%` }} key={`line-${tick}`} />)}{machineSchedules.map((machine) => <div className="grid-row" key={machine.machineId} />)}</div>
          {schedule && <div className="drop-lanes">{machineSchedules.map((machine) => {
            const active = candidate?.machineId === machine.machineId;
            const compatible = !draggedDefinition || machine.workcenterId === draggedDefinition.workcenterId;
            return <div
              key={machine.machineId}
              className={`drop-lane${draggedOperationId ? compatible ? " drop-ready" : " drop-blocked" : ""}${active ? candidate.rejection ? " drop-invalid" : " drop-valid" : ""}`}
              aria-label={`Drop operation on ${machine.machineId}`}
              onDragOver={(event) => dragOver(event, machine.machineId)}
              onDrop={(event) => drop(event, machine.machineId)}
            >{active && <span>Position {candidate.sequencePosition + 1}{candidate.rejection ? " · Not allowed" : ` · Start near ${candidate.requestedStartTime}`}</span>}</div>;
          })}</div>}
          {candidate && <div className={`time-preview${candidate.rejection ? " time-preview-invalid" : ""}`} style={{ left: `${(candidate.requestedStartTime / makespan) * 100}%` }}><span>{candidate.requestedStartTime}</span></div>}
          {machineSchedules.flatMap((machine, machineIndex) => machine.operations.map((operation) => (
            <div
              key={operation.scheduledOperationId}
              className={`bar${operation.manuallyModified ? " bar-manual" : ""}${draggedOperationId === operation.scheduledOperationId ? " bar-dragging" : ""}`}
              draggable
              aria-label={`Drag ${operation.scheduledOperationId}`}
              tabIndex={0}
              onContextMenu={(event) => operationContextMenu(event, operation)}
              onDragOver={(event) => dragOver(event, machine.machineId)}
              onDrop={(event) => drop(event, machine.machineId)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === "ContextMenu") {
                  event.preventDefault();
                  openEditor(operation);
                }
              }}
              onDragStart={(event) => { setDraggedOperationId(operation.scheduledOperationId); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", operation.scheduledOperationId); }}
              onDragEnd={() => { setDraggedOperationId(null); setCandidate(null); }}
              style={{ background: colors.get(operation.jobId), left: `${(operation.startTime / makespan) * 100}%`, width: `${Math.max(1, ((operation.endTime - operation.startTime) / makespan) * 100)}%`, top: `${42 + machineIndex * 72}px` }}
              title={`${operation.jobId} operation ${operation.operationIndex + 1}: ${operation.startTime}–${operation.endTime}`}
            >
              <i className="drag-handle" aria-hidden="true">⋮⋮</i><span>{operation.jobId} · O{operation.operationIndex + 1}</span><small>{operation.endTime - operation.startTime}u</small>
              <button type="button" draggable={false} className="operation-edit-trigger" aria-label={`Edit ${operation.scheduledOperationId}`} onClick={(event) => { event.stopPropagation(); openEditor(operation); }}>Edit</button>
            </div>
          )))}
          {!schedule && <p className="gantt-empty">Choose an algorithm and run the sample problem.</p>}
        </div>
      </div>
      {(candidate?.rejection?.message || dragMessage) && <p className={candidate?.rejection ? "drag-feedback drag-rejected" : "drag-feedback"} role={candidate?.rejection ? "alert" : "status"}>{candidate?.rejection?.message ?? dragMessage}</p>}
      {edit && editingOperation && editingDefinition && <div className="operation-editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEdit(null); }}>
        <div className="operation-editor" role="dialog" aria-modal="true" aria-labelledby="operation-editor-title" onKeyDown={editorKeyDown}>
          <header><div><span className="section-kicker">Manual schedule edit</span><h3 id="operation-editor-title">{editingOperation.jobId} · Operation {editingOperation.operationIndex + 1}</h3></div><button type="button" aria-label="Close operation editor" onClick={() => setEdit(null)}>×</button></header>
          <dl className="operation-editor-facts"><div><dt>Required workcenter</dt><dd>{editingDefinition.workcenterId}</dd></div><div><dt>Current timing</dt><dd>{editingOperation.startTime}–{editingOperation.endTime}</dd></div></dl>
          <div className="operation-editor-fields">
            <label>Machine<select value={edit.machineId} onChange={(event) => setEdit({ ...edit, machineId: event.target.value, sequencePosition: 0, error: null })}>{eligibleMachines.map((machine) => <option key={machine.machineId} value={machine.machineId}>{machine.machineId}</option>)}</select></label>
            <label>Queue position<select value={Math.min(edit.sequencePosition, targetQueueLength)} onChange={(event) => setEdit({ ...edit, sequencePosition: Number(event.target.value), error: null })}>{Array.from({ length: targetQueueLength + 1 }, (_, index) => <option key={index} value={index}>{index + 1}</option>)}</select></label>
            <label>Requested start time<input autoFocus type="number" min="0" step="1" value={edit.requestedStartTime} onChange={(event) => setEdit({ ...edit, requestedStartTime: event.target.value, error: null })} /></label>
          </div>
          <p className="operation-editor-note">The requested time is a lower bound. Job precedence, machine order, and release times may move the operation later.</p>
          {edit.error && <p className="operation-editor-error" role="alert">{edit.error}</p>}
          <footer><button type="button" className="editor-clear" disabled={manualStartConstraints[edit.operationId] === undefined} onClick={() => applyEditor(null)}>Clear manual time</button><span /><button type="button" onClick={() => setEdit(null)}>Cancel</button><button type="button" className="editor-apply" onClick={() => edit.requestedStartTime.trim() ? applyEditor(Number(edit.requestedStartTime)) : setEdit({ ...edit, error: "Enter a requested start time." })}>Apply change</button></footer>
        </div>
      </div>}
    </section>
  );
}
