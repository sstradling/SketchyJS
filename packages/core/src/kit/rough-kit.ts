import type { Path, Point, RoughKit, RoughPatch, RoughStream } from "@sketchy-js/plugin";
import { f } from "../f32.js";
import { Rng } from "../rng/index.js";
import { randOffsetWithRange, type Pt, type RoughCtx } from "../rough/context.js";
import {
  curveOps,
  doubleLineOps,
  ellipseOps,
  solidEllipseStroke,
  solidFillPathOps,
} from "../rough/legacy.js";

const pt = (p: Point): Pt => [f(p.x), f(p.y)];

/** A stream bound to one context. Curve ops read that context's rng and options. */
function streamOf(ctx: RoughCtx): RoughStream {
  return {
    unit: () => ctx.rng.swiftUnit(),
    curve: (points): Path => curveOps(ctx, points.map(pt)),
  };
}

/**
 * Binds Sketchy's rough drawing helpers to one shape's options and random stream. Fill plugins
 * call these instead of owning rough-line math, so a plugin's draws interleave with the outline
 * exactly as in Sketchy. Fillers always use the legacy generators, whatever the outline
 * continuity (as in Swift).
 *
 * Routing: created per shape by the scene fill stage and exposed as `ctx.geom.rough`.
 * `isolated` is Sketchy's `RoughRandom.isolated`: contour slots and wash strokes keep
 * their own sequence and do not advance the outline.
 */
export function createRoughKit(ctx: RoughCtx): RoughKit {
  const shared = streamOf(ctx);
  return {
    line: (a, b): Path => doubleLineOps(ctx, pt(a), pt(b)),
    ellipse: (center, rx, ry): Path => ellipseOps(ctx, f(center.x), f(center.y), f(rx), f(ry)),
    offset: (min, max): number => randOffsetWithRange(ctx, f(min), f(max)),
    solidPolygon: (points): Path => solidFillPathOps(ctx, points.map(pt)),
    solidEllipse: (center, rx, ry): Path =>
      solidEllipseStroke(ctx, f(center.x), f(center.y), f(rx), f(ry)),
    curve: (points): Path => shared.curve(points),
    isolated(seed: bigint, patch?: RoughPatch): RoughStream {
      const o = patch
        ? {
            ...ctx.o,
            ...(patch.roughness !== undefined ? { roughness: patch.roughness } : {}),
            ...(patch.bowing !== undefined ? { bowing: patch.bowing } : {}),
            ...(patch.maxRandomnessOffset !== undefined
              ? { maxRandomnessOffset: patch.maxRandomnessOffset }
              : {}),
          }
        : ctx.o;
      return streamOf({ o, rng: new Rng(seed) });
    },
  };
}
