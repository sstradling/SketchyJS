import type { PathOp, Point } from "@sketchy-js/types";
import { f } from "../f32.js";
import * as continuous from "../rough/continuous.js";
import type { Pt, RoughCtx } from "../rough/context.js";
import * as legacy from "../rough/legacy.js";
import { rectanglePoints } from "../rough/legacy.js";

/** Converts public `Point`s to the `[x, y]` pairs the generators use, rounding to `Float`. */
export function toPts(points: readonly Point[]): Pt[] {
  return points.map((p): Pt => [f(p.x), f(p.y)]);
}

/** True when the drawing uses Bezier-continuous outlines (the default). */
const isContinuous = (ctx: RoughCtx): boolean => ctx.o.strokeContinuity === "continuous";

/** Rough line outline (two jittered passes) in the selected continuity. */
export function lineOutline(ctx: RoughCtx, a: Pt, b: Pt): PathOp[] {
  return isContinuous(ctx) ? continuous.doubleLineOps(ctx, a, b) : legacy.doubleLineOps(ctx, a, b);
}

/** Rough rectangle outline; points are built once so fill and outline agree. */
export function rectangleOutline(
  ctx: RoughCtx,
  x: number,
  y: number,
  width: number,
  height: number,
): PathOp[] {
  return isContinuous(ctx)
    ? continuous.rectangleOps(ctx, x, y, width, height)
    : legacy.rectangleOps(ctx, x, y, width, height);
}

/** Ellipse outline for already resolved radii (no second jitter). */
export function ellipseOutline(
  ctx: RoughCtx,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): PathOp[] {
  return isContinuous(ctx)
    ? continuous.ellipseOps(ctx, cx, cy, rx, ry)
    : legacy.ellipseStroke(ctx, cx, cy, rx, ry);
}

/** Open polyline outline. */
export function linearPathOutline(ctx: RoughCtx, points: readonly Pt[]): PathOp[] {
  return isContinuous(ctx)
    ? continuous.linearPathOps(ctx, points, false)
    : legacy.linearPathOps(ctx, points, false);
}

/** Closed polygon outline. */
export function polygonOutline(ctx: RoughCtx, points: readonly Pt[]): PathOp[] {
  return isContinuous(ctx) ? continuous.polygonOps(ctx, points) : legacy.polygonOps(ctx, points);
}

/** Arc outline; legacy closes with rough radius lines, continuous closes with its own geometry. */
export function arcOutline(
  ctx: RoughCtx,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  start: number,
  stop: number,
  closed: boolean,
): PathOp[] {
  return isContinuous(ctx)
    ? continuous.arcOps(ctx, cx, cy, rx, ry, start, stop, closed)
    : legacy.arcOps(ctx, cx, cy, rx, ry, start, stop, closed, true);
}

/** Rounded rectangle outline. */
export function roundedRectangleOutline(
  ctx: RoughCtx,
  x: number,
  y: number,
  width: number,
  height: number,
  cornerRadius: number,
): PathOp[] {
  return isContinuous(ctx)
    ? continuous.roundedRectangleOps(ctx, x, y, width, height, cornerRadius)
    : legacy.roundedRectangleOps(ctx, x, y, width, height, cornerRadius);
}

/** Egg outline. */
export function eggOutline(
  ctx: RoughCtx,
  cx: number,
  cy: number,
  width: number,
  height: number,
  tilt: number,
): PathOp[] {
  return isContinuous(ctx)
    ? continuous.eggOps(ctx, cx, cy, width, height, tilt)
    : legacy.eggOps(ctx, cx, cy, width, height, tilt);
}

/** Corner points of a rectangle in Sketchy's order, for fills. */
export { rectanglePoints };
