import { describe, expect, it } from "vitest";
import {
  Rng,
  circle,
  contoursToSvgPath,
  createGeometryKit,
  createRoughKit,
  ellipse,
  fillPolygon,
  flattenPath,
  generateDrawing,
  line,
  polygon,
  rectangle,
  signedArea,
  svgContours,
  type FillStage,
  type Pt,
  type RoughCtx,
} from "../src/index.js";
import { resolveSketchOptions } from "../src/options/index.js";

const square: Pt[] = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
];

const noFill: FillStage = { paintsArea: () => false, run: () => [] };

describe("fill geometry (padding and offset)", () => {
  it("insets a polygon by the padding", () => {
    const inset = fillPolygon(square, 2, { x: 0, y: 0 })!;
    const xs = inset.map((p) => p[0]);
    expect(Math.min(...xs)).toBeCloseTo(2, 4);
    expect(Math.max(...xs)).toBeCloseTo(8, 4);
  });

  it("ignores negligible padding and applies the offset", () => {
    const moved = fillPolygon(square, 0, { x: 3, y: -1 })!;
    expect(moved[0]).toEqual([3, -1]);
    expect(moved[2]).toEqual([13, 9]);
  });

  it("returns undefined when padding collapses the shape", () => {
    expect(fillPolygon(square, 6, { x: 0, y: 0 })).toBeUndefined();
  });

  it("computes signed area by winding", () => {
    expect(signedArea(square)).toBe(-signedArea([...square].reverse()));
    expect(Math.abs(signedArea(square))).toBe(100);
  });

  it("pads SVG contours and serializes them as path text", () => {
    const contours = svgContours("M0 0 L10 0 L10 10 L0 10 Z", 1, { x: 0, y: 0 })!;
    expect(contours).toHaveLength(1);
    expect(contoursToSvgPath(contours)).toBe("M 1 1 L 9 1 L 9 9 L 1 9 Z");
  });
});

describe("geometry kit", () => {
  const ctx: RoughCtx = { o: resolveSketchOptions({ seed: 1n }), rng: new Rng(1n) };
  const kit = createGeometryKit(createRoughKit(ctx));

  it("flattens curves within tolerance", () => {
    const [sub] = flattenPath([
      { op: "M", x: 0, y: 0 },
      { op: "C", c1x: 0, c1y: 50, c2x: 100, c2y: 50, x: 100, y: 0 },
    ]);
    expect(sub!.closed).toBe(false);
    expect(sub!.points.length).toBeGreaterThan(8);
    expect(sub!.points.at(-1)).toEqual({ x: 100, y: 0 });
  });

  it("resamples evenly including both ends", () => {
    const [sub] = kit.flatten([
      { op: "M", x: 0, y: 0 },
      { op: "L", x: 10, y: 0 },
    ]);
    const samples = kit.resample(sub!, 2.5);
    expect(samples.map((s) => s.point.x)).toEqual([0, 2.5, 5, 7.5, 10]);
    expect(samples[0]!.normal).toEqual({ x: -0, y: 1 });
  });

  it("measures path bounds", () => {
    expect(
      kit.bounds(
        kit.polygon([
          { x: 1, y: 2 },
          { x: 5, y: 9 },
          { x: -3, y: 4 },
        ]),
      ),
    ).toEqual({ x: -3, y: 2, width: 8, height: 7 });
  });

  it("closes polygons unless asked not to", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ];
    expect(kit.polygon(pts).at(-1)).toEqual({ op: "Z" });
    expect(kit.polygon(pts, false).at(-1)).not.toEqual({ op: "Z" });
  });

  it("draws rough lines that consume the shared stream", () => {
    const a = createRoughKit({ o: ctx.o, rng: new Rng(9n) }).line({ x: 0, y: 0 }, { x: 40, y: 0 });
    const b = createRoughKit({ o: ctx.o, rng: new Rng(9n) }).line({ x: 0, y: 0 }, { x: 40, y: 0 });
    expect(a).toEqual(b);
    expect(a[0]!.op).toBe("M");
  });
});

describe("generateDrawing", () => {
  const options = resolveSketchOptions({ seed: 11n });

  it("is deterministic and begins each outline with a move", () => {
    const a = generateDrawing(rectangle(0, 0, 40, 30), options, noFill)!;
    const b = generateDrawing(rectangle(0, 0, 40, 30), options, noFill)!;
    expect(a).toEqual(b);
    expect(a.sets.at(-1)!.type).toBe("path");
    expect(a.sets.at(-1)!.ops[0]!.op).toBe("M");
  });

  it("emits the fill before the outline", () => {
    const stage: FillStage = {
      paintsArea: () => false,
      run: () => [{ type: "fillSketch", ops: [{ op: "M", x: 0, y: 0 }] }],
    };
    const drawing = generateDrawing(ellipse(50, 50, 80, 40), options, stage)!;
    expect(drawing.sets.map((s) => s.type)).toEqual(["fillSketch", "path"]);
  });

  it("skips fills for open shapes", () => {
    let calls = 0;
    const stage: FillStage = { paintsArea: () => false, run: () => (calls++, []) };
    generateDrawing(line(0, 0, 10, 10), options, stage);
    expect(calls).toBe(0);
  });

  it("returns undefined for a point list with no points", () => {
    expect(generateDrawing(polygon([]), options, noFill)).toBeUndefined();
  });

  it("changes with the seed and with stroke continuity", () => {
    const seeded = (seed: bigint, strokeContinuity: "continuous" | "legacy") =>
      JSON.stringify(
        generateDrawing(
          circle(50, 50, 40),
          resolveSketchOptions({ seed, strokeContinuity }),
          noFill,
        )?.sets,
      );
    expect(seeded(1n, "continuous")).not.toBe(seeded(2n, "continuous"));
    expect(seeded(1n, "continuous")).not.toBe(seeded(1n, "legacy"));
  });
});
