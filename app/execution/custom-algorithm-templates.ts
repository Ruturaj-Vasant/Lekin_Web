import minimalSptSource from "../../examples/custom-algorithms/01_minimal_spt.py?raw";
import iterativeSource from "../../examples/custom-algorithms/03_bounded_iterative_improvement.py?raw";

export type CustomAlgorithmTemplateId = "spt" | "edd" | "wspt" | "composite" | "blankRule" | "iterative" | "blank";

export type CustomAlgorithmTemplate = {
  name: string;
  description: string;
  level: "Beginner job rule" | "Advanced scheduler";
  source: string;
};

function jobRuleSource({ className, id, displayName, scheduleType, selector }: {
  className: string;
  id: string;
  displayName: string;
  scheduleType: string;
  selector: string;
}): string {
  return `from lekinpy.algorithms import SchedulingAlgorithm
from lekinpy.schedule import Schedule


class ${className}(SchedulingAlgorithm):
    metadata = {
        "id": "${id}",
        "display_name": "${displayName}",
        "supports_multi_operation": True,
        "version": "1.0.0",
    }

    def schedule(self, system):
        def pick(available_jobs):
${selector}

        total_time, machines = self.dynamic_schedule(system, pick)
        return Schedule("${scheduleType}", total_time, machines)


def schedule(system, parameters, context):
    return ${className}().schedule(system)
`;
}

export const CUSTOM_ALGORITHM_TEMPLATES: Record<CustomAlgorithmTemplateId, CustomAlgorithmTemplate> = {
  spt: {
    name: "Custom SPT",
    description: "Change one selector to schedule the released job with the shortest first operation.",
    level: "Beginner job rule",
    source: minimalSptSource,
  },
  edd: {
    name: "Custom EDD",
    description: "Select the released job with the earliest due date.",
    level: "Beginner job rule",
    source: jobRuleSource({
      className: "MyEDDRule",
      id: "custom-edd",
      displayName: "My Earliest Due Date",
      scheduleType: "Custom EDD",
      selector: "            return min(available_jobs, key=lambda job: (job.due, job.job_id))",
    }),
  },
  wspt: {
    name: "Custom WSPT",
    description: "Select the released job with the greatest weight-to-processing-time ratio.",
    level: "Beginner job rule",
    source: jobRuleSource({
      className: "MyWSPTRule",
      id: "custom-wspt",
      displayName: "My Weighted Shortest Processing Time",
      scheduleType: "Custom WSPT",
      selector: "            return min(\n                available_jobs,\n                key=lambda job: (\n                    -(job.weight / job.operations[0].processing_time),\n                    job.job_id,\n                ),\n            )",
    }),
  },
  composite: {
    name: "Due date, then shortest",
    description: "Demonstrate a custom tuple rule with due date, processing time, and weight tie-breaks.",
    level: "Beginner job rule",
    source: jobRuleSource({
      className: "MyCompositeRule",
      id: "custom-composite",
      displayName: "Due Date Then Shortest",
      scheduleType: "Custom Composite",
      selector: "            return min(\n                available_jobs,\n                key=lambda job: (\n                    job.due,\n                    job.operations[0].processing_time,\n                    -job.weight,\n                    job.job_id,\n                ),\n            )",
    }),
  },
  blankRule: {
    name: "Untitled job rule",
    description: "Start with the complete library pattern and implement only how the next released job is selected.",
    level: "Beginner job rule",
    source: jobRuleSource({
      className: "MyJobRule",
      id: "custom-job-rule",
      displayName: "My Job Rule",
      scheduleType: "Custom Job Rule",
      selector: "            # Return one Job from available_jobs.\n            # Example: return min(available_jobs, key=lambda job: job.due)\n            raise NotImplementedError(\"Choose the next job\")",
    }),
  },
  iterative: {
    name: "Bounded experiment",
    description: "A local-search example with parameters, progress, incumbents, and cooperative stopping.",
    level: "Advanced scheduler",
    source: iterativeSource,
  },
  blank: {
    name: "Untitled custom algorithm",
    description: "Start from only the required entrypoint and build a complete Schedule yourself.",
    level: "Advanced scheduler",
    source: `def schedule(system, parameters, context):
    # Build and return a real lekinpy.Schedule here.
    raise NotImplementedError("Implement this algorithm")
`,
  },
};

export const DEFAULT_CUSTOM_ALGORITHM_TEMPLATE = CUSTOM_ALGORITHM_TEMPLATES.spt;
