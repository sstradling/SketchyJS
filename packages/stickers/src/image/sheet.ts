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

function finiteSize(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function firstSize(source: object, keys: readonly string[]): number | undefined {
  const record = source as Record<string, unknown>;
  for (const key of keys) {
    const value = finiteSize(record[key]);
    if (value !== undefined) return value;
  }
  return undefined;
}

/** A canvas, image, bitmap, or video frame the caller already decoded. */
function isDecodedImage(source: object): boolean {
  const record = source as Record<string, unknown>;
  return (
    typeof record.getContext === "function" ||
    typeof record.naturalWidth === "number" ||
    typeof record.videoWidth === "number" ||
    typeof record.displayWidth === "number" ||
    typeof record.codedWidth === "number" ||
    typeof record.close === "function"
  );
}

function dataUrlFrom(source: object): string | undefined {
  const toDataURL = (source as { toDataURL?: (type?: string) => unknown }).toDataURL;
  if (typeof toDataURL !== "function") return undefined;
  const url = toDataURL.call(source, "image/png");
  return typeof url === "string" && url.startsWith("data:image/") ? url : undefined;
}

type HostCanvas = {
  width: number;
  height: number;
  getContext?: (kind: string) => { drawImage?: (...args: unknown[]) => void } | null;
  toDataURL?: (type?: string) => string;
};

/** One PNG data URL per source object. Rebuilding a frame must not re-encode. */
const encodedUrl = new WeakMap<object, string>();

function hostCanvas(width: number, height: number): HostCanvas | undefined {
  const host = globalThis as Record<string, unknown>;
  const document = host.document as { createElement?: (tag: string) => HostCanvas } | undefined;
  const fromDocument = document?.createElement?.("canvas");
  if (fromDocument) {
    fromDocument.width = width;
    fromDocument.height = height;
    return fromDocument;
  }
  const Offscreen = host.OffscreenCanvas as (new (w: number, h: number) => HostCanvas) | undefined;
  if (typeof Offscreen === "function") return new Offscreen(width, height);
  return undefined;
}

/**
 * Draws a decoded image into a canvas and returns a PNG data URL.
 * A source with `toDataURL` is used directly. Otherwise this uses
 * `document.createElement("canvas")`, then `OffscreenCanvas` when there is
 * no document (workers). The URL is cached on the source object.
 */
export function rasterDataUrl(source: object, width: number, height: number): string | undefined {
  const cached = encodedUrl.get(source);
  if (cached) return cached;
  const direct = dataUrlFrom(source);
  const drawn = direct ?? dataUrlFrom(paintHost(source, width, height) ?? {});
  if (!drawn) return undefined;
  encodedUrl.set(source, drawn);
  return drawn;
}

function paintHost(source: object, width: number, height: number): HostCanvas | undefined {
  const canvas = hostCanvas(width, height);
  if (!canvas?.getContext) return undefined;
  const context = canvas.getContext("2d");
  if (!context?.drawImage) return undefined;
  context.drawImage(source, 0, 0, width, height);
  return canvas;
}

/**
 * `source` is a decoded image, a `data:` URL wrapped with width and height, or
 * `{ href, width, height }`. A bare string has no size and is refused. There is
 * no 1×1 default.
 */
export function resolveStickerImageSource(
  source: unknown,
  allowSameOrigin = false,
): { href: string; width: number; height: number; source?: object } {
  if (typeof source === "string") {
    throw new StickerImageError(
      "sticker-image-source",
      "a data URL or href needs explicit width and height",
    );
  }
  if (!source || typeof source !== "object") {
    throw new StickerImageError("sticker-image-source", "sticker image source is missing");
  }
  if (!isDecodedImage(source) && "href" in source && typeof source.href === "string") {
    const href = assertDataImage(source.href, allowSameOrigin);
    const width = finiteSize((source as { width?: unknown }).width);
    const height = finiteSize((source as { height?: unknown }).height);
    if (width === undefined || height === undefined) {
      throw new StickerImageError(
        "sticker-image-source",
        "a data URL or href needs explicit width and height",
      );
    }
    return { href, width, height };
  }
  const width = firstSize(source, [
    "naturalWidth",
    "videoWidth",
    "displayWidth",
    "codedWidth",
    "width",
  ]);
  const height = firstSize(source, [
    "naturalHeight",
    "videoHeight",
    "displayHeight",
    "codedHeight",
    "height",
  ]);
  if (width === undefined || height === undefined) {
    throw new StickerImageError(
      "sticker-image-source",
      "a decoded sticker image needs width and height on the object",
    );
  }
  const href = rasterDataUrl(source, width, height);
  if (!href) {
    throw new StickerImageError(
      "sticker-image-source",
      "cannot encode this sticker image: no document canvas and no OffscreenCanvas are available",
    );
  }
  return { href, width, height, source };
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
  const size = resolveStickerImageSource(image.source, allowSameOrigin);
  const box = unionSheetBounds(sheetPaths);
  const placed = resolveImagePlacement({
    placement: image.placement,
    scale,
    imageWidth: size.width,
    imageHeight: size.height,
    mask: box,
  });
  const imageLayer: DrawLayer = {
    role: "sticker-image",
    paths: sheetPaths,
    fillRule: "evenodd",
    paint: { kind: "solid", color: [0, 0, 0, 0] },
    clip: { paths: sheetPaths, fillRule: "evenodd" },
    stickerImage: {
      href: size.href,
      placement: image.placement,
      scale,
      opacity,
      width: size.width,
      height: size.height,
      drawRect: placed.drawRect,
      ...(size.source ? { source: size.source } : {}),
    },
  };
  const textureAt = layers.findIndex((layer) => layer.role === "texture");
  if (textureAt < 0) return [...layers, imageLayer];
  return [...layers.slice(0, textureAt), imageLayer, ...layers.slice(textureAt)];
}
