import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { Resvg } from "@resvg/resvg-js";
import { describe, expect, it } from "vitest";
import { polygon, rectangle, path as svgPath } from "@sketchy-js/core";
import type { StickerBackingWithImage } from "@sketchy-js/stickers/image";
import type { Scene, StickerBacking } from "@sketchy-js/types";
import type { RoughView as SheetView } from "@sketchy-js/scene";
import { RoughView } from "@sketchy-js/scene/basic";
import { SketchGroup, SketchPart, buildStickerScene } from "@sketchy-js/scene/stickers";
import { renderToSvgString } from "@sketchy-js/svg-renderer";
import { renderToCanvas, type Canvas2D, type CanvasSurfaceFactory } from "../src/index.js";

const dir = new URL("../../../docs/examples/phase-3/", import.meta.url);

const cream: StickerBacking["color"] = [0.98, 0.95, 0.88, 1];
const ink = "#1c1915";
const wash = "#1d4e89";

function sheet(
  partial: Partial<StickerBackingWithImage> & Pick<StickerBacking, "edge">,
): StickerBackingWithImage {
  return { width: 14, smoothness: 1, color: cream, ...partial };
}

function sceneOf(view: SheetView, size: { width: number; height: number }): Scene {
  return buildStickerScene(view.registry(), view.contents(), size);
}

const surface: CanvasSurfaceFactory = (width, height) => {
  const canvas = createCanvas(Math.max(1, Math.ceil(width)), Math.max(1, Math.ceil(height)));
  return { context: canvas.getContext("2d") as unknown as Canvas2D, image: canvas };
};

/** 16×16 checker, the stand-in for a caller-decoded sticker image. */
function checkerDataUrl(): string {
  const canvas = createCanvas(16, 16);
  const ctx = canvas.getContext("2d");
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? "#c45520" : "#1d4e89";
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return `data:image/png;base64,${canvas.toBuffer("image/png").toString("base64")}`;
}

async function renderPair(
  scene: Scene,
  background: string,
  delta = 24,
): Promise<{ fraction: number; png: Buffer }> {
  const svg = renderToSvgString(scene, { background });
  const width = scene.size.width;
  const height = scene.size.height;
  const rendered = new Resvg(svg, { fitTo: { mode: "width", value: width }, background }).render();
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  const hrefs = scene.nodes.flatMap((node) =>
    node.type === "drawing"
      ? node.drawing.layers.flatMap((layer) =>
          layer.stickerImage ? [layer.stickerImage.href] : [],
        )
      : [],
  );
  const images: Record<string, Awaited<ReturnType<typeof loadImage>>> = {};
  for (const href of hrefs) images[href] = await loadImage(href);
  renderToCanvas(scene, context as unknown as Canvas2D, {
    background,
    createSurface: surface,
    images,
  });
  const pixels = context.getImageData(0, 0, width, height).data;
  const src = rendered.pixels;
  let bad = 0;
  const count = Math.min(src.length, pixels.length) / 4;
  for (let i = 0; i < count; i++) {
    const o = i * 4;
    const differs =
      Math.abs((src[o] ?? 0) - (pixels[o] ?? 0)) > delta ||
      Math.abs((src[o + 1] ?? 0) - (pixels[o + 1] ?? 0)) > delta ||
      Math.abs((src[o + 2] ?? 0) - (pixels[o + 2] ?? 0)) > delta ||
      Math.abs((src[o + 3] ?? 0) - (pixels[o + 3] ?? 0)) > delta;
    if (differs) bad++;
  }
  return { fraction: bad / count, png: canvas.toBuffer("image/png") };
}

const size = { width: 360, height: 280 };
const background = "#d5d0c8";

