import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { generateDrawing, line, path, rectangle, type Shape } from "@sketchy-js/core";
import { resolveSketchOptions } from "@sketchy-js/core/options";
import {
  commandsForLines,
  groupCommands,
  stickerCommands,
  stickerLayers,
  type GroupPart,
  type StickerCommand,
} from "@sketchy-js/stickers";
import type { Matrix2D, StickerBacking } from "@sketchy-js/types";
import { basicSketchy } from "../src/basic.js";
import { createFillStage } from "../src/fill-stage.js";

const phase3 = JSON.parse(
  readFileSync(
    new URL("../../../fixtures/swift-reference/v1.5.0/stickers/phase3.json", import.meta.url),
    "utf8",
  ),
) as {
  cases: {
    id: string;
    storedSmoothness: number;
    centerlines: { closed: boolean; points: [number, number][] }[];
    commands: {
      style: string;
      path: unknown[];
      lineWidth?: number;
      fillRule?: string;
      stickerImage?: { tileWidth: number; opacity: number; scale: number };
    }[];
  }[];
};

const white = [1, 1, 1, 1] as const;

function sheet(
  partial: Partial<StickerBacking> & Pick<StickerBacking, "width" | "smoothness" | "edge">,
): StickerBacking {
  return { color: [...white], ...partial };
}

function drawingOf(shape: Shape, options: ReturnType<typeof resolveSketchOptions>) {
  const fill = basicSketchy.resolveSpec("fill", { kind: options.fillStyle });
  const drawing = generateDrawing(shape, options, createFillStage({ fill, options, report() {} }));
  if (!drawing) throw new Error("empty drawing");
  return drawing;
}

function part(
  shape: Shape,
  options: Parameters<typeof resolveSketchOptions>[0],
  transform?: Matrix2D,
): GroupPart {
  const resolved = resolveSketchOptions(options);
  return {
    shape,
    options: resolved,
    drawing: drawingOf(shape, resolved),
    ...(transform ? { transform } : {}),
  };
}

