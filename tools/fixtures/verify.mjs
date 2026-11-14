import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildManifest } from "./build-manifest.mjs";
import { referenceDir, upstream } from "./lib.mjs";

/** Cases added beside the original contour file. Order is part of the fixture. */
const phase3CaseIds = [
  "torn-chop",
  "paper-fibers",
  "hole-smaller-than-margin",
  "open-ribbon",
  "smoothness-0.5",
  "smoothness-1.5",
  "group-hole",
  "group-transform",
  "group-torn",
  "image-hole",
  "group-overlapping",
  "group-corner-sharing",
  "group-torn-2",
  "group-torn-3",
  "group-torn-4",
];

/**
 * Checks the Phase 3 Darwin addition. A sandbox that only copied the Linux groups
 * does not have this file, and that is not a failure.
 */
function verifyPhase3(dir) {
  const file = join(dir, "stickers/phase3.json");
  if (!existsSync(file)) {
    return dir === referenceDir ? ["stickers/phase3.json is missing"] : [];
  }
  const problems = [];
  const text = readFileSync(file, "utf8");
  if (/\b(generatedAt|timestamp|createdAt|hostname)\b/i.test(text) || /\/Users\/|\/tmp\/|\/home\//.test(text)) {
    problems.push("stickers/phase3.json contains a host path or timestamp");
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return ["stickers/phase3.json is not JSON"];
  }
  const provenance = parsed.provenance ?? {};
  if (provenance.commit !== upstream.commit) problems.push("stickers/phase3.json is not pinned to the Sketchy commit");
  if (provenance.tag !== upstream.tag) problems.push("stickers/phase3.json is not pinned to the Sketchy tag");
  if (provenance.platform !== "darwin-x86_64" || provenance.arch !== "x86_64" || provenance.os !== "darwin") {
    problems.push("stickers/phase3.json provenance is not darwin-x86_64");
  }
  if (provenance.sdk !== "iphonesimulator") problems.push("stickers/phase3.json provenance is not the iOS simulator");
  if (!provenance.xcode || !provenance.simulator || !provenance.simulatorRuntime || !provenance.swift) {
    problems.push("stickers/phase3.json provenance is missing Xcode, simulator, or Swift");
  }
  const cases = Array.isArray(parsed.cases) ? parsed.cases : [];
  const ids = cases.map((item) => item.id);
  if (ids.join(",") !== phase3CaseIds.join(",")) {
    problems.push(`stickers/phase3.json cases are ${ids.join(", ")}`);
  }
  for (const item of cases) {
    if (!Array.isArray(item.commands) || item.commands.length === 0) problems.push(`${item.id}: no commands`);
    if (!Array.isArray(item.centerlines) || item.centerlines.length === 0) problems.push(`${item.id}: no centerlines`);
  }
  const clamped = cases.find((item) => item.id === "smoothness-1.5");
  if (clamped && clamped.storedSmoothness !== 1) {
    problems.push("smoothness-1.5 must record StickerBacking's clamp to 1");
  }
  for (const id of ["group-torn", "group-torn-2", "group-torn-3", "group-torn-4"]) {
    const item = cases.find((entry) => entry.id === id);
    if (!item) continue;
    for (const key of ["parts", "groupTransform", "preSimplifyRings", "simplifyEpsilon", "offsetBeforeTear"]) {
      if (item[key] === undefined || item[key] === null) problems.push(`${id} is missing ${key}`);
    }
    if (item.simplifyEpsilon !== 1.8) problems.push(`${id} simplifyEpsilon is not 1.8`);
    if (!Array.isArray(item.parts) || item.parts.length === 0) problems.push(`${id} has no parts`);
    for (const ring of item.preSimplifyRings ?? []) {
      if (ring.startIndex !== 0 || !Array.isArray(ring.points) || ring.points.length < 3) {
        problems.push(`${id} preSimplify ring is missing its Swift start vertex`);
      }
    }
    if (!Array.isArray(item.offsetBeforeTear) || item.offsetBeforeTear.length === 0) {
      problems.push(`${id} has no offsetBeforeTear ring`);
    }
  }
  return problems;
}

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
  problems.push(...verifyPhase3(dir));
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
