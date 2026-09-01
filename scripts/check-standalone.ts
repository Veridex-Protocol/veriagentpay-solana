import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const searchableExtensions = new Set([
  ".cjs",
  ".js",
  ".json",
  ".jsx",
  ".mjs",
  ".rs",
  ".ts",
  ".tsx",
  ".toml",
  ".yaml",
  ".yml",
]);
const ignoredDirectories = new Set([
  ".git",
  ".next",
  "coverage",
  "dist",
  "node_modules",
  "target",
  "test-ledger",
]);
const relativeReference = /["']((?:\.\.\/)+[^"']+)["']/g;

async function collectFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) {
      continue;
    }

    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(path)));
    } else if (searchableExtensions.has(extname(entry.name))) {
      files.push(path);
    }
  }

  return files;
}

const violations: string[] = [];
for (const file of await collectFiles(root)) {
  const content = await readFile(file, "utf8");
  for (const match of content.matchAll(relativeReference)) {
    const reference = match[1];
    if (!reference) continue;
    const target = resolve(dirname(file), reference);
    const fromRoot = relative(root, target);
    if (fromRoot === ".." || fromRoot.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(fromRoot)) {
      violations.push(`${relative(root, file)} -> ${reference}`);
    }
  }
}

if (violations.length > 0) {
  console.error("Standalone boundary violations:");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log(`Standalone boundary valid (${root})`);