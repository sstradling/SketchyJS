import type { StickerImagePlacement } from "@sketchy-js/types";

/**
 * Most repeats drawn for one sheet. A smaller tile is coarsened until the
 * count is within this budget. Sketchy's `StickerImagePainter.tileBudget`.
 */
export const TILE_BUDGET = 900;

export interface MaskBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImagePlacementInput {
  placement: StickerImagePlacement;
  /** Tile width, or a multiplier for stretch and fill. Non-positive means natural. */
  scale: number;
  imageWidth: number;
  imageHeight: number;
  mask: MaskBounds;
}

export interface ImagePlacement {
  resolvedTileWidth: number;
  /** `scale` when it is positive, otherwise 1. The 0.05 floor is applied at draw time. */
  resolvedFitScale: number;
  /** Repeat width after the 900-repeat cap. Recorded for every placement, including stretch and fill. */
  tileWidth: number;
  drawRect: { x: number; y: number; width: number; height: number };
}

/**
 * Where one copy of a sticker image is drawn. Pure: no decoding and no I/O.
 *
 * This matches `StickerImage.resolvedTileWidth`, `resolvedFitScale`, and
 * `StickerImagePainter.tileWidth` / the draw rect from the v1.5.0 exporter.
 * `scale` of 0 means the image's own width for tiles and "fit" for stretch
 * and fill. Stretch and fill then refuse a factor below 0.05.
 */
export function resolveImagePlacement(input: ImagePlacementInput): ImagePlacement {
  const scale = input.scale > 0 && Number.isFinite(input.scale) ? input.scale : 0;
  const natural = Math.max(input.imageWidth, 1);
  const resolvedTileWidth = Math.max(4, scale > 0 ? scale : natural);
  const resolvedFitScale = scale > 0 ? scale : 1;
  const tileWidth = tiledWidth(resolvedTileWidth, input.imageWidth, input.imageHeight, input.mask);
  return {
    resolvedTileWidth,
    resolvedFitScale,
    tileWidth,
    drawRect: drawRect(input.placement, resolvedFitScale, tileWidth, input, input.mask),
  };
}

function tiledWidth(
  resolved: number,
  imageWidth: number,
  imageHeight: number,
  bounds: MaskBounds,
): number {
  const aspect = Math.max(imageHeight, 1) / Math.max(imageWidth, 1);
  let width = resolved;
  const height = Math.max(4, width * aspect);
  const area = Math.max(bounds.width, 1) * Math.max(bounds.height, 1);
  const cell = width * height;
  if (!(cell > 0)) return width;
  const count = area / cell;
  if (count > TILE_BUDGET) width *= Math.sqrt(count / TILE_BUDGET);
  return width;
}

function drawRect(
  placement: StickerImagePlacement,
  fitScale: number,
  tileWidth: number,
  input: ImagePlacementInput,
  bounds: MaskBounds,
): ImagePlacement["drawRect"] {
  if (placement === "tile") {
    const aspect = Math.max(input.imageHeight, 1) / Math.max(input.imageWidth, 1);
    return { x: bounds.x, y: bounds.y, width: tileWidth, height: Math.max(4, tileWidth * aspect) };
  }
  if (placement === "stretch") {
    const factor = Math.max(fitScale, 0.05);
    const width = bounds.width * factor;
    const height = bounds.height * factor;
    return {
      x: bounds.x + bounds.width / 2 - width / 2,
      y: bounds.y + bounds.height / 2 - height / 2,
      width,
      height,
    };
  }
  const imageWidth = Math.max(input.imageWidth, 1);
  const imageHeight = Math.max(input.imageHeight, 1);
  const fit =
    Math.max(bounds.width / imageWidth, bounds.height / imageHeight) * Math.max(fitScale, 0.05);
  const width = imageWidth * fit;
  const height = imageHeight * fit;
  return {
    x: bounds.x + bounds.width / 2 - width / 2,
    y: bounds.y + bounds.height / 2 - height / 2,
    width,
    height,
  };
}

/** Thrown when a sticker image source is not one this build will paint. */
export class StickerImageError extends Error {
  readonly code: "sticker-image-source";
  constructor(message: string) {
    super(message);
    this.name = "StickerImageError";
    this.code = "sticker-image-source";
  }
}

/**
 * Conservative source check. A data URL is already decoded by the caller.
 * `http:`, `https:`, `blob:`, and `file:` are rejected. Nothing is fetched.
 */
export function assertDataImage(source: string): string {
  const href = source.trim();
  if (!href.startsWith("data:image/")) {
    throw new StickerImageError(
      "sticker image source must be a data:image URL supplied by the caller; network and blob URLs are not loaded",
    );
  }
  return href;
}
