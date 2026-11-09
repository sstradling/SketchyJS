import { defineFill, s } from "@sketchy-js/plugin";
import { f } from "./internal/f32.js";
import { hachureEllipse, hachureLines } from "./internal/hachure-lines.js";
import { concat, hachureParams, regionView } from "./internal/region.js";
import { zigzagLinePaths, type Boundary } from "./internal/zigzag-geometry.js";

/** `ZigzagLineFiller.zigzagOffset`: negative means the hachure gap (or four stroke widths). */
function resolveOffset(option: number, gap: number, strokeWidth: number): number {
  if (option < 0) return gap < 0 ? f(strokeWidth * 4) : gap;
  return option;
}

/**
 * Zigzag-line fill: hachure lines that carry a zigzag of the given amplitude where it fits
 * inside the shape. Sketchy's `ZigzagLineFiller`.
 */
export const zigzagLine = /*#__PURE__*/ defineFill({
  id: "zigzagLine",
  version: "0.1.0",
  api: "1.1",
  title: "Zigzag line",
  description: "Hachure lines that zigzag between the shape's edges.",
  options: {
    zigzagOffset: s.number({
      default: -1,
      min: -1,
      max: 1000,
      unit: "px",
      description: "Zigzag amplitude. A negative value uses the hachure gap.",
    }),
  },
  stochastic: true,
  stream: "shared",
  generate(input, options, ctx) {
    const { fill } = input;
    const { polygon, shape } = regionView(input);
    const strokeWidth = fill.strokeWidth ?? 1;
    const zigOffset = resolveOffset(options.zigzagOffset, fill.gap, strokeWidth);
    const gap = Math.max(fill.gap, f(strokeWidth * 4));
    // `zigOptions.fillSpacing = (gap + zigzag) / weight`, then `computedHachureGap` re-multiplies
    // by the weight with the spacing clamped to 0.5...100.
    const spacing = Math.max(0.5, Math.min(100, f(f(gap + zigOffset) / fill.weight)));
    const params = hachureParams(fill, fill.angle, f(fill.weight * spacing));
    const ellipse = shape?.kind === "ellipse" ? shape : undefined;
    const lines = ellipse
      ? hachureEllipse(ellipse.cx, ellipse.cy, ellipse.rx, ellipse.ry, params)
      : hachureLines(polygon, params);
    const boundary: Boundary = ellipse
      ? { kind: "ellipse", cx: ellipse.cx, cy: ellipse.cy, rx: ellipse.rx, ry: ellipse.ry }
      : { kind: "polygon", points: polygon };
    return [
      {
        kind: "strokes",
        centerlines: [concat(zigzagLinePaths(lines, zigOffset, boundary, ctx))],
        clip: "none",
      },
    ];
  },
});
