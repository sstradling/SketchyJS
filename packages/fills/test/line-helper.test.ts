import { describe, expect, it } from "vitest";
import { f } from "../src/internal/f32.js";
import {
  inRange,
  intersection,
  linePolygonIntersections,
  makeLine,
  type Pt,
} from "../src/internal/line-helper.js";

/** Reinterprets a binary32 bit pattern as the number it encodes. */
const fromBits = (bits: number): number => new Float32Array(new Uint32Array([bits]).buffer)[0]!;

describe("LineHelper port", () => {
  it("intersects crossing segments", () => {
    const hit = intersection(makeLine([0, 0], [10, 10]), makeLine([0, 10], [10, 0]));
    expect(hit?.[0]).toBeCloseTo(5, 5);
    expect(hit?.[1]).toBeCloseTo(5, 5);
  });

  it("returns nothing for disjoint, degenerate or both-vertical segments", () => {
    expect(intersection(makeLine([0, 0], [1, 1]), makeLine([5, 0], [6, -1]))).toBeUndefined();
    expect(intersection(makeLine([2, 2], [2, 2]), makeLine([0, 0], [4, 4]))).toBeUndefined();
    expect(intersection(makeLine([1, 0], [1, 5]), makeLine([3, 0], [3, 5]))).toBeUndefined();
  });

  it("uses the vertical-segment branch when |x1 - x2| <= 1e-5", () => {
    const hit = intersection(makeLine([5, 0], [5, 10]), makeLine([0, 3], [10, 3]));
    expect(hit).toEqual([5, 3]);
  });

  it("applies a 1e-5 margin in inRange", () => {
    expect(inRange(10.000005, 0, 10)).toBe(true);
    expect(inRange(10.0001, 0, 10)).toBe(false);
    expect(inRange(f(-0.000005), 10, 0)).toBe(true);
  });

  it("collects every polygon edge crossing in edge order", () => {
    const square: Pt[] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    const hits = linePolygonIntersections([5, 5], [20, 5], square);
    expect(hits).toEqual([[10, 5]]);
  });
});

describe("sunburst ray topology sensitivity (docs/phase-1.md, oracle policy)", () => {
  const polygon: Pt[] = [
    [10, 10],
    [150, 10],
    [150, 60],
    [80, 60],
    [80, 120],
    [10, 120],
  ];
  const centroid: Pt = [fromBits(1116061696), fromBits(1113489408)];

  it("keeps a crossing for the Linux ray 54 end point but not for the Darwin one", () => {
    const darwinEnd: Pt = [fromBits(1092328480), fromBits(3254943436)];
    const linuxEnd: Pt = [fromBits(1092328488), fromBits(3254943436)];
    const inBounds = (hits: Pt[]): Pt[] =>
      hits.filter((p) => p[0] >= 10 && p[0] <= 150 && p[1] >= 10 && p[1] <= 120);
    expect(inBounds(linePolygonIntersections(centroid, darwinEnd, polygon))).toHaveLength(0);
    expect(inBounds(linePolygonIntersections(centroid, linuxEnd, polygon))).toHaveLength(1);
  });
});
