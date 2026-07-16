"use client";
import type { ProblemDefinition } from "../../../lib/schema/problem";
import type { Schedule } from "../../../lib/schema/schedule";
import type { DragRejection } from "../../../lib/scheduling/recalculate";
import { useState, type DragEvent } from "react";

type DropCandidate = { machineId: string; sequencePosition: number; requestedStartTime: number; rejection: DragRejection | null };

type Props = {
  schedule: Schedule | null;
  problem: ProblemDefinition;
  dragMessage: string | null;
  onCheckMove: (scheduledOperationId: string, machineId: string, sequencePosition: number) => DragRejection | null;
  onMoveOperation: (scheduledOperationId: string, machineId: string, sequencePosition: number, requestedStartTime: number | null) => { accepted: boolean; message: string };
};

export function GanttChart({ schedule, problem, dragMessage, onCheckMove, onMoveOperation }: Props) {
  const [draggedOperationId, setDraggedOperationId] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<DropCandidate | null>(null);
  const machineSchedules = schedule?.machines ?? problem.machines.map((machine) => ({ machineId: machine.machineId, workcenterId: machine.workcenterId, operations: [] }));
  const makespan = Math.max(1, ...machineSchedules.flatMap((machine) => machine.operations.map((operation) => operation.endTime)));
  const ticks = Array.from({ length: 8 }, (_, index) => Math.round((makespan * index) / 7));
  const colors = new Map(problem.jobs.map((job) => [job.jobId, job.rgb ? `rgb(${job.rgb.join(",")})` : "#57068c"]));
  const draggedOperation = machineSchedules.flatMap((machine) => machine.operations).find(
    (operation) => operation.scheduledOperationId === draggedOperationId,
  );
  const draggedDefinition = draggedOperation
    ? problem.jobs.find((job) => job.jobId === draggedOperation.jobId)?.operations.find(
        (operation) => operation.operationIndex === draggedOperation.operationIndex,
      )
    : undefined;
  function placement(event: DragEvent<HTMLDivElement>, machineId: string): DropCandidate | null {
    if (!draggedOperationId) return null;
    const bounds = event.currentTarget.getBoundingClientRect();
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
    <section className="gantt-card" aria-labelledby="gantt-title">
      <div className="card-head"><div><span className="section-kicker">Schedule</span><h2 id="gantt-title">Machine timeline</h2></div><span className="chart-status">{schedule ? `${schedule.time} time units · Grab an operation and place it on a machine lane` : "No schedule yet"}</span></div>
      <div className="legend">{problem.jobs.map((job) => <span key={job.jobId}><i style={{ background: colors.get(job.jobId) }} />{job.jobId}</span>)}<span className="legend-note">Time units</span></div>
      <div className="gantt" style={{ height: `${Math.max(190, 30 + machineSchedules.length * 72)}px` }}>
        <div className="machine-labels">{machineSchedules.map((machine) => <span key={machine.machineId}>{machine.machineId}<small>{machine.workcenterId ?? "Unassigned"}</small></span>)}</div>
        <div className="timeline">
          <div className="ticks">{ticks.map((tick, index) => <span key={`${tick}-${index}`}>{tick}</span>)}</div>
          <div className="grid">{machineSchedules.map((machine) => <div className="grid-row" key={machine.machineId} />)}</div>
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
          {machineSchedules.flatMap((machine, machineIndex) => machine.operations.map((operation) => (
            <div
              key={operation.scheduledOperationId}
              className={`bar${operation.manuallyModified ? " bar-manual" : ""}${draggedOperationId === operation.scheduledOperationId ? " bar-dragging" : ""}`}
              draggable
              aria-label={`Drag ${operation.scheduledOperationId}`}
              onDragStart={(event) => { setDraggedOperationId(operation.scheduledOperationId); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", operation.scheduledOperationId); }}
              onDragEnd={() => { setDraggedOperationId(null); setCandidate(null); }}
              style={{ background: colors.get(operation.jobId), left: `${(operation.startTime / makespan) * 100}%`, width: `${Math.max(1, ((operation.endTime - operation.startTime) / makespan) * 100)}%`, top: `${42 + machineIndex * 72}px` }}
              title={`${operation.jobId} operation ${operation.operationIndex + 1}: ${operation.startTime}–${operation.endTime}`}
            >
              <i className="drag-handle" aria-hidden="true">⋮⋮</i><span>{operation.jobId} · O{operation.operationIndex + 1}</span><small>{operation.endTime - operation.startTime}u</small>
            </div>
          )))}
          {!schedule && <p className="gantt-empty">Choose an algorithm and run the sample problem.</p>}
        </div>
      </div>
      {(candidate?.rejection?.message || dragMessage) && <p className={candidate?.rejection ? "drag-feedback drag-rejected" : "drag-feedback"} role={candidate?.rejection ? "alert" : "status"}>{candidate?.rejection?.message ?? dragMessage}</p>}
    </section>
  );
}
