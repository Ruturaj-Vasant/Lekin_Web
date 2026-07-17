# Bounded iterative improvement example.
#
# Builds one initial feasible schedule (jobs dispatched in their natural
# order), then repeatedly tries swapping the dispatch order of two random
# jobs, keeping any swap that reduces makespan - until either
# context.should_stop() becomes True (the run's time limit has elapsed) or
# a fixed iteration cap is reached, whichever comes first. Demonstrates all
# three optional context methods a bounded iterative/optimization algorithm
# typically needs:
#
#   - context.should_stop()      - stop looping once time runs out
#   - context.report_progress()  - a rough 0..1 completion estimate
#   - context.report_incumbent() - the best schedule found so far, each
#                                   time it improves (every incumbent is
#                                   independently re-validated by LEKIN
#                                   before it is shown anywhere)
#
# `parameters` (optional, all have defaults):
#   maxIterations: int  - iteration cap (default 200)
#   seed: int | str      - random seed for reproducible swap choices
#
# Note: like 01_minimal_spt.py, _build_schedule below mutates each
# Operation's start_time/end_time in place every time it runs. That's
# harmless here (every call fully overwrites those values before they're
# read again), but it means system.jobs is not left untouched by this
# algorithm - worth knowing if you write your own optimizer that inspects
# operation timing across iterations.

import random

from lekinpy import Schedule, MachineSchedule, ScheduledOperation


def _build_schedule(system, job_order, schedule_type):
    machine_workcenter = {}
    machine_available = {}
    for workcenter in system.workcenters:
        for machine in workcenter.machines:
            machine_workcenter[machine.name] = workcenter.name
            machine_available[machine.name] = machine.release

    machine_ops = {machine.name: [] for machine in system.machines}

    for job in job_order:
        for index, operation in enumerate(job.operations):
            candidates = [m for m in system.machines if machine_workcenter[m.name] == operation.workcenter]
            chosen_machine = min(candidates, key=lambda m: machine_available[m.name])

            previous_end = job.operations[index - 1].end_time if index > 0 else job.release
            start_time = max(previous_end, machine_available[chosen_machine.name])
            end_time = start_time + operation.processing_time

            operation.start_time = start_time
            operation.end_time = end_time
            machine_available[chosen_machine.name] = end_time
            machine_ops[chosen_machine.name].append(
                ScheduledOperation(
                    job_id=job.job_id,
                    operation_index=index,
                    workcenter=machine_workcenter[chosen_machine.name],
                    machine=chosen_machine.name,
                    start_time=start_time,
                    end_time=end_time,
                    sequence_position=len(machine_ops[chosen_machine.name]),
                    status=operation.status,
                )
            )

    machines = [
        MachineSchedule(
            workcenter=machine_workcenter.get(machine.name),
            machine=machine.name,
            operations=machine_ops[machine.name],
        )
        for machine in system.machines
    ]
    total_time = max(machine_available.values()) if machine_available else 0
    return Schedule(schedule_type=schedule_type, time=total_time, machines=machines)


def _makespan(built_schedule):
    ends = [op.end_time for ms in built_schedule.machines for op in ms.operations]
    return max(ends) if ends else 0


def schedule(system, parameters, context):
    parameters = parameters or {}
    max_iterations = int(parameters.get("maxIterations", 200))
    rng = random.Random(parameters.get("seed"))

    job_order = list(system.jobs)
    best_schedule = _build_schedule(system, job_order, "CUSTOM_ITERATIVE")
    best_makespan = _makespan(best_schedule)
    context.report_incumbent(best_schedule, objective=best_makespan, message="initial order")

    for iteration in range(max_iterations):
        if context.should_stop():
            break

        if len(job_order) > 1:
            candidate_order = list(job_order)
            i, j = rng.sample(range(len(candidate_order)), 2)
            candidate_order[i], candidate_order[j] = candidate_order[j], candidate_order[i]
        else:
            candidate_order = job_order

        candidate_schedule = _build_schedule(system, candidate_order, "CUSTOM_ITERATIVE")
        candidate_makespan = _makespan(candidate_schedule)

        if candidate_makespan < best_makespan:
            best_schedule = candidate_schedule
            best_makespan = candidate_makespan
            job_order = candidate_order
            context.report_incumbent(
                best_schedule, objective=best_makespan, message=f"iteration {iteration}: improved to {best_makespan}"
            )

        if iteration % 10 == 0:
            context.report_progress(iteration / max_iterations, f"iteration {iteration}, best {best_makespan}")

    context.report_progress(1.0, f"stopped after best {best_makespan}")
    return best_schedule