function maxDelta(
  actual: {
    centerlines: { closed: boolean; points: { x: number; y: number }[] }[];
    commands: StickerCommand[];
  },
  expected: (typeof phase3.cases)[number],
): number {
  expect(actual.centerlines.length, "centerline count").toBe(expected.centerlines.length);
  expect(actual.commands.length, "command count").toBe(expected.commands.length);
  let max = 0;
  actual.centerlines.forEach((line, index) => {
    const exp = expected.centerlines[index]!;
    expect(line.closed).toBe(exp.closed);
    expect(line.points.length, `${expected.id} centerline ${index}`).toBe(exp.points.length);
    line.points.forEach((pt, i) => {
      max = Math.max(max, Math.abs(pt.x - exp.points[i]![0]), Math.abs(pt.y - exp.points[i]![1]));
    });
  });
  actual.commands.forEach((command, index) => {
    const exp = expected.commands[index]!;
    expect(command.style).toBe(exp.style);
    expect(command.path.length, `${expected.id} command ${index} ops`).toBe(exp.path.length);
    if (command.lineWidth !== undefined)
      expect(command.lineWidth).toBeCloseTo(exp.lineWidth ?? NaN, 6);
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
  return max;
}

/** Rotates each closed ring onto the fixture's start vertex, then rebuilds the sheet. */
function alignedGroup(
  actual: ReturnType<typeof groupCommands>,
  expected: (typeof phase3.cases)[number],
  backing: StickerBacking,
  seed: bigint,
) {
  const centerlines = actual.centerlines.map((line, index) => {
    const exp = expected.centerlines[index]!;
    if (!line.closed || line.points.length !== exp.points.length) return line;
    let best = Infinity;
    let at = 0;
    for (let shift = 0; shift < exp.points.length; shift++) {
      let worst = 0;
      for (let i = 0; i < line.points.length; i++) {
        const e = exp.points[(i + shift) % exp.points.length]!;
        worst = Math.max(
          worst,
          Math.abs(line.points[i]!.x - e[0]),
          Math.abs(line.points[i]!.y - e[1]),
        );
      }
      if (worst < best) {
        best = worst;
        at = shift;
      }
    }
    const start = (line.points.length - at) % line.points.length;
    const points = line.points.slice(start).concat(line.points.slice(0, start));
    return { ...line, points, source: points };
  });
  return {
    centerlines,
    commands: commandsForLines(centerlines, backing.width, backing, seed),
  };
}

const byId = new Map(phase3.cases.map((item) => [item.id, item]));

describe("phase 3 Darwin sticker parity", () => {
  it("stores smoothness 1.5 as 1", () => {
    expect(byId.get("smoothness-1.5")?.storedSmoothness).toBe(1);
    expect(byId.get("smoothness-0.5")?.storedSmoothness).toBe(0.5);
  });

  it("torn-chop", () => {
    const expected = byId.get("torn-chop")!;
    const backing = sheet({
      width: 14,
      smoothness: 1,
      edge: { kind: "torn", depth: 8, length: 18, jaggedness: 0 },
    });
    const shape = rectangle(40, 40, 140, 90);
    const options = resolveSketchOptions({
      seed: 42n,
      strokeWidth: 3,
      roughness: 0,
      stickerBacking: backing,
    });
    const actual = stickerCommands(drawingOf(shape, options), shape, backing);
    expect(maxDelta(actual, expected)).toBeLessThanOrEqual(1e-4);
  });

  it("hole-smaller-than-margin", () => {
    const expected = byId.get("hole-smaller-than-margin")!;
    const backing = sheet({ width: 20, smoothness: 1, edge: "smooth" });
    const shape = path("M 30 30 H 190 V 190 H 30 Z M 100 100 H 112 V 112 H 100 Z");
    const options = resolveSketchOptions({
      seed: 42n,
      strokeWidth: 4,
      roughness: 0,
      stickerBacking: backing,
    });
    const actual = stickerCommands(drawingOf(shape, options), shape, backing);
    expect(maxDelta(actual, expected)).toBeLessThanOrEqual(1e-4);
  });

  it("open-ribbon", () => {
    const expected = byId.get("open-ribbon")!;
    const backing = sheet({ width: 10, smoothness: 0.2, edge: "smooth" });
    const shape = line(20, 60, 190, 64);
    const options = resolveSketchOptions({
      seed: 42n,
      strokeWidth: 3,
      roughness: 0,
      stickerBacking: backing,
    });
    const actual = stickerCommands(drawingOf(shape, options), shape, backing);
    expect(maxDelta(actual, expected)).toBeLessThanOrEqual(1e-4);
  });

  it.each([0.5, 1.5])("smoothness %s", (smoothness) => {
    const id = smoothness === 0.5 ? "smoothness-0.5" : "smoothness-1.5";
    const expected = byId.get(id)!;
    const backing = sheet({ width: 12, smoothness, edge: "smooth" });
    const shape = rectangle(36, 46, 148, 110);
    const options = resolveSketchOptions({
      seed: 42n,
      strokeWidth: 3,
      roughness: 1,
      bowing: 1,
      maxRandomnessOffset: 2,
      stickerBacking: backing,
    });
    const actual = stickerCommands(drawingOf(shape, options), shape, backing);
    expect(maxDelta(actual, expected)).toBeLessThanOrEqual(1e-4);
  });

  it("group-hole", () => {
    const expected = byId.get("group-hole")!;
    const backing = sheet({ width: 12, smoothness: 1, edge: "smooth" });
    const shape = path("M 24 24 H 196 V 196 H 24 Z M 78 78 H 142 V 142 H 78 Z");
    const built = groupCommands(
      [part(shape, { seed: 42n, strokeWidth: 3, roughness: 0, stickerBacking: backing })],
      backing,
      42n,
    );
    expect(maxDelta(alignedGroup(built, expected, backing, 42n), expected)).toBeLessThanOrEqual(
      1e-4,
    );
  });

  it("group-transform", () => {
    const expected = byId.get("group-transform")!;
    const backing = sheet({ width: 10, smoothness: 1, edge: "smooth" });
    const transform: Matrix2D = [
      0.9396926207859084, 0.3420201433256687, -0.3420201433256687, 0.9396926207859084, 28, 14,
    ];
    const shape = rectangle(40, 36, 80, 50);
    const built = groupCommands(
      [part(shape, { seed: 3n, strokeWidth: 4, roughness: 0, stickerBacking: backing }, transform)],
      backing,
      3n,
    );
    expect(maxDelta(alignedGroup(built, expected, backing, 3n), expected)).toBeLessThanOrEqual(
      1e-4,
    );
  });

  it("group-overlapping", () => {
    const expected = byId.get("group-overlapping")!;
    const backing = sheet({ width: 12, smoothness: 1, edge: "smooth" });
    const options = {
      strokeWidth: 0,
      roughness: 0,
      bowing: 0,
      maxRandomnessOffset: 0,
      stickerBacking: backing,
    };
    const built = groupCommands(
      [
        part(rectangle(0, 0, 100, 100), { seed: 1n, ...options }),
        part(rectangle(60, 0, 100, 100), { seed: 2n, ...options }),
      ],
      backing,
      1n,
    );
    expect(built.centerlines).toHaveLength(1);
    expect(maxDelta(alignedGroup(built, expected, backing, 1n), expected)).toBeLessThanOrEqual(
      1e-4,
    );
  });

  it("group-corner-sharing", () => {
    const expected = byId.get("group-corner-sharing")!;
    const backing = sheet({ width: 8, smoothness: 1, edge: "smooth" });
    const options = {
      strokeWidth: 0,
      roughness: 0,
      bowing: 0,
      maxRandomnessOffset: 0,
      stickerBacking: backing,
    };
    const built = groupCommands(
      [
        part(rectangle(0, 0, 50, 50), { seed: 1n, ...options }),
        part(rectangle(50, 50, 50, 50), { seed: 2n, ...options }),
      ],
      backing,
      1n,
    );
    expect(maxDelta(alignedGroup(built, expected, backing, 1n), expected)).toBeLessThanOrEqual(
      1e-4,
    );
  });

  it("paper-fibers", () => {
    const expected = byId.get("paper-fibers")!;
    const backing = sheet({
      width: 12,
      smoothness: 1,
      edge: "smooth",
      color: [0.95, 0.9, 0.75, 1],
      texture: { amount: 0.5, scale: 10, seed: 5n },
    });
    const shape = rectangle(30, 28, 100, 70);
    const options = resolveSketchOptions({
      seed: 42n,
      strokeWidth: 2,
      roughness: 0,
      stickerBacking: backing,
    });
    const actual = stickerCommands(drawingOf(shape, options), shape, backing);
    const layers = stickerLayers(actual.commands, backing, 42n);
    const fibers = layers
      .filter((layer) => layer.role === "texture")
      .map((layer): StickerCommand => ({
        style: "stroke",
        color: { r: 0, g: 0, b: 0, a: 1 },
        path: layer.paths[0] ?? [],
        bounds: [0, 0, 0, 0],
        cap: "round",
        join: "round",
        miterLimit: 10,
        fillRule: "evenOdd",
        inverseClip: false,
        maskOpacity: 1,
        opacityMaskBlur: 0,
        ...(layer.strokeWidth !== undefined ? { lineWidth: layer.strokeWidth } : {}),
      }));
    expect(
      maxDelta(
        { centerlines: actual.centerlines, commands: [...actual.commands, ...fibers] },
        expected,
      ),
    ).toBeLessThanOrEqual(1e-4);
  });

  it("image-hole", () => {
    const expected = byId.get("image-hole")!;
    const backing = sheet({
      width: 12,
      smoothness: 0.9,
      edge: { kind: "fullySmooth", radius: 0 },
    });
    const shape = path("M16 16 H144 V144 H16 Z M50 50 H110 V110 H50 Z");
    const options = resolveSketchOptions({
      seed: 9n,
      strokeWidth: 2,
      roughness: 1.2,
      stickerBacking: backing,
    });
    const actual = stickerCommands(drawingOf(shape, options), shape, backing);
    const image = actual.commands[0];
    const withImage = image
      ? {
          ...actual,
          commands: [...actual.commands, { ...image, style: "fill" as const }],
        }
      : actual;
    expect(expected.commands[1]?.stickerImage).toMatchObject({
      opacity: 0.6,
      scale: 24,
      tileWidth: 24,
    });
    expect(maxDelta(withImage, expected)).toBeLessThanOrEqual(1e-4);
  });

  it("group-torn", () => {
    const expected = byId.get("group-torn")!;
    const backing = sheet({
      width: 12,
      smoothness: 0.4,
      edge: { kind: "torn", depth: 5, length: 14, jaggedness: 0.3 },
    });
    // The fixture records the part offset and tear, not the circle centers or
    // diameters. The Darwin centerline is the silhouette; this checks the torn
    // contour built from it.
    const centerlines = expected.centerlines.map((line) => ({
      points: line.points.map(([x, y]) => ({ x, y })),
      closed: line.closed,
      source: line.points.map(([x, y]) => ({ x, y })),
    }));
    const commands = commandsForLines(centerlines, backing.width, backing, 11n);
    expect(maxDelta({ centerlines, commands }, expected)).toBeLessThanOrEqual(1e-4);
  });
});
