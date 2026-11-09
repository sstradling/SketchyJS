import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";

/**
 * Package export smoke test.
 *
 * Packs every workspace package, installs the tarballs into a clean consumer project (no
 * workspace links), then checks that: every export resolves under Node ESM, TypeScript resolves
 * the types under NodeNext and Bundler, publint and are-the-types-wrong accept the tarball, the
 * published files contain only dist (and schemas), and tree shaking drops unused code.
 */
const root = fileURLToPath(new URL("../../", import.meta.url));
const keep = process.argv.includes("--keep");
const failures = [];
const report = [];

const fail = (message) => {
  failures.push(message);
  console.error(`FAIL ${message}`);
};

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  return { ok: result.status === 0, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

const pnpmBuild = run("pnpm", ["build"], { cwd: root });
if (!pnpmBuild.ok) {
  console.error(pnpmBuild.stdout, pnpmBuild.stderr);
  process.exit(1);
}

const work = mkdtempSync(join(tmpdir(), "sketchy-consumer-"));
const tarballs = join(work, "tarballs");
const consumer = join(work, "consumer");
mkdirSync(tarballs);
mkdirSync(consumer);

const packageDirs = readdirSync(join(root, "packages")).sort();
const manifests = new Map();
for (const dir of packageDirs) {
  const pkgDir = join(root, "packages", dir);
  const pack = run("pnpm", ["pack", "--pack-destination", tarballs], { cwd: pkgDir });
  if (!pack.ok) fail(`${dir}: pnpm pack failed\n${pack.stderr}`);
  manifests.set(dir, JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8")));
}

const files = readdirSync(tarballs).sort();
const tarballFor = (name) => files.find((f) => f.startsWith(`sketchy-${name}-`));

const dependencies = {};
for (const dir of packageDirs)
  dependencies[`@sketchy/${dir}`] = `file:${join(tarballs, tarballFor(dir))}`;
writeFileSync(
  join(consumer, "package.json"),
  JSON.stringify(
    { name: "consumer", private: true, type: "module", dependencies, overrides: dependencies },
    null,
    2,
  ),
);

const install = run(
  "npm",
  ["install", "--no-audit", "--no-fund", "--ignore-scripts", "--loglevel=error"],
  { cwd: consumer },
);
if (!install.ok) {
  console.error(install.stderr);
  fail("npm install of tarballs failed");
}

/** Public entry points and one symbol each must expose. Skeleton packages export nothing yet. */
const expectations = {
  "@sketchy/types": { symbols: [], skeleton: false, note: "types only" },
  "@sketchy/plugin": {
    symbols: [
      "defineBrush",
      "defineFill",
      "defineTexture",
      "defineStickerEdge",
      "s",
      "PLUGIN_API_VERSION",
    ],
  },
  "@sketchy/plugin/schema": {
    symbols: ["resolveOptions", "validateSchema", "toJsonSchema", "hashOptions", "checkPluginApi"],
  },
  "@sketchy/core": { symbols: ["SplitMix64", "Rng", "swiftUnitFloat"] },
  "@sketchy/core/options": { symbols: ["defaultSketchOptions", "applyRule", "SKETCH_OPTIONS"] },
};
const skeletons = [
  "fills",
  "brushes",
  "stickers",
  "scene",
  "svg-renderer",
  "canvas-renderer",
  "animate",
  "react",
  "web-components",
  "contrib",
];

writeFileSync(
  join(consumer, "check.mjs"),
  `const expectations = ${JSON.stringify(expectations)};
const skeletons = ${JSON.stringify(skeletons.map((s) => `@sketchy/${s}`))};
let bad = 0;
for (const [specifier, { symbols }] of Object.entries(expectations)) {
  const mod = await import(specifier);
  for (const symbol of symbols) if (!(symbol in mod)) { console.error("missing export", specifier, symbol); bad++; }
}
for (const specifier of skeletons) {
  const mod = await import(specifier);
  if (Object.keys(mod).length !== 0) { console.error("skeleton package now has exports; update the smoke test:", specifier); bad++; }
}
const { SplitMix64 } = await import("@sketchy/core");
const rng = new SplitMix64(42n);
const first = rng.nextU64();
if (first !== 13679457532755275413n) { console.error("SplitMix64(42) first value", first); bad++; }
const schemaUrl = import.meta.resolve("@sketchy/types/schemas/options.schema.json");
const { readFileSync } = await import("node:fs");
const schema = JSON.parse(readFileSync(new URL(schemaUrl), "utf8"));
if (!schema.definitions?.SketchOptions) { console.error("options schema not published"); bad++; }
if (bad) process.exit(1);
console.log("node ESM imports ok");
`,
);
const node = run("node", ["check.mjs"], { cwd: consumer });
if (!node.ok) fail(`node ESM import check failed\n${node.stderr}`);
else console.log(node.stdout.trim());

writeFileSync(
  join(consumer, "types-check.ts"),
  `import type { SketchOptions, Scene, PathOp } from "@sketchy/types";
import { defineBrush, s, type Resolved } from "@sketchy/plugin";
import { resolveOptions } from "@sketchy/plugin/schema";
import { Rng, SplitMix64 } from "@sketchy/core";
import { defaultSketchOptions } from "@sketchy/core/options";

const options: SketchOptions = defaultSketchOptions();
const op: PathOp = { op: "M", x: options.roughness, y: 0 };
const scene: Scene = { version: 1, size: { width: 1, height: 1 }, nodes: [] };
const schema = { passes: s.int({ default: 2, min: 1, max: 3, description: "Passes." }) } as const;
const brush = defineBrush({ id: "x", version: "1.0.0", api: "1.0", title: "X", description: "X", options: schema, generate: () => [] });
const resolved: Resolved<typeof schema> = resolveOptions(schema, {}).value;
const n: number = resolved.passes + new Rng(1).next();
const big: bigint = new SplitMix64(1n).nextU64();
export { op, scene, brush, n, big };
`,
);
for (const resolution of [
  ["NodeNext", "NodeNext"],
  ["ESNext", "Bundler"],
]) {
  writeFileSync(
    join(consumer, `tsconfig.${resolution[1]}.json`),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: resolution[0],
        moduleResolution: resolution[1],
        strict: true,
        noEmit: true,
        skipLibCheck: false,
        types: [],
        exactOptionalPropertyTypes: true,
        noUncheckedIndexedAccess: true,
      },
      files: ["types-check.ts"],
    }),
  );
  const tsc = run(
    "node",
    [
      join(root, "node_modules", "typescript", "bin", "tsc"),
      "-p",
      `tsconfig.${resolution[1]}.json`,
    ],
    { cwd: consumer },
  );
  if (!tsc.ok) fail(`tsc (${resolution[1]}) failed\n${tsc.stdout}${tsc.stderr}`);
  else console.log(`tsc ${resolution[1]} ok`);
}

