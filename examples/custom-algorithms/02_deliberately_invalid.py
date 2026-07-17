# Deliberately invalid: demonstrates why LEKIN independently validates
# every returned schedule, instead of trusting it just because it's a real
# lekinpy.Schedule instance.
#
# This looks like an ordinary first-come-first-served algorithm, but it has
# a planted bug: it skips each job's LAST operation entirely
# (`job.operations[:-1]` instead of `job.operations`). The Python-side
# check only confirms `isinstance(result, lekinpy.Schedule)` - a real
# Schedule object built this way passes that check easily. It's LEKIN's
# separate, independent feasibility validator
# (lib/scheduling/validate-schedule.ts) that actually catches the missing
# operations and rejects the run with status "invalid_result", naming
# exactly which job/operation is missing - not a generic failure.
#
# Run this against any problem through the same path as
# 01_minimal_spt.py and you should see a rejection explaining precisely
# which operations never appeared in the schedule, rather than a silently
# wrong (but "valid-looking") result.

from lekinpy import Schedule, MachineSchedule, ScheduledOperation


def schedule(system, parameters, context):
    machine_workcenter = {}
    machine_available = {}
    for workcenter in system.workcenters:
        for machine in workcenter.machines:
            machine_workcenter[machine.name] = workcenter.name
            machine_available[machine.name] = machine.release

    machine_ops = {machine.name: [] for machine in system.machines}

    for job in system.jobs:
        # BUG: should iterate `job.operations`, not `job.operations[:-1]` -
        # this silently drops the last operation of every job.
        for index, operation in enumerate(job.operations[:-1]):
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
    return Schedule(schedule_type="DELIBERATELY_INVALID", time=total_time, machines=machines)
