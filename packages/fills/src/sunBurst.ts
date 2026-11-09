import { defineFill } from "@sketchy-js/plugin";
import { radialFill } from "./internal/radial.js";
import { regionView } from "./internal/region.js";

/** Sunburst fill: rough rays from the shape's centroid to its boundary. */
export const sunBurst = /*#__PURE__*/ defineFill({
  id: "sunBurst",
  version: "0.1.0",
  api: "1.1",
  title: "Sunburst",
  description: "Rough rays radiating from the center of the shape.",
  options: {},
  stochastic: true,
  stream: "shared",
  generate(input, _options, ctx) {
    return [
      {
        kind: "strokes",
        centerlines: [radialFill(regionView(input), input.fill, ctx)],
        clip: "none",
      },
    ];
  },
});