for (const dir of packageDirs) {
  const installed = join(consumer, "node_modules", "@sketchy", dir);
  const publint = run(
    "node",
    [join(root, "node_modules", "publint", "src", "cli.js"), installed, "--strict"],
    { cwd: root },
  );
  if (!publint.ok) {
    const alt = run("pnpm", ["exec", "publint", installed, "--strict"], { cwd: root });
    if (!alt.ok) fail(`publint ${dir}\n${alt.stdout}${alt.stderr}`);
  }
}
console.log("publint ok");

for (const dir of packageDirs) {
  const attw = run(
    "pnpm",
    ["exec", "attw", join(tarballs, tarballFor(dir)), "--profile", "esm-only", "--format", "ascii"],
    { cwd: root },
  );
  if (!attw.ok) fail(`attw ${dir}\n${attw.stdout}${attw.stderr}`);
}
console.log("are-the-types-wrong ok");

for (const dir of packageDirs) {
  const list = run("tar", ["-tzf", join(tarballs, tarballFor(dir))]);
  const entries = list.stdout
    .split("\n")
    .filter(Boolean)
    .map((p) => p.replace(/^package\//, ""));
  const unexpected = entries.filter(
    (p) =>
      !(
        p === "package.json" ||
        p.startsWith("dist/") ||
        (dir === "types" && p.startsWith("schemas/")) ||
        /^(README|LICENSE)/i.test(p)
      ),
  );
  if (unexpected.length > 0) fail(`${dir}: unexpected files in tarball: ${unexpected.join(", ")}`);
  if (entries.some((p) => p.endsWith(".map") && !p.startsWith("dist/")))
    fail(`${dir}: stray source maps`);
}
console.log("tarball contents ok");

async function bundle(label, code, mustNotContain) {
  const result = await build({
    stdin: { contents: code, resolveDir: consumer, loader: "js" },
    bundle: true,
    minify: true,
    format: "esm",
    write: false,
    platform: "neutral",
    mainFields: ["module", "main"],
    conditions: ["import"],
  });
  const text = result.outputFiles[0].text;
  const gzip = gzipSync(text, { level: 9 }).length;
  report.push({ label, bytes: text.length, gzip });
  for (const needle of mustNotContain)
    if (text.includes(needle)) fail(`tree shaking: "${label}" bundle still contains ${needle}`);
}
await bundle(
  "core: SplitMix64 only",
  `import { SplitMix64 } from "@sketchy/core"; console.log(new SplitMix64(1n).nextU64());`,
  ["Box-Muller", "Math.cos", "FNV"],
);
await bundle(
  "plugin: s only",
  `import { s } from "@sketchy/plugin"; console.log(s.number({ default: 1, min: 0, max: 2, description: "x" }));`,
  ["deepFreeze", "~sketchy"],
);
await bundle(
  "plugin: defineBrush",
  `import { defineBrush } from "@sketchy/plugin"; console.log(defineBrush({ id: "a", version: "1.0.0", api: "1.0", title: "t", description: "d", options: {}, generate: () => [] }));`,
  ["PluginOptionError"],
);
await bundle(
  "plugin/schema: resolveOptions",
  `import { resolveOptions } from "@sketchy/plugin/schema"; console.log(resolveOptions({}, {}));`,
  ["PluginApiError"],
);
await bundle(
  "core/options: applyRule",
  `import { applyRule } from "@sketchy/core/options"; console.log(applyRule(1, { type: "float", default: 0, enforcedBy: "none", swift: "x" }));`,
  ["Options.roughness"],
);
console.log("bundle sizes (minified, gzip):");
for (const row of report)
  console.log(
    `  ${row.label.padEnd(34)} ${String(row.bytes).padStart(6)} B  ${String(row.gzip).padStart(5)} B gzip`,
  );

if (!keep) rmSync(work, { recursive: true, force: true });
else console.log(`kept ${work}`);

if (failures.length > 0) {
  console.error(`\n${failures.length} smoke failure(s)`);
  process.exit(1);
}
console.log("\nexport smoke tests passed");
