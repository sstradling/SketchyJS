import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import { circle, type Shape } from "@sketchy-js/core";
import { basicSketchy } from "@sketchy-js/scene/basic";
import { edgeShade, halo, pitRecess, pitShadow, sketchScene } from "@sketchy-js/scene";
import {
  footAnchor,
  silhouetteScene,
  treeShadow,
  type SilhouetteImage,
} from "@sketchy-js/scene/silhouette";
import type { Color, InteriorShade, SilhouetteShadowDraw } from "@sketchy-js/types";
import { renderToCanvas, type Canvas2D, type CanvasSurfaceFactory } from "../src/index.js";

/**
 * Swift PNGs cover what a path cannot: shade blur and a tinted silhouette.
 * The limit is the one in docs/visual-review.md (delta 24, 20%). Geometry is
 * checked separately at 1e-4. This file does not widen that limit.
 */

const root = fileURLToPath(new URL("../../../fixtures/swift-reference/v1.6.0/", import.meta.url));
/** SwiftUI `Color.blue` in this export is sRGB (0, 136, 255), not CSS blue. */
const SWIFT_BLUE = [0, 136 / 255, 1, 1] as const;

const DELTA = 12;
const MAX_FRACTION = 0.06;

const surface: CanvasSurfaceFactory = (width, height) => {
  const canvas = createCanvas(Math.max(1, Math.ceil(width)), Math.max(1, Math.ceil(height)));
  return { context: canvas.getContext("2d") as unknown as Canvas2D, image: canvas };
};

async function reference(
  relative: string,
): Promise<{ width: number; height: number; data: Uint8ClampedArray }> {
  const image = await loadImage(root + relative);
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  return {
    width: image.width,
    height: image.height,
    data: context.getImageData(0, 0, image.width, image.height).data,
  };
}

function fraction(actual: Uint8ClampedArray, expected: Uint8ClampedArray): number {
  const pixels = Math.min(actual.length, expected.length) / 4;
  let bad = 0;
  for (let i = 0; i < pixels; i++) {
    const o = i * 4;
    const differs =
      Math.abs((actual[o] ?? 0) - (expected[o] ?? 0)) > DELTA ||
      Math.abs((actual[o + 1] ?? 0) - (expected[o + 1] ?? 0)) > DELTA ||
      Math.abs((actual[o + 2] ?? 0) - (expected[o + 2] ?? 0)) > DELTA ||
      Math.abs((actual[o + 3] ?? 0) - (expected[o + 3] ?? 0)) > DELTA;
    if (differs) bad++;
  }
  return bad / pixels;
}

function paint(
  scene: Parameters<typeof renderToCanvas>[0],
  background: Color,
  images?: Record<string, unknown>,
): Uint8ClampedArray {
  const canvas = createCanvas(scene.size.width, scene.size.height);
  const context = canvas.getContext("2d");
  renderToCanvas(scene, context as unknown as Canvas2D, {
    background,
    createSurface: surface,
    ...(images ? { images: images as never } : {}),
  });
  return context.getImageData(0, 0, scene.size.width, scene.size.height).data;
}

const size = { width: 160, height: 160 };
const shades: Record<string, InteriorShade[]> = {
  "shade-pit-shadow": [pitShadow()],
  "shade-pit-recess": [pitRecess()],
  "shade-edge": [edgeShade()],
  "shade-halo": [halo([0.12, 0.45, 0.92, 1])],
  "shade-hole": [pitRecess()],
};

function shadeScene(id: string) {
  const shape: Shape =
    id === "shade-hole"
      ? { kind: "path", d: "M0 0 H160 V160 H0 Z M50 50 H110 V110 H50 Z" }
      : circle(80, 80, 100);
  const interiorShades = shades[id];
  if (!interiorShades) throw new Error(id);
  return sketchScene(basicSketchy, shape, size, {
    seed: 3n,
    roughness: 0,
    bowing: 0,
    maxRandomnessOffset: 0,
    strokeColor: [0, 0, 0, 0],
    strokeWidth: 0,
    fillColor: [1, 1, 1, 1],
    fillStyle: "solid",
    interiorShades,
  });
}

