import { describe, expect, it } from "vitest";
import { createGeometryKit, createRoughKit, Rng } from "@sketchy-js/core";
import { resolveSketchOptions } from "@sketchy-js/core/options";
import {
  assertDeterministic,
  assertInputImmutable,
  withRandomGuard,
  type BrushInput,
  type FillInput,
  type PluginContext,
} from "@sketchy-js/plugin";
import { crayon } from "../src/crayon.js";
import { watercolor, watercolorFill } from "../src/watercolor.js";

function context(seed = 1n): PluginContext {
  const options = resolveSketchOptions({ seed });
  const rng = new Rng(seed);
  return {
    rng,
    geom: createGeometryKit(createRoughKit({ o: options, rng })),
    quality: "final",
    maxOps: 200_000,
    warn: () => undefined,
  };
}

const crayonOptions = {
  grain: 0.28,
  edgeRoughness: 0.75,
  widthVariation: 0.18,
  opacityVariation: 0.35,
  passes: 2,
  baseOpacity: 0.8,
  baseSoftness: 0.5,
  grit: 0.92,
  flakeSize: 1.45,
};

const washOptions = {
  pigment: 0.72,
  wetness: 0.6,
  edgeDarkening: 0.75,
  layers: 3,
  variation: 0.45,
  bleed: 0.5,
  seed: 4,
};

const stroke: BrushInput = {
  path: [
    { op: "M", x: 8, y: 40 },
    { op: "L", x: 70, y: 16 },
    { op: "L", x: 120, y: 48 },
  ],
  bounds: { x: 8, y: 16, width: 112, height: 32 },
  stroke: {
    width: 10,
    color: "#112233",
    opacity: 1,
    cap: "round",
    join: "round",
    miterLimit: 10,
  },
  seed: 9n,
};

const square: FillInput = {
  region: {
    rings: [
      {
        points: [
          { x: 10, y: 10 },
          { x: 80, y: 12 },
          { x: 76, y: 50 },
          { x: 14, y: 48 },
        ],
        closed: true,
        length: 200,
      },
    ],
    path: [
      { op: "M", x: 10, y: 10 },
      { op: "L", x: 80, y: 12 },
      { op: "L", x: 76, y: 50 },
      { op: "L", x: 14, y: 48 },
      { op: "Z" },
    ],
    bounds: { x: 10, y: 10, width: 70, height: 40 },
    fillRule: "nonzero",
  },
  fill: { weight: 1, gap: 4, angle: 45, color: "#224466", opacity: 1 },
};

describe("brush conformance", () => {
  it("runs crayon under the determinism, immutability, and randomness guards", () => {
    const run = (): unknown => crayon.generate(stroke, crayonOptions, context());
    assertDeterministic(run);
    withRandomGuard(run);
    const output = assertInputImmutable(
      (input) => crayon.generate(input, crayonOptions, context()),
      stroke,
    );
    expect(output.length).toBeGreaterThan(0);
  });

  it("runs the watercolor stroke under the same guards", () => {
    const run = (): unknown => watercolor.generate({ ...stroke, seed: 4n }, washOptions, context());
    assertDeterministic(run);
    withRandomGuard(run);
    const output = assertInputImmutable(
      (input) => watercolor.generate(input, washOptions, context()),
      { ...stroke, seed: 4n },
    );
    expect(output.length).toBeGreaterThan(0);
  });

  it("runs the watercolor fill under the same guards", () => {
    const run = (): unknown => watercolorFill.generate(square, washOptions, context());
    assertDeterministic(run);
    withRandomGuard(run);
    const output = assertInputImmutable(
      (input) => watercolorFill.generate(input, washOptions, context()),
      square,
    );
    expect(output.length).toBeGreaterThan(0);
  });
});
