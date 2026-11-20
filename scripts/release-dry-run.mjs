import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Release dry run. Prints the plan and exits.
 * It does not run `npm publish`, `git tag`, or `gh release create`.
 *
 * A real release is `.github/workflows/release.yml` with the dry-run input off,
 * and only after every package version is the same `1.6.0`.
 */

const root = fileURLToPath(new URL("../", import.meta.url));
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
console.log(`versions: ${version} across ${versions.size} packages`);
if (version === "0.0.0") {
  console.log("refusing to tag or publish: versions are still 0.0.0");
  console.log(
    "the release PR sets 1.6.0 explicitly. A Changesets bump from 0.0.0 would publish 0.1.0.",
  );
} else if (version !== "1.6.0") {
  console.error(`refusing: expected 0.0.0 (this phase) or 1.6.0 (the release), got ${version}`);
  process.exit(1);
}

const tags = spawnSync("git", ["tag", "--list", "v*"], { cwd: root, encoding: "utf8" });
console.log(`existing v-tags: ${tags.stdout.trim() || "(none)"}`);
console.log("dry run complete: no publish, no tag, no GitHub release");
