import type { SketchOptions } from "@sketchy-js/types";
import { DEFAULT_STYLE_SEED } from "../options/index.js";
import { Rng } from "../rng/index.js";
import { f } from "../f32.js";
import type { RoughCtx } from "../rough/context.js";
import * as legacy from "../rough/legacy.js";
import type { Shape } from "../shapes/types.js";
import { arcFill, ellipseFill, pathFill, polygonFill } from "./fills.js";
import {
  arcOutline,
  eggOutline,
  ellipseOutline,
  lineOutline,
  linearPathOutline,
  polygonOutline,
  rectangleOutline,
  roundedRectangleOutline,
  toPts,
} from "./outline.js";
import { svgPathOutlineOps } from "./svg-outline.js";
import type { FillStage, OperationSet, SketchDrawing } from "./types.js";

/** Builds the `path` outline set for `ops`. */
const outlineSet = (ops: OperationSet["ops"], path?: string): OperationSet =>
  path === undefined ? { type: "path", ops } : { type: "path", ops, path };

/**
 * Generates the operation sets of one shape. Mirrors `NativeGenerator.generate`: one random
 * stream per call, fill first (it consumes the stream at the same point Sketchy's does), outline
 * last. Returns `undefined` for shapes Sketchy refuses (a point list with no points).
 *
 * Routing: `@sketchy-js/scene` calls this from `drawShape`, passing the fill plugin registry as
 * the `stage`; the scene then turns the sets into render layers.
 *
 * @param shape the shape value (arguments are rounded to `Float`, like Sketchy's API)
 * @param o fully resolved options (see `resolveSketchOptions`)
 * @param stage runs the selected fill plugin
 */
export function generateDrawing(
  shape: Shape,
  o: SketchOptions,
  stage: FillStage,
): SketchDrawing | undefined {
  const ctx: RoughCtx = { o, rng: new Rng(o.seed ?? DEFAULT_STYLE_SEED) };
  const sets = generateSets(shape, ctx, stage);
  return sets ? { shape: shape.kind, sets, options: o } : undefined;
}

function generateSets(shape: Shape, ctx: RoughCtx, stage: FillStage): OperationSet[] | undefined {
  switch (shape.kind) {
    case "line":
      return [outlineSet(lineOutline(ctx, [f(shape.x1), f(shape.y1)], [f(shape.x2), f(shape.y2)]))];
    case "rectangle": {
      const [x, y, w, h] = [f(shape.x), f(shape.y), f(shape.width), f(shape.height)] as const;
      const fill = polygonFill(stage, ctx, legacy.rectanglePoints(x, y, w, h));
      return [...fill, outlineSet(rectangleOutline(ctx, x, y, w, h))];
    }
    case "ellipse":
      return ellipseSets(
        ctx,
        stage,
        f(shape.x),
        f(shape.y),
        f(f(shape.width) / 2),
        f(f(shape.height) / 2),
      );
    case "circle": {
      const r = f(f(shape.diameter) / 2);
      return ellipseSets(ctx, stage, f(shape.x), f(shape.y), r, r);
    }
    case "linearPath": {
      if (shape.points.length === 0) return undefined;
      return [outlineSet(linearPathOutline(ctx, toPts(shape.points)))];
    }
    case "polygon": {
      if (shape.points.length === 0) return undefined;
      const points = toPts(shape.points);
      return [...polygonFill(stage, ctx, points), outlineSet(polygonOutline(ctx, points))];
    }
    case "arc":
      return arcSets(ctx, stage, shape);
    case "curve": {
      if (shape.points.length === 0) return undefined;
      return [outlineSet(legacy.curveOps(ctx, toPts(shape.points)))];
    }
    case "roundedRectangle": {
      const [x, y, w, h, r] = [
        f(shape.x),
        f(shape.y),
        f(shape.width),
        f(shape.height),
        f(shape.cornerRadius),
      ] as const;
      const fill = polygonFill(stage, ctx, legacy.roundedRectanglePolygonPoints(x, y, w, h, r));
      return [...fill, outlineSet(roundedRectangleOutline(ctx, x, y, w, h, r))];
    }
    case "egg": {
      const [cx, cy, w, h, tilt] = [
        f(shape.x),
        f(shape.y),
        f(shape.width),
        f(shape.height),
        f(shape.tilt),
      ] as const;
      const polygon = legacy.eggPolygonPoints(cx, cy, w, h, tilt, ctx.o.curveStepCount);
      return [...polygonFill(stage, ctx, polygon), outlineSet(eggOutline(ctx, cx, cy, w, h, tilt))];
    }
    case "path":
      return [
        ...pathFill(stage, ctx, shape.d),
        outlineSet(svgPathOutlineOps(ctx, shape.d), shape.d),
      ];
  }
}

/** Ellipse and circle: the radii are jittered once and shared by fill and outline. */
function ellipseSets(
  ctx: RoughCtx,
  stage: FillStage,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): OperationSet[] {
  const resolved = legacy.resolvedEllipseRadii(ctx, rx, ry);
  const fill = ellipseFill(stage, ctx, cx, cy, resolved.rx, resolved.ry);
  return [...fill, outlineSet(ellipseOutline(ctx, cx, cy, resolved.rx, resolved.ry))];
}

/** Arc: only closed arcs are filled. */
function arcSets(
  ctx: RoughCtx,
  stage: FillStage,
  shape: Extract<Shape, { kind: "arc" }>,
): OperationSet[] {
  const [cx, cy, start, stop] = [f(shape.x), f(shape.y), f(shape.start), f(shape.stop)] as const;
  const rx = f(f(shape.width) / 2);
  const ry = f(f(shape.height) / 2);
  const fill = shape.closed ? arcFill(stage, ctx, cx, cy, rx, ry, start, stop) : [];
  return [...fill, outlineSet(arcOutline(ctx, cx, cy, rx, ry, start, stop, shape.closed))];
}
