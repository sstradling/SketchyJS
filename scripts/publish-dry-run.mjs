import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Publish metadata check. It does not upload, tag, or create a release.
 *
 * Each public package must carry `repository.url` `git+https://github.com/sstradling/SketchyJS.git`,
 * a `directory`, `homepage`, and `bugs`. `npm publish --dry-run` then packs that
 * package the way a real publish would. Provenance attestations themselves are
 * minted only on GitHub Actions (`NPM_CONFIG_PROVENANCE=true` in the release
 * workflow); this script checks the repository URL that attestation requires.
 */

const root = fileURLToPath(new URL("../", import.meta.url));
const repository = "git+https://github.com/sstradling/SketchyJS.git";
const failures = [];

for (const dir of readdirSync(join(root, "packages")).sort()) {
  const pkgDir = join(root, "packages", dir);
  const manifest = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
  if (manifest.private) continue;
  const where = `packages/${dir}/package.json`;
  if (manifest.repository?.url !== repository) failures.push(`${where}: repository.url`);
  if (manifest.repository?.directory !== `packages/${dir}`)
    failures.push(`${where}: repository.directory`);
  if (manifest.homepage !== "https://github.com/sstradling/SketchyJS#readme")
    failures.push(`${where}: homepage`);
  if (manifest.bugs?.url !== "https://github.com/sstradling/SketchyJS/issues")
    failures.push(`${where}: bugs.url`);
  const dry = spawnSync("npm", ["publish", "--dry-run", "--json"], {
    cwd: pkgDir,
    encoding: "utf8",
  });
  if (dry.status !== 0) failures.push(`${dir}: npm publish --dry-run failed\n${dry.stderr}`);
  else console.log(`${manifest.name}: dry-run ok`);
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("publish dry-run ok: no upload. Provenance is left to the release workflow.");
