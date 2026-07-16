import type { ProblemDefinition } from "../../lib/schema/problem";
import { parseProblemJson, safeProblemFilename, serializeProblem, type ImportProblemResult } from "../../lib/import-export/problem-json";

export const MAX_PROBLEM_FILE_BYTES = 5 * 1024 * 1024;

export async function readProblemFile(file: File): Promise<ImportProblemResult> {
  if (file.size > MAX_PROBLEM_FILE_BYTES) {
    return { ok: false, reason: "malformed-envelope", message: "The selected file is larger than the 5 MB import limit." };
  }
  try {
    return parseProblemJson(await file.text(), crypto.randomUUID());
  } catch {
    return { ok: false, reason: "malformed-json", message: "The selected file could not be read." };
  }
}

export function downloadProblemFile(problem: ProblemDefinition): void {
  const url = URL.createObjectURL(new Blob([serializeProblem(problem)], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = safeProblemFilename(problem.name);
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
