import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Shape } from "@sketchy-js/core";
import { generateDrawing, type SketchDrawing } from "@sketchy-js/core";
import { resolveSketchOptions } from "@sketchy-js/core/options";
import { basicSketchy } from "../../src/basic.js";
import { createFillStage } from "../../src/fill-stage.js";
import type { FillStyle, PathOp, SketchOptions } from "@sketchy-js/types";

const root = fileURLToPath(
  new URL("../../../../fixtures/swift-reference/v1.5.0/", import.meta.url),
);

/** Which reference platform a fixture file comes from. `darwin` is the canonical oracle. */
export type Platform = "darwin" | "linux";

/** Loads a Swift reference fixture; `darwin` files live under `darwin/`, Linux baselines at the root. */
export function loadSwift<T>(platform: Platform, relativePath: string): T {
  const base = platform === "darwin" ? "darwin/" : "";
  return JSON.parse(readFileSync(`${root}${base}${relativePath}`, "utf8")) as T;
}

const STYLE_NAMES: Record<string, FillStyle> = {
  "cross-hatch": "crossHatch",
  sunburst: "sunBurst",
  starburst: "starBurst",
  "zigzag-line": "zigzagLine",
};

/** Maps exporter option names and Swift raw values to `SketchOptions` (seed strings become bigints). */
export function fixtureOptions(raw: Record<string, unknown>): Partial<SketchOptions> {
  const out: Record<string, unknown> = { ...raw };
  if (typeof raw.fillStyle === "string")
    out.fillStyle = STYLE_NAMES[raw.fillStyle] ?? raw.fillStyle;
  if (typeof raw.seed === "string") out.seed = BigInt(raw.seed);
  return out;
}

/** Builds a `Shape` from an exporter case (`{ kind, args }`). */
export function fixtureShape(shape: { kind: string; args: Record<string, unknown> }): Shape {
  const args = shape.args as Record<string, never>;
  const points = (args.points as unknown as [number, number][] | undefined)?.map(([x, y]) => ({
    x,
    y,
  }));
  return { kind: shape.kind, ...args, ...(points ? { points } : {}) } as unknown as Shape;
}

/** One operation as the exporter wrote it: `["M", x, y]`, `["C", ...6]`, `["L", x, y]`, `["Q", ...4]`, `["Z"]`. */
export type FixtureOp = readonly [string, ...number[]];

/** A fixture operation set. Note the exporter spells the SVG area type `path2Dfill`. */
export interface FixtureSet {
  type: string;
  ops: FixtureOp[];
  path?: string;
  size?: { width: number; height: number };
}

const TYPE_NAMES: Record<string, string> = { path2Dfill: "path2DFill" };

/** Normalizes a fixture set type to the scene naming. */
export const setType = (type: string): string => TYPE_NAMES[type] ?? type;

/** Flattens a path op to the exporter's `[kind, ...numbers]` form. */
export function opToFixture(op: PathOp): FixtureOp {
  switch (op.op) {
    case "M":
    case "L":
      return [op.op, op.x, op.y];
    case "Q":
      return ["Q", op.cx, op.cy, op.x, op.y];
    case "C":
      return ["C", op.c1x, op.c1y, op.c2x, op.c2y, op.x, op.y];
    case "Z":
      return ["Z"];
  }
}

/** Numeric tolerance for Swift `Float` versus TypeScript comparisons, in px. */
export const TOLERANCE = 1e-4;

/** Result of comparing two operation lists. */
export interface OpsComparison {
  /** Same number of operations with the same kinds in the same order. */
  structural: boolean;
  /** Largest absolute coordinate difference (only meaningful when `structural`). */
  maxDelta: number;
  /** Coordinates that differ after rounding the fixture value to `Float`. */
  floatMismatches: number;
  coordinates: number;
  message?: string;
}

/**
 * Compares operations: structure first (count and kinds), numbers second. Numbers are never
 * compared when the structure differs, so a topology difference can never hide inside a tolerance.
 */
export function compareOps(
  actual: readonly FixtureOp[],
  expected: readonly FixtureOp[],
): OpsComparison {
  const result: OpsComparison = {
    structural: true,
    maxDelta: 0,
    floatMismatches: 0,
    coordinates: 0,
  };
  if (actual.length !== expected.length) {
    return {
      ...result,
      structural: false,
      message: `op count ${actual.length} !== ${expected.length}`,
    };
  }
  for (let i = 0; i < actual.length; i++) {
    const a = actual[i]!;
    const e = expected[i]!;
    if (a[0] !== e[0] || a.length !== e.length) {
      return { ...result, structural: false, message: `op ${i} kind ${a[0]} !== ${e[0]}` };
    }
  }
  for (let i = 0; i < actual.length; i++) {
    const a = actual[i]!;
    const e = expected[i]!;
    for (let k = 1; k < a.length; k++) {
      const delta = Math.abs((a[k] as number) - (e[k] as number));
      result.coordinates++;
      result.maxDelta = Math.max(result.maxDelta, delta);
      if (Math.fround(e[k] as number) !== a[k]) result.floatMismatches++;
    }
  }
  return result;
}

/** Runs the generator exactly as `buildScene` does (before layer assembly), for operation-level parity. */
export function generateFixtureDrawing(
  shape: Shape,
  raw: Record<string, unknown>,
  diagnostics: { code: string }[] = [],
): SketchDrawing | undefined {
  const options = resolveSketchOptions(fixtureOptions(raw));
  const fill = basicSketchy.resolveSpec("fill", { kind: options.fillStyle });
  const stage = createFillStage({ fill, options, report: (d) => diagnostics.push(d) });
  return generateDrawing(shape, options, stage);
}
