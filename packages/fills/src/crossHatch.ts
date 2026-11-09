import { defineFill, type PluginContext, type FillInput, type Path } from "@sketchy-js/plugin";
import { f } from "./internal/f32.js";
import { hachureEllipse, hachureLines } from "./internal/hachure-lines.js";
import { concat, hachureParams, regionView } from "./internal/region.js";
import { renderLines } from "./internal/render.js";

function pass(input: FillInput, ctx: PluginContext, angle: number): Path[] {
  const { polygon, shape } = regionView(input);
  const params = hachureParams(input.fill, angle);
  const lines =
    shape?.kind === "ellipse"
      ? hachureEllipse(shape.cx, shape.cy, shape.rx, shape.ry, params)
      : hachureLines(polygon, params);
  return renderLines(lines, ctx, false);
}

/** Cross-hatch fill: a hachure pass at the fill angle, then a second at `angle + 90`. */
export const crossHatch = /*#__PURE__*/ defineFill({
  id: "crossHatch",
  version: "0.1.0",
  api: "1.1",
  title: "Cross-hatch",
  description: "Two perpendicular hachure passes.",
  options: {},
  stochastic: true,
  stream: "shared",
  generate(input, _options, ctx) {
    const first = pass(input, ctx, input.fill.angle);
    const second = pass(input, ctx, f(input.fill.angle + 90));
    return [{ kind: "strokes", centerlines: [concat([...first, ...second])], clip: "none" }];
  },
});
