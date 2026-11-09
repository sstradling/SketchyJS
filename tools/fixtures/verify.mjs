import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildManifest } from "./build-manifest.mjs";
import { referenceDir, upstream } from "./lib.mjs";

/** Returns a list of problems with the committed manifest; empty means it matches the files on disk. */
export function verifyManifest(dir = referenceDir) {
  const problems = [];
  const manifestPath = join(dir, "manifest.json");
  if (!existsSync(manifestPath)) return ["manifest.json is missing; run pnpm fixtures:manifest"];
  const committed = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (committed.source?.commit !== upstream.commit || committed.source?.tag !== upstream.tag) {
    problems.push(`manifest is not pinned to ${upstream.tag} (${upstream.commit})`);
  }
  if (/\b(generatedAt|timestamp|createdAt|hostname)\b/i.test(JSON.stringify(committed))) {
    problems.push("manifest contains a timestamp or host field");
  }
  const fresh = buildManifest(dir);
  const byPath = new Map(committed.files.map((f) => [f.path, f]));
  for (const file of fresh.files) {
    const old = byPath.get(file.path);
    if (!old) problems.push(`${file.path}: on disk but not in manifest`);
    else if (old.sha256 !== file.sha256) problems.push(`${file.path}: hash differs from manifest`);
    byPath.delete(file.path);
  }
  for (const path of byPath.keys()) problems.push(`${path}: in manifest but missing on disk`);
  if (committed.treeSha256 !== fresh.treeSha256) problems.push("treeSha256 differs from manifest");
  return problems;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const problems = verifyManifest();
  if (problems.length > 0) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  console.log("fixtures: manifest matches files on disk");
}
