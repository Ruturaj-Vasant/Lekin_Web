import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { ALGORITHM_REGISTRY } from "./algorithms";

/**
 * Registry-drift guard - ARCHITECTURE.md §1.5.
 *
 * Imports the real lekinpy source and compares every registry entry's
 * `libraryMetadata` against the actual `SchedulingAlgorithm.metadata` dict,
 * byte-for-byte (mod snake_case -> camelCase). There is no auto-discovery
 * (lekinpy item 5 explicitly rejected that), so ALGORITHM_REGISTRY is
 * hand-maintained - this is what catches it going stale the next time
 * lekin-library is retagged.
 *
 * Opt-in, not part of the default `npm run test:unit`: requires a local
 * Python 3 with lekin-library importable. Set LEKINPY_SOURCE to the path
 * of the lekin-library checkout (containing the `lekinpy` package) to run
 * it, e.g.:
 *
 *   LEKINPY_SOURCE=../lekin-library npx vitest run lib/registry/verify.test.ts
 */
const LEKINPY_SOURCE = process.env.LEKINPY_SOURCE;

const CLASS_NAMES: Record<string, string> = {
  fcfs: "FCFSAlgorithm",
  spt: "SPTAlgorithm",
  edd: "EDDAlgorithm",
  wspt: "WSPTAlgorithm",
};

function readLiveMetadata(source: string, algorithmId: string): {
  id: string;
  display_name: string;
  supports_multi_operation: boolean;
  version: string;
} {
  const className = CLASS_NAMES[algorithmId];
  if (!className) throw new Error(`No known lekinpy class name for algorithm id '${algorithmId}'`);
  const script = [
    "import sys, json",
    `sys.path.insert(0, ${JSON.stringify(source)})`,
    `from lekinpy.algorithms.${algorithmId} import ${className}`,
    `print(json.dumps(${className}.metadata))`,
  ].join("\n");
  const output = execFileSync("python3", ["-c", script], { encoding: "utf-8" });
  return JSON.parse(output);
}

describe.skipIf(!LEKINPY_SOURCE)("algorithm registry vs. live lekinpy metadata", () => {
  for (const entry of ALGORITHM_REGISTRY) {
    it(`'${entry.id}' matches lekinpy's real SchedulingAlgorithm.metadata`, () => {
      const live = readLiveMetadata(LEKINPY_SOURCE!, entry.id);
      expect(entry.libraryMetadata).toEqual({
        id: live.id,
        displayName: live.display_name,
        supportsMultiOperation: live.supports_multi_operation,
        version: live.version,
      });
    });
  }
});
