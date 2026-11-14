import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  circle as circleShape,
  ellipse,
  generateDrawing,
  path,
  polygon,
  rectangle,
  type Shape,
} from "@sketchy-js/core";
import { resolveSketchOptions } from "@sketchy-js/core/options";
import {
  commandsForLines,
  groupCommands,
  stickerCommands,
  type GroupPart,
} from "@sketchy-js/stickers";
import type { StickerBacking } from "@sketchy-js/types";
import { basicSketchy } from "../src/basic.js";
import { createFillStage } from "../src/fill-stage.js";

const contours = JSON.parse(
  readFileSync(
    new URL("../../../fixtures/swift-reference/v1.5.0/stickers/contours.json", import.meta.url),
    "utf8",
  ),
) as {
  cases: {
    id: string;
    centerlines: { closed: boolean; points: [number, number][] }[];
    commands: { style: string; path: unknown[]; lineWidth?: number }[];
  }[];
};

const white = [1, 1, 1, 1] as const;

function backing(edge: StickerBacking["edge"], shadow?: StickerBacking["shadow"]): StickerBacking {
  return { width: 12, smoothness: 1, edge, color: [...white], ...(shadow ? { shadow } : {}) };
}

const cases: { id: string; shape: Shape; backing: StickerBacking }[] = [
  { id: "smooth", shape: rectangle(36, 46, 148, 110), backing: backing("smooth") },
  {
    id: "fullySmooth",
    shape: ellipse(110, 110, 150, 110),
    backing: backing({ kind: "fullySmooth", radius: 0 }),
  },
  {
    id: "fullySmooth-radius-12",
    shape: rectangle(36, 46, 148, 110),
    backing: backing({ kind: "fullySmooth", radius: 12 }),
  },
  {
    id: "torn",
    shape: polygon([
      { x: 110, y: 24 },
      { x: 132, y: 78 },
      { x: 190, y: 82 },
      { x: 146, y: 118 },
      { x: 160, y: 176 },
      { x: 110, y: 146 },
      { x: 60, y: 176 },
      { x: 74, y: 118 },
      { x: 30, y: 82 },
      { x: 88, y: 78 },
    ]),
    backing: backing({ kind: "torn", depth: 8, length: 14, jaggedness: 0.4 }),
  },
  {
    id: "shadow",
    shape: rectangle(40, 40, 130, 100),
    backing: backing("smooth", { opacity: 0.35, x: 6, y: 8, radius: 8, color: [0, 0, 0, 1] }),
  },
  {
    id: "hole",
    shape: path("M 24 24 H 196 V 196 H 24 Z M 78 78 H 142 V 142 H 78 Z"),
    backing: backing("smooth"),
  },
];

function build(shape: Shape, sheet: StickerBacking) {
  const options = resolveSketchOptions({ seed: 42n, strokeWidth: 3, stickerBacking: sheet });
  const fill = basicSketchy.resolveSpec("fill", { kind: options.fillStyle });
  const drawing = generateDrawing(shape, options, createFillStage({ fill, options, report() {} }));
  if (!drawing) throw new Error("empty");
  return stickerCommands(drawing, shape, sheet);
}

