import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildManifest, buildV16Manifest } from "./build-manifest.mjs";
import { diffReference } from "./diff-v16.mjs";
import { referenceDir, referenceV16Dir, upstream, upstreamV16 } from "./lib.mjs";

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

const v16FeatureCases = {
  "fills/contour.json": [
    "contour-intensity-0",
    "contour-intensity-middle",
    "contour-intensity-1",
    "contour-intensity-ramp",
    "contour-falloff",
    "contour-animated",
    "contour-svg-hole",
    "contour-short-clip",
    "contour-wash-passes",
  ],
  "fills/wash.json": ["wash-default", "wash-sky", "wash-scatter", "wash-trim", "wash-bow"],
  "fills/interior-shades.json": ["shade-pit-shadow", "shade-pit-recess", "shade-edge", "shade-halo", "shade-hole"],
  "strokes/closed-width.json": [
    "width-samples-stops",
    "width-samples-variable",
    "closed-ring-stops",
    "closed-ring-variable",
    "closed-crayon-ring",
    "closed-ring-same-seed",
  ],
  "stickers/silhouette-shadow.json": ["silhouette-affine", "silhouette-tree"],
};

const v16Replay = [
  "darwin/rng/splitmix64.json",
  "darwin/rng/unit-float.json",
  "darwin/options/defaults.json",
  "darwin/options/clamps.json",
  "darwin/shapes/shapes.json",
  "darwin/fills/fills.json",
  "darwin/fills/direct-fillers.json",
  "darwin/fills/scribble.json",
  "darwin/svg/path-parse.json",
  "strokes/outlines.json",
  "brushes/crayon-watercolor.json",
  "stickers/contours.json",
  "stickers/image-placement.json",
  "stickers/phase3.json",
  "animation/frames.json",
  "text/outlines.json",
];

function caseIds(parsed) {
  return Array.isArray(parsed.cases) ? parsed.cases.map((item) => item.id) : [];
}

