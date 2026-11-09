import { defineFill } from "@sketchy-js/plugin";
import { atan2f, cosf, f, sinf, toInt } from "./internal/f32.js";
import { hachureEllipse, hachureLines } from "./internal/hachure-lines.js";
import { lineLength, type FillLine } from "./internal/line-helper.js";
import { concat, hachureParams, regionView } from "./internal/region.js";
import type { Path, PluginContext } from "@sketchy-js/plugin";

/**
 * Places small rough circles along horizontal guide lines (`DotsFiller.dotsOnLines`). The dot
 * radius is the effective fill weight; each dot is jittered by a quarter of the gap.
 */
function dotsOnLines(
  lines: readonly FillLine[],
  gapInput: number,
  weight: number,
  strokeWidth: number,
  ctx: PluginContext,
): Path[] {
  let gap = gapInput;
  if (gap < 0) gap = f(strokeWidth * 4);
  gap = Math.max(gap, f(0.1));
  const radius = weight < 0 ? f(strokeWidth / 2) : weight;
  const out: Path[] = [];
  for (const line of lines) {
    const length = lineLength(line);
    const dotCount = toInt(Math.ceil(f(length / gap))) - 1;
    if (dotCount < 1) continue;
    const angle = atan2f(f(line.end[1] - line.start[1]), f(line.end[0] - line.start[0]));
    for (let i = 0; i < dotCount; i++) {
      const distance = f(gap * f(i + 1));
      const dx = f(distance * cosf(angle));
      const dy = f(distance * sinf(angle));
      const quarter = f(gap / 4);
      const jx = ctx.geom.rough.offset(f(-gap / 4), quarter);
      const cx = f(f(line.start[0] + dx) + jx);
      const jy = ctx.geom.rough.offset(f(-gap / 4), quarter);
      const cy = f(f(line.start[1] + dy) + jy);
      out.push(ctx.geom.rough.ellipse({ x: cx, y: cy }, radius, radius));
    }
  }
  return out;
}

/** Dots fill: rough circles on a hachure grid. The fill angle is ignored (guides run at 0 degrees). */
export const dots = /*#__PURE__*/ defineFill({
  id: "dots",
  version: "0.1.0",
  api: "1.1",
  title: "Dots",
  description: "Hand-drawn dots on a regular grid.",
  options: {},
  stochastic: true,
  stream: "shared",
  generate(input, _options, ctx) {
    const { polygon, shape } = regionView(input);
    const params = hachureParams(input.fill, 0);
    const lines =
      shape?.kind === "ellipse"
        ? hachureEllipse(shape.cx, shape.cy, shape.rx, shape.ry, params)
        : hachureLines(polygon, params);
    const dotPaths = dotsOnLines(
      lines,
      input.fill.gap,
      input.fill.weight,
      input.fill.strokeWidth ?? 1,
      ctx,
    );
    return [{ kind: "strokes", centerlines: [concat(dotPaths)], clip: "none" }];
  },
});
