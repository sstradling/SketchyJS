import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { StickerImageError, isStickerImageError } from "../src/image/error.js";
import { TILE_BUDGET, assertDataImage, resolveImagePlacement } from "../src/image/placement.js";

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

  it("keeps the image class out of the main entry", () => {
    const index = new URL("../dist/index.js", import.meta.url);
    const image = new URL("../dist/image.js", import.meta.url);
    expect(existsSync(index), "build the package before this test").toBe(true);
    expect(readFileSync(index, "utf8")).not.toContain("StickerImageError");
    expect(readFileSync(image, "utf8")).toContain("StickerImageError");
  });
});
