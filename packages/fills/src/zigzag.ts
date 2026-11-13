import { defineFill } from "@sketchy-js/plugin";
import { hachureEllipse, hachureLines } from "./internal/hachure-lines.js";
import { concat, hachureParams, regionView } from "./internal/region.js";
import { renderLines } from "./internal/render.js";

/**
 * Zigzag fill: hachure lines joined end to start by rough connectors. Sketchy's `ZigzagFiller`
 * ignores `zigzagOffset`; that option belongs to `zigzagLine`.
 */
export const zigzag = /*#__PURE__*/ defineFill({
  id: "zigzag",
  version: "0.1.0",
  api: "1.0",
  title: "Zigzag",
  description: "Hachure lines connected into one continuous zigzag.",
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
      { kind: "strokes", centerlines: [concat(renderLines(lines, ctx, true))], clip: "none" },
    ];
  },
});
