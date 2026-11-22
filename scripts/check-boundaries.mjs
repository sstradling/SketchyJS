import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));

/**
 * Relative module specifiers: static imports, re-exports, side-effect imports,
 * and dynamic import().
 * @param {string} text
 */
export function relativeSpecifiers(text) {
  const found = [];
  for (const match of text.matchAll(/from\s+["'](\.[^"']+)["']/g)) found.push(match[1]);
  for (const match of text.matchAll(/import\s*\(\s*["'](\.[^"']+)["']\s*\)/g)) found.push(match[1]);
  for (const match of text.matchAll(/(?:^|\n)\s*import\s+["'](\.[^"']+)["']/g))
    found.push(match[1]);
  return found;
}

/** @param {string} rel path under packages/sketchy/src */
export function areaOf(rel) {
  if (rel.startsWith("..")) return null;
  const [first, ...rest] = rel.split("/");
  return rest.length === 0 ? "root" : first;
}

/**
 * @param {{ rel: string, text: string }[]} files paths under src
 * @param {Record<string, string[]>} areas
 */
export function importProblems(files, areas) {
  const problems = [];
  for (const file of files) {
    const area = areaOf(file.rel);
    if (!area) continue;
    const allowed = new Set([area, ...(areas[area] ?? [])]);
    for (const spec of relativeSpecifiers(file.text)) {
      const target = resolve("/src", dirname(file.rel), spec).replace(/^\/src\/?/, "");
      const other = areaOf(target);
      if (other && !allowed.has(other))
        problems.push(`${file.rel}: ${area} cannot import ${other}`);
    }
    const clipperFile = file.rel.startsWith("stickers/clipper/");
    if (file.text.includes("clipper2-ts") && !clipperFile)
      problems.push(`${file.rel}: clipper2-ts is only allowed from stickers/clipper`);
  }
  return problems;
}

/**
 * @param {string[]} dirs first-level folders under src
 * @param {Record<string, string[]>} areas
 */
export function undeclaredAreaProblems(dirs, areas) {
  return dirs
    .filter((dir) => !Object.hasOwn(areas, dir))
    .map((dir) => `packages/sketchy/src/${dir} is not declared in tools/boundaries.json`);
}

/**
 * DOM globals are banned in every area that is not listed in domAreas.
 * A new folder therefore fails until someone names it as a DOM area.
 * @param {{ rel: string, text: string }[]} files
 * @param {{ areas: Record<string, string[]>, domAreas?: string[], bannedInPureGeometry: { globals: string[], members: string[], newExpressions: string[] } }} boundaries
 */
export function domProblems(files, boundaries) {
  const dom = new Set(boundaries.domAreas ?? []);
  const { globals, members, newExpressions } = boundaries.bannedInPureGeometry;
  const problems = [];
  for (const file of files) {
    const area = areaOf(file.rel);
    if (!area || dom.has(area)) continue;
    for (const hit of bannedHits(file.text, { globals, members, newExpressions }))
      problems.push(`${file.rel}: ${area} cannot use ${hit}`);
  }
  return problems;
}

/**
 * @param {string} text
 * @param {{ globals: string[], members: string[], newExpressions: string[] }} banned
 */
