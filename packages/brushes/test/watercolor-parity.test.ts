import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ellipse, path, rectangle } from "@sketchy-js/core";
import { defaultSketchOptions } from "@sketchy-js/core/options";
import { sketchScene } from "@sketchy-js/scene";
import { basicSketchy } from "@sketchy-js/scene/basic";
import type { DrawLayer, PathOp } from "@sketchy-js/types";
import { watercolor, watercolorFill } from "../src/watercolor.js";

const fixture = JSON.parse(
  readFileSync(
    new URL(
      "../../../fixtures/swift-reference/v1.5.0/brushes/crayon-watercolor.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as {
  watercolorRectangle: { commands: FixtureCommand[] };
  watercolorEllipseFill: { commands: FixtureCommand[] };
};

interface FixtureCommand {
  path: [string, ...number[]][];
  color: { a: number };
  clip?: [string, ...number[]][];
}

const registry = basicSketchy.use(watercolor).use(watercolorFill);

function washScene(shape: ReturnType<typeof rectangle>, width: number, height: number) {
  const profile = defaultSketchOptions().brushProfile;
  return sketchScene(
    registry,
    shape,
    { width, height },
    {
      seed: 42n,
      strokeWidth: 12,
      fillStyle: "watercolor",
      brushProfile: {
        ...profile,
        watercolor: {
          pigment: 0.72,
          wetness: 0.6,
          edgeDarkening: 0.75,
          layers: 3,
          variation: 0.45,
          bleed: 0.5,
          seed: 1,
        },
      },
    },
  );
}

function nums(op: PathOp): number[] {
  if (op.op === "M" || op.op === "L") return [op.x, op.y];
  if (op.op === "C") return [op.c1x, op.c1y, op.c2x, op.c2y, op.x, op.y];
  if (op.op === "Q") return [op.cx, op.cy, op.x, op.y];
  return [];
}

/** Largest coordinate gap. Fill fixture alphas are 0 because the default fill color is clear. */
function maxDelta(
  layers: readonly DrawLayer[],
  commands: readonly FixtureCommand[],
  alphas: boolean,
): number {
  if (layers.length !== commands.length) return Infinity;
  let max = 0;
  for (let i = 0; i < layers.length; i++) {
    const path = layers[i]!.paths[0]!;
    const expected = commands[i]!.path;
    if (path.length !== expected.length) return Infinity;
    if (alphas && Math.abs((layers[i]!.paint.alpha ?? 1) - commands[i]!.color.a) > max)
      max = Math.abs((layers[i]!.paint.alpha ?? 1) - commands[i]!.color.a);
    for (let k = 0; k < path.length; k++) {
      const op = path[k]!;
      const element = expected[k]!;
      if (op.op !== element[0]) return Infinity;
      nums(op).forEach((value, index) => {
        max = Math.max(max, Math.abs(value - (element[index + 1] as number)));
      });
    }
  }
  return max;
}

describe("watercolor Darwin fixtures", () => {
  it("replays the rectangle stroke and the clipped fill", () => {
    const scene = washScene(rectangle(30, 36, 140, 120), 200, 200);
    expect(scene.diagnostics).toBeUndefined();
    const drawing = scene.nodes[0];
    expect(drawing?.type).toBe("drawing");
    if (drawing?.type !== "drawing") return;
    const strokes = drawing.drawing.layers.filter((layer) => layer.role === "stroke");
    const fills = drawing.drawing.layers.filter((layer) => layer.role === "fill");
    const commands = fixture.watercolorRectangle.commands;
    expect(
      maxDelta(
        strokes,
        commands.filter((command) => !command.clip),
        true,
      ),
    ).toBeLessThanOrEqual(1e-4);
    expect(
      maxDelta(
        fills,
        commands.filter((command) => command.clip),
        false,
      ),
    ).toBeLessThanOrEqual(1e-4);
    expect(fills.every((layer) => layer.clip?.paths.length === 1)).toBe(true);
  });

  it("replays the ellipse stroke and the clipped fill", () => {
    const scene = washScene(ellipse(100, 100, 140, 100), 200, 200);
    const drawing = scene.nodes[0];
    expect(drawing?.type).toBe("drawing");
    if (drawing?.type !== "drawing") return;
    const strokes = drawing.drawing.layers.filter((layer) => layer.role === "stroke");
    const fills = drawing.drawing.layers.filter((layer) => layer.role === "fill");
    const commands = fixture.watercolorEllipseFill.commands;
    expect(
      maxDelta(
        strokes,
        commands.filter((command) => !command.clip),
        true,
      ),
    ).toBeLessThanOrEqual(1e-4);
    expect(
      maxDelta(
        fills,
        commands.filter((command) => command.clip),
        false,
      ),
    ).toBeLessThanOrEqual(1e-4);
  });

  it("washes an SVG path instead of painting one solid area", () => {
    const scene = washScene(path("M 20 20 H 140 V 90 H 20 Z"), 200, 200);
    const drawing = scene.nodes[0];
    expect(drawing?.type).toBe("drawing");
    if (drawing?.type !== "drawing") return;
    const fills = drawing.drawing.layers.filter((layer) => layer.role === "fill");
    expect(fills.length).toBeGreaterThan(10);
    expect(fills.some((layer) => layer.paths[0]?.some((op) => op.op === "C"))).toBe(true);
    expect(scene.diagnostics).toBeUndefined();
  });
});
