"use client";
import type { ProblemDefinition } from "../../../lib/schema/problem";
import type { Schedule } from "../../../lib/schema/schedule";
import type { ScheduledOperation } from "../../../lib/schema/schedule";
import type { DragRejection } from "../../../lib/scheduling/recalculate";
import { timelineGeometry } from "../../../lib/scheduling/timeline-geometry";
import { useEffect, useLayoutEffect, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent } from "react";
import { createPortal } from "react-dom";

type DropCandidate = { machineId: string; sequencePosition: number; requestedStartTime: number; rejection: DragRejection | null };
type EditState = { operationId: string; machineId: string; sequencePosition: number; requestedStartTime: string; error: string | null };
type MoveResult = { accepted: boolean; message: string; scheduledStartTime?: number };
type HoveredOperation = {
  operation: ScheduledOperation;
  workcenterId: string;
  anchor: { left: number; right: number; top: number; bottom: number };
};
type TooltipPosition = { left: number; top: number };

const TOOLTIP_MARGIN = 12;
const TOOLTIP_GAP = 10;

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
  canUndo: boolean;
  canRedo: boolean;
  canReset: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onReset: () => void;
  onCheckMove: (scheduledOperationId: string, machineId: string, sequencePosition: number) => DragRejection | null;
  onMoveOperation: (scheduledOperationId: string, machineId: string, sequencePosition: number, requestedStartTime: number | null) => MoveResult;
};

