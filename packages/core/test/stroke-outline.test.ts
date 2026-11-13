import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { BrushCap, BrushJoin, Path, PathOp } from "@sketchy-js/types";
import { nativePolylineOutline } from "../src/stroke/native.js";
import { strokeToOutline } from "../src/stroke/outline.js";

const root = fileURLToPath(
  new URL("../../../fixtures/swift-reference/v1.5.0/strokes/outlines.json", import.meta.url),
);

interface Case {
  id: string;
  width: number;
  cap: string;
  join: string;
  miterLimit: number;
  outline: [string, ...number[]][];
}

const cases = (JSON.parse(readFileSync(root, "utf8")) as { cases: Case[] }).cases;

const centerline = (id: string): Path => {
  if (id.startsWith("rectangle")) {
    return [
      { op: "M", x: 30, y: 40 },
      { op: "L", x: 170, y: 40 },
      { op: "L", x: 170, y: 140 },
      { op: "L", x: 30, y: 140 },
      { op: "Z" },
    ];
  }
  return [
    { op: "M", x: 12, y: 30 },
    { op: "L", x: 80, y: 36 },
    { op: "L", x: 150, y: 110 },
    { op: "L", x: 188, y: 70 },
  ];
};

const joinOf = (join: string): BrushJoin => {
  if (join.startsWith("curvedBevel")) return { kind: "curvedBevel", bulge: 0.65 };
  return join as BrushCap extends never ? never : "round" | "miter" | "bevel";
};

const toTuples = (path: Path): [string, ...number[]][] =>
  path.map((op) => {
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

describe("native stroke outlines", () => {
  it("polyline-curved-bevel", () => {
    const c = cases.find((item) => item.id === "polyline-curved-bevel")!;
    const actual = toTuples(
      strokeToOutline(centerline(c.id), {
        width: c.width,
        cap: c.cap as BrushCap,
        join: { kind: "curvedBevel", bulge: 0.65 },
        miterLimit: c.miterLimit,
      }),
    );
    expect(actual.map((op) => op[0])).toEqual(c.outline.map((op) => op[0]));
    let max = 0;
    for (let i = 0; i < Math.min(actual.length, c.outline.length); i++) {
      const a = actual[i]!;
      const e = c.outline[i]!;
      if (a[0] !== e[0]) break;
      for (let k = 1; k < a.length; k++)
        max = Math.max(max, Math.abs((a[k] as number) - (e[k] as number)));
    }
    expect(max).toBeLessThanOrEqual(1e-4);
  });

  for (const c of cases) {
    if (c.id === "polyline-curved-bevel") continue;
    it(c.id, () => {
      const actual = toTuples(
        nativePolylineOutline(
          centerline(c.id),
          c.width,
          c.cap as BrushCap,
          joinOf(c.join),
          c.miterLimit,
        ),
      );
      expect(actual.map((op) => op[0])).toEqual(c.outline.map((op) => op[0]));
      let max = 0;
      for (let i = 0; i < actual.length; i++) {
        const a = actual[i]!;
        const e = c.outline[i]!;
        for (let k = 1; k < a.length; k++)
          max = Math.max(max, Math.abs((a[k] as number) - (e[k] as number)));
      }
      expect(max).toBeLessThanOrEqual(1e-4);
    });
  }
});

void (0 as unknown as PathOp);
