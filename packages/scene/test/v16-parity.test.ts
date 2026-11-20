import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compareSets } from "./support/compare-sets.js";
import {
  fixtureShape,
  generateFixtureDrawing,
  TOLERANCE,
  type FixtureSet,
} from "./support/swift.js";

/**
 * Sketchy 1.6.0 fixtures are exported on a separate branch and merged when they
 * arrive. This file loads every case under `fixtures/swift-reference/v1.6.0/`
 * when that directory exists. Darwin files are the oracle. Tolerances stay at
 * an exact structural match, then 1e-4 px. The v1.5.0 corpus is not read here.
 */

const root = fileURLToPath(new URL("../../../fixtures/swift-reference/v1.6.0/", import.meta.url));

interface CaseFile {
  cases?: {
    id: string;
    shape?: { kind: string; args: Record<string, unknown> };
    options?: Record<string, unknown>;
    drawing?: { sets: FixtureSet[] };
    platform?: string;
  }[];
}

function jsonFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...jsonFiles(path));
    else if (name.endsWith(".json") && name !== "manifest.json") out.push(path);
  }
  return out;
}

function casesIn(path: string): {
  file: string;
  id: string;
  shape: { kind: string; args: Record<string, unknown> };
  options: Record<string, unknown>;
  sets: FixtureSet[];
}[] {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as CaseFile;
  if (!parsed.cases) return [];
  return parsed.cases.flatMap((item) => {
    if (!item.shape || !item.drawing) return [];
    return [
      {
        file: path.slice(root.length),
        id: item.id,
        shape: item.shape,
        options: item.options ?? {},
        sets: item.drawing.sets,
      },
    ];
  });
}

const present = existsSync(root);
const loaded = present ? jsonFiles(root).flatMap(casesIn) : [];

describe("Sketchy 1.6.0 parity", () => {
  if (!present || loaded.length === 0) {
    it("waits for fixtures/swift-reference/v1.6.0 before comparing cases", () => {
      expect(loaded).toEqual([]);
    });
    return;
  }

  it.each(loaded.map((item) => [item.file, item.id, item] as const))("%s %s", (_file, id, item) => {
    const drawing = generateFixtureDrawing(fixtureShape(item.shape), item.options);
    expect(drawing, id).toBeDefined();
    const cmp = compareSets(drawing!, item.sets);
    expect(cmp.sameSets, `${id} structure`).toBe(true);
    cmp.perSet.forEach((set, index) => {
      expect(set.message, `${id} set ${index}`).toBeUndefined();
      expect(set.maxDelta, `${id} set ${index}`).toBeLessThanOrEqual(TOLERANCE);
    });
  });
});
