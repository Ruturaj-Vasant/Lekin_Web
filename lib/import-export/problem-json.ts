import { z } from "zod";
import { ProblemDefinitionSchema, type ProblemDefinition } from "../schema/problem";

export const PROBLEM_FILE_FORMAT = "lekin-lab.problem";
export const PROBLEM_FILE_VERSION = 1;

const ProblemFileEnvelopeSchema = z.object({
  format: z.literal(PROBLEM_FILE_FORMAT),
  formatVersion: z.number(),
  exportedAt: z.iso.datetime(),
  problemId: z.string(),
  name: z.string(),
  schemaVersion: z.string(),
  problem: z.unknown(),
});

export type ImportProblemResult =
  | { ok: true; problem: ProblemDefinition }
  | {
      ok: false;
      reason: "malformed-json" | "malformed-envelope" | "unsupported-version" | "invalid-problem" | "metadata-mismatch";
      message: string;
    };

export function serializeProblem(problem: ProblemDefinition, exportedAt = new Date().toISOString()): string {
  return JSON.stringify(
    {
      format: PROBLEM_FILE_FORMAT,
      formatVersion: PROBLEM_FILE_VERSION,
      exportedAt,
      problemId: problem.problemId,
      name: problem.name,
      schemaVersion: problem.schemaVersion,
      problem,
    },
    null,
    2,
  );
}

export function parseProblemJson(json: string, freshProblemId: string): ImportProblemResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, reason: "malformed-json", message: "This file is not valid JSON." };
  }

  const envelope = ProblemFileEnvelopeSchema.safeParse(raw);
  if (!envelope.success) {
    return {
      ok: false,
      reason: "malformed-envelope",
      message: "This is not a valid LEKIN Lab problem file.",
    };
  }
  if (envelope.data.formatVersion !== PROBLEM_FILE_VERSION) {
    return {
      ok: false,
      reason: "unsupported-version",
      message: `This file uses format version ${envelope.data.formatVersion}. This version of LEKIN Lab supports version ${PROBLEM_FILE_VERSION}.`,
    };
  }

  const problem = ProblemDefinitionSchema.safeParse(envelope.data.problem);
  if (!problem.success) {
    return {
      ok: false,
      reason: "invalid-problem",
      message: "The problem data is incomplete or uses an unsupported schema version.",
    };
  }
  if (
    envelope.data.problemId !== problem.data.problemId ||
    envelope.data.name !== problem.data.name ||
    envelope.data.schemaVersion !== problem.data.schemaVersion
  ) {
    return {
      ok: false,
      reason: "metadata-mismatch",
      message: "The file metadata does not match its problem data.",
    };
  }

  return { ok: true, problem: { ...problem.data, problemId: freshProblemId } };
}

export function safeProblemFilename(name: string): string {
  const stem = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 80);
  return `${stem || "lekin-problem"}.lekin.json`;
}
