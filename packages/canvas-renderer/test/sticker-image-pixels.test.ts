import { createCanvas, loadImage } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import { rectangle } from "@sketchy-js/core";
import { RoughView } from "@sketchy-js/scene/basic";
import { buildStickerScene } from "@sketchy-js/scene/stickers";
import { isStickerImageError } from "@sketchy-js/stickers/image";
import type { Path, Scene } from "@sketchy-js/types";
import { renderToCanvas, type Canvas2D, type CanvasSurfaceFactory } from "../src/index.js";

const surface: CanvasSurfaceFactory = (width, height) => {
  const canvas = createCanvas(Math.max(1, Math.ceil(width)), Math.max(1, Math.ceil(height)));
  return { context: canvas.getContext("2d") as unknown as Canvas2D, image: canvas };
};

function png(
  paint: (ctx: ReturnType<ReturnType<typeof createCanvas>["getContext"]>) => void,
  w: number,
  h: number,
) {
  const canvas = createCanvas(w, h);
  paint(canvas.getContext("2d"));
  return `data:image/png;base64,${canvas.toBuffer("image/png").toString("base64")}`;
}

function paint(scene: Scene, images: Record<string, unknown>) {
  const canvas = createCanvas(scene.size.width, scene.size.height);
  const context = canvas.getContext("2d");
  renderToCanvas(scene, context as unknown as Canvas2D, {
    background: "#d5d0c8",
    createSurface: surface,
    images: images as never,
  });
  return context;
}

const box = (x: number, y: number, w: number, h: number): Path => [
  { op: "M", x, y },
  { op: "L", x: x + w, y },
  { op: "L", x: x + w, y: y + h },
  { op: "L", x, y: y + h },
  { op: "Z" },
];

