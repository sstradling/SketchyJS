import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { createCanvas } from "@napi-rs/canvas";
import { Resvg } from "@resvg/resvg-js";
import { describe, expect, it } from "vitest";
import { circle, rectangle } from "@sketchy-js/core";
import { defaultSketchOptions } from "@sketchy-js/core/options";
import { skyWash } from "@sketchy-js/fills";
import { crayon } from "@sketchy-js/brushes";
import { basicSketchy, RoughView } from "@sketchy-js/scene/basic";
import { edgeShade, halo, pitRecess, pitShadow } from "@sketchy-js/scene";
import { silhouetteScene, treeShadow } from "@sketchy-js/scene/silhouette";
import { sketchScene } from "@sketchy-js/scene";
import { renderToSvgString } from "@sketchy-js/svg-renderer";
import {
  renderToCanvas,
  type Canvas2D,
  type CanvasRenderOptions,
  type CanvasSurfaceFactory,
} from "../src/index.js";
import type { Scene } from "@sketchy-js/types";

const dir = new URL("../../../docs/examples/phase-4/", import.meta.url);
const background = "#f4efe6";
const ink = [0.12, 0.16, 0.22, 1] as const;
const blue = [0.18, 0.38, 0.62, 1] as const;

const surface: CanvasSurfaceFactory = (width, height) => {
  const canvas = createCanvas(Math.max(1, Math.ceil(width)), Math.max(1, Math.ceil(height)));
  return { context: canvas.getContext("2d") as unknown as Canvas2D, image: canvas };
};

function renderPng(
  scene: Scene,
  images?: CanvasRenderOptions["images"],
): { png: Buffer; fraction: number } {
  const svg = renderToSvgString(scene, { background });
  const width = scene.size.width;
  const height = scene.size.height;
  const rendered = new Resvg(svg, { fitTo: { mode: "width", value: width }, background }).render();
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  renderToCanvas(scene, context as unknown as Canvas2D, {
    background,
    createSurface: surface,
    ...(images ? { images } : {}),
  });
  const pixels = context.getImageData(0, 0, width, height).data;
  const src = rendered.pixels;
  let bad = 0;
  const count = Math.min(src.length, pixels.length) / 4;
  for (let i = 0; i < count; i++) {
    const o = i * 4;
    const differs =
      Math.abs((src[o] ?? 0) - (pixels[o] ?? 0)) > 24 ||
      Math.abs((src[o + 1] ?? 0) - (pixels[o + 1] ?? 0)) > 24 ||
      Math.abs((src[o + 2] ?? 0) - (pixels[o + 2] ?? 0)) > 24 ||
      Math.abs((src[o + 3] ?? 0) - (pixels[o + 3] ?? 0)) > 24;
    if (differs) bad++;
  }
  return { png: canvas.toBuffer("image/png"), fraction: count === 0 ? 1 : bad / count };
}

function treeImage() {
  const canvas = createCanvas(96, 128);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#2f6b32";
  ctx.beginPath();
  ctx.moveTo(48, 8);
  ctx.lineTo(88, 72);
  ctx.lineTo(8, 72);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(40, 72, 16, 48);
  const image = ctx.getImageData(0, 0, 96, 128);
  return {
    width: 96,
    height: 128,
    pixels: image.data,
    href: `data:image/png;base64,${canvas.toBuffer("image/png").toString("base64")}`,
    canvas,
  };
}

