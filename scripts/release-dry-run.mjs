import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Release dry run. Prints the plan and exits.
 * It does not run `npm publish`, `git tag`, or `gh release create`.
 *
 * A real release is `.github/workflows/release.yml` with the dry-run input off.
 * `--gate --expect <version>` refuses a non-semver expect, 0.0.0, a mismatch,
 * a version other than the one the workflow was given, and any pending
 * changeset. The release PR runs `changeset version` first, so nothing is
 * pending when this gate runs.
 */

/** Strict semver, including a prerelease or build, and not a `v` prefix. */
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

function flagValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) return undefined;
  return value;
}

const root = flagValue("--root") ?? fileURLToPath(new URL("../", import.meta.url));
const packages = readdirSync(join(root, "packages")).sort();
const versions = new Map();
for (const dir of packages) {
  const manifest = JSON.parse(readFileSync(join(root, "packages", dir, "package.json"), "utf8"));
  versions.set(manifest.name, manifest.version);
}
const unique = [...new Set(versions.values())];
if (unique.length !== 1) {
  console.error("package versions differ", Object.fromEntries(versions));
  process.exit(1);
}
const version = unique[0];
const gate = process.argv.includes("--gate");
const expected = flagValue("--expect");
if (process.argv.includes("--expect") && (expected === undefined || !SEMVER.test(expected))) {
  console.error("refusing to publish: --expect must be strict semver, for example 1.6.0");
  process.exit(1);
}
const pending = readdirSync(join(root, ".changeset")).filter(
  (name) => name.endsWith(".md") && name !== "README.md",
);
console.log(`versions: ${version} across ${versions.size} packages`);
console.log(`pending changesets: ${pending.length}`);
if (gate) {
  if (!expected || expected.startsWith("--")) {
    console.error("refusing to publish: --gate requires --expect <version>");
    process.exit(1);
  }
  if (version === "0.0.0" || expected === "0.0.0") {
    console.error("refusing to publish: versions are still 0.0.0");
    process.exit(1);
  }
  if (version !== expected) {
    console.error(`refusing to publish: expected ${expected}, got ${version}`);
    process.exit(1);
  }
  if (pending.length > 0) {
    console.error(`refusing to publish: ${pending.length} changeset(s) are still pending`);
    process.exit(1);
  }
} else if (version === "0.0.0") {
  console.log("dry run only: versions are still 0.0.0, so this is not a release");
  console.log("a real release passes --gate --expect <version> and refuses 0.0.0 before publish");
}

const tags = spawnSync("git", ["tag", "--list", "v*"], { cwd: root, encoding: "utf8" });
console.log(`existing v-tags: ${tags.stdout.trim() || "(none)"}`);
console.log("dry run complete: no publish, no tag, no GitHub release");
