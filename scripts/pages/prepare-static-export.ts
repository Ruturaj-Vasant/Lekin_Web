import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const outputDirectory = path.resolve("dist/client");
const repositoryName = process.env.GITHUB_REPOSITORY?.split("/").at(-1) ?? "Lekin_Web";
const basePath = `/${repositoryName}`;

async function htmlFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return htmlFiles(entryPath);
    return entry.isFile() && entry.name.endsWith(".html") ? [entryPath] : [];
  }));
  return nested.flat();
}

const files = await htmlFiles(outputDirectory);
if (!files.some((file) => file === path.join(outputDirectory, "index.html"))) {
  throw new Error("GitHub Pages export is missing dist/client/index.html");
}

for (const file of files) {
  const source = await readFile(file, "utf8");
  const prepared = source
    .replaceAll('href="/assets/', `href="${basePath}/assets/`)
    .replaceAll("url(/assets/", `url(${basePath}/assets/`);
  await writeFile(file, prepared);

  if (prepared.includes('href="/assets/') || prepared.includes("url(/assets/")) {
    throw new Error(`Unprefixed asset URL remains in ${path.relative(outputDirectory, file)}`);
  }
}

await writeFile(path.join(outputDirectory, ".nojekyll"), "");

const requiredFiles = [
  "favicon.svg",
  "vendor/lekinpy-0.2.0-py3-none-any.whl",
  "vendor/lekinpy-0.2.0-py3-none-any.whl.sha256",
];
for (const requiredFile of requiredFiles) {
  await readFile(path.join(outputDirectory, requiredFile));
}

console.log(`Prepared ${files.length} static pages for ${basePath}.`);
