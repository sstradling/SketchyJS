import type { SketchOptions } from "@sketchy-js/types";
import { cosf, f, sinf } from "../f32.js";
import { controlPointBounds, svgPathToOps } from "../svg/path.js";
import { contoursToSvgPath, fillEllipse, fillPolygon, svgContours } from "../fill/geometry.js";
import type { Pt, RoughCtx } from "../rough/context.js";
import type { FillRegionSpec, FillStage, OperationSet } from "./types.js";

/** Flattens the ops of every set a stage returned into one operation list. */
function mergedOps(sets: readonly OperationSet[]): OperationSet["ops"] {
  return sets.flatMap((set) => set.ops);
}

/**
 * Fill for a polygon shape (`generatePolygonFill`): applies padding and offset, then runs the
 * fill. Returns no sets when padding collapses the polygon.
 */
export function polygonFill(
  stage: FillStage,
  ctx: RoughCtx,
  points: readonly Pt[],
): readonly OperationSet[] {
  const region = fillPolygon(points, ctx.o.fillPadding, ctx.o.fillOffset);
  if (!region) return [];
  return stage.run({ kind: "polygon", points: region }, ctx);
}

/** Fill for an ellipse or circle (`generateEllipseFill`) using the radii the outline also uses. */
export function ellipseFill(
  stage: FillStage,
  ctx: RoughCtx,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): readonly OperationSet[] {
  const region = fillEllipse(cx, cy, rx, ry, ctx.o.fillPadding, ctx.o.fillOffset);
  if (!region) return [];
  return stage.run({ kind: "ellipse", ...region }, ctx);
}

/**
 * The default `fillArc` polygon: the center followed by samples every `(stop - start) /
 * curveStepCount`, closed with an exact sample at `stop`. A non-advancing step stops sampling
 * (Sketchy would loop forever).
 */
export function arcFanPoints(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  start: number,
  stop: number,
  curveStepCount: number,
): Pt[] {
  const points: Pt[] = [[cx, cy]];
  const increment = f(f(stop - start) / curveStepCount);
  if (increment > 0) {
    for (let angle = start; angle <= stop; angle = f(angle + increment)) {
      points.push([f(cx + f(rx * cosf(angle))), f(cy + f(ry * sinf(angle)))]);
    }
  }
  points.push([f(cx + f(rx * cosf(stop))), f(cy + f(ry * sinf(stop)))]);
  return points;
}

/** Fill for a closed arc (`generateArcFill`): ellipse padding, then the arc sector. */
export function arcFill(
  stage: FillStage,
  ctx: RoughCtx,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  start: number,
  stop: number,
): readonly OperationSet[] {
  const region = fillEllipse(cx, cy, rx, ry, ctx.o.fillPadding, ctx.o.fillOffset);
  if (!region) return [];
  const spec: FillRegionSpec = {
    kind: "arc",
    ...region,
    start,
    stop,
    points: arcFanPoints(
      region.cx,
      region.cy,
      region.rx,
      region.ry,
      start,
      stop,
      ctx.o.curveStepCount,
    ),
  };
  return stage.run(spec, ctx);
}

function hasAdjustment(o: SketchOptions): boolean {
  return o.fillPadding !== 0 || o.fillOffset.x !== 0 || o.fillOffset.y !== 0;
}

function patternSet(
  ops: OperationSet["ops"],
  path: string,
  bounds: { width: number; height: number },
): OperationSet {
  return {
    type: "path2DPattern",
    ops,
    path,
    size: { width: f(bounds.width), height: f(bounds.height) },
  };
}

/**
 * Fill for an SVG path shape (`generatePathFill`).
 *
 * - Area-painting styles (solid) become a `path2DFill` carrying the path text and consume no
 *   random values.
 * - Other styles run the fill over the path's control-point bounding box, or over its outer
 *   contour when padding or offset is set, and become a `path2DPattern` the renderer clips to
 *   the path.
 */
export function pathFill(stage: FillStage, ctx: RoughCtx, d: string): readonly OperationSet[] {
  const o = ctx.o;
  const direct = stage.paintsArea(o.fillStyle);
  const wash = stage.expandsSvgPath?.(o.fillStyle) === true;
  if (hasAdjustment(o)) {
    const contours = svgContours(d, o.fillPadding, o.fillOffset);
    const outer = contours?.[0];
    if (!contours || !outer) return [];
    const clipped = contoursToSvgPath(contours);
    if (direct && wash) return stage.run({ kind: "svgPath", d: clipped }, ctx);
    if (direct) return [{ type: "path2DFill", ops: [], path: clipped }];
    const sets = stage.run({ kind: "polygon", points: outer }, ctx);
    if (sets.length === 0) return [];
    return [patternSet(mergedOps(sets), clipped, controlPointBounds(svgPathToOps(clipped)))];
  }
  if (direct && wash) return stage.run({ kind: "svgPath", d }, ctx);
  if (direct) return [{ type: "path2DFill", ops: [], path: d }];
  const bounds = controlPointBounds(svgPathToOps(d));
  const minX = f(bounds.minX);
  const minY = f(bounds.minY);
  const maxX = f(bounds.maxX);
  const maxY = f(bounds.maxY);
  const box: Pt[] = [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
  ];
  const sets = stage.run({ kind: "polygon", points: box }, ctx);
  if (sets.length === 0) return [];
  return [patternSet(mergedOps(sets), d, bounds)];
}
