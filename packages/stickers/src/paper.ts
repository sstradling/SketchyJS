import { SplitMix64, swiftDoubleInRange } from "@sketchy-js/core";
import { defineTexture, type TextureLayer } from "@sketchy-js/plugin";
import type { Color, PathOp } from "@sketchy-js/types";

const MASK = (1n << 64n) - 1n;
const wrap = (value: bigint): bigint => value & MASK;

/**
 * Procedural paper fibers. Short strokes on a grid, clipped to the sheet by
 * the host (including holes). The seed is the texture seed, then the drawing
 * seed, then a fixed seed. This does not read `ctx.rng`.
 *
 * Request flow: sticker layer assembly -> this plugin -> texture stroke layers.
 */
export const paper = /*#__PURE__*/ defineTexture({
  id: "paper",
  version: "0.1.0",
  api: "1.0",
  title: "Paper",
  description: "Short fibers on the paper color. Clipped to the sheet, including holes.",
  stochastic: true,
  options: {
    amount: {
      type: "number",
      default: 0.45,
      min: 0,
      max: 1,
      unit: "ratio",
      description: "How visible the grain is.",
    },
    scale: {
      type: "number",
      default: 11,
      min: 4,
      max: 400,
      unit: "px",
      description: "Spacing of the fiber grid.",
    },
    seedHi: {
      type: "int",
      default: 0,
      min: 0,
      max: 0xffffffff,
      description: "High 32 bits of the grain seed.",
    },
    seedLo: {
      type: "int",
      default: 0,
      min: 0,
      max: 0xffffffff,
      description: "Low 32 bits of the grain seed.",
    },
  },
  generate(input, options) {
    const bounds = input.sheet.bounds;
    if (!(bounds.width > 2) || !(bounds.height > 2) || !(options.amount > 0.01)) return [];
    let spacing = Math.max(4, options.scale);
    const budget = 1600;
    while ((bounds.width / spacing) * (bounds.height / spacing) > budget) spacing *= 1.2;
    const columns = Math.max(1, Math.ceil(bounds.width / spacing));
    const rows = Math.max(1, Math.ceil(bounds.height / spacing));
    const grain = (BigInt(options.seedHi >>> 0) << 32n) | BigInt(options.seedLo >>> 0);
    const fibers: PathOp[] = [];
    const specks: PathOp[] = [];
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const rng = new SplitMix64(
          wrap(grain + BigInt(row) * 0x9e3779b9n + BigInt(column) * 0xbf58476dn),
        );
        const chance = swiftDoubleInRange(rng, 0, 1);
        if (!(chance < 0.35 + 0.65 * options.amount)) continue;
        const origin = {
          x: bounds.x + (column + swiftDoubleInRange(rng, 0, 1)) * spacing,
          y: bounds.y + (row + swiftDoubleInRange(rng, 0, 1)) * spacing,
        };
        const along = swiftDoubleInRange(rng, -0.55, 0.55);
        const cross = (row + column) % 5 === 0;
        const angle = (cross ? Math.PI / 2 : 0) + along;
        const length = spacing * swiftDoubleInRange(rng, 0.55, 1.35);
        const end = {
          x: origin.x + Math.cos(angle) * length,
          y: origin.y + Math.sin(angle) * length,
        };
        const target = cross ? specks : fibers;
        target.push({ op: "M", x: origin.x, y: origin.y }, { op: "L", x: end.x, y: end.y });
      }
    }
    const ink = fiberColor(input.paperColor, options.amount);
    const layers: TextureLayer[] = [];
    if (fibers.length > 0) {
      layers.push({
        role: "texture",
        paths: [fibers],
        paint: { kind: "solid", color: ink, alpha: 1 },
      });
    }
    if (specks.length > 0) {
      layers.push({
        role: "texture",
        paths: [specks],
        paint: { kind: "solid", color: ink, alpha: 0.7 },
      });
    }
    return layers;
  },
});

/** Stroke width of the fiber layer, then the speck layer. The host applies these. */
export function paperWidths(amount: number): readonly [number, number] {
  const width = 0.55 + amount * 0.7;
  return [width, Math.max(0.4, width * 0.65)];
}

function fiberColor(base: Color, amount: number): [number, number, number, number] {
  const [r, g, b, a] = rgba(base);
  const contrast = 0.28 + 0.4 * amount;
  const shade = (channel: number): number => Math.min(1, Math.max(0, channel * (1 - contrast)));
  return [shade(r), shade(g), shade(b), Math.min(1, Math.max(0.35, a))];
}

function rgba(color: Color): [number, number, number, number] {
  if (typeof color !== "string")
    return [color[0] ?? 0, color[1] ?? 0, color[2] ?? 0, color[3] ?? 1];
  return [1, 1, 1, 1];
}

/** Mixes the drawing seed into the paper seed the way `textureCommands` does. */
export function paperSeed(
  textureSeed: bigint | undefined,
  drawingSeed: bigint | undefined,
): bigint {
  return wrap((textureSeed ?? drawingSeed ?? 0xb0a9e5e1n) ^ 0x9a9e2n);
}

export function seedHalves(seed: bigint): { seedHi: number; seedLo: number } {
  return { seedHi: Number((seed >> 32n) & 0xffffffffn), seedLo: Number(seed & 0xffffffffn) };
}
