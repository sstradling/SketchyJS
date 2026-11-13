import { createCanvas } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import { renderToSvgString } from "@sketchy-js/svg-renderer";
import type { Path, Scene } from "@sketchy-js/types";
import { renderToCanvas, type Canvas2D } from "../src/index.js";

const rect: Path = [
  { op: "M", x: 10, y: 10 },
  { op: "L", x: 30, y: 10 },
  { op: "L", x: 30, y: 30 },
  { op: "L", x: 10, y: 30 },
  { op: "Z" },
];

/** Black at 0.5, hard shadow shifted to x+40 so the sample is shadow only. */
function scene(): Scene {
  return {
    version: 1,
    size: { width: 80, height: 40 },
    nodes: [
      {
        type: "drawing",
        drawing: {
          shape: "rectangle",
          outline: [],
          layers: [
            {
              role: "sheet-shadow",
              paths: [rect],
              fillRule: "nonzero",
              paint: { kind: "solid", color: [0, 0, 0, 0.5] },
              shadow: { x: 40, y: 0, radius: 0 },
            },
          ],
        },
      },
    ],
  };
}

describe("sheet shadow opacity", () => {
  it("applies opacity once", () => {
    const drawn = scene();
    const svg = renderToSvgString(drawn, { background: "#ffffff" });
    expect(svg).toContain('flood-opacity="1"');
    expect(svg).toContain('fill-opacity="0.5"');
    expect(svg).toContain('stdDeviation="0"');
    const blurred = scene();
    const shadow = blurred.nodes[0];
    if (shadow?.type === "drawing") {
      const layer = shadow.drawing.layers[0];
      if (layer) layer.shadow = { x: 8, y: 0, radius: 10 };
    }
    const blurredSvg = renderToSvgString(blurred, { background: "#ffffff" });
    expect(blurredSvg).toContain('stdDeviation="5"');
    expect(blurredSvg).not.toContain('stdDeviation="10"');

    const canvas = createCanvas(80, 40);
    const context = canvas.getContext("2d");
    renderToCanvas(drawn, context as unknown as Canvas2D, { background: "#ffffff" });
    const pixel = context.getImageData(60, 20, 1, 1).data;
    // One application of 0.5 black on white is about 128. Applying it twice is about 191.
    expect(pixel[0]).toBeLessThan(160);
    expect(pixel[0]).toBeGreaterThan(100);
  });
});
