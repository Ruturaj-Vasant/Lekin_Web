import { z } from "zod";
import { ProblemDefinitionSchema, type ProblemDefinition } from "../schema/problem";

/**
 * PRODUCT_SPEC.md §24 - local project persistence.
 *
 * Framework-independent, storage-independent adapter: every function here
 * takes a `KeyValueStorage` explicitly rather than reaching for
 * `window.localStorage` directly, so the whole module is unit-testable
 * against an in-memory fake (see local-project-store.test.ts) without a
 * DOM. The browser-only lookup of the real storage object lives in
 * app/persistence/browser-storage.ts, which is the one place allowed to
 * touch `window`.
 *
 * Raw stored JSON is NEVER trusted: every read re-validates the envelope
 * shape and the nested ProblemDefinition against the existing Zod schemas
 * before handing data back to the caller (loadProject/listProjects below).
 */

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Bump this if the stored envelope shape ever changes; loadProject rejects any other value as unsupported-version. */
export const STORAGE_FORMAT_VERSION = 1;

const NAMESPACE = "lekin-lab";
const projectStorageKey = (problemId: string) => `${NAMESPACE}:v${STORAGE_FORMAT_VERSION}:project:${problemId}`;
const INDEX_STORAGE_KEY = `${NAMESPACE}:v${STORAGE_FORMAT_VERSION}:index`;
const LAST_ACTIVE_STORAGE_KEY = `${NAMESPACE}:v${STORAGE_FORMAT_VERSION}:last-active`;

const StoredProjectEnvelopeSchema = z.object({
  formatVersion: z.number(),
  problemId: z.string(),
  name: z.string(),
  savedAt: z.string(),
  // Deliberately z.unknown(): the nested problem is re-validated against
  // ProblemDefinitionSchema separately (below) so a schema-invalid problem
  // and a malformed envelope are distinguishable failure reasons.
  problem: z.unknown(),
});

export interface ProjectSummary {
  problemId: string;
  name: string;
  savedAt: string;
}

const ProjectSummarySchema = z.object({
  problemId: z.string(),
  name: z.string(),
  savedAt: z.string(),
});
const ProjectIndexSchema = z.array(ProjectSummarySchema);

function readIndex(storage: KeyValueStorage): ProjectSummary[] {
  const raw = storage.getItem(INDEX_STORAGE_KEY);
  if (raw === null) return [];
  try {
    const parsed = ProjectIndexSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

function writeIndex(storage: KeyValueStorage, index: ProjectSummary[]): void {
  storage.setItem(INDEX_STORAGE_KEY, JSON.stringify(index));
}

export type SaveProjectResult = { ok: true } | { ok: false; error: string };

/** Saves (or overwrites) the project under its own problemId, and records it as the most recent entry in the recent-projects index. */
export function saveProject(storage: KeyValueStorage, problem: ProblemDefinition): SaveProjectResult {
  const savedAt = new Date().toISOString();
  try {
    storage.setItem(
      projectStorageKey(problem.problemId),
      JSON.stringify({ formatVersion: STORAGE_FORMAT_VERSION, problemId: problem.problemId, name: problem.name, savedAt, problem }),
    );
    const index = readIndex(storage).filter((entry) => entry.problemId !== problem.problemId);
    index.unshift({ problemId: problem.problemId, name: problem.name, savedAt });
    writeIndex(storage, index);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unable to write to local storage." };
  }
}

export type LoadProjectResult =
  | { ok: true; problem: ProblemDefinition }
  | { ok: false; reason: "not-found" | "malformed" | "unsupported-version" | "invalid-schema"; message: string };

/** Loads and fully re-validates one stored project. Never throws - any bad data is reported as a typed failure reason instead. */
export function loadProject(storage: KeyValueStorage, problemId: string): LoadProjectResult {
  const raw = storage.getItem(projectStorageKey(problemId));
  if (raw === null) {
    return { ok: false, reason: "not-found", message: `No locally saved project with id '${problemId}'.` };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "malformed", message: "Saved project data is not valid JSON and could not be read." };
  }

  const envelope = StoredProjectEnvelopeSchema.safeParse(parsedJson);
  if (!envelope.success) {
    return { ok: false, reason: "malformed", message: "Saved project data is missing required fields." };
  }
  if (envelope.data.formatVersion !== STORAGE_FORMAT_VERSION) {
    return {
      ok: false,
      reason: "unsupported-version",
      message: `Saved project uses storage format v${envelope.data.formatVersion}, which this version of LEKIN Lab does not support (expected v${STORAGE_FORMAT_VERSION}).`,
    };
  }

  const problem = ProblemDefinitionSchema.safeParse(envelope.data.problem);
  if (!problem.success) {
    return { ok: false, reason: "invalid-schema", message: "Saved project data failed validation and could not be restored." };
  }
  if (
    envelope.data.problemId !== problemId ||
    envelope.data.problemId !== problem.data.problemId ||
    envelope.data.name !== problem.data.name
  ) {
    return {
      ok: false,
      reason: "malformed",
      message: "Saved project metadata does not match the stored problem.",
    };
  }

  return { ok: true, problem: problem.data };
}

/**
 * Lists every recoverable saved project, most-recently-saved first.
 * Self-healing: an index entry whose underlying project data has gone bad
 * (malformed JSON, wrong version, failed schema validation) is silently
 * pruned from the index rather than surfaced as an error, so one corrupt
 * entry never breaks the whole list.
 */
export function listProjects(storage: KeyValueStorage): ProjectSummary[] {
  const index = readIndex(storage);
  const valid = index.filter((entry) => loadProject(storage, entry.problemId).ok);
  if (valid.length !== index.length) writeIndex(storage, valid);
  return valid;
}

export function deleteProject(storage: KeyValueStorage, problemId: string): void {
  storage.removeItem(projectStorageKey(problemId));
  writeIndex(storage, readIndex(storage).filter((entry) => entry.problemId !== problemId));
  if (getLastActiveProjectId(storage) === problemId) clearLastActiveProjectId(storage);
}

export function getLastActiveProjectId(storage: KeyValueStorage): string | null {
  return storage.getItem(LAST_ACTIVE_STORAGE_KEY);
}

export function setLastActiveProjectId(storage: KeyValueStorage, problemId: string): void {
  storage.setItem(LAST_ACTIVE_STORAGE_KEY, problemId);
}

export function clearLastActiveProjectId(storage: KeyValueStorage): void {
  storage.removeItem(LAST_ACTIVE_STORAGE_KEY);
}
