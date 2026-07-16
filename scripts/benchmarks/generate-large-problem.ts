import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serializeProblem } from "../../lib/import-export/problem-json";
import { createLargeProblem } from "./large-problem";

const here = dirname(fileURLToPath(import.meta.url));
const output = resolve(here, "../../examples/large-browser-study-500-operations.lekin.json");
const problem = createLargeProblem({
  jobs: 100,
  operationsPerJob: 5,
  workcenters: 25,
  machinesPerWorkcenter: 2,
});

await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${serializeProblem(problem, "2026-07-16T00:00:00.000Z")}\n`);
console.log(output);

