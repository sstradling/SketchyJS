import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Case-level diff of the v1.5.0 Darwin case list against a v1.6.0 replay.
 * Provenance is ignored on phase3 so a new commit pin is not reported as a geometry change.
 */
const pairs = [
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

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function load(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function caseId(item, index) {
  if (item && typeof item.id === "string") return item.id;
  return `#${index}`;
}

function changedKeys(before, after, prefix, out, depth) {
  if (canonical(before) === canonical(after)) return;
  const nested =
    depth < 3 &&
    before &&
    after &&
    typeof before === "object" &&
    typeof after === "object" &&
    !Array.isArray(before) &&
    !Array.isArray(after);
  if (!nested) {
    out.push(prefix || "$");
    return;
  }
  for (const key of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) {
    changedKeys(before[key], after[key], prefix ? `${prefix}.${key}` : key, out, depth + 1);
  }
}

export function diffReference(baselineDir, candidateDir) {
  const unchanged = [];
  const provenanceOnly = [];
  const changed = [];
  for (const path of pairs) {
    const before = load(join(baselineDir, path));
    const after = load(join(candidateDir, path));
    if (Array.isArray(before.cases) && Array.isArray(after.cases)) {
      const beforeCases = new Map(before.cases.map((item, index) => [caseId(item, index), item]));
      const afterCases = new Map(after.cases.map((item, index) => [caseId(item, index), item]));
      const ids = [...new Set([...beforeCases.keys(), ...afterCases.keys()])].sort();
      const caseIds = ids.filter((id) => canonical(beforeCases.get(id)) !== canonical(afterCases.get(id)));
      const { cases: _beforeCases, provenance: _beforeProvenance, ...beforeRest } = before;
      const { cases: _afterCases, provenance: _afterProvenance, ...afterRest } = after;
      const restChanged = canonical(beforeRest) !== canonical(afterRest);
      const provenanceChanged = canonical(before.provenance ?? null) !== canonical(after.provenance ?? null);
      if (caseIds.length === 0 && !restChanged) {
        if (provenanceChanged || canonical(before) !== canonical(after)) provenanceOnly.push(path);
        else unchanged.push(path);
      } else {
        const entry = { path, caseIds };
        if (restChanged) {
          const keys = [];
          changedKeys(beforeRest, afterRest, "", keys, 0);
          entry.keys = keys;
        }
        changed.push(entry);
      }
      continue;
    }
    if (canonical(before) === canonical(after)) {
      unchanged.push(path);
      continue;
    }
    const keys = [];
    changedKeys(before, after, "", keys, 0);
    changed.push({ path, caseIds: [], keys });
  }
  return {
    baseline: "v1.5.0",
    candidate: "v1.6.0",
    unchanged,
    provenanceOnly,
    changed,
  };
}

const invokedDirectly = process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  const baseline = process.argv[2];
  const candidate = process.argv[3];
  const diff = diffReference(baseline, candidate);
  const destination = join(candidate, "regression", "changed.json");
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, `${JSON.stringify(diff, null, 2)}\n`);
  const count = diff.changed.reduce((sum, entry) => sum + (entry.caseIds.length || 1), 0);
  console.log(`regression: ${diff.changed.length} files differ (${count} case entries), ${diff.unchanged.length} unchanged`);
}