/** Checks the Sketchy 1.6.0 Darwin corpus, including the replay of the v1.5.0 case list. */
export function verifyV160(dir = referenceV16Dir) {
  const problems = [];
  if (!existsSync(dir)) return ["v1.6.0 fixture directory is missing"];
  const manifestPath = join(dir, "manifest.json");
  if (!existsSync(manifestPath)) return ["v1.6.0 manifest.json is missing"];
  const committed = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (committed.source?.commit !== upstreamV16.commit || committed.source?.tag !== upstreamV16.tag) {
    problems.push(`v1.6.0 manifest is not pinned to ${upstreamV16.tag} (${upstreamV16.commit})`);
  }
  if (/\b(generatedAt|timestamp|createdAt|hostname)\b/i.test(JSON.stringify(committed))) {
    problems.push("v1.6.0 manifest contains a timestamp or host field");
  }
  const fresh = buildV16Manifest(dir);
  if (committed.treeSha256 !== fresh.treeSha256) problems.push("v1.6.0 treeSha256 differs from manifest");
  const provenancePath = join(dir, "provenance.json");
  if (!existsSync(provenancePath)) return [...problems, "v1.6.0 provenance.json is missing"];
  const provenance = JSON.parse(readFileSync(provenancePath, "utf8"));
  if (provenance.commit !== upstreamV16.commit || provenance.tag !== upstreamV16.tag) {
    problems.push("v1.6.0 provenance is not pinned to the Sketchy commit");
  }
  if (provenance.os !== "darwin" || provenance.sdk !== "iphonesimulator" || provenance.minimumOS !== "17.0") {
    problems.push("v1.6.0 provenance is missing darwin, the simulator SDK, or minimum OS 17.0");
  }
  if (provenance.platform !== `darwin-${provenance.arch}`) problems.push("v1.6.0 provenance platform does not match arch");
  if (provenance.hashing !== "SWIFT_DETERMINISTIC_HASHING=1") problems.push("v1.6.0 provenance hashing is not pinned");
  for (const field of ["xcode", "simulator", "simulatorRuntime", "swift", "sdkVersion", "arch"]) {
    if (!provenance[field]) problems.push(`v1.6.0 provenance is missing ${field}`);
  }
  for (const [path, expected] of Object.entries(v16FeatureCases)) {
    const file = join(dir, path);
    if (!existsSync(file)) {
      problems.push(`${path} is missing`);
      continue;
    }
    const text = readFileSync(file, "utf8");
    if (/\b(generatedAt|timestamp|createdAt|hostname)\b/i.test(text) || /\/Users\/|\/tmp\/|\/home\//.test(text)) {
      problems.push(`${path} contains a host path or timestamp`);
    }
    const parsed = JSON.parse(text);
    if (JSON.stringify(parsed.provenance) !== JSON.stringify(provenance)) {
      problems.push(`${path} provenance does not match provenance.json`);
    }
    const ids = caseIds(parsed);
    if (ids.join(",") !== expected.join(",")) problems.push(`${path} cases are ${ids.join(", ")}`);
  }
  const shades = JSON.parse(readFileSync(join(dir, "fills/interior-shades.json"), "utf8"));
  for (const item of shades.cases ?? []) {
    if (!Array.isArray(item.order) || item.order.length === 0) problems.push(`${item.id} has no draw order`);
    if (!item.png || !existsSync(join(dir, item.png))) problems.push(`${item.id} is missing its reference PNG`);
  }
  const closed = JSON.parse(readFileSync(join(dir, "strokes/closed-width.json"), "utf8"));
  for (const id of ["width-samples-stops", "width-samples-variable"]) {
    const item = (closed.cases ?? []).find((entry) => entry.id === id);
    if (!item || !Array.isArray(item.samples) || item.samples.length === 0) problems.push(`${id} has no width samples`);
  }
  const same = (closed.cases ?? []).find((entry) => entry.id === "closed-ring-same-seed");
  if (!same?.identical) problems.push("closed-ring-same-seed did not repeat");
  const shadow = JSON.parse(readFileSync(join(dir, "stickers/silhouette-shadow.json"), "utf8"));
  for (const item of shadow.cases ?? []) {
    if (!Array.isArray(item.composedTransform) || item.composedTransform.length !== 6) {
      problems.push(`${item.id} is missing its composed transform`);
    }
    if (!Array.isArray(item.anchor) || item.anchor.length !== 2) problems.push(`${item.id} is missing its anchor`);
  }
  const tree = (shadow.cases ?? []).find((entry) => entry.id === "silhouette-tree");
  if (!tree?.anchorMatchesFoot) problems.push("silhouette-tree anchor is not the foot anchor");
  const phase3Path = join(dir, "stickers/phase3.json");
  if (!existsSync(phase3Path)) problems.push("v1.6.0 stickers/phase3.json is missing");
  else {
    const phase3 = JSON.parse(readFileSync(phase3Path, "utf8"));
    if (phase3.provenance?.commit !== upstreamV16.commit) problems.push("v1.6.0 phase3 is not pinned to the Sketchy commit");
    const ids = caseIds(phase3);
    if (ids.join(",") !== phase3CaseIds.join(",")) problems.push(`v1.6.0 phase3 cases are ${ids.join(", ")}`);
  }
  for (const path of v16Replay) {
    if (!existsSync(join(dir, path))) problems.push(`v1.6.0 replay is missing ${path}`);
    else if (!existsSync(join(referenceDir, path))) problems.push(`v1.5.0 baseline is missing ${path}`);
  }
  const diffPath = join(dir, "regression/changed.json");
  if (!existsSync(diffPath)) problems.push("regression/changed.json is missing");
  else if (v16Replay.every((path) => existsSync(join(dir, path)) && existsSync(join(referenceDir, path)))) {
    const freshDiff = diffReference(referenceDir, dir);
    const committedDiff = JSON.parse(readFileSync(diffPath, "utf8"));
    if (JSON.stringify(committedDiff) !== JSON.stringify(freshDiff)) {
      problems.push("regression/changed.json does not match the v1.5.0 case diff");
    }
  }
  for (const file of committed.files ?? []) {
    if (typeof file.bytes === "number" && file.bytes > 10_000_000 && String(file.path).endsWith(".png")) {
      problems.push(`${file.path} is over 10 MB`);
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
  const problems = [...verifyManifest(), ...verifyV160()];
  if (problems.length > 0) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  console.log("fixtures: v1.5.0 and v1.6.0 manifests match the files on disk");
}
