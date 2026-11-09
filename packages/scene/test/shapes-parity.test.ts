import { describe, expect, it } from "vitest";
import {
  compareOps,
  fixtureShape,
  generateFixtureDrawing,
  loadSwift,
  setType,
  TOLERANCE,
  type FixtureSet,
  type FixtureOp,
} from "./support/swift.js";

interface ShapeCase {
  id: string;
  shape: { kind: string; args: Record<string, unknown> };
  options: Record<string, unknown>;
  drawing: { sets: FixtureSet[] };
}

const toFixtureOps = (ops: readonly { op: string }[]): FixtureOp[] =>
  ops.map((op) => {
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

const shapes = loadSwift<{ cases: ShapeCase[] }>("darwin", "shapes/shapes.json").cases;

describe("Darwin shape fixtures: generator operation parity", () => {
  it.each(shapes.map((c) => [c.id, c] as const))("%s", (_id, c) => {
    const drawing = generateFixtureDrawing(fixtureShape(c.shape), c.options);
    expect(drawing).toBeDefined();
    const sets = drawing!.sets;
    expect(sets.map((s) => s.type)).toEqual(c.drawing.sets.map((s) => setType(s.type)));
    c.drawing.sets.forEach((expected, index) => {
      const actual = sets[index]!;
      const cmp = compareOps(toFixtureOps(actual.ops), expected.ops);
      expect(cmp.message, `set ${index} (${setType(expected.type)})`).toBeUndefined();
      expect(cmp.maxDelta).toBeLessThanOrEqual(TOLERANCE);
      expect(actual.path).toBe(expected.path);
    });
  });
});
