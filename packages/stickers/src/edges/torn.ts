import { defineStickerEdge } from "@sketchy-js/plugin";
import { choppedOffset } from "../chop.js";
import { contourPath } from "../contour.js";

/**
 * Torn sticker edge. Facets are seeded from the drawing seed, not `ctx.rng`,
 * matching Sketchy (the tear reads `Options.seed` on its own). The host passes
 * the already offset ring and the mixed seed as two 32-bit halves.
 */
export const tornEdge = /*#__PURE__*/ defineStickerEdge({
  id: "torn",
  version: "0.1.0",
  api: "1.0",
  title: "Torn",
  description: "Chopped facets along the offset edge. The same seed repeats the chops.",
  stochastic: true,
  options: {
    depth: {
      type: "number",
      default: 0,
      min: 0,
      max: 500,
      unit: "px",
      description: "Peak chip size. 0 uses the backing width.",
    },
    length: {
      type: "number",
      default: 16,
      min: 4,
      max: 500,
      unit: "px",
      description: "Nominal facet length.",
    },
    jaggedness: {
      type: "number",
      default: 0.35,
      min: 0,
      max: 1,
      unit: "ratio",
      description: "Extra nicks on each facet.",
    },
    seedHi: {
      type: "int",
      default: 0,
      min: 0,
      max: 0xffffffff,
      description: "High 32 bits of the tear seed.",
    },
    seedLo: {
      type: "int",
      default: 0,
      min: 0,
      max: 0xffffffff,
      description: "Low 32 bits of the tear seed.",
    },
  },
  generate(input, options) {
    const seed = (BigInt(options.seedHi >>> 0) << 32n) | BigInt(options.seedLo >>> 0);
    const depth = options.depth;
    return input.rings.map((ring) => {
      const points = ring.points.map((point) => ({ x: point.x, y: point.y }));
      const chopped =
        depth > 0 ? choppedOffset(points, depth, options.length, options.jaggedness, seed) : points;
      return { hole: ring.hole, path: contourPath(chopped, true, false, false) };
    });
  },
});
