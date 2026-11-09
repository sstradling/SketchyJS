import { describe, expect, it } from "vitest";
import { convertArc, parseSvgPath, svgPathToOps, type SvgCommand } from "../src/svg/index.js";
import { loadFixture } from "./fixtures.js";

interface ParseCase {
  id: string;
  d: string;
  commands: SvgCommand[];
}
interface ArcCase {
  id: string;
  input: {
    start: [number, number];
    end: [number, number];
    rx: number;
    ry: number;
    rotation: number;
    largeArc: boolean;
    sweep: boolean;
  };
  result:
    | { kind: "omitted" | "line" }
    | {
        kind: "cubic";
        cx: number;
        cy: number;
        rx: number;
        ry: number;
        deltaAngle: number;
        curves: number[][];
      };
}

const fixture = loadFixture<{ parse: ParseCase[]; arcConversion: ArcCase[] }>(
  "darwin/svg/path-parse.json",
);
const TOLERANCE = 1e-4;

describe("Darwin SVG path parse fixtures", () => {
  it.each(fixture.parse.map((c) => [c.id, c] as const))("%s", (_id, c) => {
    const actual = parseSvgPath(c.d);
    expect(actual.map((x) => x.type)).toEqual(c.commands.map((x) => x.type));
    actual.forEach((command, i) => {
      const expected = c.commands[i]!;
      for (const key of ["x", "y", "c1x", "c1y", "c2x", "c2y", "rx", "ry", "rotation"] as const) {
        expect(Math.abs(command[key] - expected[key]), `${i}.${key}`).toBeLessThanOrEqual(
          TOLERANCE,
        );
      }
      expect(command.largeArc).toBe(expected.largeArc);
      expect(command.sweep).toBe(expected.sweep);
    });
  });
});

describe("Darwin SVG arc conversion fixtures", () => {
  it.each(fixture.arcConversion.map((c) => [c.id, c] as const))("%s", (_id, c) => {
    const { start, end, rx, ry, rotation, largeArc, sweep } = c.input;
    const actual = convertArc(start, end, rx, ry, rotation, largeArc, sweep);
    expect(actual.kind).toBe(c.result.kind);
    const expected = c.result;
    if (actual.kind !== "cubic" || expected.kind !== "cubic") return;
    for (const key of ["cx", "cy", "rx", "ry", "deltaAngle"] as const) {
      expect(Math.abs(actual[key] - expected[key]), key).toBeLessThanOrEqual(TOLERANCE);
    }
    expect(actual.curves).toHaveLength(expected.curves.length);
    actual.curves.forEach((curve, i) => {
      const e = expected.curves[i]!;
      const values = [curve.c1x, curve.c1y, curve.c2x, curve.c2y, curve.x, curve.y];
      values.forEach((v, k) => expect(Math.abs(v - e[k]!)).toBeLessThanOrEqual(TOLERANCE));
    });
  });
});

describe("svgPathToOps", () => {
  it("converts arcs to cubics and keeps close as Z", () => {
    const ops = svgPathToOps("M10 50 A40 40 0 0 1 50 10 Z");
    expect(ops.map((o) => o.op)).toEqual(["M", "C", "Z"]);
  });

  it("draws a zero-radius arc as a straight line", () => {
    expect(svgPathToOps("M0 0 A0 5 0 0 1 10 10").map((o) => o.op)).toEqual(["M", "L"]);
  });

  it("omits an arc whose endpoints coincide", () => {
    expect(svgPathToOps("M5 5 A3 3 0 0 1 5 5").map((o) => o.op)).toEqual(["M"]);
  });
});
