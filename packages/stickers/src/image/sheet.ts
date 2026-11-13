import { applyRule, STICKER_IMAGE } from "@sketchy-js/core/options";
import type { DrawLayer, Path, StickerBacking, StickerImage } from "@sketchy-js/types";
import { StickerImageError } from "./error.js";
import { assertDataImage, resolveImagePlacement } from "./placement.js";

/**
 * `StickerBacking` plus the image field. The field stays on this subpath so
 * `@sketchy-js/stickers` does not import image decoding.
 */
export interface StickerBackingWithImage extends StickerBacking {
  image?: StickerImage;
}

function finite(value: number, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new StickerImageError("sticker-image-source", `${name} must be a finite number`);
  }
  return value;
}

function imageHref(source: unknown): string {
  if (typeof source === "string") return source;
  if (source && typeof source === "object" && "href" in source && typeof source.href === "string") {
    return source.href;
  }
  return "";
}

function imageSize(source: unknown): { width: number; height: number } {
  if (source && typeof source === "object" && "width" in source && "height" in source) {
    const width = Number((source as { width: unknown }).width);
    const height = Number((source as { height: unknown }).height);
    if (Number.isFinite(width) && Number.isFinite(height)) return { width, height };
  }
  return { width: 1, height: 1 };
}

/** Union of the sheet paths. Tiles start at this box, not at each ring. */
export function unionSheetBounds(paths: readonly Path[]): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const path of paths) {
    for (const op of path) {
      if (op.op === "Z") continue;
      const xs = op.op === "C" ? [op.c1x, op.c2x, op.x] : op.op === "Q" ? [op.cx, op.x] : [op.x];
      const ys = op.op === "C" ? [op.c1y, op.c2y, op.y] : op.op === "Q" ? [op.cy, op.y] : [op.y];
      for (const x of xs) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
      }
      for (const y of ys) {
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Adds the image layer after the paper. The image is not given a shadow.
 * `allowSameOrigin` stores a same-origin URL; SVG export still embeds data
 * URLs unless the renderer option is set.
 */
export function appendStickerImage(
  layers: readonly DrawLayer[],
  backing: StickerBackingWithImage,
  sheetPaths: readonly Path[],
  allowSameOrigin = false,
): DrawLayer[] {
  const image = backing.image;
  if (!image || sheetPaths.length === 0) return layers.slice();
  const opacity = applyRule(finite(image.opacity, "sticker image opacity"), STICKER_IMAGE.opacity);
  const scale = applyRule(finite(image.scale, "sticker image scale"), STICKER_IMAGE.scale);
  if (!(opacity > 0.001)) return layers.slice();
  const href = assertDataImage(imageHref(image.source), allowSameOrigin);
  const size = imageSize(image.source);
  const box = unionSheetBounds(sheetPaths);
  const placed = resolveImagePlacement({
    placement: image.placement,
    scale,
    imageWidth: size.width,
    imageHeight: size.height,
    mask: box,
  });
  return [
    ...layers,
    {
      role: "sticker-image",
      paths: sheetPaths,
      fillRule: "evenodd",
      paint: { kind: "solid", color: [0, 0, 0, 0] },
      clip: { paths: sheetPaths, fillRule: "evenodd" },
      stickerImage: {
        href,
        placement: image.placement,
        scale,
        opacity,
        width: size.width,
        height: size.height,
        drawRect: placed.drawRect,
      },
    },
  ];
}
