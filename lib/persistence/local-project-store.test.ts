import { describe, expect, it } from "vitest";
import type { KeyValueStorage } from "./local-project-store";
import {
  STORAGE_FORMAT_VERSION,
  clearLastActiveProjectId,
  deleteProject,
  getLastActiveProjectId,
  listProjects,
  loadProject,
  saveProject,
  setLastActiveProjectId,
} from "./local-project-store";
import type { ProblemDefinition } from "../schema/problem";

/** In-memory fake implementing the same three-method contract as `window.localStorage`, so these tests never need a DOM. */
function fakeStorage(initial: Record<string, string> = {}): KeyValueStorage {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

function problem(problemId: string, name = "Untitled problem"): ProblemDefinition {
  return { schemaVersion: "1.0.0", problemId, name, jobs: [], workcenters: [], machines: [] };
}

describe("saveProject / loadProject", () => {
  it("round-trips a problem definition exactly", () => {
    const storage = fakeStorage();
    const p = problem("p1", "My problem");
    expect(saveProject(storage, p)).toEqual({ ok: true });
    const result = loadProject(storage, "p1");
    expect(result).toEqual({ ok: true, problem: p });
  });

  it("overwrites a previously saved project with the same problemId", () => {
    const storage = fakeStorage();
    saveProject(storage, problem("p1", "First name"));
    saveProject(storage, problem("p1", "Second name"));
    const result = loadProject(storage, "p1");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.problem.name).toBe("Second name");
  });

  it("reports not-found for an id that was never saved", () => {
    const storage = fakeStorage();
    expect(loadProject(storage, "missing")).toEqual({
      ok: false,
      reason: "not-found",
      message: "No locally saved project with id 'missing'.",
    });
  });

  it("reports malformed for unparseable JSON", () => {
    const storage = fakeStorage({ [`lekin-lab:v${STORAGE_FORMAT_VERSION}:project:p1`]: "{not json" });
    const result = loadProject(storage, "p1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("malformed");
  });

  it("reports malformed for JSON missing required envelope fields", () => {
    const storage = fakeStorage({ [`lekin-lab:v${STORAGE_FORMAT_VERSION}:project:p1`]: JSON.stringify({ foo: "bar" }) });
    const result = loadProject(storage, "p1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("malformed");
  });

  it("reports unsupported-version for a different formatVersion", () => {
    const storage = fakeStorage({
      [`lekin-lab:v${STORAGE_FORMAT_VERSION}:project:p1`]: JSON.stringify({
        formatVersion: 999,
        problemId: "p1",
        name: "n",
        savedAt: new Date().toISOString(),
        problem: problem("p1"),
      }),
    });
    const result = loadProject(storage, "p1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("unsupported-version");
      expect(result.message).toContain("v999");
    }
  });

  it("reports invalid-schema when the nested problem fails ProblemDefinitionSchema", () => {
    const storage = fakeStorage({
      [`lekin-lab:v${STORAGE_FORMAT_VERSION}:project:p1`]: JSON.stringify({
        formatVersion: STORAGE_FORMAT_VERSION,
        problemId: "p1",
        name: "n",
        savedAt: new Date().toISOString(),
        problem: { schemaVersion: "1.0.0", problemId: "p1" /* missing name/jobs/workcenters/machines */ },
      }),
    });
    const result = loadProject(storage, "p1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid-schema");
  });

  it("returns a storage-error result rather than throwing when setItem fails", () => {
    const storage: KeyValueStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota exceeded");
      },
      removeItem: () => {},
    };
    const result = saveProject(storage, problem("p1"));
    expect(result).toEqual({ ok: false, error: "quota exceeded" });
  });
});

describe("listProjects", () => {
  it("lists saved projects most-recently-saved first", () => {
    const storage = fakeStorage();
    saveProject(storage, problem("p1", "First"));
    saveProject(storage, problem("p2", "Second"));
    const list = listProjects(storage);
    expect(list.map((entry) => entry.problemId)).toEqual(["p2", "p1"]);
  });

  it("moves a re-saved project back to the front", () => {
    const storage = fakeStorage();
    saveProject(storage, problem("p1"));
    saveProject(storage, problem("p2"));
    saveProject(storage, problem("p1"));
    expect(listProjects(storage).map((entry) => entry.problemId)).toEqual(["p1", "p2"]);
  });

  it("prunes an index entry whose underlying project data is corrupt, without affecting the others", () => {
    const storage = fakeStorage();
    saveProject(storage, problem("p1", "Good one"));
    saveProject(storage, problem("p2", "Will be corrupted"));
    storage.setItem(`lekin-lab:v${STORAGE_FORMAT_VERSION}:project:p2`, "{not json");

    const list = listProjects(storage);
    expect(list.map((entry) => entry.problemId)).toEqual(["p1"]);
    // The prune is persisted, not just filtered in memory for this one call.
    expect(listProjects(storage).map((entry) => entry.problemId)).toEqual(["p1"]);
  });

  it("returns an empty list, not an error, when the index itself is corrupt", () => {
    const storage = fakeStorage({ [`lekin-lab:v${STORAGE_FORMAT_VERSION}:index`]: "{not json" });
    expect(listProjects(storage)).toEqual([]);
  });

  it("returns an empty list when nothing has ever been saved", () => {
    expect(listProjects(fakeStorage())).toEqual([]);
  });
});

describe("deleteProject", () => {
  it("removes the project and its index entry", () => {
    const storage = fakeStorage();
    saveProject(storage, problem("p1"));
    saveProject(storage, problem("p2"));
    deleteProject(storage, "p1");
    expect(listProjects(storage).map((entry) => entry.problemId)).toEqual(["p2"]);
    expect(loadProject(storage, "p1")).toMatchObject({ ok: false, reason: "not-found" });
  });

  it("clears the last-active pointer if it pointed at the deleted project", () => {
    const storage = fakeStorage();
    saveProject(storage, problem("p1"));
    setLastActiveProjectId(storage, "p1");
    deleteProject(storage, "p1");
    expect(getLastActiveProjectId(storage)).toBeNull();
  });

  it("leaves the last-active pointer untouched when a different project is deleted", () => {
    const storage = fakeStorage();
    saveProject(storage, problem("p1"));
    saveProject(storage, problem("p2"));
    setLastActiveProjectId(storage, "p1");
    deleteProject(storage, "p2");
    expect(getLastActiveProjectId(storage)).toBe("p1");
  });

  it("is a no-op when deleting an id that was never saved", () => {
    const storage = fakeStorage();
    saveProject(storage, problem("p1"));
    expect(() => deleteProject(storage, "missing")).not.toThrow();
    expect(listProjects(storage).map((entry) => entry.problemId)).toEqual(["p1"]);
  });
});

describe("last-active project id", () => {
  it("is null until set", () => {
    expect(getLastActiveProjectId(fakeStorage())).toBeNull();
  });

  it("round-trips through set/get/clear", () => {
    const storage = fakeStorage();
    setLastActiveProjectId(storage, "p1");
    expect(getLastActiveProjectId(storage)).toBe("p1");
    clearLastActiveProjectId(storage);
    expect(getLastActiveProjectId(storage)).toBeNull();
  });
});
