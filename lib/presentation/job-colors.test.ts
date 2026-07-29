import { describe, expect, it } from "vitest";
import type { Job, ProblemDefinition } from "../schema/problem";
import {
  JOB_COLOR_PALETTE,
  assignMissingJobColors,
  automaticJobColor,
  contrastRatio,
  hexToRgb,
  readableForeground,
  rgbToHex,
} from "./job-colors";

function job(jobId: string, rgb?: [number, number, number]): Job {
  return { jobId, release: 0, due: 10, weight: 1, rgb, operations: [] };
}

function problem(jobs: Job[]): ProblemDefinition {
  return { schemaVersion: "1.0.0", problemId: "p", name: "n", jobs, workcenters: [], machines: [] };
}

describe("job colors", () => {
  it("assigns distinct deterministic colors to legacy jobs without rgb values", () => {
    const original = problem([job("J1"), job("J2"), job("J3")]);
    const first = assignMissingJobColors(original);
    const second = assignMissingJobColors(original);

    expect(first.jobs.map((entry) => entry.rgb)).toEqual(second.jobs.map((entry) => entry.rgb));
    expect(new Set(first.jobs.map((entry) => entry.rgb!.join(","))).size).toBe(3);
  });

  it("preserves explicit colors and only fills missing values", () => {
    const assigned = assignMissingJobColors(problem([job("J1", [1, 2, 3]), job("J2")]));
    expect(assigned.jobs[0]!.rgb).toEqual([1, 2, 3]);
    expect(assigned.jobs[1]!.rgb).not.toEqual([1, 2, 3]);
  });

  it("reserves explicit colors even when the legacy job appears first", () => {
    const assigned = assignMissingJobColors(problem([
      job("legacy"),
      job("explicit", [...JOB_COLOR_PALETTE[0]]),
    ]));
    expect(assigned.jobs[0]!.rgb).not.toEqual(JOB_COLOR_PALETTE[0]);
  });

  it("generates additional distinct colors after the fixed palette is exhausted", () => {
    const jobs = Array.from({ length: JOB_COLOR_PALETTE.length + 8 }, (_, index) => job(`J${index + 1}`));
    const colors = assignMissingJobColors(problem(jobs)).jobs.map((entry) => entry.rgb!.join(","));
    expect(new Set(colors).size).toBe(jobs.length);
  });

  it("automatic reset ignores the current job and avoids every other job color", () => {
    const jobs = [job("J1", JOB_COLOR_PALETTE[0]), job("J2", JOB_COLOR_PALETTE[1])];
    expect(automaticJobColor(jobs, 1)).toEqual(JOB_COLOR_PALETTE[1]);
    expect(automaticJobColor(jobs)).toEqual(JOB_COLOR_PALETTE[2]);
  });

  it("round-trips six-digit hex colors", () => {
    expect(hexToRgb(rgbToHex([91, 120, 165]))).toEqual([91, 120, 165]);
    expect(hexToRgb("#bad")).toBeNull();
  });

  it("chooses the higher-contrast foreground and meets the AA text threshold", () => {
    for (const color of [...JOB_COLOR_PALETTE, [245, 245, 245] as const, [20, 20, 20] as const]) {
      const foreground = readableForeground(color);
      const foregroundRgb = foreground === "#ffffff" ? [255, 255, 255] : [0, 0, 0];
      expect(contrastRatio(color, foregroundRgb)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
