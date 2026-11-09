import { defineFill } from "@sketchy-js/plugin";
import { radialFill } from "./internal/radial.js";
import { regionView } from "./internal/region.js";

/** Starburst fill. Sketchy renders `starBurst` and `sunBurst` identically; both ids are kept for source compatibility. */
export const starBurst = /*#__PURE__*/ defineFill({
  id: "starBurst",
  version: "0.1.0",
  api: "1.1",
  title: "Starburst",
  description: "Rough rays radiating from the center of the shape (alias of sunburst).",
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
