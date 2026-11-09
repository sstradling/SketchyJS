import { defineFill, s, type Path, type PluginContext } from "@sketchy-js/plugin";
import { atan2f, cosf, f, sinf, toInt } from "./internal/f32.js";
import { hachureEllipse, hachureLines } from "./internal/hachure-lines.js";
import { lineLength, type FillLine, type Pt } from "./internal/line-helper.js";
import { concat, hachureParams, regionView } from "./internal/region.js";

const dashOptions = {
  dashOffset: s.number({
    default: -1,
    min: -1,
    max: 1000,
    unit: "px",
    description: "Length of each dash. A negative value uses the hachure gap.",
  }),
  dashGap: s.number({
    default: -1,
    min: -1,
    max: 1000,
    unit: "px",
    description: "Space between dashes. A negative value uses the hachure gap.",
  }),
} as const;

/** `DashedFiller.dashedLines`: splits each hachure line into centered rough dashes. */
function dashedLines(
  lines: readonly FillLine[],
  gapInput: number,
  strokeWidth: number,
  dashOffsetOption: number,
  dashGapOption: number,
  ctx: PluginContext,
): Path[] {
  const auto = gapInput < 0 ? f(strokeWidth * 4) : gapInput;
  const dashOffset = dashOffsetOption < 0 ? auto : dashOffsetOption;
  const dashGap = dashGapOption < 0 ? auto : dashGapOption;
  const pitch = f(dashOffset + dashGap);
  const out: Path[] = [];
  const rough = (a: Pt, b: Pt): Path =>
    ctx.geom.rough.line({ x: a[0], y: a[1] }, { x: b[0], y: b[1] });
  for (const line of lines) {
    const length = lineLength(line);
    const dashCount = pitch > 0 ? toInt(Math.floor(f(length / pitch))) : 0;
    if (dashCount < 1) {
      out.push(rough(line.start, line.end));
      continue;
    }
    let start = line.start;
    let end = line.end;
    if (start[0] > end[0]) [start, end] = [end, start];
    const angle = atan2f(f(end[1] - start[1]), f(end[0] - start[0]));
    const cosA = cosf(angle);
    const sinA = sinf(angle);
    const total = f(f(dashCount) * pitch);
    const offset = f(f(f(length - total) + dashGap) / 2);
    for (let i = 0; i < dashCount; i++) {
      const segmentStart = f(f(i) * pitch);
      const segmentEnd = f(segmentStart + dashOffset);
      const x1 = f(start[0] + f(f(segmentStart + offset) * cosA));
      const y1 = f(start[1] + f(f(segmentStart + offset) * sinA));
      const x2 = f(start[0] + f(f(segmentEnd + offset) * cosA));
      const y2 = f(start[1] + f(f(segmentEnd + offset) * sinA));
      out.push(rough([x1, y1], [x2, y2]));
    }
  }
  return out;
}

/** Dashed fill: hachure lines broken into dashes of `dashOffset` with `dashGap` between them. */
export const dashed = /*#__PURE__*/ defineFill({
  id: "dashed",
  version: "0.1.0",
  api: "1.1",
  title: "Dashed",
  description: "Hachure lines broken into evenly spaced dashes.",
  options: dashOptions,
  stochastic: true,
  stream: "shared",
  generate(input, options, ctx) {
    const { polygon, shape } = regionView(input);
    const params = hachureParams(input.fill);
    const lines =
      shape?.kind === "ellipse"
        ? hachureEllipse(shape.cx, shape.cy, shape.rx, shape.ry, params)
        : hachureLines(polygon, params);
    const paths = dashedLines(
      lines,
      input.fill.gap,
      input.fill.strokeWidth ?? 1,
      options.dashOffset,
      options.dashGap,
      ctx,
    );
    return [{ kind: "strokes", centerlines: [concat(paths)], clip: "none" }];
  },
});
