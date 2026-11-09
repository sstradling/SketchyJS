import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { referenceDir } from "./lib.mjs";

const pairs = [
  ["rng/splitmix64.json", "darwin/rng/splitmix64.json"],
  ["rng/unit-float.json", "darwin/rng/unit-float.json"],
  ["options/defaults.json", "darwin/options/defaults.json"],
  ["options/clamps.json", "darwin/options/clamps.json"],
  ["shapes/shapes.json", "darwin/shapes/shapes.json"],
  ["fills/fills.json", "darwin/fills/fills.json"],
  ["fills/direct-fillers.json", "darwin/fills/direct-fillers.json"],
  ["fills/scribble.json", "darwin/fills/scribble.json"],
  ["svg/path-parse.json", "darwin/svg/path-parse.json"],
];

/** Compares one Linux fixture with its Darwin replay. Numbers are absolute CSS-pixel deltas. */
function compare(left, right, path = "$") {
  const stats = { numericCount: 0, absSum: 0, maxAbs: 0, maxPath: path, structuralMismatches: 0 };
  const visit = (a, b, at) => {
    if (typeof a === "number" && typeof b === "number") {
      if (!Number.isFinite(a) || !Number.isFinite(b)) {
        if (Object.is(a, b)) return;
        stats.structuralMismatches += 1;
        return;
      }
      const delta = Math.abs(a - b);
      stats.numericCount += 1;
      stats.absSum += delta;
      if (delta > stats.maxAbs) {
        stats.maxAbs = delta;
        stats.maxPath = at;
      }
      return;
    }
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) stats.structuralMismatches += 1;
      for (let i = 0; i < Math.min(a.length, b.length); i += 1) visit(a[i], b[i], `${at}[${i}]`);
      return;
    }
    if (a && b && typeof a === "object" && typeof b === "object") {
      const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
      for (const key of keys) {
        if (!(key in a) || !(key in b)) stats.structuralMismatches += 1;
        else visit(a[key], b[key], `${at}.${key}`);
      }
      return;
    }
    if (a !== b) stats.structuralMismatches += 1;
  };
  visit(left, right, path);
  return {
    numericCount: stats.numericCount,
    maxAbs: stats.maxAbs,
    meanAbs: stats.numericCount === 0 ? 0 : stats.absSum / stats.numericCount,
    maxPath: stats.maxPath,
    structuralMismatches: stats.structuralMismatches,
  };
}

const groups = pairs.map(([linux, darwin]) => ({
  group: linux.split("/")[0],
  linux,
  darwin,
  ...compare(JSON.parse(readFileSync(join(referenceDir, linux), "utf8")), JSON.parse(readFileSync(join(referenceDir, darwin), "utf8"))),
}));
const aligned = groups.filter((group) => group.structuralMismatches === 0);
const alignedMax = aligned.reduce((max, group) => Math.max(max, group.maxAbs), 0);
const recommendation = Math.max(1e-4, alignedMax === 0 ? 1e-4 : 10 ** Math.ceil(Math.log10(alignedMax * 1.01)));
const report = {
  unit: "px",
  baseline: "linux-x86_64 committed fixtures",
  candidate: "darwin-x86_64 iOS simulator replay of the same exporter functions",
  recommendedTolerancePx: recommendation,
  alignedMaxAbsPx: alignedMax,
  note: "The recommended tolerance covers groups with the same JSON shape. fills/fills.json and fills/direct-fillers.json each have two sunburst or starburst concave cases whose operation lists differ in length, so their large deltas are misaligned points rather than libm noise. options/defaults.json differs only in UIColor mirror fields that the Linux shim exposes and UIKit does not.",
  groups,
};
const comparisonDir = join(referenceDir, "comparison");
mkdirSync(comparisonDir, { recursive: true });
writeFileSync(join(comparisonDir, "darwin-linux.json"), `${JSON.stringify(report, null, 2)}\n`);
console.table(groups.map((group) => ({ group: group.linux, maxAbs: group.maxAbs, meanAbs: group.meanAbs, structural: group.structuralMismatches })));
console.log(`recommended tolerance ${recommendation} px`);
