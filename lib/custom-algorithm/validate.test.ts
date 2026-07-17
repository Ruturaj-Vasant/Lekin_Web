import { describe, expect, it } from "vitest";
import { collectPreflightIssues, findNonSerializablePath, isBlankSource } from "./validate";
import { DEFAULT_CUSTOM_ALGORITHM_POLICY } from "./policy";

describe("isBlankSource", () => {
  it("treats empty and whitespace-only source as blank", () => {
    expect(isBlankSource("")).toBe(true);
    expect(isBlankSource("   \n\t  ")).toBe(true);
    expect(isBlankSource("def schedule(): pass")).toBe(false);
  });
});

describe("findNonSerializablePath", () => {
  it("accepts plain JSON-shaped data", () => {
    expect(findNonSerializablePath({ a: 1, b: "x", c: [1, 2, { d: null }], e: true })).toBeNull();
  });

  it("rejects a function value", () => {
    expect(findNonSerializablePath({ a: () => 1 })).toEqual(["a"]);
  });

  it("rejects undefined explicitly present in an object", () => {
    expect(findNonSerializablePath({ a: undefined })).toEqual(["a"]);
  });

  it("rejects a class instance", () => {
    class Foo {}
    expect(findNonSerializablePath({ a: new Foo() })).toEqual(["a"]);
  });

  it("rejects NaN/Infinity", () => {
    expect(findNonSerializablePath({ a: NaN })).toEqual(["a"]);
    expect(findNonSerializablePath({ a: Infinity })).toEqual(["a"]);
  });

  it("rejects a circular reference instead of infinite-looping", () => {
    const obj: Record<string, unknown> = {};
    obj.self = obj;
    expect(findNonSerializablePath(obj)).toEqual(["self"]);
  });

  it("finds a non-serializable value nested inside an array", () => {
    expect(findNonSerializablePath({ list: [1, 2, () => {}] })).toEqual(["list", 2]);
  });
});

describe("collectPreflightIssues", () => {
  it("rejects empty source", () => {
    const issues = collectPreflightIssues({ source: "" });
    expect(issues.some((i) => i.code === "CUSTOM_ALGORITHM_EMPTY_SOURCE")).toBe(true);
  });

  it("rejects source exceeding the size policy", () => {
    const policy = { ...DEFAULT_CUSTOM_ALGORITHM_POLICY, maxSourceBytes: 10 };
    const issues = collectPreflightIssues({ source: "def schedule(system, parameters, context):\n    return None\n" }, policy);
    expect(issues.some((i) => i.code === "CUSTOM_ALGORITHM_SOURCE_TOO_LARGE")).toBe(true);
  });

  it("rejects non-serializable parameters", () => {
    const issues = collectPreflightIssues({
      source: "def schedule(system, parameters, context):\n    return None\n",
      parameters: { fn: () => 1 },
    });
    expect(issues.some((i) => i.code === "CUSTOM_ALGORITHM_PARAMETERS_NOT_SERIALIZABLE")).toBe(true);
  });

  it("rejects a time limit outside policy", () => {
    const issues = collectPreflightIssues({
      source: "def schedule(system, parameters, context):\n    return None\n",
      timeLimitMs: DEFAULT_CUSTOM_ALGORITHM_POLICY.maxTimeLimitMs + 1,
    });
    expect(issues.some((i) => i.code === "CUSTOM_ALGORITHM_LIMITS_EXCEED_POLICY")).toBe(true);
  });

  it("returns no issues for a well-formed request", () => {
    const issues = collectPreflightIssues({
      source: "def schedule(system, parameters, context):\n    return None\n",
      parameters: { alpha: 1, label: "x" },
      timeLimitMs: 5000,
    });
    expect(issues).toEqual([]);
  });
});
