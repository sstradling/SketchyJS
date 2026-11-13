import { Rng } from "@sketchy-js/core";
import type { PluginContext } from "@sketchy-js/plugin";
import type { DrawLayer, StickerBacking } from "@sketchy-js/types";
import { controlBounds } from "./contour.js";
import type { StickerCommand } from "./builder.js";
import { assertDataImage, resolveImagePlacement } from "./image/placement.js";
import { paper, paperSeed, paperWidths, seedHalves } from "./paper.js";

const edgeContext = {
  rng: new Rng(1n),
  quality: "final" as const,
  maxOps: 200_000,
  warn() {},
} as unknown as PluginContext;

/**
 * Scene layers for a sticker sheet, in paint order: shadow, paper, image, fibers.
 * Ink (fill and stroke) is the caller's existing layers and is painted after these.
 *
 * An image source that is not a `data:image` URL throws `StickerImageError`.
 * The image is not given a shadow. Fibers are clipped to the sheet, even-odd,
 * so holes stay empty.
 */
export function stickerLayers(
  commands: readonly StickerCommand[],
  backing: StickerBacking,
  drawingSeed?: bigint,
): DrawLayer[] {
  const layers: DrawLayer[] = [];
  const sheetPaths = commands
    .filter((command) => command.style === "fill")
    .map((command) => command.path);
  for (const command of commands) {
    if (command.sheetShadow && command.style === "fill") {
      const shadow = command.sheetShadow;
      layers.push({
        role: "sheet-shadow",
        paths: [command.path],
        fillRule: "evenodd",
        paint: {
          kind: "solid",
          color: [shadow.rgba[0], shadow.rgba[1], shadow.rgba[2], shadow.rgba[3] * shadow.opacity],
        },
        shadow: { x: shadow.x, y: shadow.y, radius: shadow.radius },
      });
    }
    layers.push({
      role: "sheet",
      paths: [command.path],
      fillRule: command.fillRule === "evenOdd" ? "evenodd" : "nonzero",
      paint: {
        kind: "solid",
        color: [command.color.r, command.color.g, command.color.b, command.color.a],
      },
      ...(command.style === "stroke"
        ? {
            strokeWidth: command.lineWidth,
            cap: command.cap,
            join: command.join,
            miterLimit: command.miterLimit,
          }
        : {}),
    });
  }
  if (backing.image && backing.image.opacity > 0.001 && sheetPaths.length > 0) {
    const href = assertDataImage(imageHref(backing.image.source));
    const size = imageSize(backing.image.source);
    const box = unionBounds(sheetPaths.map((path) => controlBounds(path)));
    const placed = resolveImagePlacement({
      placement: backing.image.placement,
      scale: backing.image.scale,
      imageWidth: size.width,
      imageHeight: size.height,
      mask: box,
    });
    layers.push({
      role: "sticker-image",
      paths: sheetPaths,
      fillRule: "evenodd",
      paint: { kind: "solid", color: [0, 0, 0, 0] },
      clip: { paths: sheetPaths, fillRule: "evenodd" },
      stickerImage: {
        href,
        placement: backing.image.placement,
        scale: backing.image.scale,
        opacity: backing.image.opacity,
        width: size.width,
        height: size.height,
        drawRect: placed.drawRect,
      },
    });
  }
  if (backing.texture && backing.texture.amount > 0.01 && sheetPaths.length > 0) {
    const bounds = unionBounds(sheetPaths.map((path) => controlBounds(path)));
    const seed = paperSeed(asSeed(backing.texture.seed), asSeed(drawingSeed));
    const marks = paper.generate(
      {
        sheet: { paths: sheetPaths, fillRule: "evenodd", bounds, margin: backing.width },
        paperColor: backing.color,
      },
      { amount: backing.texture.amount, scale: backing.texture.scale, ...seedHalves(seed) },
      edgeContext,
    );
    const widths = paperWidths(backing.texture.amount);
    marks.forEach((mark, index) => {
      layers.push({
        role: "texture",
        paths: mark.paths,
        fillRule: "nonzero",
        paint: mark.paint.kind === "solid" ? mark.paint : { kind: "solid", color: backing.color },
        strokeWidth: widths[index] ?? widths[0],
        cap: "round",
        join: "round",
        clip: { paths: sheetPaths, fillRule: "evenodd" },
      });
    });
  }
  return layers;
}

function asSeed(seed: bigint | number | undefined): bigint | undefined {
  if (seed === undefined) return undefined;
  return typeof seed === "bigint" ? seed : BigInt(Math.trunc(seed));
}

function imageHref(source: unknown): string {
  if (typeof source === "string") return source;
  if (source && typeof source === "object" && "href" in source && typeof source.href === "string")
    return source.href;
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

function unionBounds(boxes: readonly [number, number, number, number][]): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y, w, h] of boxes) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
