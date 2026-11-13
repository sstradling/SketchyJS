import { describe, expect, it } from "vitest";
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
  });
});