describe("v1.6.0 shade and silhouette pixels", () => {
  const beige: Color = [0.96, 0.93, 0.88, 1];

  it.each(["shade-pit-shadow", "shade-pit-recess", "shade-edge", "shade-halo", "shade-hole"])(
    "%s stays within the blur allowance",
    async (id) => {
      const ref = await reference(`images/shades/${id}.png`);
      const actual = paint(shadeScene(id), id === "shade-hole" ? SWIFT_BLUE : beige);
      const share = fraction(actual, ref.data);
      expect(share, `${id} differing fraction ${share}`).toBeLessThanOrEqual(MAX_FRACTION);
    },
  );

  it("pins the tree on the foot and matches both tinted cards", async () => {
    const doc = JSON.parse(readFileSync(root + "stickers/silhouette-shadow.json", "utf8")) as {
      cases: {
        id: string;
        color: { r: number; g: number; b: number; a: number };
        opacity: number;
        transform: number[];
        anchor: number[];
        position: number[];
        composedTransform: number[];
        png: string;
        footAnchor?: number[];
        anchorMatchesFoot?: boolean;
      }[];
    };
    const decoded = await loadImage(root + "images/silhouette-source.png");
    const sprite = createCanvas(decoded.width, decoded.height);
    const pixels = sprite.getContext("2d");
    pixels.drawImage(decoded, 0, 0);
    const data = pixels.getImageData(0, 0, decoded.width, decoded.height).data;
    const image: SilhouetteImage = {
      width: decoded.width,
      height: decoded.height,
      pixels: data,
      source: sprite,
      href: "sprite",
    };
    const foot = footAnchor(image);
    expect(foot).toEqual({ x: 14, y: 63.5 });

    const tree = treeShadow(image, { x: 90, y: 120 });
    expect(tree.opacity).toBeCloseTo(0.42, 6);
    expect(tree.transform).toEqual([1, 0, -0.58, 0.32, 0, 0]);
    expect(tree.anchor).toEqual(foot);
    const treeCase = doc.cases.find((entry) => entry.id === "silhouette-tree")!;
    expect(treeCase.anchorMatchesFoot).toBe(true);
    expect(treeCase.footAnchor).toEqual([14, 63.5]);
    expectCloseMatrix(composed(tree), treeCase.composedTransform, "tree");
    expectColor(tree.color, treeCase.color);

    const affine: SilhouetteShadowDraw = {
      href: "sprite",
      width: image.width,
      height: image.height,
      color: [22 / 255, 48 / 255, 14 / 255, 1],
      opacity: 0.42,
      transform: [0.9, 0.15, -0.4, 0.5, 0, 0],
      anchor: { x: 8, y: 40 },
      position: { x: 90, y: 110 },
      source: sprite,
    };
    const affineCase = doc.cases.find((entry) => entry.id === "silhouette-affine")!;
    expectCloseMatrix(composed(affine), affineCase.composedTransform, "affine");

    const images = { sprite };
    for (const [shadow, item] of [
      [tree, treeCase],
      [affine, affineCase],
    ] as const) {
      const scene = silhouetteScene({ width: 180, height: 160 }, shadow);
      const ref = await reference(item.png);
      const share = fraction(paint(scene, "#ffffff", images), ref.data);
      expect(share, `${item.id} differing fraction ${share}`).toBeLessThanOrEqual(MAX_FRACTION);
    }
  });
});

function composed(shadow: SilhouetteShadowDraw): number[] {
  const [a, b, c, d, e, f] = shadow.transform;
  const tx = (a ?? 1) * -shadow.anchor.x + (c ?? 0) * -shadow.anchor.y + (e ?? 0);
  const ty = (b ?? 0) * -shadow.anchor.x + (d ?? 1) * -shadow.anchor.y + (f ?? 0);
  return [a ?? 1, b ?? 0, c ?? 0, d ?? 1, tx + shadow.position.x, ty + shadow.position.y];
}

function expectCloseMatrix(actual: number[], expected: number[], label: string): void {
  expect(actual.length, label).toBe(expected.length);
  actual.forEach((value, index) => {
    expect(Math.abs(value - expected[index]!), `${label}[${index}]`).toBeLessThanOrEqual(1e-4);
  });
}

function expectColor(
  actual: Color,
  expected: { r: number; g: number; b: number; a: number },
): void {
  if (typeof actual === "string") throw new Error(actual);
  expect(Math.abs((actual[0] ?? 0) - expected.r)).toBeLessThanOrEqual(1e-4);
  expect(Math.abs((actual[1] ?? 0) - expected.g)).toBeLessThanOrEqual(1e-4);
  expect(Math.abs((actual[2] ?? 0) - expected.b)).toBeLessThanOrEqual(1e-4);
  expect(Math.abs((actual[3] ?? 1) - expected.a)).toBeLessThanOrEqual(1e-4);
}