export function bannedHits(text, banned) {
  const source = ts.createSourceFile(
    "file.ts",
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const declared = new Set();
  const collect = (node) => {
    if (ts.isIdentifier(node) && isBindingName(node)) declared.add(node.text);
    ts.forEachChild(node, collect);
  };
  collect(source);
  const hits = [];
  const visit = (node) => {
    if (
      ts.isIdentifier(node) &&
      !isPropertyName(node) &&
      !declared.has(node.text) &&
      banned.globals.includes(node.text)
    ) {
      hits.push(node.text);
    }
    if (
      (ts.isPropertyAccessExpression(node) || ts.isPropertyAccessChain(node)) &&
      ts.isIdentifier(node.expression)
    ) {
      const path = `${node.expression.text}.${node.name.text}`;
      if (banned.members.includes(path)) hits.push(path);
    }
    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      banned.newExpressions.includes(node.expression.text)
    )
      hits.push(`new ${node.expression.text}`);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return hits;
}

/** @param {ts.Identifier} node */
function isBindingName(node) {
  const parent = node.parent;
  if (!parent) return false;
  if (ts.isVariableDeclaration(parent) && parent.name === node) return true;
  if (ts.isParameter(parent) && parent.name === node) return true;
  if (ts.isBindingElement(parent) && parent.name === node) return true;
  if (ts.isFunctionDeclaration(parent) && parent.name === node) return true;
  if (ts.isClassDeclaration(parent) && parent.name === node) return true;
  if (ts.isImportClause(parent) || ts.isImportSpecifier(parent) || ts.isNamespaceImport(parent))
    return true;
  return false;
}

/** @param {ts.Identifier} node */
function isPropertyName(node) {
  const parent = node.parent;
  if (!parent) return false;
  if (
    (ts.isPropertyAccessExpression(parent) || ts.isPropertyAccessChain(parent)) &&
    parent.name === node
  )
    return true;
  if (ts.isPropertySignature(parent) && parent.name === node) return true;
  if (ts.isPropertyAssignment(parent) && parent.name === node) return true;
  if (ts.isMethodSignature(parent) && parent.name === node) return true;
  if (ts.isMethodDeclaration(parent) && parent.name === node) return true;
  return ts.isQualifiedName(parent) && parent.right === node;
}

/**
 * @param {string} name
 * @param {Record<string, unknown>} pkg
 */
export function packageProblems(name, pkg) {
  const problems = [];
  if (pkg.name !== `@sketchy-js/${name}`)
    problems.push(`${name}: name must be @sketchy-js/${name}`);
  if (pkg.sideEffects !== false) problems.push(`${name}: sideEffects must be false`);
  if (name === "sketchy") {
    const peers = Object.keys(pkg.peerDependencies ?? {});
    if (peers.length > 0) problems.push("sketchy: peerDependencies must be empty");
    if (!Object.hasOwn(pkg.dependencies ?? {}, "clipper2-ts"))
      problems.push("sketchy: clipper2-ts must be a regular dependency");
  }
  if (name === "react") {
    const deps = Object.keys(pkg.dependencies ?? {});
    if (deps.length !== 1 || deps[0] !== "@sketchy-js/sketchy")
      problems.push("react: dependencies must be only @sketchy-js/sketchy");
    const peers = Object.keys(pkg.peerDependencies ?? {});
    if (peers.length !== 1 || peers[0] !== "react") problems.push("react: the only peer is react");
  }
  return problems;
}

/** Problems for the repository as it is on disk. */
export function collectRepoProblems(repo = root) {
  const boundaries = JSON.parse(readFileSync(join(repo, "tools", "boundaries.json"), "utf8"));
  const problems = [];
  const declared = Object.keys(boundaries.packages).sort();
  const dirs = readdirSync(join(repo, "packages"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const name of dirs.filter((dir) => !declared.includes(dir)))
    problems.push(`packages/${name} is not declared in tools/boundaries.json`);
  for (const name of declared.filter((dir) => !dirs.includes(dir)))
    problems.push(`tools/boundaries.json declares ${name} but packages/${name} does not exist`);
  for (const name of declared) {
    const pkg = JSON.parse(readFileSync(join(repo, "packages", name, "package.json"), "utf8"));
    problems.push(...packageProblems(name, pkg));
  }

  const srcRoot = join(repo, "packages/sketchy/src");
  const areaDirs = readdirSync(srcRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  problems.push(...undeclaredAreaProblems(areaDirs, boundaries.areas));

  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".ts"))
        files.push({
          rel: relative(srcRoot, path).split("\\").join("/"),
          text: readFileSync(path, "utf8"),
        });
    }
  };
  walk(srcRoot);
  problems.push(...importProblems(files, boundaries.areas));
  problems.push(...domProblems(files, boundaries));
  return problems;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const problems = collectRepoProblems();
  if (problems.length > 0) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  const boundaries = JSON.parse(readFileSync(join(root, "tools", "boundaries.json"), "utf8"));
  console.log(
    `boundaries ok: ${Object.keys(boundaries.packages).length} packages, ${Object.keys(boundaries.areas).length} areas`,
  );
}
