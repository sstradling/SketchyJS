import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const boundaries = JSON.parse(readFileSync(join(root, "tools", "boundaries.json"), "utf8"));
const problems = [];
const declared = Object.keys(boundaries.packages).sort();
const dirs = readdirSync(join(root, "packages"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
for (const name of dirs.filter((dir) => !declared.includes(dir)))
  problems.push(`packages/${name} is not declared in tools/boundaries.json`);
for (const name of declared.filter((dir) => !dirs.includes(dir)))
  problems.push(`tools/boundaries.json declares ${name} but packages/${name} does not exist`);

for (const name of declared) {
  const pkg = JSON.parse(readFileSync(join(root, "packages", name, "package.json"), "utf8"));
  if (pkg.name !== `@sketchy-js/${name}`)
    problems.push(`${name}: name must be @sketchy-js/${name}`);
  if (pkg.sideEffects !== false) problems.push(`${name}: sideEffects must be false`);
  const used = Object.keys({
    ...pkg.dependencies,
    ...pkg.peerDependencies,
    ...pkg.devDependencies,
  }).filter((dep) => dep.startsWith("@sketchy-js/"));
  const allowed = new Set(
    (boundaries.packages[name].dependencies ?? []).map((dep) => `@sketchy-js/${dep}`),
  );
  if (name === "react") allowed.add("@sketchy-js/sketchy");
  for (const dep of used) {
    const base = dep.startsWith("@sketchy-js/sketchy") ? "@sketchy-js/sketchy" : dep;
    if (!allowed.has(base) && dep !== "@sketchy-js/sketchy")
      problems.push(`${name}: ${dep} is not an allowed dependency`);
  }
}

const srcRoot = join(root, "packages/sketchy/src");
function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else if (entry.name.endsWith(".ts")) out.push(path);
  }
  return out;
}

function areaOf(file) {
  const rel = relative(srcRoot, file);
  if (rel.startsWith("..")) return null;
  const [first, ...rest] = rel.split("/");
  return rest.length === 0 ? "root" : first;
}

for (const file of walk(srcRoot)) {
  const area = areaOf(file);
  const allowed = new Set([area, ...(boundaries.areas[area] ?? [])]);
  const text = readFileSync(file, "utf8");
  for (const match of text.matchAll(/from\s+["'](\.[^"']+)["']/g)) {
    const target = resolve(dirname(file), match[1]);
    const other = areaOf(target);
    if (other && !allowed.has(other))
      problems.push(`${relative(root, file)}: ${area} cannot import ${other}`);
  }
  if (
    area === "stickers" &&
    !file.includes(`${join("stickers", "clipper")}`) &&
    text.includes("clipper2-ts")
  )
    problems.push(`${relative(root, file)}: clipper2-ts is only allowed from the clipper subpath`);
  if (area !== "stickers" && text.includes("clipper2-ts"))
    problems.push(`${relative(root, file)}: clipper2-ts is only allowed from stickers/clipper`);
}

if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(
  `boundaries ok: ${dirs.length} packages, ${Object.keys(boundaries.areas).length} areas`,
);
