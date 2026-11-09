import type { Path, Point, RoughKit } from "@sketchy-js/plugin";
import { f } from "../f32.js";
import { randOffsetWithRange, type Pt, type RoughCtx } from "../rough/context.js";
import {
  doubleLineOps,
  ellipseOps,
  solidEllipseStroke,
  solidFillPathOps,
} from "../rough/legacy.js";

const pt = (p: Point): Pt => [f(p.x), f(p.y)];

/**
 * Binds Sketchy's rough drawing helpers to one shape's options and random stream. Fill plugins
 * call these instead of owning rough-line math, so a plugin's draws interleave with the outline
 * exactly as in Sketchy. Fillers always use the legacy generators, whatever the outline
 * continuity (as in Swift).
 *
 * Routing: created per shape by the scene fill stage and exposed as `ctx.geom.rough`.
 */
export function createRoughKit(ctx: RoughCtx): RoughKit {
  return {
    line: (a, b): Path => doubleLineOps(ctx, pt(a), pt(b)),
    ellipse: (center, rx, ry): Path => ellipseOps(ctx, f(center.x), f(center.y), f(rx), f(ry)),
    offset: (min, max): number => randOffsetWithRange(ctx, f(min), f(max)),
    solidPolygon: (points): Path => solidFillPathOps(ctx, points.map(pt)),
    solidEllipse: (center, rx, ry): Path =>
      solidEllipseStroke(ctx, f(center.x), f(center.y), f(rx), f(ry)),
  };
}
