import { createCanvas } from "@napi-rs/canvas";
import { Resvg } from "@resvg/resvg-js";
import { describe, expect, it } from "vitest";
import { curve, line, rectangle } from "@sketchy-js/core";
import { defaultSketchOptions } from "@sketchy-js/core/options";
import { sketchScene } from "@sketchy-js/scene";
import { basicSketchy, sketch } from "@sketchy-js/scene/basic";
import { renderToSvgString } from "@sketchy-js/svg-renderer";
import type { DrawLayer, Matrix2D, Path, Scene, SceneNode } from "@sketchy-js/types";
import { crayon, watercolor, watercolorFill } from "@sketchy-js/brushes";
import { renderToCanvas, type Canvas2D, type CanvasSurfaceFactory } from "../src/index.js";

/**
 * SVG (resvg) versus Canvas (napi) agreement.
 *
 * A pixel differs when any channel, including alpha, differs by more than `CHANNEL_DELTA`.
 * At most 3% of the pixels in a scene may differ (`MAX_DIFF_FRACTION`). The limit is loose enough
 * for antialiased edges and tight enough that a missing clip, a black mask, or a dropped
 * transform fails. HiDPI uses the same limit on a 2× backing store.
 */
export const CHANNEL_DELTA = 24;
const MAX_DIFF_FRACTION = 0.03;

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

function compare(scene: Scene, scale = 1): number {
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
  return diffFraction(rendered.pixels, pixels, CHANNEL_DELTA);
}

function expectClose(scene: Scene, scale = 1): void {
  expect(compare(scene, scale)).toBeLessThanOrEqual(MAX_DIFF_FRACTION);
}

const red: DrawLayer["paint"] = { kind: "solid", color: "#ff0000" };

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
    expectClose(scene);
    expectClose(scene, 2);
    const canvas = createCanvas(80, 60);
    const context = canvas.getContext("2d");
    context.scale(2, 2);
    renderToCanvas(scene, context as unknown as Canvas2D, { createSurface: surface });
    const pixel = context.getImageData(40, 30, 1, 1).data;
    expect(pixel[0]).toBeGreaterThan(200);
    expect(pixel[1]).toBeLessThan(40);
    expect(pixel[2]).toBeLessThan(40);
  });

  it("matches clips, inverse clips, and both fill rules", () => {
    const hole: Path = [
      ...rect(8, 8, 64, 44),
      { op: "M", x: 28, y: 22 },
      { op: "L", x: 52, y: 22 },
      { op: "L", x: 52, y: 38 },
      { op: "L", x: 28, y: 38 },
      { op: "Z" },
    ];
    const sameWay: Path = [...rect(15, 12, 30, 24), ...rect(15, 12, 30, 24)];
    for (const fillRule of ["nonzero", "evenodd"] as const) {
      expectClose(
        sceneOf([
          drawing([
            layer({
              paths: [rect(0, 0, 80, 60)],
              paint: { kind: "solid", color: "#2255aa" },
              clip: { paths: [rect(18, 14, 36, 28)], fillRule },
            }),
          ]),
        ]),
      );
      expectClose(
        sceneOf([
          drawing([
            layer({
              paths: [rect(0, 0, 80, 60)],
              paint: { kind: "solid", color: "#2255aa" },
              clip: { paths: [hole], fillRule, inverse: true },
            }),
          ]),
        ]),
      );
      expectClose(
        sceneOf([
          drawing([
            layer({
              paths: [rect(0, 0, 80, 60)],
              paint: { kind: "solid", color: "#c45520" },
              clip: { paths: [sameWay], fillRule, inverse: true },
            }),
          ]),
        ]),
      );
    }
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
    expectClose(scene);
    expectClose(scene, 2);
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
    expectClose(scene);
    expectClose(scene, 2);
  });

  it("matches scribble, crayon, and watercolor", () => {
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
      line(8, 40, 72, 16),
      { width: 80, height: 60 },
      {
        seed: 5n,
        strokeWidth: 8,
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
    expectClose(scribble);
    expectClose(wax);
    expectClose(wash);
  });
});
