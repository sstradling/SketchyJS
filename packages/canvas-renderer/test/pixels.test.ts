import { createCanvas } from "@napi-rs/canvas";
import { Resvg } from "@resvg/resvg-js";
import { describe, expect, it } from "vitest";
import { curve, line, rectangle } from "@sketchy-js/core";
import { defaultSketchOptions } from "@sketchy-js/core/options";
import { sketchScene } from "@sketchy-js/scene";
import { basicSketchy, sketch } from "@sketchy-js/scene/basic";
import { renderToSvgString } from "@sketchy-js/svg-renderer";
import type { DrawLayer, FillRule, Matrix2D, Path, Scene, SceneNode } from "@sketchy-js/types";
import { crayon, watercolor, watercolorFill } from "@sketchy-js/brushes";
import { renderToCanvas, type Canvas2D, type CanvasSurfaceFactory } from "../src/index.js";

/**
 * SVG (resvg) versus Canvas (napi) agreement, with a limit per kind of scene.
 *
 * A pixel differs when any channel, including alpha, differs by more than the scene's
 * channel delta. Geometric scenes (fills, clips, strokes, transforms, curves) allow 0.3%
 * of pixels to differ at delta 24, about 0.2%. The allowance is 0.4% because a round cap
 * measures up to 0.31% from antialiasing. It still fails a dropped even-odd rule, a 1 px
 * transform, a wrong cap, or a quadratic drawn as a line. Watercolor and crayon use
 * delta 4 and at most 2% differing, so a glaze whose alpha is below 0.2 (about 51) is not
 * hidden inside the old delta of 24.
 * Scribble keeps the looser Phase 2 limit: delta 24 and 3%. Its strokes are a dense field
 * of short overlapping marks, and resvg and Canvas antialias those crossings differently
 * even when the paths match.
 */
export const CHANNEL_DELTA = 24;

export const PIXEL_LIMITS = {
  /**
   * About 0.2% of the scene. The allowance is 0.4%: a round cap measures up to 0.31%
   * (15 pixels on 80×60) from antialiasing, and a couple of pixels of raster noise
   * sit on top of that. A 1 px shift, a filled-in hole, or a wrong cap moves more.
   */
  geometric: { delta: 24, maxFraction: 0.004 },
  /** Faint watercolor and crayon layers. Delta 4 is below an alpha of 0.2. */
  soft: { delta: 4, maxFraction: 0.02 },
  /**
   * Scribble only. Looser than geometric scenes because the fill is many short
   * overlapping strokes; the paths themselves are checked geometrically elsewhere.
   */
  scribble: { delta: 24, maxFraction: 0.03 },
} as const;

type PixelLimit = { readonly delta: number; readonly maxFraction: number };

const surface: CanvasSurfaceFactory = (width, height) => {
  const canvas = createCanvas(Math.max(1, Math.ceil(width)), Math.max(1, Math.ceil(height)));
  const context = canvas.getContext("2d");
  return { context: context as unknown as Canvas2D, image: canvas };
};

function layer(partial: Pick<DrawLayer, "paths" | "paint"> & Partial<DrawLayer>): DrawLayer {
  return {
    role: "fill",
    fillRule: "nonzero",
    ...partial,
  };
}

function drawing(layers: readonly DrawLayer[], transform?: Matrix2D): SceneNode {
  return {
    type: "drawing",
    drawing: { shape: "rectangle", outline: [], layers },
    ...(transform ? { transform } : {}),
  };
}

function sceneOf(nodes: readonly SceneNode[], width = 80, height = 60): Scene {
  return { version: 1, size: { width, height }, nodes };
}

const rect = (x: number, y: number, w: number, h: number): Path => [
  { op: "M", x, y },
  { op: "L", x: x + w, y },
  { op: "L", x: x + w, y: y + h },
  { op: "L", x, y: y + h },
  { op: "Z" },
];

function diffFraction(
  svg: Uint8Array | Uint8ClampedArray,
  canvas: Uint8Array | Uint8ClampedArray,
  delta: number,
): number {
  const pixels = Math.min(svg.length, canvas.length) / 4;
  let bad = 0;
  for (let i = 0; i < pixels; i++) {
    const o = i * 4;
    const differs =
      Math.abs((svg[o] ?? 0) - (canvas[o] ?? 0)) > delta ||
      Math.abs((svg[o + 1] ?? 0) - (canvas[o + 1] ?? 0)) > delta ||
      Math.abs((svg[o + 2] ?? 0) - (canvas[o + 2] ?? 0)) > delta ||
      Math.abs((svg[o + 3] ?? 0) - (canvas[o + 3] ?? 0)) > delta;
    if (differs) bad++;
  }
  return bad / pixels;
}

