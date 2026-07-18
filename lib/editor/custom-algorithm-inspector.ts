import { toLekinpySystemPayload } from "../adapter/translate";
import type { ProblemDefinition } from "../schema/problem";
import { parseCustomParameters } from "./custom-algorithm-input";

function pythonValue(value: string | number | null): string {
  if (value === null) return "None";
  if (typeof value === "string") return JSON.stringify(value);
  return String(value);
}

/**
 * A readable representation of the exact snake_case payload used to build the
 * real lekinpy.System in the worker. This is documentation, not executable
 * Python serialization.
 */
export function buildPythonInputPreview(problem: ProblemDefinition, parametersText: string): string {
  const payload = toLekinpySystemPayload(problem);
  const parsedParameters = parseCustomParameters(parametersText);
  const lines = [
    "# LEKIN Lab constructs a real lekinpy.System from these values.",
    "# Your function receives that object as `system`.",
    "",
    "system.jobs = [",
  ];

  for (const job of payload.jobs) {
    lines.push(
      "    Job(",
      `        job_id=${pythonValue(job.job_id)}, release=${job.release}, due=${job.due}, weight=${job.weight},`,
      "        operations=[",
    );
    for (const operation of job.operations) {
      lines.push(
        `            Operation(workcenter=${pythonValue(operation.workcenter)}, processing_time=${operation.processing_time}, status=${pythonValue(operation.status)}),`,
      );
    }
    lines.push("        ],", "    ),");
  }
  lines.push("]", "", "system.workcenters = [");

  for (const workcenter of payload.workcenters) {
    lines.push(
      "    Workcenter(",
      `        name=${pythonValue(workcenter.name)}, release=${workcenter.release}, status=${pythonValue(workcenter.status)},`,
      "        machines=[",
    );
    for (const machine of workcenter.machines) {
      lines.push(
        `            Machine(name=${pythonValue(machine.name)}, release=${machine.release}, status=${pythonValue(machine.status)}),`,
      );
    }
    lines.push("        ],", "    ),");
  }

  lines.push("]", "", "# Parameters are passed as a normal Python dict.");
  lines.push(parsedParameters.ok
    ? `parameters = ${JSON.stringify(parsedParameters.value, null, 4)}`
    : `parameters = <invalid JSON: ${parametersText}>`);
  return lines.join("\n");
}

/** Exact JSON-shaped construction input used at the web-to-Python boundary. */
export function buildJsonInputPreview(problem: ProblemDefinition, parametersText: string): string {
  const parsedParameters = parseCustomParameters(parametersText);
  return JSON.stringify({
    system: toLekinpySystemPayload(problem),
    parameters: parsedParameters.ok ? parsedParameters.value : parametersText,
  }, null, 2);
}
