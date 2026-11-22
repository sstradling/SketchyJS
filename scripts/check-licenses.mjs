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
const notices = readFileSync(join(root, "THIRD_PARTY_NOTICES"), "utf8");
if (!notices.includes("@resvg/resvg-js") || !notices.includes("fixtures/swift-reference"))
  problems.push("root THIRD_PARTY_NOTICES no longer records the dev-only notices");
const shippedPath = join(root, "packages", "sketchy", "THIRD_PARTY_NOTICES");
if (!existsSync(shippedPath)) problems.push("sketchy: missing THIRD_PARTY_NOTICES");
else {
  const shipped = readFileSync(shippedPath, "utf8");
  for (const required of ["Boost Software License", "Khoa Pham", "Preet Shihn", "clipper2-ts"]) {
    if (!shipped.includes(required))
      problems.push(`sketchy: THIRD_PARTY_NOTICES is missing ${required}`);
  }
  for (const dropped of ["@resvg/resvg-js", "clipper2-wasm", "fixtures/"]) {
    if (shipped.includes(dropped))
      problems.push(
        `sketchy: THIRD_PARTY_NOTICES still mentions ${dropped}, which is not in the tarball`,
      );
  }
}
const reactNotices = join(root, "packages", "react", "THIRD_PARTY_NOTICES");
if (existsSync(reactNotices))
  problems.push("react: ships no third-party code, so it must not include THIRD_PARTY_NOTICES");
if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log("package LICENSE files match the repo root");