function compare(scene: Scene, delta: number, scale = 1): number {
  const svg = renderToSvgString(scene, { background: "#ffffff" });
  const width = scene.size.width * scale;
  const height = scene.size.height * scale;
  const rendered = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    background: "#ffffff",
  }).render();
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  context.scale(scale, scale);
  renderToCanvas(scene, context as unknown as Canvas2D, {
    background: "#ffffff",
    createSurface: surface,
  });
  const pixels = context.getImageData(0, 0, width, height).data;
  expect(rendered.width).toBe(width);
  expect(rendered.height).toBe(height);
  return diffFraction(rendered.pixels, pixels, delta);
}

function expectClose(scene: Scene, limit: PixelLimit, scale = 1): void {
  const fraction = compare(scene, limit.delta, scale);
  expect(fraction).toBeLessThanOrEqual(limit.maxFraction);
}

const red: DrawLayer["paint"] = { kind: "solid", color: "#ff0000" };
const blue: DrawLayer["paint"] = { kind: "solid", color: "#2255aa" };

/** Outer rectangle with a same-winding rectangular hole. Even-odd punches the hole; nonzero does not. */
const holeClip: Path = [...rect(6, 6, 68, 48), ...rect(28, 20, 24, 18)];

/** Two same-winding rectangles that overlap. Even-odd leaves the overlap empty. */
const overlap: Path = [...rect(8, 14, 36, 28), ...rect(28, 18, 40, 28)];

function clippedScene(fillRule: FillRule, inverse = false): Scene {
  return sceneOf([
    drawing([
      layer({
        paths: [rect(0, 0, 80, 60)],
        paint: blue,
        clip: { paths: [inverse ? holeClip : rect(18, 14, 36, 28)], fillRule, inverse },
      }),
    ]),
  ]);
}

