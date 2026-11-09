import type { Path, PluginContext } from "@sketchy-js/plugin";
import type { FillLine } from "./line-helper.js";

/**
 * `HachureFiller.renderLines`: one rough double line per fill line. With `connect`, a rough
 * connector joins each line's end to the next line's start (zigzag).
 */
export function renderLines(
  lines: readonly FillLine[],
  ctx: PluginContext,
  connect: boolean,
): Path[] {
  const out: Path[] = [];
  let lastEnd: FillLine["end"] | undefined;
  for (const line of lines) {
    out.push(
      ctx.geom.rough.line(
        { x: line.start[0], y: line.start[1] },
        { x: line.end[0], y: line.end[1] },
      ),
    );
    if (connect && lastEnd) {
      out.push(
        ctx.geom.rough.line(
          { x: lastEnd[0], y: lastEnd[1] },
          { x: line.start[0], y: line.start[1] },
        ),
      );
    }
    lastEnd = line.end;
  }
  return out;
}
