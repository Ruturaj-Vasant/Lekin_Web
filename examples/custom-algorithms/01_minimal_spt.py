# Beginner example: shortest-processing-time job rule.
#
# The only scheduling decision in this file is `pick()`. The existing
# SchedulingAlgorithm.dynamic_schedule() engine handles validation, release
# times, workcenters, machines, operation precedence, start/end times, and
# construction of every ScheduledOperation and MachineSchedule.
#
# The selector receives the jobs released at the current dispatch time and
# must return one of those Job objects. Once selected, all operations of that
# job are scheduled in order. This is the same job-level behavior used by the
# built-in SPT, EDD, and WSPT algorithms.

from lekinpy.algorithms import SchedulingAlgorithm
from lekinpy.schedule import Schedule


class MySPTRule(SchedulingAlgorithm):
    metadata = {
        "id": "custom-spt",
        "display_name": "My Shortest Processing Time",
        "supports_multi_operation": True,
        "version": "1.0.0",
    }

    def schedule(self, system):
        def pick(available_jobs):
            return min(
                available_jobs,
                key=lambda job: (
                    job.operations[0].processing_time,
                    job.job_id,
                ),
            )

        total_time, machines = self.dynamic_schedule(system, pick)
        return Schedule("Custom SPT", total_time, machines)


# LEKIN Lab calls this top-level function automatically. `parameters` and
# `context` are available for parameterized or long-running advanced rules.
def schedule(system, parameters, context):
    return MySPTRule().schedule(system)
