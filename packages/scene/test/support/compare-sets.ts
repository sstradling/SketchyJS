import type { SketchDrawing } from "@sketchy-js/core";
import {
  compareOps,
  setType,
  type FixtureOp,
  type FixtureSet,
  type OpsComparison,
} from "./swift.js";

/** Converts scene-model ops to the exporter's tuple form. */
export function toFixtureOps(ops: readonly { op: string }[]): FixtureOp[] {
  return ops.map((op) => {
    const o = op as unknown as Record<string, number | string>;
    switch (o.op) {
      case "M":
      case "L":
        return [o.op, o.x, o.y] as unknown as FixtureOp;
      case "Q":
        return ["Q", o.cx, o.cy, o.x, o.y] as unknown as FixtureOp;
      case "C":
        return ["C", o.c1x, o.c1y, o.c2x, o.c2y, o.x, o.y] as unknown as FixtureOp;
      default:
        return ["Z"] as unknown as FixtureOp;
    }
  });
}

/** Per-set result of comparing a generated drawing with a fixture drawing. */
export interface SetsComparison {
  /** Same number of sets and the same set types in order. */
  sameSets: boolean;
  perSet: OpsComparison[];
}

/** Compares generated sets with fixture sets: set types first, then each set's operations. */
export function compareSets(
  actual: SketchDrawing,
  expected: readonly FixtureSet[],
): SetsComparison {
  const sameSets =
    actual.sets.length === expected.length &&
    actual.sets.every((s, i) => s.type === setType(expected[i]!.type));
  if (!sameSets) return { sameSets, perSet: [] };
  return {
    sameSets,
    perSet: expected.map((e, i) => compareOps(toFixtureOps(actual.sets[i]!.ops), e.ops)),
  };
}
