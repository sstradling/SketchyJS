import type { FillBase, Path, PluginContext } from "@sketchy-js/plugin";
import { cosf, f, PI, sinf, sqrtf, toInt } from "./f32.js";
import { polygonBounds } from "./hachure-lines.js";
import { linePolygonIntersections, type Pt } from "./line-helper.js";
import { concat } from "./region.js";
import type { RegionView } from "./region.js";

function radialGap(fill: FillBase): number {
  let gap = fill.gap;
  if (gap < 0) gap = f(f(fill.strokeWidth ?? 1) * 4);
  return Math.max(gap, 1);
}

/** `RoughMath.polygonCentroid`: area-weighted centroid in `Float`. */
export function polygonCentroid(points: readonly Pt[]): Pt {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const q = points[(i + 1) % points.length]!;
    const factor = f(f(p[0] * q[1]) - f(q[0] * p[1]));
    area = f(area + factor);
    cx = f(cx + f(f(p[0] + q[0]) * factor));
    cy = f(cy + f(f(p[1] + q[1]) * factor));
  }
  area = f(area / 2);
  const areaFactor = f(6 * area);
  return [f(cx / areaFactor), f(cy / areaFactor)];
}

function distance(ax: number, ay: number, bx: number, by: number): number {
  const dx = f(ax - bx);
  const dy = f(ay - by);
  return sqrtf(f(f(dx * dx) + f(dy * dy)));
}

/** `StarburstFiller.removeDuplicatePoints`: drops points within `tolerance` of an earlier point. */
function removeDuplicatePoints(points: readonly Pt[], tolerance: number): Pt[] {
  const result: Pt[] = [];
  for (const point of points) {
    const duplicate = result.some((e) => {
      const dx = f(e[0] - point[0]);
      const dy = f(e[1] - point[1]);
      return sqrtf(f(f(dx * dx) + f(dy * dy))) < tolerance;
    });
    if (!duplicate) result.push(point);
  }
  return result;
}

function rayAngle(i: number, count: number): number {
  return f(f(f(f(i) * 2) * PI) / f(count));
}

function drawRadial(origin: Pt, ends: readonly Pt[], ctx: PluginContext): Path[] {
  return ends.map((end) =>
    ctx.geom.rough.line({ x: origin[0], y: origin[1] }, { x: end[0], y: end[1] }),
  );
}

/**
 * Rays from the centroid to every polygon edge crossing (`StarburstFiller.fillPolygon`).
 *
 * The ray count is `Int(pi * maxRadius / gap)`. Whether a ray that passes through a vertex yields
 * one or two crossings depends on the `1e-5` margin in `LineHelper.inRange`, which is where
 * Darwin and Linux Swift differ for the concave fixture polygon. See docs/phase-1.md.
 */
function polygonRays(polygon: readonly Pt[], fill: FillBase, ctx: PluginContext): Path[] {
  if (polygon.length < 3) return [];
  const bounds = polygonBounds(polygon);
  const centroid = polygonCentroid(polygon);
  const { minX, maxX, minY, maxY } = bounds;
  const maxRadius = Math.max(
    distance(centroid[0], centroid[1], minX, minY),
    distance(centroid[0], centroid[1], maxX, minY),
    distance(centroid[0], centroid[1], maxX, maxY),
    distance(centroid[0], centroid[1], minX, maxY),
  );
  const gap = radialGap(fill);
  const rayCount = Math.max(1, toInt(f(f(PI * maxRadius) / gap)));
  const hits: Pt[] = [];
  for (let i = 0; i < rayCount; i++) {
    const angle = rayAngle(i, rayCount);
    const end: Pt = [
      f(centroid[0] + f(maxRadius * cosf(angle))),
      f(centroid[1] + f(maxRadius * sinf(angle))),
    ];
    for (const point of linePolygonIntersections(centroid, end, polygon)) {
      if (point[0] >= minX && point[0] <= maxX && point[1] >= minY && point[1] <= maxY) {
        hits.push(point);
      }
    }
  }
  return drawRadial(centroid, removeDuplicatePoints(hits, f(0.5)), ctx);
}

function ellipseRays(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  fill: FillBase,
  ctx: PluginContext,
): Path[] {
  const gap = radialGap(fill);
  const inner = sqrtf(f(f(f(f(3 * rx) + ry)) * f(rx + f(3 * ry))));
  const perimeter = f(PI * f(f(3 * f(rx + ry)) - inner));
  const rayCount = Math.max(1, toInt(f(perimeter / gap)));
  const ends: Pt[] = [];
  for (let i = 0; i < rayCount; i++) {
    const angle = rayAngle(i, rayCount);
    ends.push([f(cx + f(rx * cosf(angle))), f(cy + f(ry * sinf(angle)))]);
  }
  return drawRadial([cx, cy], ends, ctx);
}

function arcRays(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  start: number,
  stop: number,
  fill: FillBase,
  ctx: PluginContext,
): Path[] {
  const gap = radialGap(fill);
  const arcAngle = Math.abs(f(stop - start));
  const avgRadius = f(f(rx + ry) / 2);
  const arcLength = f(arcAngle * avgRadius);
  const rayCount = Math.max(1, toInt(f(arcLength / gap)));
  const ends: Pt[] = [];
  for (let i = 0; i <= rayCount; i++) {
    const t = f(f(i) / f(rayCount));
    const angle = f(start + f(t * f(stop - start)));
    ends.push([f(cx + f(rx * cosf(angle))), f(cy + f(ry * sinf(angle)))]);
  }
  return drawRadial([cx, cy], ends, ctx);
}

/** Radial fill shared by `sunBurst` and `starBurst` (Sketchy maps both styles to `StarburstFiller`). */
export function radialFill(view: RegionView, fill: FillBase, ctx: PluginContext): Path {
  const { shape, polygon } = view;
  if (shape?.kind === "ellipse")
    return concat(ellipseRays(shape.cx, shape.cy, shape.rx, shape.ry, fill, ctx));
  if (shape?.kind === "arc") {
    return concat(
      arcRays(shape.cx, shape.cy, shape.rx, shape.ry, shape.start, shape.stop, fill, ctx),
    );
  }
  return concat(polygonRays(polygon, fill, ctx));
}
