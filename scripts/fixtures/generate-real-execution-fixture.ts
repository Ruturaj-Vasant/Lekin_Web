/**
 * Deterministic regeneration/verification tool for
 * test/fixtures/real-execution/fixture.json.
 *
 * Default (no flags): regenerates the fixture and overwrites the committed
 * file.
 * `--check`: regenerates into memory and deep-compares against the
 * committed file; exits non-zero (with a diff-shaped report) on any
 * mismatch, without writing anything. This is what
 * `npm run fixture:check` runs, and what CI/reviewers should use to prove
 * the committed fixture is still exactly what the pinned library produces.
 *
 * Pipeline (every step is real library/lib code, nothing handwritten):
 *   1. Validate the sample ProblemDefinition with lib/schema (must be
 *      zero-error).
 *   2. Translate it to the lekinpy System payload shape with
 *      lib/adapter/translate.ts's toLekinpySystemPayload().
 *   3. Shell out to scripts/fixtures/run_lekinpy_fixture.py, which
 *      independently verifies the pinned wheel's checksum, imports it from
 *      an isolated extracted copy (never a global install), and runs all
 *      four built-in algorithms against the translated payload.
 *   4. Translate each raw Schedule.to_dict() back with
 *      fromLekinpyScheduleDict(), and compute Metrics with
 *      computeMetrics() -- both real lib/ functions.
 *   5. Cross-check each algorithm's metadata against lib/registry's
 *      ALGORITHM_REGISTRY.
 *   6. Assemble and write/compare the fixture.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { REAL_EXECUTION_SAMPLE_PROBLEM } from "../../test/fixtures/real-execution/problem";
import { validateProblemDefinition } from "../../lib/schema/problem";
import { hasBlockingError } from "../../lib/schema/issue";
import { toLekinpySystemPayload, fromLekinpyScheduleDict, type LekinpyScheduleDict } from "../../lib/adapter/translate";
import { computeMetrics } from "../../lib/scheduling/metrics";
import { ALGORITHM_REGISTRY, getAlgorithmDefinition } from "../../lib/registry/algorithms";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");
const WHEEL_PATH = join(REPO_ROOT, "public/vendor/lekinpy-0.2.0-py3-none-any.whl");
const SHA256_PATH = join(REPO_ROOT, "public/vendor/lekinpy-0.2.0-py3-none-any.whl.sha256");
const PYTHON_SCRIPT = join(REPO_ROOT, "scripts/fixtures/run_lekinpy_fixture.py");
const FIXTURE_PATH = join(REPO_ROOT, "test/fixtures/real-execution/fixture.json");

// Matches ARCHITECTURE.md's documented pin and lekin-web_DECISIONS.md's
// wheel-pinning entry. The wheel's SHA-256 (verified empirically by the
// Python script, not just asserted here) is the actual cryptographic proof
// of provenance; this is the human-readable cross-reference to where that
// wheel came from.
const EXPECTED_LEKIN_LIBRARY_TAG = "v0.2.0";
const EXPECTED_LEKIN_LIBRARY_COMMIT = "a3fee48";
const EXPECTED_LEKINPY_VERSION = "0.2.0";

const ALGORITHM_IDS = ["fcfs", "spt", "edd", "wspt"] as const;
type AlgorithmId = (typeof ALGORITHM_IDS)[number];

interface RawFixtureOutput {
  lekinpyVersion: string;
  wheelSha256: string;
  pythonVersion: string;
  algorithms: Record<AlgorithmId, { schedule: LekinpyScheduleDict; metadata: Record<string, unknown> }>;
}

function fail(message: string): never {
  console.error(`FIXTURE GENERATION FAILED: ${message}`);
  process.exit(1);
}

function runPythonExecution(problemPayloadPath: string): RawFixtureOutput {
  if (!existsSync(WHEEL_PATH)) fail(`pinned wheel not found at ${WHEEL_PATH}`);
  if (!existsSync(SHA256_PATH)) fail(`checksum file not found at ${SHA256_PATH}`);

  let stdout: string;
  try {
    stdout = execFileSync(
      "python3",
      [
        PYTHON_SCRIPT,
        "--wheel",
        WHEEL_PATH,
        "--sha256",
        SHA256_PATH,
        "--problem",
        problemPayloadPath,
        "--expected-version",
        EXPECTED_LEKINPY_VERSION,
      ],
      { encoding: "utf-8" },
    );
  } catch (error) {
    const stderr = error && typeof error === "object" && "stderr" in error ? String((error as { stderr: unknown }).stderr) : "";
    fail(`running the pinned lekinpy wheel failed.\n${stderr || String(error)}`);
  }
  return JSON.parse(stdout);
}

function generateFixture() {
  const validationIssues = validateProblemDefinition(REAL_EXECUTION_SAMPLE_PROBLEM);
  if (hasBlockingError(validationIssues)) {
    fail(
      `the sample ProblemDefinition itself fails lib/schema validation:\n${JSON.stringify(validationIssues, null, 2)}`,
    );
  }

  const systemPayload = toLekinpySystemPayload(REAL_EXECUTION_SAMPLE_PROBLEM);
  const tempDir = mkdtempSync(join(tmpdir(), "real-execution-fixture-"));
  const payloadPath = join(tempDir, "problem-payload.json");
  writeFileSync(payloadPath, JSON.stringify(systemPayload));

  const raw = runPythonExecution(payloadPath);

  if (raw.lekinpyVersion !== EXPECTED_LEKINPY_VERSION) {
    fail(`lekinpy reported version ${raw.lekinpyVersion}, expected ${EXPECTED_LEKINPY_VERSION}`);
  }
  const expectedSha256 = readFileSync(SHA256_PATH, "utf-8").trim();
  if (raw.wheelSha256.toLowerCase() !== expectedSha256.toLowerCase()) {
    fail(`wheel checksum reported by the Python step (${raw.wheelSha256}) does not match ${SHA256_PATH} (${expectedSha256})`);
  }

  const results: Record<string, unknown> = {};
  for (const algorithmId of ALGORITHM_IDS) {
    const entry = raw.algorithms[algorithmId];
    if (!entry) fail(`Python step did not return a result for algorithm '${algorithmId}'`);

    const registryEntry = getAlgorithmDefinition(algorithmId);
    if (!registryEntry) fail(`algorithm '${algorithmId}' is not present in lib/registry's ALGORITHM_REGISTRY`);

    const liveMetadata = entry.metadata as { id: string; display_name: string; supports_multi_operation: boolean; version: string };
    const expected = registryEntry.libraryMetadata;
    const actual = {
      id: liveMetadata.id,
      displayName: liveMetadata.display_name,
      supportsMultiOperation: liveMetadata.supports_multi_operation,
      version: liveMetadata.version,
    };
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      fail(
        `lib/registry's libraryMetadata for '${algorithmId}' has drifted from the real pinned library.\n` +
          `  registry: ${JSON.stringify(expected)}\n` +
          `  live:     ${JSON.stringify(actual)}`,
      );
    }

    const scheduleId = `fixture-${algorithmId}`;
    const webSchedule = fromLekinpyScheduleDict(entry.schedule, scheduleId, algorithmId);
    const metrics = computeMetrics(webSchedule, REAL_EXECUTION_SAMPLE_PROBLEM);

    results[algorithmId] = {
      libraryMetadata: expected,
      rawLekinpyScheduleDict: entry.schedule,
      webSchedule,
      metrics,
    };
  }

  return {
    provenance: {
      lekinLibraryTag: EXPECTED_LEKIN_LIBRARY_TAG,
      lekinLibraryCommit: EXPECTED_LEKIN_LIBRARY_COMMIT,
      lekinpyVersion: raw.lekinpyVersion,
      wheelPath: "public/vendor/lekinpy-0.2.0-py3-none-any.whl",
      wheelSha256: raw.wheelSha256,
      pythonVersion: raw.pythonVersion,
      generatedAt: process.env.FIXTURE_FREEZE_TIMESTAMP ?? new Date().toISOString(),
      registrySnapshot: ALGORITHM_REGISTRY.map((a) => a.libraryMetadata),
    },
    problem: REAL_EXECUTION_SAMPLE_PROBLEM,
    results,
  };
}

function main() {
  const check = process.argv.includes("--check");
  const fixture = generateFixture();
  const serialized = `${JSON.stringify(fixture, null, 2)}\n`;

  if (check) {
    if (!existsSync(FIXTURE_PATH)) {
      fail(`${FIXTURE_PATH} does not exist yet -- run without --check to generate it first`);
    }
    const committed = readFileSync(FIXTURE_PATH, "utf-8");
    // generatedAt is expected to differ run-to-run; compare everything else.
    const stripTimestamp = (text: string) => text.replace(/"generatedAt":\s*"[^"]*"/, '"generatedAt": "<omitted>"');
    if (stripTimestamp(committed) !== stripTimestamp(serialized)) {
      console.error("FIXTURE CHECK FAILED: regenerating from the pinned library produced a different result than the committed fixture.");
      console.error("Run `npm run fixture:generate` and review/commit the diff if the change is expected.");
      process.exit(1);
    }
    console.log("Fixture check passed: committed fixture matches a fresh run against the pinned library.");
    return;
  }

  writeFileSync(FIXTURE_PATH, serialized);
  console.log(`Wrote ${FIXTURE_PATH}`);
}

main();
