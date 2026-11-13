import { defineStickerEdge, type EdgeRing } from "@sketchy-js/plugin";
import { contourPath } from "../contour.js";

/**
 * Smooth sticker edge: curves between real corners, so a rectangle corner stays
 * sharp and an egg stays continuous. The host has already offset the ring.
 *
 * Request flow: `buildStickerBacking` -> this plugin -> `contourPath`.
 */
export const smoothEdge = /*#__PURE__*/ defineStickerEdge({
  id: "smooth",
  version: "0.1.0",
  api: "1.0",
  title: "Smooth",
  description: "Curves between real corners. Star points and rectangle corners stay sharp.",
  stochastic: false,
  options: {},
  generate(input) {
    return input.rings.map((ring) => ({
      hole: ring.hole,
      path: contourPath(asPoints(ring), true, true, false),
    }));
  },
});

function asPoints(ring: EdgeRing): { x: number; y: number }[] {
  return ring.points.map((point) => ({ x: point.x, y: point.y }));
}
