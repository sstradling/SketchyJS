import type { PathOp } from "@sketchy-js/types";
import { f } from "../f32.js";
import { randOffset, type RoughCtx } from "../rough/context.js";
import { convertArc } from "../svg/arc.js";
import { parseSvgPath, type SvgCommand } from "../svg/parse.js";

/** Splits parsed commands into contours; each `move` after the first command starts a new one. */
function splitContours(commands: readonly SvgCommand[]): SvgCommand[][] {
  const contours: SvgCommand[][] = [];
  let current: SvgCommand[] = [];
  for (const command of commands) {
    if (command.type === "move" && current.length > 0) {
      contours.push(current);
      current = [];
    }
    current.push(command);
  }
  if (current.length > 0) contours.push(current);
  return contours;
}

/** `Float(source) + randOffset(scale)`; one stream draw. */
function jitter(ctx: RoughCtx, source: number, scale: number): number {
  return f(f(source) + randOffset(ctx, scale));
}

/**
 * Renders one contour with a jitter scale. The source position (unjittered) resets for every
 * contour, which is where an arc that follows a `move` less contour starts: the origin.
 */
function renderContour(ctx: RoughCtx, commands: readonly SvgCommand[], scale: number): PathOp[] {
  const ops: PathOp[] = [];
  let source: [number, number] = [0, 0];
  let firstSource: [number, number] | undefined;
  for (const c of commands) {
    switch (c.type) {
      case "move": {
        const x = jitter(ctx, c.x, scale);
        const y = jitter(ctx, c.y, scale);
        ops.push({ op: "M", x, y });
        source = [c.x, c.y];
        firstSource = source;
        break;
      }
      case "line": {
        const x = jitter(ctx, c.x, scale);
        const y = jitter(ctx, c.y, scale);
        ops.push({ op: "L", x, y });
        source = [c.x, c.y];
        break;
      }
      case "cubic": {
        const c1x = jitter(ctx, c.c1x, scale);
        const c1y = jitter(ctx, c.c1y, scale);
        const c2x = jitter(ctx, c.c2x, scale);
        const c2y = jitter(ctx, c.c2y, scale);
        const x = jitter(ctx, c.x, scale);
        const y = jitter(ctx, c.y, scale);
        ops.push({ op: "C", c1x, c1y, c2x, c2y, x, y });
        source = [c.x, c.y];
        break;
      }
      case "quad": {
        const cx = jitter(ctx, c.c1x, scale);
        const cy = jitter(ctx, c.c1y, scale);
        const x = jitter(ctx, c.x, scale);
        const y = jitter(ctx, c.y, scale);
        ops.push({ op: "Q", cx, cy, x, y });
        source = [c.x, c.y];
        break;
      }
      case "arc": {
        const conversion = convertArc(
          source,
          [c.x, c.y],
          c.rx,
          c.ry,
          c.rotation,
          c.largeArc,
          c.sweep,
        );
        if (conversion.kind === "line") {
          const x = jitter(ctx, c.x, scale);
          const y = jitter(ctx, c.y, scale);
          ops.push({ op: "L", x, y });
        } else if (conversion.kind === "cubic") {
          for (const k of conversion.curves) {
            const c1x = jitter(ctx, k.c1x, scale);
            const c1y = jitter(ctx, k.c1y, scale);
            const c2x = jitter(ctx, k.c2x, scale);
            const c2y = jitter(ctx, k.c2y, scale);
            const x = jitter(ctx, k.x, scale);
            const y = jitter(ctx, k.y, scale);
            ops.push({ op: "C", c1x, c1y, c2x, c2y, x, y });
          }
        }
        source = [c.x, c.y];
        break;
      }
      case "close":
        ops.push({ op: "Z" });
        if (firstSource) source = firstSource;
        break;
    }
  }
  return ops;
}

/**
 * `SVGPathRenderer.pathOps`: the rough outline of an SVG path. All contours are drawn once with
 * offset scale `1 * (1 + 0.2 * roughness)`, then again with `1.5 * (1 + 0.22 * roughness)`.
 * Used for both stroke continuities (Sketchy has one SVG outline generator).
 */
export function svgPathOutlineOps(ctx: RoughCtx, d: string): PathOp[] {
  const contours = splitContours(parseSvgPath(d));
  const r = ctx.o.roughness;
  const first = f(1 * f(1 + f(f(0.2) * r)));
  const second = f(f(1.5) * f(1 + f(f(0.22) * r)));
  const ops: PathOp[] = [];
  for (const contour of contours) ops.push(...renderContour(ctx, contour, first));
  for (const contour of contours) ops.push(...renderContour(ctx, contour, second));
  return ops;
}
