import { describe, expect, it } from "vitest";
import { svgPathToOps } from "@sketchy-js/core";
import { scribblePaths } from "@sketchy-js/fills/scribble";
import type { Path, Point } from "@sketchy-js/types";
import { compareOps, loadSwift, TOLERANCE, type FixtureOp } from "./support/swift.js";

interface ScribbleCase {
  id: string;
  shape: [number, number][] | string;
  options: { scribbleOrigin?: number; scribbleTightness?: number; scribbleCurvature?: number };
  sets: { ops: FixtureOp[] }[];
}

const cases = loadSwift<{ cases: ScribbleCase[] }>("darwin", "fills/scribble.json").cases;

function polygonPath(points: readonly [number, number][]): Path {
  return [
    ...points.map(([x, y], i) =>
      i === 0 ? { op: "M" as const, x, y } : { op: "L" as const, x, y },
    ),
    { op: "Z" },
  ];
}

function toFixture(path: Path): FixtureOp[] {
  return path.map((op) => {
    switch (op.op) {
      case "M":
      case "L":
        return [op.op, op.x, op.y];
      case "Q":
        return ["Q", op.cx, op.cy, op.x, op.y];
      case "C":
        return ["C", op.c1x, op.c1y, op.c2x, op.c2y, op.x, op.y];
      default:
        return ["Z"];
    }
  });
}

describe("Darwin scribble fixtures", () => {
  it.each(cases.map((c) => [c.id, c] as const))("%s", (_id, c) => {
    const path = typeof c.shape === "string" ? svgPathToOps(c.shape) : polygonPath(c.shape);
    const ring: Point[] =
      typeof c.shape === "string"
        ? path.flatMap((op) => (op.op === "Z" ? [] : [{ x: op.x, y: op.y }]))
        : c.shape.map(([x, y]) => ({ x, y }));
    const paths = scribblePaths(path, ring, {
      origin: c.options.scribbleOrigin ?? 0,
      tightness: c.options.scribbleTightness ?? 10,
      curvature: c.options.scribbleCurvature ?? 0,
    });
    expect(paths).toHaveLength(c.sets.length);
    c.sets.forEach((set, index) => {
      const cmp = compareOps(toFixture(paths[index]!), set.ops);
      expect(cmp.message).toBeUndefined();
      expect(cmp.maxDelta).toBeLessThanOrEqual(TOLERANCE);
    });
  });
});