describe("SVG and Canvas pixels", () => {
  it("tints a hex mask red, including under a device-pixel scale", () => {
    const scene = sceneOf([
      drawing([
        layer({
          paths: [rect(10, 10, 40, 30)],
          paint: red,
          mask: { group: 1, opacity: 1 },
        }),
      ]),
    ]);
    expectClose(scene, PIXEL_LIMITS.geometric);
    expectClose(scene, PIXEL_LIMITS.geometric, 2);
    const canvas = createCanvas(80, 60);
    const context = canvas.getContext("2d");
    context.scale(2, 2);
    renderToCanvas(scene, context as unknown as Canvas2D, { createSurface: surface });
    const pixel = context.getImageData(40, 30, 1, 1).data;
    expect(pixel[0]).toBeGreaterThan(200);
    expect(pixel[1]).toBeLessThan(40);
    expect(pixel[2]).toBeLessThan(40);
  });

  it("matches clips and inverse clips", () => {
    for (const fillRule of ["nonzero", "evenodd"] as const) {
      expectClose(clippedScene(fillRule), PIXEL_LIMITS.geometric);
      expectClose(clippedScene(fillRule, true), PIXEL_LIMITS.geometric);
    }
  });

  it("punches a hole with an even-odd clip and keeps it with nonzero", () => {
    const scene = (fillRule: FillRule): Scene =>
      sceneOf([
        drawing([
          layer({
            paths: [rect(0, 0, 80, 60)],
            paint: { kind: "solid", color: "#c45520" },
            clip: { paths: [holeClip], fillRule },
          }),
        ]),
      ]);
    expectClose(scene("evenodd"), PIXEL_LIMITS.geometric);
    expectClose(scene("nonzero"), PIXEL_LIMITS.geometric);
  });

  it("matches an even-odd fill of overlapping subpaths", () => {
    for (const fillRule of ["evenodd", "nonzero"] as const) {
      expectClose(
        sceneOf([
          drawing([
            layer({
              paths: [overlap],
              paint: { kind: "solid", color: "#0b6b4f" },
              fillRule,
            }),
          ]),
        ]),
        PIXEL_LIMITS.geometric,
      );
    }
  });

  it("matches butt, round, and square caps and every join", () => {
    const angle: Path = [
      { op: "M", x: 12, y: 46 },
      { op: "L", x: 40, y: 12 },
      { op: "L", x: 68, y: 48 },
    ];
    const caps = ["butt", "round", "square"] as const;
    const joins = ["miter", "round", "bevel", { kind: "curvedBevel", bulge: 0.6 }] as const;
    for (const cap of caps) {
      for (const join of joins) {
        expectClose(
          sceneOf([
            drawing([
              layer({
                role: "stroke",
                paths: [angle],
                paint: { kind: "solid", color: "#1a1a1a" },
                strokeWidth: 8,
                cap,
                join,
                miterLimit: 4,
              }),
            ]),
          ]),
          PIXEL_LIMITS.geometric,
        );
      }
    }
  });

  it("honors a miter limit of 1 on a sharp corner", () => {
    const angle: Path = [
      { op: "M", x: 12, y: 46 },
      { op: "L", x: 40, y: 8 },
      { op: "L", x: 68, y: 48 },
    ];
    expectClose(
      sceneOf([
        drawing([
          layer({
            role: "stroke",
            paths: [angle],
            paint: { kind: "solid", color: "#1a1a1a" },
            strokeWidth: 10,
            cap: "butt",
            join: "miter",
            miterLimit: 1,
          }),
        ]),
      ]),
      PIXEL_LIMITS.geometric,
    );
  });

  it("matches a quadratic curve", () => {
    const quad: Path = [
      { op: "M", x: 8, y: 46 },
      { op: "Q", cx: 40, cy: 2, x: 72, y: 46 },
      { op: "Q", cx: 40, cy: 58, x: 8, y: 46 },
      { op: "Z" },
    ];
    expectClose(
      sceneOf([
        drawing([
          layer({
            paths: [quad],
            paint: { kind: "solid", color: "#5b2a86" },
            fillRule: "evenodd",
          }),
        ]),
      ]),
      PIXEL_LIMITS.geometric,
    );
  });

  it("matches a variable-opacity mask", () => {
    const scene = sceneOf([
      drawing([
        layer({
          paths: [rect(8, 10, 50, 18)],
          paint: { kind: "solid", color: [0.1, 0.35, 0.7, 1] },
          mask: { group: 1, opacity: 0.35 },
        }),
        layer({
          paths: [rect(20, 18, 50, 18)],
          paint: { kind: "solid", color: [0.1, 0.35, 0.7, 1] },
          mask: { group: 1, opacity: 0.9 },
        }),
      ]),
    ]);
    expectClose(scene, PIXEL_LIMITS.geometric);
    expectClose(scene, PIXEL_LIMITS.geometric, 2);
  });

  it("matches nested transforms at 1× and 2×", () => {
    const scene = sceneOf([
      {
        type: "group",
        transform: [1, 0, 0, 1, 12, 8],
        children: [
          {
            type: "group",
            transform: [1, 0, 0, 1, 6, 4],
            children: [
              drawing(
                [
                  layer({
                    paths: [rect(0, 0, 16, 12)],
                    paint: { kind: "solid", color: "#0b6b4f" },
                  }),
                ],
                [2, 0, 0, 2, 0, 0],
              ),
            ],
          },
        ],
      },
    ]);
    expectClose(scene, PIXEL_LIMITS.geometric);
    expectClose(scene, PIXEL_LIMITS.geometric, 2);
  });

  it("matches scribble at the loose limit, and crayon and watercolor at delta 4", () => {
    const profile = defaultSketchOptions().brushProfile;
    const scribble = sketch(
      rectangle(8, 8, 64, 44),
      { width: 80, height: 60 },
      {
        seed: 3n,
        fillStyle: "scribble",
        fillColor: "#1d4e89",
        strokeColor: "#1a1a1a",
        strokeWidth: 2,
      },
    );
    const wax = sketchScene(
      basicSketchy.use(crayon),
      line(28, 30, 52, 30),
      { width: 80, height: 60 },
      {
        seed: 5n,
        strokeWidth: 4,
        strokeColor: "#7c2d12",
        fillColor: [0, 0, 0, 0],
        brushProfile: {
          ...profile,
          crayon: {
            grain: 0.28,
            edgeRoughness: 0.75,
            widthVariation: 0.18,
            opacityVariation: 0.35,
            passes: 2,
            baseOpacity: 0.8,
            baseSoftness: 0.5,
            grit: 0.92,
            flakeSize: 1.45,
            seed: 5,
          },
        },
      },
    );
    const wash = sketchScene(
      basicSketchy.use(watercolor).use(watercolorFill),
      curve([
        { x: 8, y: 46 },
        { x: 30, y: 8 },
        { x: 54, y: 46 },
        { x: 74, y: 14 },
      ]),
      { width: 80, height: 60 },
      {
        seed: 4n,
        strokeWidth: 8,
        strokeColor: "#1e4d6b",
        fillColor: [0, 0, 0, 0],
        brushProfile: {
          ...profile,
          watercolor: {
            pigment: 0.72,
            wetness: 0.6,
            edgeDarkening: 0.75,
            layers: 2,
            variation: 0.3,
            bleed: 0.4,
            seed: 4,
          },
        },
      },
    );
    expectClose(scribble, PIXEL_LIMITS.scribble);
    expectClose(wax, PIXEL_LIMITS.soft);
    expectClose(wash, PIXEL_LIMITS.soft);
  });
});
