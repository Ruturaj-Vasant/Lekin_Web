# Minimal custom SPT-style algorithm.
#
# Dispatches whichever released job has the shortest first-operation
# processing time, then runs every operation of that job back-to-back -
# the same "pick a job, then run all of its operations" pattern lekinpy's
# own built-in SPT/EDD/WSPT algorithms use internally (see lekin-library's
# lekinpy/algorithms/base.py: dynamic_schedule). This is intentionally
# close to the built-in SPT algorithm so you can compare it against
# "Run SPT" in the app on the same problem and see they agree.
#
# See docs/CUSTOM_PYTHON_ALGORITHMS.md for the full contract this
# schedule(system, parameters, context) function follows.

from lekinpy import Schedule, MachineSchedule, ScheduledOperation


def schedule(system, parameters, context):
    machine_workcenter = {}
    machine_available = {}
    for workcenter in system.workcenters:
        for machine in workcenter.machines:
            machine_workcenter[machine.name] = workcenter.name
            machine_available[machine.name] = machine.release

    machine_ops = {machine.name: [] for machine in system.machines}
    unscheduled = list(system.jobs)
    total_jobs = len(unscheduled)

    while unscheduled:
        if context.should_stop():
            break

        current_time = min(machine_available.values())
        available = [job for job in unscheduled if job.release <= current_time]
        if not available:
            # Nothing is released yet - fast-forward the earliest machine to
            # the next job's release time, same idea as lekinpy's own
            # dynamic_schedule loop.
            next_release = min(job.release for job in unscheduled)
            earliest_machine = min(machine_available, key=machine_available.get)
            machine_available[earliest_machine] = next_release
            continue

        job = min(available, key=lambda j: j.operations[0].processing_time)

        for index, operation in enumerate(job.operations):
            candidates = [m for m in system.machines if machine_workcenter[m.name] == operation.workcenter]
            chosen_machine = min(candidates, key=lambda m: machine_available[m.name])

            previous_end = job.operations[index - 1].end_time if index > 0 else job.release
            start_time = max(previous_end, machine_available[chosen_machine.name])
            end_time = start_time + operation.processing_time

            # lekinpy's own algorithms record timing on the Operation object
            # too - not required by the schedule(...) contract, but harmless
            # and matches the built-in style.
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

        unscheduled.remove(job)
        context.report_progress((total_jobs - len(unscheduled)) / total_jobs)

    machines = [
        MachineSchedule(
            workcenter=machine_workcenter.get(machine.name),
            machine=machine.name,
            operations=machine_ops[machine.name],
        )
        for machine in system.machines
    ]
    total_time = max(machine_available.values()) if machine_available else 0
    return Schedule(schedule_type="CUSTOM_SPT", time=total_time, machines=machines)