export function GanttChart({ schedule, problem, dragMessage, manualStartConstraints, canUndo, canRedo, canReset, onUndo, onRedo, onReset, onCheckMove, onMoveOperation }: Props) {
  const [draggedOperationId, setDraggedOperationId] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<DropCandidate | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [zoom, setZoom] = useState(1);
  const [cursorTime, setCursorTime] = useState<number | null>(null);
  const [showIdle, setShowIdle] = useState(true);
  const [hoveredOperation, setHoveredOperation] = useState<HoveredOperation | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<TooltipPosition | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const machineSchedules = schedule?.machines ?? problem.machines.map((machine) => ({ machineId: machine.machineId, workcenterId: machine.workcenterId, operations: [] }));
  const makespan = Math.max(1, ...machineSchedules.flatMap((machine) => machine.operations.map((operation) => operation.endTime)));
  const ticks = timelineTicks(makespan, Math.max(7, Math.round(7 * zoom)));
  const minorStep = Math.max(1, Math.ceil(makespan / 50));
  const minorTicks = Array.from({ length: Math.floor(makespan / minorStep) + 1 }, (_, index) => index * minorStep)
    .filter((time) => time <= makespan && !ticks.includes(time));
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

  useLayoutEffect(() => {
    if (!hoveredOperation || !tooltipRef.current) return;
    const tooltip = tooltipRef.current.getBoundingClientRect();
    const { anchor } = hoveredOperation;
    const maximumLeft = Math.max(TOOLTIP_MARGIN, window.innerWidth - tooltip.width - TOOLTIP_MARGIN);
    const left = Math.min(
      maximumLeft,
      Math.max(TOOLTIP_MARGIN, (anchor.left + anchor.right - tooltip.width) / 2),
    );
    const below = anchor.bottom + TOOLTIP_GAP;
    const above = anchor.top - tooltip.height - TOOLTIP_GAP;
    const maximumTop = Math.max(TOOLTIP_MARGIN, window.innerHeight - tooltip.height - TOOLTIP_MARGIN);
    const top = below + tooltip.height <= window.innerHeight - TOOLTIP_MARGIN
      ? below
      : Math.min(maximumTop, Math.max(TOOLTIP_MARGIN, above));
    setTooltipPosition({ left, top });
  }, [hoveredOperation]);

  useEffect(() => {
    if (!hoveredOperation) return;
    const closeTooltip = () => setHoveredOperation(null);
    window.addEventListener("resize", closeTooltip);
    window.addEventListener("scroll", closeTooltip, true);
    return () => {
      window.removeEventListener("resize", closeTooltip);
      window.removeEventListener("scroll", closeTooltip, true);
    };
  }, [hoveredOperation]);

  function machineUtilization(machineId: string, operations: ScheduledOperation[]): number {
    const release = problem.machines.find((machine) => machine.machineId === machineId)?.release ?? 0;
    const available = makespan - release;
    if (available <= 0) return 0;
    return operations.reduce((total, operation) => total + operation.endTime - operation.startTime, 0) / available;
  }

  function idleIntervals(machineId: string, operations: ScheduledOperation[]) {
    const release = problem.machines.find((machine) => machine.machineId === machineId)?.release ?? 0;
    const sorted = [...operations].sort((left, right) => left.startTime - right.startTime);
    const intervals: Array<{ start: number; end: number }> = [];
    let cursor = release;
    for (const operation of sorted) {
      if (operation.startTime > cursor) intervals.push({ start: cursor, end: operation.startTime });
      cursor = Math.max(cursor, operation.endTime);
    }
    if (cursor < makespan) intervals.push({ start: cursor, end: makespan });
    return intervals;
  }

  function openEditor(operation: ScheduledOperation) {
    setHoveredOperation(null);
    setEdit({
      operationId: operation.scheduledOperationId,
      machineId: operation.machineId,
      sequencePosition: operation.sequencePosition,
      requestedStartTime: String(manualStartConstraints[operation.scheduledOperationId] ?? operation.startTime),
      error: null,
    });
  }

  function showOperationTooltip(
    target: HTMLElement,
    operation: ScheduledOperation,
    workcenterId: string,
  ) {
    const bounds = target.getBoundingClientRect();
    setTooltipPosition(null);
    setHoveredOperation({
      operation,
      workcenterId,
      anchor: {
        left: bounds.left,
        right: bounds.right,
        top: bounds.top,
        bottom: bounds.bottom,
      },
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
      <div className="card-head gantt-head">
        <div><span className="section-kicker">Schedule</span><h2 id="gantt-title">Machine timeline</h2><small>{schedule ? "Drag operations to reschedule" : "Run a schedule"}</small></div>
        <div className="chart-toolbar" aria-label="Timeline controls">
          <span className="time-scale">Time units</span>
          <button type="button" aria-label="Zoom out timeline" disabled={zoom <= 1} onClick={() => setZoom((value) => Math.max(1, Number((value - 0.25).toFixed(2))))}>−</button>
          <strong>{Math.round(zoom * 100)}%</strong>
          <button type="button" aria-label="Zoom in timeline" onClick={() => setZoom((value) => Number((value + 0.25).toFixed(2)))}>+</button>
          <button type="button" onClick={() => setZoom(1)}>Fit</button>
          <button type="button" aria-pressed={showIdle} onClick={() => setShowIdle((value) => !value)}>Idle time</button>
          <span className="toolbar-separator" aria-hidden="true" />
          <button type="button" onClick={onUndo} disabled={!canUndo}>↶ Undo</button>
          <button type="button" onClick={onRedo} disabled={!canRedo}>↷ Redo</button>
          <button type="button" onClick={onReset} disabled={!canReset}>Reset schedule</button>
        </div>
      </div>
      <div className="legend">{problem.jobs.map((job) => <span key={job.jobId}><i style={{ background: colors.get(job.jobId) }} />{job.jobId}</span>)}<span className="legend-note">Time units</span></div>
      <div className="gantt" style={{ height: `${Math.max(190, 30 + machineSchedules.length * 72)}px` }}>
        <div className="machine-labels">{machineSchedules.map((machine) => {
          const utilization = machineUtilization(machine.machineId, machine.operations);
          return <span key={machine.machineId}><b>{machine.machineId}</b><small>{machine.workcenterId ?? "Unassigned"}</small><em>Util. {(utilization * 100).toFixed(0)}%</em><meter min="0" max="1" value={utilization} aria-label={`${machine.machineId} utilization`} /></span>;
        })}</div>
        <div
          className="timeline"
          style={{ minWidth: zoom === 1 ? "650px" : `${zoom * 100}%` }}
          onMouseMove={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            setCursorTime(Math.max(0, Math.min(makespan, Math.round(((event.clientX - bounds.left) / bounds.width) * makespan))));
          }}
          onMouseLeave={() => setCursorTime(null)}
        >
          <div className="ticks">{ticks.map((tick, index) => <span data-time={tick} className={index === 0 ? "tick-first" : index === ticks.length - 1 ? "tick-last" : undefined} style={{ left: `${(tick / makespan) * 100}%` }} key={tick}>{tick}</span>)}</div>
          <div className="grid">{minorTicks.map((tick) => <i className="grid-line grid-line-minor" style={{ left: `${(tick / makespan) * 100}%` }} key={`minor-${tick}`} />)}{ticks.map((tick) => <i data-time={tick} className="grid-line" style={{ left: `${(tick / makespan) * 100}%` }} key={`line-${tick}`} />)}{machineSchedules.map((machine) => <div className="grid-row" key={machine.machineId} />)}</div>
          {showIdle && schedule && <div className="idle-layer" aria-hidden="true">{machineSchedules.flatMap((machine, machineIndex) => idleIntervals(machine.machineId, machine.operations).map((interval) => <i key={`${machine.machineId}-${interval.start}`} className="idle-segment" style={{ left: `${(interval.start / makespan) * 100}%`, width: `${((interval.end - interval.start) / makespan) * 100}%`, top: `${42 + machineIndex * 72}px` }}>{interval.end - interval.start >= Math.max(2, makespan * 0.06) ? `Idle ${interval.end - interval.start}u` : ""}</i>))}</div>}
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
          {cursorTime !== null && !candidate && <div className="cursor-time" style={{ left: `${(cursorTime / makespan) * 100}%` }}><span>{cursorTime}</span></div>}
          {machineSchedules.flatMap((machine, machineIndex) => machine.operations.map((operation) => {
            const geometry = timelineGeometry(operation.startTime, operation.endTime, makespan);
            return (
            <div
              key={operation.scheduledOperationId}
              className={`bar${operation.manuallyModified ? " bar-manual" : ""}${draggedOperationId === operation.scheduledOperationId ? " bar-dragging" : ""}`}
              draggable
              aria-label={`Drag ${operation.scheduledOperationId}`}
              tabIndex={0}
              onContextMenu={(event) => operationContextMenu(event, operation)}
              onMouseEnter={(event) => showOperationTooltip(event.currentTarget, operation, machine.workcenterId)}
              onMouseLeave={() => setHoveredOperation(null)}
              onFocus={(event) => showOperationTooltip(event.currentTarget, operation, machine.workcenterId)}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setHoveredOperation(null);
              }}
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
              style={{ background: colors.get(operation.jobId), left: `${geometry.leftPercent}%`, width: `${geometry.widthPercent}%`, top: `${42 + machineIndex * 72}px` }}
            >
              <i className="drag-handle" aria-hidden="true">⋮⋮</i><span>{operation.jobId} · O{operation.operationIndex + 1}</span><small>{operation.startTime}–{operation.endTime} · {operation.endTime - operation.startTime}u</small>
              <button type="button" draggable={false} className="operation-edit-trigger" aria-label={`Edit ${operation.scheduledOperationId}`} onClick={(event) => { event.stopPropagation(); openEditor(operation); }}>Edit</button>
            </div>
            );
          }))}
          {!schedule && <p className="gantt-empty">No schedule yet</p>}
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
      {hoveredOperation && typeof document !== "undefined" && createPortal(
        <div
          ref={tooltipRef}
          className="operation-hover-card operation-hover-card-floating"
          role="tooltip"
          style={{
            left: tooltipPosition?.left ?? -9999,
            top: tooltipPosition?.top ?? -9999,
            visibility: tooltipPosition ? "visible" : "hidden",
          }}
        >
          <strong>{hoveredOperation.operation.jobId} · Operation {hoveredOperation.operation.operationIndex + 1}</strong>
          <span>{hoveredOperation.operation.machineId} · {hoveredOperation.workcenterId}</span>
          <dl>
            <div><dt>Start to end</dt><dd>{hoveredOperation.operation.startTime}–{hoveredOperation.operation.endTime}</dd></div>
            <div><dt>Duration</dt><dd>{hoveredOperation.operation.endTime - hoveredOperation.operation.startTime}u</dd></div>
            <div><dt>Due</dt><dd>{problem.jobs.find((job) => job.jobId === hoveredOperation.operation.jobId)?.due ?? "-"}</dd></div>
            <div><dt>Weight</dt><dd>{problem.jobs.find((job) => job.jobId === hoveredOperation.operation.jobId)?.weight ?? "-"}</dd></div>
          </dl>
        </div>,
        document.body,
      )}
    </section>
  );
}
