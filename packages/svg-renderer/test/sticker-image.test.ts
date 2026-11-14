import { createCanvas } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import { isStickerImageError } from "@sketchy-js/stickers/image";
import type { Path, Scene } from "@sketchy-js/types";
import { renderToSvgString } from "../src/index.js";

const sheet: Path = [
  { op: "M", x: 0, y: 0 },
  { op: "L", x: 80, y: 0 },
  { op: "L", x: 80, y: 60 },
  { op: "L", x: 0, y: 60 },
  { op: "Z" },
];

const href = "data:image/png;base64,aaaa";

function scene(): Scene {
  return {
    version: 1,
    size: { width: 80, height: 60 },
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
              stickerImage: {
                href,
                placement: "tile",
                scale: 20,
                opacity: 1,
                width: 10,
                height: 10,
                drawRect: { x: 0, y: 0, width: 20, height: 20 },
              },
            },
          ],
        },
      },
    ],
  };
}

describe("sticker image SVG", () => {
  it("tiles with one pattern and one image", () => {
    const svg = renderToSvgString(scene());
    expect(svg.match(/<pattern\b/g)?.length).toBe(1);
    expect(svg.match(/<image\b/g)?.length).toBe(1);
    expect(svg.length).toBeLessThan(href.length + 800);
    expect(() =>
      renderToSvgString({
        ...scene(),
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
                  stickerImage: {
                    href: "blob:https://example/id",
                    placement: "tile",
                    scale: 20,
                    opacity: 1,
                    width: 10,
                    height: 10,
                    drawRect: { x: 0, y: 0, width: 20, height: 20 },
                  },
                },
              ],
            },
          },
        ],
      }),
    ).toThrow(/blob/);
    try {
      renderToSvgString(sceneWith("blob:https://example/id"));
    } catch (error) {
      expect(isStickerImageError(error)).toBe(true);
      expect((error as { code?: string }).code).toBe("sticker-image-source");
    }
  });

  it("serializes a decoded canvas and tiles from the union", () => {
    const canvas = createCanvas(4, 4);
    canvas.getContext("2d").fillRect(0, 0, 4, 4);
    const href = "bitmap:4x4";
    const first: Path = [
      { op: "M", x: 100, y: 0 },
      { op: "L", x: 120, y: 0 },
      { op: "L", x: 120, y: 20 },
      { op: "L", x: 100, y: 20 },
      { op: "Z" },
    ];
    const second: Path = [
      { op: "M", x: 0, y: 0 },
      { op: "L", x: 20, y: 0 },
      { op: "L", x: 20, y: 20 },
      { op: "L", x: 0, y: 20 },
      { op: "Z" },
    ];
    const svg = renderToSvgString(
      {
        version: 1,
        size: { width: 140, height: 40 },
        nodes: [
          {
            type: "drawing",
            drawing: {
              shape: "path",
              outline: [],
              layers: [
                {
                  role: "sticker-image",
                  paths: [first, second],
                  fillRule: "evenodd",
                  paint: { kind: "solid", color: [0, 0, 0, 0] },
                  stickerImage: {
                    href,
                    placement: "tile",
                    scale: 10,
                    opacity: 1,
                    width: 4,
                    height: 4,
                    drawRect: { x: 0, y: 0, width: 10, height: 10 },
                  },
                },
              ],
            },
          },
        ],
      },
      { images: { [href]: canvas } },
    );
    expect(svg).toContain(canvas.toDataURL());
    expect(svg).toContain('x="0"');
    expect(svg).not.toContain('x="100"');
  });
});

function sceneWith(href: string): Scene {
  const sheet: Path = [
    { op: "M", x: 0, y: 0 },
    { op: "L", x: 10, y: 0 },
    { op: "L", x: 10, y: 10 },
    { op: "Z" },
  ];
  return {
    version: 1,
    size: { width: 10, height: 10 },
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
              stickerImage: {
                href,
                placement: "tile",
                scale: 10,
                opacity: 1,
                width: 4,
                height: 4,
                drawRect: { x: 0, y: 0, width: 10, height: 10 },
              },
            },
          ],
        },
      },
    ],
  };
}
