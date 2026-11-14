import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Path, Scene } from "@sketchy-js/types";
import { StickerImageError, isStickerImageError } from "../src/image/error.js";
import { assertImageUntainted, prepareImages } from "../src/image/prepare.js";
import { TILE_BUDGET, assertDataImage, resolveImagePlacement } from "../src/image/placement.js";
import {
  appendStickerImage,
  resolveStickerImageSource,
  unionSheetBounds,
} from "../src/image/sheet.js";

const fixture = JSON.parse(
  readFileSync(
    new URL(
      "../../../fixtures/swift-reference/v1.5.0/stickers/image-placement.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as {
  tileBudget: number;
  cases: {
    id: string;
    placement: "tile" | "stretch" | "fill";
    scale: number;
    imageSize: [number, number];
    maskBounds: [number, number, number, number];
    resolvedTileWidth: number;
    resolvedFitScale: number;
    tileWidth: number;
    drawRect: [number, number, number, number];
  }[];
};

describe("resolveImagePlacement", () => {
  it("uses Swift's tile budget", () => {
    expect(TILE_BUDGET).toBe(fixture.tileBudget);
  });

  it.each(fixture.cases.map((row) => [row.id, row] as const))("%s", (_id, row) => {
    const [x, y, width, height] = row.maskBounds;
    const placed = resolveImagePlacement({
      placement: row.placement,
      scale: row.scale,
      imageWidth: row.imageSize[0],
      imageHeight: row.imageSize[1],
      mask: { x, y, width, height },
    });
    expect(placed.resolvedTileWidth).toBeCloseTo(row.resolvedTileWidth, 6);
    expect(placed.resolvedFitScale).toBeCloseTo(row.resolvedFitScale, 6);
    expect(placed.tileWidth).toBeCloseTo(row.tileWidth, 6);
    expect(placed.drawRect.x).toBeCloseTo(row.drawRect[0], 6);
    expect(placed.drawRect.y).toBeCloseTo(row.drawRect[1], 6);
    expect(placed.drawRect.width).toBeCloseTo(row.drawRect[2], 6);
    expect(placed.drawRect.height).toBeCloseTo(row.drawRect[3], 6);
  });

  it("rejects anything that is not a data image", () => {
    expect(assertDataImage("data:image/png;base64,aaaa")).toContain("data:image/png");
    expect(() => assertDataImage("https://example.com/a.png")).toThrow(StickerImageError);
    expect(() => assertDataImage("blob:https://example.com/id")).toThrow(/not loaded/);
    expect(() => assertDataImage("")).toThrow(StickerImageError);
    expect(assertDataImage("/weave.png", true)).toBe("/weave.png");
  });

  it("shares one StickerImageError class across entries", async () => {
    const fromIndex = await import("../src/image/index.js");
    const fromError = await import("../src/image/error.js");
    const error = new fromIndex.StickerImageError("sticker-image-source", "no");
    expect(error instanceof fromError.StickerImageError).toBe(true);
    expect(error instanceof StickerImageError).toBe(true);
    const tainted = Object.assign(new Error("tainted"), { code: "sticker-image-taint" });
    expect(isStickerImageError(tainted)).toBe(true);
    expect(isStickerImageError(new Error("other"))).toBe(false);
  });

  it("floors stretch and fill at 0.05 when drawing", () => {
    const mask = { x: 0, y: 0, width: 100, height: 80 };
    const stretch = resolveImagePlacement({
      placement: "stretch",
      scale: 0.01,
      imageWidth: 10,
      imageHeight: 10,
      mask,
    });
    expect(stretch.resolvedFitScale).toBe(0.01);
    expect(stretch.drawRect.width).toBeCloseTo(5);
    expect(stretch.drawRect.height).toBeCloseTo(4);
    const fill = resolveImagePlacement({
      placement: "fill",
      scale: 0.01,
      imageWidth: 10,
      imageHeight: 10,
      mask,
    });
    expect(fill.drawRect.width).toBeCloseTo(5);
    expect(fill.drawRect.height).toBeCloseTo(5);
  });

  it("reads a decoded image's size and refuses a bare data URL", () => {
    expect(() => resolveStickerImageSource("data:image/png;base64,aaaa")).toThrow(
      StickerImageError,
    );
    expect(() => resolveStickerImageSource({ href: "data:image/png;base64,aaaa" })).toThrow(
      /width and height/,
    );
    expect(
      resolveStickerImageSource({ href: "data:image/png;base64,aaaa", width: 3, height: 5 }),
    ).toEqual({ href: "data:image/png;base64,aaaa", width: 3, height: 5 });
    const canvas = {
      width: 8,
      height: 4,
      getContext() {
        return null;
      },
      toDataURL() {
        return "data:image/png;base64,zz";
      },
    };
    expect(resolveStickerImageSource(canvas)).toMatchObject({
      href: "data:image/png;base64,zz",
      width: 8,
      height: 4,
    });
    expect(() => resolveStickerImageSource({ width: 4, height: 4, close() {} })).toThrow(
      /no document canvas is available/,
    );
  });

  it("reuses a cached PNG data URL for the same source", () => {
    let calls = 0;
    const canvas = {
      width: 4,
      height: 4,
      getContext() {
        return null;
      },
      toDataURL() {
        calls += 1;
        return "data:image/png;base64,zz";
      },
    };
    expect(resolveStickerImageSource(canvas).href).toBe("data:image/png;base64,zz");
    expect(resolveStickerImageSource(canvas).href).toBe("data:image/png;base64,zz");
    expect(calls).toBe(1);
  });

  it("does not encode an ImageBitmap from OffscreenCanvas", () => {
    const key = "OffscreenCanvas";
    const host = globalThis as Record<string, unknown>;
    const previous = host[key];
    let constructed = 0;
    class FakeOffscreen {
      width: number;
      height: number;
      constructor(width: number, height: number) {
        constructed += 1;
        this.width = width;
        this.height = height;
      }
      getContext() {
        return { drawImage() {} };
      }
      convertToBlob() {
        return Promise.resolve(new Blob());
      }
    }
    host[key] = FakeOffscreen;
    try {
      const bitmap = { width: 3, height: 5, close() {} };
      expect(() => resolveStickerImageSource(bitmap)).toThrow(/no document canvas is available/);
      expect(constructed).toBe(0);
      expect(
        resolveStickerImageSource({ href: "data:image/png;base64,off", width: 3, height: 5 }),
      ).toEqual({ href: "data:image/png;base64,off", width: 3, height: 5 });
    } finally {
      if (previous === undefined) delete host[key];
      else host[key] = previous;
    }
  });

  it("tiles from the union of every ring", () => {
    const rect = (x: number, y: number): Path => [
      { op: "M", x, y },
      { op: "L", x: x + 10, y },
      { op: "L", x: x + 10, y: y + 10 },
      { op: "L", x, y: y + 10 },
      { op: "Z" },
    ];
    const first = rect(100, 40);
    const second = rect(0, 0);
    const box = unionSheetBounds([first, second]);
    expect(box.x).toBe(0);
    expect(box.y).toBe(0);
    expect(box.width).toBe(110);
    const layer = appendStickerImage(
      [],
      {
        width: 4,
        smoothness: 1,
        edge: "smooth",
        color: [1, 1, 1, 1],
        image: {
          source: { href: "data:image/png;base64,aaaa", width: 8, height: 8 },
          placement: "tile",
          scale: 12,
          opacity: 1,
        },
      },
      [first, second],
    )[0];
    expect(layer?.stickerImage?.drawRect.x).toBe(0);
    expect(layer?.stickerImage?.drawRect.y).toBe(0);
    expect(layer?.stickerImage?.drawRect.x).not.toBe(100);
  });

  it("reports a tainted canvas once from prepareImages", async () => {
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
    const scene: Scene = {
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
                paths: [],
                fillRule: "evenodd",
                paint: { kind: "solid", color: [0, 0, 0, 1] },
                stickerImage: {
                  href: "data:image/png;base64,aaaa",
                  placement: "tile",
                  scale: 8,
                  opacity: 1,
                  width: 2,
                  height: 2,
                  drawRect: { x: 0, y: 0, width: 8, height: 8 },
                },
              },
            ],
          },
        },
      ],
    };
    const load = () => Promise.resolve(tainted);
    await expect(prepareImages(scene, { load })).rejects.toMatchObject({
      code: "sticker-image-taint",
    });
    await expect(prepareImages(scene, { load })).rejects.toMatchObject({
      code: "sticker-image-taint",
    });
    expect(reads).toBe(1);
    expect(() => assertImageUntainted(tainted)).toThrow(StickerImageError);
    expect(reads).toBe(1);
  });

  it("keeps the image class out of the main entry", () => {
    const index = new URL("../dist/index.js", import.meta.url);
    const image = new URL("../dist/image.js", import.meta.url);
    expect(existsSync(index), "build the package before this test").toBe(true);
    expect(readFileSync(index, "utf8")).not.toContain("StickerImageError");
    expect(readFileSync(image, "utf8")).toContain("StickerImageError");
  });
});