describe("sticker image pixels", () => {
  it("throws a cached taint error from renderToCanvas", () => {
    let reads = 0;
    const tainted = {
      width: 2,
      height: 2,
      getContext() {
        return {
          getImageData() {
            reads += 1;
            throw new Error("tainted");
          },
        };
      },
    };
    const href = "data:image/png;base64,aaaa";
    const sheet = box(2, 2, 16, 16);
    const scene: Scene = {
      version: 1,
      size: { width: 20, height: 20 },
      nodes: [
        {
          type: "drawing",
          drawing: {
            shape: "rectangle",
            outline: [],
            layers: [
              {
                role: "sticker-image",
                paths: [sheet],
                fillRule: "evenodd",
                paint: { kind: "solid", color: [0, 0, 0, 0] },
                clip: { paths: [sheet], fillRule: "evenodd" },
                stickerImage: {
                  href,
                  placement: "stretch",
                  scale: 1,
                  opacity: 1,
                  width: 2,
                  height: 2,
                  drawRect: { x: 2, y: 2, width: 16, height: 16 },
                },
              },
            ],
          },
        },
      ],
    };
    const context = createCanvas(20, 20).getContext("2d") as unknown as Canvas2D;
    const options = { images: { [href]: tainted } };
    expect(() => renderToCanvas(scene, context, options)).toThrow(
      expect.objectContaining({ code: "sticker-image-taint" }),
    );
    expect(() => renderToCanvas(scene, context, options)).toThrow(
      expect.objectContaining({ code: "sticker-image-taint" }),
    );
    expect(reads).toBe(1);
    try {
      renderToCanvas(scene, context, options);
    } catch (error) {
      expect(isStickerImageError(error)).toBe(true);
    }
  });

  it("leaves a hole through the image empty", async () => {
    const href = png(
      (ctx) => {
        ctx.fillStyle = "#1d4e89";
        ctx.fillRect(0, 0, 8, 8);
      },
      8,
      8,
    );
    const sheet: Path = [
      ...box(10, 10, 60, 40).slice(0, -1),
      { op: "Z" },
      ...box(30, 22, 20, 16).slice(0, -1),
      { op: "Z" },
    ];
    const scene: Scene = {
      version: 1,
      size: { width: 80, height: 60 },
      nodes: [
        {
          type: "drawing",
          drawing: {
            shape: "path",
            outline: [],
            layers: [
              {
                role: "sticker-image",
                paths: [sheet],
                fillRule: "evenodd",
                paint: { kind: "solid", color: [0, 0, 0, 0] },
                clip: { paths: [sheet], fillRule: "evenodd" },
                stickerImage: {
                  href,
                  placement: "stretch",
                  scale: 1,
                  opacity: 1,
                  width: 8,
                  height: 8,
                  drawRect: { x: 10, y: 10, width: 60, height: 40 },
                },
              },
            ],
          },
        },
      ],
    };
    const context = paint(scene, { [href]: await loadImage(href) });
    const hole = context.getImageData(40, 30, 1, 1).data;
    const ink = context.getImageData(16, 16, 1, 1).data;
    expect(hole[0]).toBeGreaterThan(180);
    expect(hole[2]).toBeGreaterThan(180);
    expect(ink[2]).toBeGreaterThan(100);
    expect(ink[0]).toBeLessThan(80);
  });

  it("shows paper through a transparent image pixel and does not shadow the image", async () => {
    const href = png(
      (ctx) => {
        ctx.clearRect(0, 0, 2, 1);
        ctx.fillStyle = "#1d4e89";
        ctx.fillRect(0, 0, 1, 1);
      },
      2,
      1,
    );
    const sheet = box(10, 10, 40, 20);
    const scene: Scene = {
      version: 1,
      size: { width: 80, height: 50 },
      nodes: [
        {
          type: "drawing",
          drawing: {
            shape: "rectangle",
            outline: [],
            layers: [
              {
                role: "sheet",
                paths: [sheet],
                fillRule: "nonzero",
                paint: { kind: "solid", color: [1, 0, 0, 1] },
              },
              {
                role: "sticker-image",
                paths: [sheet],
                fillRule: "evenodd",
                paint: { kind: "solid", color: [0, 0, 0, 0] },
                clip: { paths: [sheet], fillRule: "evenodd" },
                stickerImage: {
                  href,
                  placement: "stretch",
                  scale: 1,
                  opacity: 1,
                  width: 2,
                  height: 1,
                  drawRect: { x: 10, y: 10, width: 40, height: 20 },
                },
              },
            ],
          },
        },
      ],
    };
    const image = scene.nodes[0];
    const layer = image?.type === "drawing" ? image.drawing.layers[1] : undefined;
    expect(layer?.shadow).toBeUndefined();
    const context = paint(scene, { [href]: await loadImage(href) });
    const clear = context.getImageData(40, 20, 1, 1).data;
    const opaque = context.getImageData(16, 20, 1, 1).data;
    expect(clear[0]).toBeGreaterThan(200);
    expect(clear[2]).toBeLessThan(40);
    expect(opaque[2]).toBeGreaterThan(100);
  });

  it("paints fibers over an opaque image", async () => {
    const href = png(
      (ctx) => {
        ctx.fillStyle = "#102030";
        ctx.fillRect(0, 0, 8, 8);
      },
      8,
      8,
    );
    const backing = {
      width: 8,
      smoothness: 1,
      edge: "smooth" as const,
      color: [1, 1, 1, 1] as const,
      image: {
        source: { href, width: 8, height: 8 },
        placement: "stretch" as const,
        scale: 1,
        opacity: 1,
      },
      texture: { amount: 0.9, scale: 10, seed: 4n },
    };
    const view = new RoughView()
      .with({
        seed: 4n,
        strokeWidth: 0,
        roughness: 0,
        bowing: 0,
        fillColor: [0, 0, 0, 0],
        stickerBacking: backing,
      })
      .draw(rectangle(20, 16, 80, 50));
    const size = { width: 140, height: 90 };
    const withFibers = buildStickerScene(view.registry(), view.contents(), size);
    const plain: Scene = {
      ...withFibers,
      nodes: withFibers.nodes.map((node) =>
        node.type === "drawing"
          ? {
              ...node,
              drawing: {
                ...node.drawing,
                layers: node.drawing.layers.filter((layer) => layer.role !== "texture"),
              },
            }
          : node,
      ),
    };
    const decoded = await loadImage(href);
    const fibers = paint(withFibers, { [href]: decoded }).getImageData(
      0,
      0,
      size.width,
      size.height,
    ).data;
    const bare = paint(plain, { [href]: decoded }).getImageData(0, 0, size.width, size.height).data;
    let different = 0;
    for (let i = 0; i < fibers.length; i += 4) {
      if (Math.abs((fibers[i] ?? 0) - (bare[i] ?? 0)) > 12) different += 1;
    }
    expect(different).toBeGreaterThan(30);
  });
});
