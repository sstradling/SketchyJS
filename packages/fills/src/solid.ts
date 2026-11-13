import { defineFill } from "@sketchy-js/plugin";
import { regionView } from "./internal/region.js";

/**
 * Solid fill. Sketchy's `SolidFiller`: a jittered closed outline that the renderer paints as an
 * area. Ellipses use one closed ellipse path; arcs fill the fan `center, arc samples`.
 *
 * Request flow: scene fill stage -> this plugin -> `ctx.geom.rough` (shared outline stream).
 */
export const solid = /*#__PURE__*/ defineFill({
  id: "solid",
  version: "0.1.0",
  api: "1.0",
  title: "Solid",
  description: "A jittered, fully painted fill that follows the outline.",
  options: {},
  paints: "area",
  stochastic: true,
  stream: "shared",
  generate(input, _options, ctx) {
    const { polygon, shape } = regionView(input);
    const paths =
      shape?.kind === "ellipse"
        ? [ctx.geom.rough.solidEllipse({ x: shape.cx, y: shape.cy }, shape.rx, shape.ry)]
        : [ctx.geom.rough.solidPolygon(polygon.map(([x, y]) => ({ x, y })))];
    return [{ kind: "area", paths, fillRule: "nonzero", clip: "none" }];
  },
});
