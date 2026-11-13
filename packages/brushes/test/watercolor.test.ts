import { describe, expect, it } from "vitest";
import { generateDrawing, line } from "@sketchy-js/core";
import { defaultSketchOptions, resolveSketchOptions } from "@sketchy-js/core/options";
import { createFillStage } from "@sketchy-js/scene";
import { basicSketchy } from "@sketchy-js/scene/basic";
import { watercolorStrokePieces } from "../src/watercolor-stroke.js";

describe("watercolor stroke", () => {
  it("emits finite glaze pieces for an open line", () => {
    const options = resolveSketchOptions({ seed: 42n, strokeWidth: 12 });
    const stage = createFillStage({
      fill: basicSketchy.resolveSpec("fill", { kind: options.fillStyle }),
      options,
      report: () => undefined,
    });
    const drawing = generateDrawing(line(16, 150, 184, 60), options, stage);
    const outline = drawing!.sets[drawing!.sets.length - 1]!.ops;
    const brush = defaultSketchOptions().brushProfile;
    const pieces = watercolorStrokePieces(
      outline,
      12,
      brush,
      {
        pigment: 0.72,
        wetness: 0.6,
        edgeDarkening: 0.75,
        layers: 3,
        variation: 0.45,
        bleed: 0.5,
        seed: 42n,
      },
      1,
    );
    expect(pieces.length).toBeGreaterThan(10);
    for (const piece of pieces) {
      expect(Number.isFinite(piece.opacity)).toBe(true);
      expect(piece.opacity).toBeGreaterThan(0);
      expect(piece.opacity).toBeLessThanOrEqual(1);
    }
  });
});