describe("phase 3 previews", () => {
  it("writes the sticker sheets and checks SVG against Canvas", async () => {
    mkdirSync(dir, { recursive: true });
    const href = checkerDataUrl();
    const star = polygon([
      { x: 180, y: 36 },
      { x: 210, y: 110 },
      { x: 290, y: 116 },
      { x: 230, y: 168 },
      { x: 250, y: 248 },
      { x: 180, y: 206 },
      { x: 110, y: 248 },
      { x: 130, y: 168 },
      { x: 70, y: 116 },
      { x: 150, y: 110 },
    ]);
    const views: { name: string; scene: Scene; limit: number; delta?: number }[] = [
      {
        name: "single",
        limit: 0.02,
        scene: sceneOf(
          new RoughView()
            .with({
              seed: 42n,
              strokeWidth: 3,
              strokeColor: ink,
              fillColor: wash,
              fillStyle: "solid",
              stickerBacking: sheet({ edge: "smooth" }),
            })
            .draw(rectangle(70, 50, 200, 150)),
          size,
        ),
      },
      {
        name: "holes",
        limit: 0.02,
        scene: sceneOf(
          new RoughView()
            .with({
              seed: 42n,
              strokeWidth: 3,
              strokeColor: ink,
              fillColor: [0, 0, 0, 0],
              stickerBacking: sheet({ edge: "smooth" }),
            })
            .draw(svgPath("M 50 40 H 300 V 230 H 50 Z M 130 100 H 230 V 180 H 130 Z")),
          size,
        ),
      },
      {
        name: "torn",
        limit: 0.03,
        scene: sceneOf(
          new RoughView()
            .with({
              seed: 42n,
              strokeWidth: 3,
              strokeColor: ink,
              fillColor: "#9a3412",
              fillStyle: "solid",
              stickerBacking: sheet({
                edge: { kind: "torn", depth: 8, length: 14, jaggedness: 0.4 },
              }),
            })
            .draw(star),
          size,
        ),
      },
      {
        name: "paper",
        limit: 0.04,
        scene: sceneOf(
          new RoughView()
            .with({
              seed: 7n,
              strokeWidth: 3,
              strokeColor: ink,
              fillColor: [0, 0, 0, 0],
              stickerBacking: sheet({
                edge: "smooth",
                texture: { amount: 0.7, scale: 9, seed: 7n },
              }),
            })
            .draw(rectangle(60, 40, 230, 180)),
          size,
        ),
      },
      {
        name: "shadow",
        limit: 0.08,
        scene: sceneOf(
          new RoughView()
            .with({
              seed: 4n,
              strokeWidth: 3,
              strokeColor: ink,
              fillColor: wash,
              fillStyle: "solid",
              stickerBacking: sheet({
                edge: "smooth",
                shadow: { opacity: 0.45, x: 10, y: 14, radius: 10, color: [0, 0, 0, 1] },
              }),
            })
            .draw(rectangle(70, 40, 190, 140)),
          size,
        ),
      },
      {
        name: "group",
        limit: 0.03,
        scene: new SketchGroup(
          [
            new RoughView()
              .with({
                seed: 42n,
                strokeWidth: 3,
                strokeColor: ink,
                fillColor: wash,
                fillStyle: "solid",
              })
              .draw(rectangle(40, 80, 150, 110)),
            new SketchPart(
              new RoughView()
                .with({
                  seed: 7n,
                  strokeWidth: 3,
                  strokeColor: ink,
                  fillColor: "#9a3412",
                  fillStyle: "solid",
                })
                .draw(rectangle(150, 50, 120, 120)),
            ).offset(20, 10),
          ],
          sheet({ edge: "smooth", width: 16 }),
        ).build(size),
      },
      {
        name: "texture-mask",
        // One SVG <pattern> resamples the checker. Edges sit just over delta 24
        // and under delta 48. A missing image moves the sheet by far more than that.
        limit: 0.005,
        delta: 48,
        scene: sceneOf(
          new RoughView()
            .with({
              seed: 9n,
              strokeWidth: 3,
              strokeColor: ink,
              fillColor: [0, 0, 0, 0],
              stickerBacking: sheet({
                edge: "smooth",
                image: {
                  source: { href, width: 16, height: 16 },
                  placement: "tile",
                  scale: 28,
                  opacity: 0.85,
                },
                texture: { amount: 0.35, scale: 12, seed: 9n },
              }),
            })
            .draw(rectangle(70, 50, 200, 150)),
          size,
        ),
      },
    ];
    for (const view of views) {
      const { fraction, png } = await renderPair(view.scene, background, view.delta ?? 24);
      const file = new URL(`${view.name}.png`, dir);
      if (process.env.UPDATE_EXAMPLES === "1") writeFileSync(file, png);
      expect(statSync(file).size, view.name).toBeLessThan(10 * 1024 * 1024);
      expect(fraction, view.name).toBeLessThanOrEqual(view.limit);
    }
  });
});