describe("sticker contour parity", () => {
  it("keeps a hole in a compound path", () => {
    const shape = path("M 50 40 H 300 V 230 H 50 Z M 130 100 H 230 V 180 H 130 Z");
    const sheet = backing("smooth");
    const built = build(shape, { ...sheet, width: 14 });
    expect(built.centerlines.filter((line) => line.closed).length).toBeGreaterThanOrEqual(2);
    const moves = built.commands[0]?.path.filter((op) => op.op === "M").length;
    expect(moves).toBeGreaterThanOrEqual(2);
    expect(built.centerlines.map((line) => line.points.length)).toEqual(
      expect.arrayContaining([expect.any(Number)]),
    );
    const lengths = built.centerlines.map((line) => line.points.length);
    expect(lengths.every((n) => n >= 4)).toBe(true);
    let box: { minX: number; maxX: number } | undefined;
    const boxes: { minX: number; maxX: number }[] = [];
    for (const op of built.commands[0]!.path) {
      if (op.op === "M") {
        if (box) boxes.push(box);
        box = { minX: op.x, maxX: op.x };
      } else if (op.op !== "Z" && box) {
        box.minX = Math.min(box.minX, op.x);
        box.maxX = Math.max(box.maxX, op.x);
      }
    }
    if (box) boxes.push(box);
    expect(boxes.length).toBeGreaterThanOrEqual(2);
    expect(boxes.every((item) => item.maxX - item.minX > 10)).toBe(true);
  });

  it.each(cases)("$id", ({ id, shape, backing: sheet }) => {
    const expected = contours.cases.find((c) => c.id === id)!;
    const actual = build(shape, sheet);
    expect(actual.centerlines.length).toBe(expected.centerlines.length);
    let max = 0;
    actual.centerlines.forEach((line, li) => {
      const exp = expected.centerlines[li]!;
      expect(line.closed).toBe(exp.closed);
      expect(line.points.length, "centerline points").toBe(exp.points.length);
      line.points.forEach((pt, i) => {
        max = Math.max(max, Math.abs(pt.x - exp.points[i]![0]), Math.abs(pt.y - exp.points[i]![1]));
      });
    });
    expect(actual.commands.length).toBe(expected.commands.length);
    actual.commands.forEach((command, ci) => {
      const exp = expected.commands[ci]!;
      expect(command.style).toBe(exp.style);
      expect(command.path.length, "path ops").toBe(exp.path.length);
      command.path.forEach((op, i) => {
        const row = exp.path[i] as unknown[];
        expect(op.op).toBe(row[0]);
        const nums = op.op === "Z" ? [] : Object.values(op).filter((v) => typeof v === "number");
        nums.forEach((n, k) => {
          max = Math.max(max, Math.abs(n - (row[k + 1] as number)));
        });
      });
    });
    expect(max).toBeLessThanOrEqual(1e-4);
    if (id === "shadow") {
      expect(actual.commands[0]?.sheetShadow).toMatchObject({
        opacity: 0.35,
        x: 6,
        y: 8,
        radius: 8,
      });
    }
  });

  it("group", () => {
    const sheet = backing("smooth");
    const part = (shape: Shape, seed: bigint, transform?: GroupPart["transform"]): GroupPart => {
      const options = resolveSketchOptions({ seed, strokeWidth: 3, stickerBacking: sheet });
      const fill = basicSketchy.resolveSpec("fill", { kind: options.fillStyle });
      const drawing = generateDrawing(
        shape,
        options,
        createFillStage({ fill, options, report() {} }),
      );
      if (!drawing) throw new Error("empty");
      return { shape, options, drawing, ...(transform ? { transform } : {}) };
    };
    const actual = groupCommands(
      [
        part(rectangle(30, 70, 100, 80), 42n),
        part(circleShape(130, 110, 90), 7n, [1, 0, 0, 1, 10, 0]),
      ],
      sheet,
      42n,
    );
    const expected = contours.cases.find((c) => c.id === "group")!;
    // Swift chains the union from a Dictionary, whose iteration order picks the
    // start vertex. The cycle matches; rotate to that vertex before comparing.
    const aligned = actual.centerlines.map((line, li) => {
      const exp = expected.centerlines[li]!.points;
      let best = Infinity;
      let at = 0;
      for (let shift = 0; shift < exp.length; shift++) {
        let m = 0;
        for (let i = 0; i < line.points.length; i++) {
          const e = exp[(i + shift) % exp.length]!;
          m = Math.max(m, Math.abs(line.points[i]!.x - e[0]), Math.abs(line.points[i]!.y - e[1]));
        }
        if (m < best) {
          best = m;
          at = shift;
        }
      }
      const start = (line.points.length - at) % line.points.length;
      const points = line.points.slice(start).concat(line.points.slice(0, start));
      return { ...line, points, source: points };
    });
    const commands = commandsForLines(aligned, sheet.width, sheet, 42n);
    const rebuilt = { centerlines: aligned, commands };
    let max = 0;
    rebuilt.centerlines.forEach((line, li) => {
      const exp = expected.centerlines[li]!;
      expect(line.points.length).toBe(exp.points.length);
      line.points.forEach((pt, i) => {
        max = Math.max(max, Math.abs(pt.x - exp.points[i]![0]), Math.abs(pt.y - exp.points[i]![1]));
      });
    });
    expect(rebuilt.commands.length).toBe(expected.commands.length);
    rebuilt.commands.forEach((command, ci) => {
      const exp = expected.commands[ci]!;
      expect(command.style).toBe(exp.style);
      expect(command.path.length).toBe(exp.path.length);
      if (command.lineWidth !== undefined) expect(command.lineWidth).toBe(exp.lineWidth);
      command.path.forEach((op, i) => {
        const row = exp.path[i] as unknown[];
        expect(op.op).toBe(row[0]);
        const nums =
          op.op === "Z" ? [] : Object.values(op).filter((v): v is number => typeof v === "number");
        nums.forEach((n, k) => {
          max = Math.max(max, Math.abs(n - (row[k + 1] as number)));
        });
      });
    });
    expect(max).toBeLessThanOrEqual(1e-4);
  });
});
