import { describe, expect, it } from "vitest";
import { circle } from "@sketchy-js/sketchy/core";
import { defaultSketchOptions } from "@sketchy-js/sketchy/core/options";
import { crayon } from "@sketchy-js/sketchy/brushes";
import { basicSketchy } from "../../src/scene/basic.js";
import { sketchScene } from "../../src/scene/functional.js";
import { renderToSvgString } from "@sketchy-js/sketchy/svg";

/**
 * Waxing the default clear fill turns a crayon ring into tens of megabytes of
 * invisible ellipses. The default path must stay near the stroke-only SVG.
 */
describe("crayon SVG size", () => {
  it("skips invisible wax on the default clear fill", () => {
    const profile = defaultSketchOptions().brushProfile;
    const scene = sketchScene(
      basicSketchy.use(crayon),
      circle(80, 80, 100),
      { width: 160, height: 160 },
      {
        seed: 11n,
        roughness: 0.2,
        strokeWidth: 12,
        strokeColor: [0, 0, 0, 1],
        brushProfile: {
          ...profile,
          crayon: {
            grain: 0.28,
            edgeRoughness: 0.75,
            widthVariation: 0.18,
            opacityVariation: 0.35,
            passes: 2,
            baseOpacity: 0.8,
            baseSoftness: 0.5,
            grit: 0.92,
            flakeSize: 1.45,
            seed: 11n,
          },
        },
      },
    );
    const svg = renderToSvgString(scene);
    const bytes = Buffer.byteLength(svg);
    // This seeded ring is a few hundred KB of visible wax. Waxing the clear
    // fill as well is the 52 MB failure mode, so the ceiling stays far below that.
    expect(bytes).toBeGreaterThan(100_000);
    expect(bytes).toBeLessThan(1_000_000);
  });
});
