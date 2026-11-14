import { defineStickerEdge, type EdgeRing } from "@sketchy-js/plugin";
import { contourPath } from "../contour.js";
import { offsetClosed, normalOffset } from "../offset.js";
import { continuousOutline, expandToCover } from "../smooth.js";
import type { Pt } from "../geom.js";

/**
 * Fully smooth sticker edge. Corners are rounded on purpose. The ring the host
 * passes is the smoothed centerline, not the miter offset: this edge offsets
 * along the normal so a concave sample does not fold inward. An optional
 * `source` on the ring (the rough outline, before smoothness) is what the
 * sheet is expanded to cover. Plugins that only have the centerline use that.
 */
export const fullySmoothEdge = /*#__PURE__*/ defineStickerEdge({
  id: "fullySmooth",
  version: "0.1.0",
  api: "1.0",
  title: "Fully smooth",
  description: "Continuous tangent around the whole sheet, including the closed seam.",
  stochastic: false,
  options: {
    radius: {
      type: "number",
      default: 0,
      min: 0,
      max: 10_000,
      unit: "px",
      description:
        "How far along the edge the rounding reaches. 0 picks a radius from the outline length.",
    },
  },
  generate(input, options) {
    const margin = Math.abs(input.margin);
    return input.rings.map((ring) => {
      const signed = ring.hole ? -margin : margin;
      const points = fullySmoothPoints(ring, signed, options.radius);
      return { hole: ring.hole, path: contourPath(points, true, true, true) };
    });
  },
});

/** One fully-smooth ring. Exported for the host, which has the rough source outline. */
export function fullySmoothPoints(ring: EdgeRing, signed: number, radius: number): Pt[] {
  const points = ring.points.map((point) => ({ x: point.x, y: point.y }));
  const source = sourceOf(ring);
  const coverageBase = source.length >= 3 ? source : points;
  const coverage = offsetClosed(coverageBase, signed);
  const smoothed = continuousOutline(points, true, radius);
  let next = normalOffset(smoothed, signed);
  const polish = radius > 0 ? Math.min(18, Math.max(12, radius * 0.5)) : 14;
  next = continuousOutline(next, true, polish);
  next = continuousOutline(next, true, 10);
  if (coverage) next = expandToCover(coverage, next);
  return next;
}

function sourceOf(ring: EdgeRing): Pt[] {
  const extra = (ring as EdgeRing & { source?: readonly { x: number; y: number }[] }).source;
  if (!extra) return [];
  return extra.map((point) => ({ x: point.x, y: point.y }));
}
