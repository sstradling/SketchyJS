import { describe, expect, it } from "vitest";
import type { BrushProfile, Path } from "@sketchy-js/types";
import {
  effectiveWidth,
  opacityRibbon,
  thicknessMultiplier,
  thicknessWidth,
} from "../src/stroke/index.js";

const uniform: BrushProfile = {
  tip: { roundness: 1, angle: 0, directionSensitive: false },
  thicknessProfile: { kind: "uniform" },
  cap: "round",
  join: "round",
  opacityProfile: { kind: "uniform" },
};

describe("brush tips and thickness", () => {
  it("keeps a circular tip at the base width and widens a flat tip along its long axis", () => {
    const flat = { roundness: 0.25, angle: 0, directionSensitive: true };
    expect(effectiveWidth(uniform.tip, 10, 0.4)).toBe(10);
    expect(effectiveWidth({ ...flat, directionSensitive: false }, 10, 0)).toBe(10);
    const along = effectiveWidth(flat, 10, 0);
    const across = effectiveWidth(flat, 10, Math.PI / 2);
    expect(along).toBeGreaterThan(across);
    expect(across).toBeCloseTo(2.5, 5);
    expect(along).toBeCloseTo(10, 5);
  });

  it("tapers in, out, and from both ends", () => {
    expect(thicknessMultiplier({ kind: "taperIn", start: 0.5 }, 0)).toBe(0);
    expect(thicknessMultiplier({ kind: "taperIn", start: 0.5 }, 0.25)).toBeCloseTo(0.5, 5);
    expect(thicknessMultiplier({ kind: "taperIn", start: 0.5 }, 1)).toBe(1);
    expect(thicknessMultiplier({ kind: "taperOut", end: 0.4 }, 1)).toBe(0);
    expect(thicknessMultiplier({ kind: "taperOut", end: 0.4 }, 0)).toBe(1);
    expect(thicknessMultiplier({ kind: "taperBoth", start: 0.2, end: 0.2 }, 0.5)).toBe(1);
    expect(thicknessMultiplier({ kind: "taperBoth", start: 0.2, end: 0.2 }, 0)).toBe(0);
  });

  it("interpolates width stops and ignores the base width when stops are set", () => {
    const stops = {
      kind: "stops" as const,
      stops: [
        { position: 0, width: 2 },
        { position: 1, width: 8 },
      ],
    };
    expect(thicknessWidth(stops, 0, 100)).toBe(2);
    expect(thicknessWidth(stops, 0.5, 100)).toBeCloseTo(5, 5);
    expect(thicknessWidth(stops, 1, 100)).toBe(8);
    expect(thicknessWidth({ kind: "stops", stops: [] }, 0.5, 6)).toBe(6);
  });

  it("varies width from a seed and repeats", () => {
    const width = {
      variation: 1,
      minimum: 0.4,
      maximum: 1.6,
      taperStart: 0,
      taperEnd: 0,
      pressure: [],
      seed: 7,
      frequency: 2,
    };
    const at = (seed: number, t: number): number =>
      thicknessMultiplier({ kind: "variable", width: { ...width, seed } }, t);
    expect(at(7, 0.3)).toBe(at(7, 0.3));
    expect(at(7, 0.3)).toBeGreaterThanOrEqual(0.4);
    expect(at(7, 0.3)).toBeLessThanOrEqual(1.6);
    const times = [0.15, 0.4, 0.7];
    expect(times.map((t) => at(7, t))).not.toEqual(times.map((t) => at(11, t)));
  });
});

describe("opacity ribbons", () => {
  const line: Path = [
    { op: "M", x: 10, y: 20 },
    { op: "L", x: 80, y: 24 },
    { op: "L", x: 70, y: 60 },
  ];

  it("emits finite quads whose opacity follows the profile", () => {
    const brush: BrushProfile = {
      ...uniform,
      cap: "butt",
      opacityProfile: {
        kind: "stops",
        stops: [
          { position: 0, opacity: 0.2 },
          { position: 1, opacity: 1 },
        ],
      },
    };
    const pieces = opacityRibbon(line, 8, brush, 1);
    expect(pieces.length).toBeGreaterThan(2);
    for (const piece of pieces) {
      expect(piece.opacity).toBeGreaterThan(0);
      expect(piece.opacity).toBeLessThanOrEqual(1);
      for (const op of piece.path) {
        if (op.op === "Z") continue;
        expect(Number.isFinite(op.x)).toBe(true);
        expect(Number.isFinite(op.y)).toBe(true);
      }
    }
    const start = pieces[0]!.opacity;
    const later = pieces[pieces.length - 1]!.opacity;
    expect(later).toBeGreaterThan(start);
  });

  it("is deterministic and drops a zero-width stroke", () => {
    const brush: BrushProfile = {
      ...uniform,
      opacityProfile: {
        kind: "noise",
        noise: { minimum: 0.2, maximum: 1, variation: 1, seed: 4, frequency: 3 },
      },
    };
    const once = opacityRibbon(line, 6, brush, 0.8);
    const twice = opacityRibbon(line, 6, brush, 0.8);
    expect(once.map((p) => p.opacity)).toEqual(twice.map((p) => p.opacity));
    expect(opacityRibbon(line, 0, brush, 1)).toEqual([]);
  });
});
