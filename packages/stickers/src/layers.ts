import type { DrawLayer, StickerBacking } from "@sketchy-js/types";
import { controlBounds } from "./contour.js";
import { asSeed, type StickerCommand } from "./builder.js";
import { paper, paperSeed, paperWidths, seedHalves } from "./paper.js";
import { freshPluginContext } from "./plugin-context.js";

/**
 * Scene layers for a sticker sheet, in paint order: shadow, paper, image, fibers.
 * Ink (fill and stroke) is the caller's existing layers and is painted after these.
 *
 * Image layers are added by `@sketchy-js/stickers/image`, not here.
 * Fibers are clipped to the sheet, even-odd, so holes stay empty.
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
  if (backing.texture && backing.texture.amount > 0.01 && sheetPaths.length > 0) {
    const bounds = unionBounds(sheetPaths.map((path) => controlBounds(path)));
    const seed = paperSeed(asSeed(backing.texture.seed), asSeed(drawingSeed));
    const marks = paper.generate(
      {
        sheet: { paths: sheetPaths, fillRule: "evenodd", bounds, margin: backing.width },
        paperColor: backing.color,
      },
      { amount: backing.texture.amount, scale: backing.texture.scale, ...seedHalves(seed) },
      freshPluginContext(),
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
