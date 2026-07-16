import { describe, expect, it } from "vitest";
import type { ProblemDefinition } from "../schema/problem";
import {
  PROBLEM_FILE_FORMAT,
  PROBLEM_FILE_VERSION,
  parseProblemJson,
  safeProblemFilename,
  serializeProblem,
} from "./problem-json";

const problem: ProblemDefinition = {
  schemaVersion: "1.0.0",
  problemId: "original-id",
  name: "Café job shop / study #1",
  jobs: [{ jobId: "J1", release: 0, due: 10, weight: 2, operations: [{ operationIndex: 0, operationId: "J1:0", workcenterId: "WC1", processingTime: 4, status: "active" }] }],
  workcenters: [{ workcenterId: "WC1", release: 0, status: "active", machineIds: ["M1"] }],
  machines: [{ machineId: "M1", workcenterId: "WC1", release: 0, status: "active" }],
};

describe("problem JSON import/export", () => {
  it("round-trips every scheduling field and assigns a fresh project id", () => {
    const result = parseProblemJson(serializeProblem(problem, "2026-01-02T03:04:05.000Z"), "fresh-id");
    expect(result).toEqual({ ok: true, problem: { ...problem, problemId: "fresh-id" } });
  });

  it("writes a documented versioned envelope", () => {
    expect(JSON.parse(serializeProblem(problem, "2026-01-02T03:04:05.000Z"))).toMatchObject({
      format: PROBLEM_FILE_FORMAT,
      formatVersion: PROBLEM_FILE_VERSION,
      exportedAt: "2026-01-02T03:04:05.000Z",
      problemId: problem.problemId,
      name: problem.name,
      schemaVersion: "1.0.0",
      problem,
    });
  });

  it("rejects malformed JSON", () => {
    expect(parseProblemJson("{no", "fresh")).toMatchObject({ ok: false, reason: "malformed-json" });
  });

  it("rejects a malformed envelope", () => {
    expect(parseProblemJson(JSON.stringify({ problem }), "fresh")).toMatchObject({ ok: false, reason: "malformed-envelope" });
  });

  it("rejects unsupported file versions", () => {
    const envelope = JSON.parse(serializeProblem(problem));
    envelope.formatVersion = 99;
    expect(parseProblemJson(JSON.stringify(envelope), "fresh")).toMatchObject({ ok: false, reason: "unsupported-version" });
  });

  it("rejects invalid problem definitions", () => {
    const envelope = JSON.parse(serializeProblem(problem));
    delete envelope.problem.jobs;
    expect(parseProblemJson(JSON.stringify(envelope), "fresh")).toMatchObject({ ok: false, reason: "invalid-problem" });
  });

  it("rejects mismatched envelope metadata", () => {
    const envelope = JSON.parse(serializeProblem(problem));
    envelope.name = "Different";
    expect(parseProblemJson(JSON.stringify(envelope), "fresh")).toMatchObject({ ok: false, reason: "metadata-mismatch" });
  });

  it("creates safe, bounded filenames", () => {
    expect(safeProblemFilename(problem.name)).toBe("cafe-job-shop-study-1.lekin.json");
    expect(safeProblemFilename("../../")).toBe("lekin-problem.lekin.json");
    expect(safeProblemFilename("a".repeat(100))).toBe(`${"a".repeat(80)}.lekin.json`);
  });
});
