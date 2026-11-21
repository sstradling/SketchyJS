import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * `pnpm pack` copies the repo-root LICENSE into a package tarball. `npm pack`
 * and other pack tools do not. Each publishable package keeps its own copy so
 * the package is self-contained, and this check fails when a copy drifts.
 */

const root = fileURLToPath(new URL("../", import.meta.url));
const license = readFileSync(join(root, "LICENSE"), "utf8");
const problems = [];
for (const dir of readdirSync(join(root, "packages")).sort()) {
  const manifestPath = join(root, "packages", dir, "package.json");
  if (!existsSync(manifestPath)) continue;
  const pkg = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (pkg.private) continue;
  const copy = join(root, "packages", dir, "LICENSE");
  if (!existsSync(copy)) problems.push(`${dir}: missing LICENSE`);
  else if (readFileSync(copy, "utf8") !== license)
    problems.push(`${dir}: LICENSE differs from the repo root`);
}
if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log("package LICENSE files match the repo root");
