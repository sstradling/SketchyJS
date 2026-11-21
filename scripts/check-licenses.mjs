import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * `npm pack` and `pnpm pack` include LICENSE only when that file is in the
 * package directory. Neither copies the repo-root LICENSE. Each publishable
 * package keeps its own copy, and this check fails when a copy drifts.
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
