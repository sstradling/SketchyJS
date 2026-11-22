import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The public exports, the tsup entry map, and typedoc entryPoints are one list.
 * A new subpath has to be added to all three.
 */

/** @param {string} source */
export function tsupEntries(source) {
  const fillsBlock = source.match(/const fills = \[([\s\S]*?)\];/);
  const fills = fillsBlock
    ? [...fillsBlock[1].matchAll(/"([^"]+)"/g)].map((match) => match[1])
    : [];
  const entryBlock = source.match(/entry:\s*\{([\s\S]*?)\n {2}\},/);
  if (!entryBlock) throw new Error("tsup entry block not found");
  /** @type {Record<string, string>} */
  const entries = {};
  for (const match of entryBlock[1].matchAll(
    /(?:["']([^"']+)["']|([A-Za-z0-9_]+))\s*:\s*["'](src\/[^"']+)["']/g,
  )) {
    entries[match[1] || match[2]] = match[3];
  }
  for (const name of fills) entries[`fills/${name}`] = `src/fills/${name}.ts`;
  return entries;
}

/**
 * @param {{ exportsMap: Record<string, unknown>, typedocEntryPoints: string[], tsupSource: string }} input
 */
export function entryProblems(input) {
  const entries = tsupEntries(input.tsupSource);
  const problems = [];
  const fromPkg = Object.keys(input.exportsMap)
    .filter((key) => key !== "./package.json" && !key.includes("*"))
    .sort();
  const fromTsup = Object.keys(entries)
    .map((key) => (key === "index" ? "." : `./${key}`))
    .sort();
  if (fromPkg.join("\n") !== fromTsup.join("\n")) {
    problems.push(
      `package exports and tsup entries differ\nexports: ${fromPkg.join(", ")}\ntsup: ${fromTsup.join(", ")}`,
    );
  }
  const built = Object.values(entries).sort();
  const documented = [...input.typedocEntryPoints].sort();
  if (built.join("\n") !== documented.join("\n")) {
    problems.push(
      `typedoc entryPoints and tsup entries differ\ntypedoc: ${documented.join(", ")}\ntsup: ${built.join(", ")}`,
    );
  }
  return problems;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const pkg = JSON.parse(readFileSync(join(root, "packages/sketchy/package.json"), "utf8"));
  const typedoc = JSON.parse(readFileSync(join(root, "packages/sketchy/typedoc.json"), "utf8"));
  const tsupSource = readFileSync(join(root, "packages/sketchy/tsup.config.ts"), "utf8");
  const problems = entryProblems({
    exportsMap: pkg.exports,
    typedocEntryPoints: typedoc.entryPoints,
    tsupSource,
  });
  if (problems.length > 0) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  console.log(`typedoc entries match ${Object.keys(pkg.exports).length} sketchy export keys`);
}
