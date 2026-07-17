import { describe, expect, it } from "vitest";
import { customAlgorithmFilename, parseCustomParameters } from "./custom-algorithm-input";

describe("custom algorithm editor input", () => {
  it("accepts only JSON objects as parameters", () => {
    expect(parseCustomParameters('{"iterations": 50}')).toEqual({ ok: true, value: { iterations: 50 } });
    expect(parseCustomParameters("[]")).toEqual({ ok: false, message: "Parameters must be a JSON object, such as {}." });
    expect(parseCustomParameters("oops").ok).toBe(false);
  });

  it("creates a portable Python filename", () => {
    expect(customAlgorithmFilename("My SPT Experiment")).toBe("my-spt-experiment.py");
    expect(customAlgorithmFilename("***")).toBe("custom-algorithm.py");
  });
});