describe("phase 4 previews", () => {
  it("writes the gallery and checks SVG against Canvas", () => {
    mkdirSync(dir, { recursive: true });
    const size = { width: 360, height: 260 };
    const profile = defaultSketchOptions().brushProfile;
    const contour = new RoughView()
      .with({
        seed: 7n,
        fillStyle: "contour",
        fillColor: blue,
        strokeColor: ink,
        contourGuide: { kind: "arc", x: 180, y: 520, radius: 460 },
        contourIntensity: 1,
        contourFalloff: 0.65,
        fillSpacing: 6,
      })
      .draw(rectangle(30, 24, 300, 200))
      .build(size);
    const wash = new RoughView()
      .with({
        seed: 11n,
        fillStyle: "wash",
        fillColor: [0.45, 0.62, 0.82, 1],
        strokeColor: ink,
        washPasses: [
          {
            ...skyWash[0]!,
            seed: 3n,
            widthMin: 10,
            widthSpan: 6,
            spacingMin: 8,
            spacingSpan: 4,
            trimMax: 10,
            bow: 8,
          },
        ],
      })
      .draw(rectangle(24, 30, 310, 190))
      .build(size);
    const sky = new RoughView()
      .with({ seed: 11n, fillStyle: "wash", fillColor: [0.55, 0.72, 0.9, 1], strokeColor: ink })
      .draw(rectangle(20, 20, 320, 200))
      .build({ width: 420, height: 280 });
    const shades = new RoughView()
      .with({
        seed: 4n,
        fillStyle: "solid",
        fillColor: [0.75, 0.22, 0.18, 1],
        strokeColor: ink,
        strokeWidth: 2,
        interiorShades: [pitShadow(), pitRecess(), edgeShade(), halo([1, 0.82, 0.2, 1])],
      })
      .draw(circle(180, 130, 140))
      .build(size);
    const variable = new RoughView()
      .with({
        seed: 8n,
        fillColor: [0, 0, 0, 0],
        strokeColor: ink,
        strokeWidth: 8,
        brushProfile: {
          ...profile,
          thicknessProfile: {
            kind: "stops",
            stops: [
              { position: 0, width: 2 },
              { position: 0.5, width: 16 },
              { position: 1, width: 2 },
            ],
          },
        },
      })
      .draw(circle(180, 130, 150))
      .build(size);
    const crayonScene = sketchScene(basicSketchy.use(crayon), circle(180, 130, 150), size, {
      seed: 8n,
      fillColor: [0, 0, 0, 0],
      strokeColor: [0.55, 0.16, 0.12, 1],
      strokeWidth: 14,
      brushProfile: {
        ...profile,
        crayon: { ...defaultCrayon(), seed: 8 },
        thicknessProfile: {
          kind: "stops",
          stops: [
            { position: 0, width: 4 },
            { position: 0.35, width: 18 },
            { position: 0.7, width: 8 },
            { position: 1, width: 4 },
          ],
        },
      },
    });
    const image = treeImage();
    const shadow = silhouetteScene(
      { width: 360, height: 220 },
      treeShadow({ ...image, href: image.href, source: image.canvas }, { x: 170, y: 150 }),
    );
    const reactExample = new RoughView()
      .with({ seed: 42n, fillStyle: "hachure", strokeColor: ink, fillColor: blue })
      .draw(rectangle(24, 24, 160, 100))
      .build({ width: 220, height: 160 });

    const files: [string, Scene, number][] = [
      ["contour.png", contour, 0.08],
      ["wash.png", wash, 0.08],
      ["sky-wash.png", sky, 0.12],
      ["interior-shades.png", shades, 0.2],
      ["closed-variable.png", variable, 0.08],
      ["closed-crayon.png", crayonScene, 0.25],
      ["react-example.png", reactExample, 0.05],
    ];
    for (const [name, scene, limit] of files) {
      const { png, fraction } = renderPng(scene);
      expect(fraction, name).toBeLessThan(limit);
      if (process.env.UPDATE_EXAMPLES === "1") writeFileSync(new URL(name, dir), png);
      expect(statSync(new URL(name, dir)).size).toBeLessThan(10 * 1024 * 1024);
    }
    const shadowPng = renderPng(shadow, { [image.href]: image.canvas });
    expect(shadowPng.fraction).toBeLessThan(0.2);
    if (process.env.UPDATE_EXAMPLES === "1")
      writeFileSync(new URL("tree-shadow.png", dir), shadowPng.png);
    expect(statSync(new URL("tree-shadow.png", dir)).size).toBeLessThan(10 * 1024 * 1024);
  });
});

function defaultCrayon() {
  return {
    grain: 0.28,
    edgeRoughness: 0.75,
    widthVariation: 0.18,
    opacityVariation: 0.35,
    passes: 2,
    baseOpacity: 0.8,
    baseSoftness: 0.5,
    grit: 0.92,
    flakeSize: 1.45,
    seed: 1,
  };
}
