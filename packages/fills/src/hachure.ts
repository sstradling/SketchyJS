import { defineFill } from "@sketchy-js/plugin";
import { hachureEllipse, hachureLines } from "./internal/hachure-lines.js";
import { concat, hachureParams, regionView } from "./internal/region.js";
import { renderLines } from "./internal/render.js";

/**
 * Hachure fill: parallel rough lines at the fill angle. Sketchy's `HachureFiller`. Ellipses use
 * evenly spaced chords instead of a polygon scan.
 *
 * Request flow: scene fill stage -> this plugin -> `renderLines` -> `ctx.geom.rough.line`.
 */
export const hachure = /*#__PURE__*/ defineFill({
  id: "hachure",
  version: "0.1.0",
  api: "1.1",
  title: "Hachure",
  description: "Parallel hand-drawn lines at the fill angle.",
  options: {},
  stochastic: true,
  stream: "shared",
  generate(input, _options, ctx) {
    const { polygon, shape } = regionView(input);
    const params = hachureParams(input.fill);
    const lines =
      shape?.kind === "ellipse"
        ? hachureEllipse(shape.cx, shape.cy, shape.rx, shape.ry, params)
        : hachureLines(polygon, params);
    return [
      { kind: "strokes", centerlines: [concat(renderLines(lines, ctx, false))], clip: "none" },
    ];
  },
});
