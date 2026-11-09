import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const boundaries = JSON.parse(readFileSync(join(root, "tools", "boundaries.json"), "utf8"));
const problems = [];

const dirs = readdirSync(join(root, "packages"), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();
const declared = Object.keys(boundaries.packages).sort();
for (const name of dirs.filter((d) => !declared.includes(d)))
  problems.push(`packages/${name} is not declared in tools/boundaries.json`);
for (const name of declared.filter((d) => !dirs.includes(d)))
  problems.push(`tools/boundaries.json declares ${name} but packages/${name} does not exist`);

const graph = new Map();
for (const name of dirs.filter((d) => declared.includes(d))) {
  const rule = boundaries.packages[name];
  const pkgPath = join(root, "packages", name, "package.json");
  if (!existsSync(pkgPath)) {
    problems.push(`packages/${name}/package.json is missing`);
    continue;
  }
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  const where = `packages/${name}/package.json`;
  if (pkg.name !== `@sketchy/${name}`) problems.push(`${where}: name must be @sketchy/${name}`);
  if (pkg.type !== "module") problems.push(`${where}: type must be "module"`);
  if (pkg.sideEffects !== false) problems.push(`${where}: sideEffects must be false`);
  const root_ = pkg.exports?.["."];
  if (!root_?.types || !root_?.import)
    problems.push(`${where}: exports["."] needs "types" and "import"`);
  for (const [key, value] of Object.entries(pkg.exports ?? {})) {
    if (typeof value === "string" && !value.startsWith("./"))
      problems.push(`${where}: exports["${key}"] must be relative`);
  }
  const sketchy = (record = {}) =>
    Object.keys(record)
      .filter((k) => k.startsWith("@sketchy/"))
      .map((k) => k.slice("@sketchy/".length));
  const allowed = new Set([
    ...rule.dependencies,
    ...(rule.peers ?? []),
    ...(rule.optionalPeers ?? []),
  ]);
  const used = [
    ...sketchy(pkg.dependencies),
    ...sketchy(pkg.peerDependencies),
    ...sketchy(pkg.devDependencies),
  ];
  for (const dep of used)
    if (!allowed.has(dep))
      problems.push(
        `${where}: @sketchy/${dep} is not an allowed dependency (tools/boundaries.json)`,
      );
  for (const dep of rule.dependencies)
    if (!sketchy(pkg.dependencies).includes(dep))
      problems.push(`${where}: missing dependency @sketchy/${dep}`);
  for (const dep of rule.peers ?? [])
    if (!sketchy(pkg.peerDependencies).includes(dep))
      problems.push(`${where}: missing peer dependency @sketchy/${dep}`);
  graph.set(name, [...rule.dependencies, ...(rule.peers ?? []), ...(rule.optionalPeers ?? [])]);
}

function findCycle() {
  const state = new Map();
  const visit = (node, path) => {
    if (state.get(node) === 1) return [...path, node];
    if (state.get(node) === 2) return null;
    state.set(node, 1);
    for (const next of graph.get(node) ?? []) {
      const cycle = visit(next, [...path, node]);
      if (cycle) return cycle;
    }
    state.set(node, 2);
    return null;
  };
  for (const node of graph.keys()) {
    const cycle = visit(node, []);
    if (cycle) return cycle;
  }
  return null;
}
const cycle = findCycle();
if (cycle) problems.push(`dependency cycle: ${cycle.join(" -> ")}`);

if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`boundaries ok: ${dirs.length} packages`);
