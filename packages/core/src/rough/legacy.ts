import type { PathOp } from "@sketchy-js/types";
import { cosf, f, PI, sinf, sqrtf } from "../f32.js";
import {
  ellipseIncrement,
  randOffset,
  randOffsetWithRange,
  type Pt,
  type RoughCtx,
} from "./context.js";

const move = (x: number, y: number): PathOp => ({ op: "M", x, y });
const line = (x: number, y: number): PathOp => ({ op: "L", x, y });
const cubic = (
  c1x: number,
  c1y: number,
  c2x: number,
  c2y: number,
  x: number,
  y: number,
): PathOp => ({ op: "C", c1x, c1y, c2x, c2y, x, y });

/**
 * `RoughMath.lineOps`: one rough line pass with bowing. `overlay` passes use half the offset.
 *
 * Draw order: diverge point, two bow offsets, then (when `moveFirst`) the move jitter and the six
 * curve jitters. Changing it changes every later value of the stream.
 */
export function lineOps(
  ctx: RoughCtx,
  [x1, y1]: Pt,
  [x2, y2]: Pt,
  moveFirst: boolean,
  overlay: boolean,
): PathOp[] {
  const { o } = ctx;
  const dx = f(x1 - x2);
  const dy = f(y1 - y2);
  const lengthSq = f(f(dx * dx) + f(dy * dy));
  let maxOffset = o.maxRandomnessOffset;
  if (f(f(maxOffset * maxOffset) * 100) > lengthSq) maxOffset = f(sqrtf(lengthSq) / 10);
  const halfOffset = f(maxOffset / 2);
  const divergePoint = f(f(0.2) + f(f(0.2) * ctx.rng.swiftUnit()));

  let midDispX = f(f(f(o.bowing * o.maxRandomnessOffset) * f(y2 - y1)) / 200);
  let midDispY = f(f(f(o.bowing * o.maxRandomnessOffset) * f(x1 - x2)) / 200);
  midDispX = randOffset(ctx, midDispX);
  midDispY = randOffset(ctx, midDispY);

  const ops: PathOp[] = [];
  const spread = overlay ? halfOffset : maxOffset;
  if (moveFirst) {
    const x = f(x1 + randOffset(ctx, spread));
    const y = f(y1 + randOffset(ctx, spread));
    ops.push(move(x, y));
  }
  const ddx = f(x2 - x1);
  const ddy = f(y2 - y1);
  const c1x = f(f(f(midDispX + x1) + f(ddx * divergePoint)) + randOffset(ctx, spread));
  const c1y = f(f(f(midDispY + y1) + f(ddy * divergePoint)) + randOffset(ctx, spread));
  const c2x = f(f(f(midDispX + x1) + f(f(2 * ddx) * divergePoint)) + randOffset(ctx, spread));
  const c2y = f(f(f(midDispY + y1) + f(f(2 * ddy) * divergePoint)) + randOffset(ctx, spread));
  const ex = f(x2 + randOffset(ctx, spread));
  const ey = f(y2 + randOffset(ctx, spread));
  ops.push(cubic(c1x, c1y, c2x, c2y, ex, ey));
  return ops;
}

/** `RoughMath.doubleLineOps`: two `lineOps` passes, `M C M C`. */
export function doubleLineOps(ctx: RoughCtx, a: Pt, b: Pt): PathOp[] {
  const first = lineOps(ctx, a, b, true, false);
  const second = lineOps(ctx, a, b, true, true);
  return [...first, ...second];
}

/**
 * `RoughMath.bezierFromPoints`: Catmull-Rom control points to cubic segments. Draws from the
 * stream only for the two-point case (a rough line) and the optional `close` point.
 */
export function bezierFromPoints(ctx: RoughCtx, points: readonly Pt[], close?: Pt): PathOp[] {
  const ops: PathOp[] = [];
  const len = points.length;
  if (len > 3) {
    const s = f(1 - ctx.o.curveTightness);
    ops.push(move(points[1]![0], points[1]![1]));
    for (let i = 1; i < len - 2; i++) {
      const pm = points[i - 1]!;
      const p = points[i]!;
      const p1 = points[i + 1]!;
      const p2 = points[i + 2]!;
      ops.push(
        cubic(
          f(p[0] + f(f(f(s * p1[0]) - f(s * pm[0])) / 6)),
          f(p[1] + f(f(f(s * p1[1]) - f(s * pm[1])) / 6)),
          f(p1[0] + f(f(f(s * p[0]) - f(s * p2[0])) / 6)),
          f(p1[1] + f(f(f(s * p[1]) - f(s * p2[1])) / 6)),
          p1[0],
          p1[1],
        ),
      );
    }
    if (close) {
      const maxOff = ctx.o.maxRandomnessOffset;
      const x = f(close[0] + randOffset(ctx, maxOff));
      const y = f(close[1] + randOffset(ctx, maxOff));
      ops.push(line(x, y));
    }
  } else if (len === 3) {
    const [, p1, p2] = points as [Pt, Pt, Pt];
    ops.push(move(p1[0], p1[1]));
    ops.push(cubic(p1[0], p1[1], p2[0], p2[1], p2[0], p2[1]));
  } else if (len === 2) {
    ops.push(...doubleLineOps(ctx, points[0]!, points[1]!));
  }
  return ops;
}

function jitteredPoint(ctx: RoughCtx, p: Pt, offset: number): Pt {
  const x = f(p[0] + randOffset(ctx, offset));
  const y = f(p[1] + randOffset(ctx, offset));
  return [x, y];
}

function curveWithOffset(ctx: RoughCtx, points: readonly Pt[], offset: number): PathOp[] {
  const ps: Pt[] = [];
  ps.push(jitteredPoint(ctx, points[0]!, offset));
  ps.push(jitteredPoint(ctx, points[0]!, offset));
  for (let i = 1; i < points.length; i++) {
    ps.push(jitteredPoint(ctx, points[i]!, offset));
    if (i === points.length - 1) ps.push(jitteredPoint(ctx, points[i]!, offset));
  }
  return bezierFromPoints(ctx, ps);
}

/** `RoughMath.curveOps`: Catmull-Rom curve through `points`, two jittered passes. */
export function curveOps(ctx: RoughCtx, points: readonly Pt[]): PathOp[] {
  const r = ctx.o.roughness;
  const o1 = curveWithOffset(ctx, points, f(1 * f(1 + f(f(0.2) * r))));
  const o2 = curveWithOffset(ctx, points, f(f(1.5) * f(1 + f(f(0.22) * r))));
  return [...o1, ...o2];
}

/** `RoughMath.resolvedEllipseRadii`: the single radius jitter shared by an ellipse's fill and outline. */
export function resolvedEllipseRadii(
  ctx: RoughCtx,
  rx: number,
  ry: number,
): { rx: number; ry: number } {
  const jx = randOffset(ctx, f(rx * f(0.05)));
  const nrx = f(rx + jx);
  const jy = randOffset(ctx, f(ry * f(0.05)));
  return { rx: nrx, ry: f(ry + jy) };
}

/** Overlap angle of an ellipse's first pass: `increment * randOffsetWithRange(0.1, randOffsetWithRange(0.4, 1))`. */
export function ellipseOverlap(ctx: RoughCtx, increment: number): number {
  const hi = randOffsetWithRange(ctx, f(0.4), 1);
  return f(increment * randOffsetWithRange(ctx, f(0.1), hi));
}

/** `RoughMath.ellipseWithParams`: one closed-ish pass of a sampled ellipse. */
export function ellipseWithParams(
  ctx: RoughCtx,
  increment: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  offset: number,
  overlap: number,
): PathOp[] {
  const radOffset = f(randOffset(ctx, f(0.5)) - f(PI / 2));
  const points: Pt[] = [];
  const at = (angle: number, kx: number, ky: number): Pt => {
    const jx = randOffset(ctx, offset);
    const x = f(f(jx + cx) + f(f(kx * rx) * cosf(angle)));
    const jy = randOffset(ctx, offset);
    const y = f(f(jy + cy) + f(f(ky * ry) * sinf(angle)));
    return [x, y];
  };
  points.push(at(f(radOffset - increment), f(0.9), f(0.9)));
  const limit = f(f(f(PI * 2) + radOffset) - f(0.01));
  for (let angle = radOffset; angle < limit; angle = f(angle + increment)) {
    points.push(at(angle, 1, 1));
  }
  points.push(at(f(f(radOffset + f(PI * 2)) + f(overlap * f(0.5))), 1, 1));
  points.push(at(f(radOffset + overlap), f(0.98), f(0.98)));
  points.push(at(f(radOffset + f(overlap * f(0.5))), f(0.9), f(0.9)));
  return bezierFromPoints(ctx, points);
}

/** `RoughMath.ellipseStroke`: two passes of an ellipse whose radii are already resolved. */
export function ellipseStroke(
  ctx: RoughCtx,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): PathOp[] {
  const increment = ellipseIncrement(ctx);
  const overlap = ellipseOverlap(ctx, increment);
  const o1 = ellipseWithParams(ctx, increment, cx, cy, rx, ry, 1, overlap);
  const o2 = ellipseWithParams(ctx, increment, cx, cy, rx, ry, f(1.5), 0);
  return [...o1, ...o2];
}

/** `RoughMath.ellipseOps`: resolves the radii, then strokes. Dots fills call this directly. */
export function ellipseOps(
  ctx: RoughCtx,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): PathOp[] {
  const resolved = resolvedEllipseRadii(ctx, rx, ry);
  return ellipseStroke(ctx, cx, cy, resolved.rx, resolved.ry);
}

/** `RoughMath.solidEllipseStroke`: one closed ellipse path for solid fills. */
export function solidEllipseStroke(
  ctx: RoughCtx,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): PathOp[] {
  const increment = ellipseIncrement(ctx);
  const overlap = ellipseOverlap(ctx, increment);
  return [...ellipseWithParams(ctx, increment, cx, cy, rx, ry, 1, overlap), { op: "Z" }];
}

function arcWithParams(
  ctx: RoughCtx,
  arcInc: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  start: number,
  stop: number,
  offset: number,
): PathOp[] {
  const radOffset = f(start + randOffset(ctx, f(0.1)));
  const points: Pt[] = [];
  const at = (angle: number, k: number): Pt => {
    const jx = randOffset(ctx, offset);
    const x = f(f(jx + cx) + f(f(k * rx) * cosf(angle)));
    const jy = randOffset(ctx, offset);
    const y = f(f(jy + cy) + f(f(k * ry) * sinf(angle)));
    return [x, y];
  };
  points.push(at(f(radOffset - arcInc), f(0.9)));
  for (let angle = radOffset; angle <= stop; angle = f(angle + arcInc)) points.push(at(angle, 1));
  const end: Pt = [f(cx + f(rx * cosf(stop))), f(cy + f(ry * sinf(stop)))];
  points.push(end, end);
  return bezierFromPoints(ctx, points);
}

/** Normalizes an arc's angles like Sketchy: start moves into `[0, 2π)`, spans over a turn become a full circle. */
export function normalizeArcAngles(start: number, stop: number): { strt: number; stp: number } {
  let strt = start;
  let stp = stop;
  while (strt < 0) {
    strt = f(strt + f(PI * 2));
    stp = f(stp + f(PI * 2));
  }
  if (f(stp - strt) > f(PI * 2)) {
    strt = 0;
    stp = f(PI * 2);
  }
  return { strt, stp };
}

/** `RoughMath.arcOps`. With `roughClosure` a closed arc is finished with two rough radius lines. */
export function arcOps(
  ctx: RoughCtx,
  cx: number,
  cy: number,
  rxIn: number,
  ryIn: number,
  start: number,
  stop: number,
  closed: boolean,
  roughClosure: boolean,
): PathOp[] {
  const rx = f(rxIn + randOffset(ctx, f(rxIn * f(0.01))));
  const ry = f(ryIn + randOffset(ctx, f(ryIn * f(0.01))));
  const { strt, stp } = normalizeArcAngles(start, stop);
  const increment = ellipseIncrement(ctx);
  const arcInc = Math.min(f(increment / 2), f(f(stp - strt) / 2));
  const o1 = arcWithParams(ctx, arcInc, cx, cy, rx, ry, strt, stp, 1);
  const o2 = arcWithParams(ctx, arcInc, cx, cy, rx, ry, strt, stp, f(1.5));
  const ops = [...o1, ...o2];
  if (closed) {
    const sx = f(cx + f(rx * cosf(strt)));
    const sy = f(cy + f(ry * sinf(strt)));
    const ex = f(cx + f(rx * cosf(stp)));
    const ey = f(cy + f(ry * sinf(stp)));
    if (roughClosure) {
      ops.push(...doubleLineOps(ctx, [cx, cy], [sx, sy]));
      ops.push(...doubleLineOps(ctx, [cx, cy], [ex, ey]));
    } else {
      ops.push(line(cx, cy), line(sx, sy));
    }
  }
  return ops;
}

/** `RoughMath.linearPathOps`: rough lines through the points, optionally closed. */
export function linearPathOps(ctx: RoughCtx, points: readonly Pt[], close: boolean): PathOp[] {
  const len = points.length;
  if (len > 2) {
    const ops: PathOp[] = [];
    for (let i = 0; i < len - 1; i++) ops.push(...doubleLineOps(ctx, points[i]!, points[i + 1]!));
    if (close) ops.push(...doubleLineOps(ctx, points[len - 1]!, points[0]!));
    return ops;
  }
  if (len === 2) return doubleLineOps(ctx, points[0]!, points[1]!);
  return [];
}

/** `RoughMath.polygonOps`. */
export function polygonOps(ctx: RoughCtx, points: readonly Pt[]): PathOp[] {
  return linearPathOps(ctx, points, true);
}

/** Corner points of an `x, y, width, height` rectangle in Sketchy's order. */
export function rectanglePoints(x: number, y: number, width: number, height: number): Pt[] {
  return [
    [x, y],
    [f(x + width), y],
    [f(x + width), f(y + height)],
    [x, f(y + height)],
  ];
}

/** `RoughMath.rectangleOps`. */
export function rectangleOps(
  ctx: RoughCtx,
  x: number,
  y: number,
  width: number,
  height: number,
): PathOp[] {
  return polygonOps(ctx, rectanglePoints(x, y, width, height));
}

/** `RoughMath.solidFillPathOps`: a jittered polyline through the points (no roughness-scaled bow). */
export function solidFillPathOps(ctx: RoughCtx, points: readonly Pt[]): PathOp[] {
  const ops: PathOp[] = [];
  const maxOffset = ctx.o.maxRandomnessOffset;
  points.forEach((p, i) => {
    const x = f(p[0] + randOffset(ctx, maxOffset));
    const y = f(p[1] + randOffset(ctx, maxOffset));
    ops.push(i === 0 ? move(x, y) : line(x, y));
  });
  return ops;
}

/** `RoughMath.roundedRectanglePolygonPoints`: 8-step corner approximation used for fills. */
export function roundedRectanglePolygonPoints(
  x: number,
  y: number,
  width: number,
  height: number,
  cornerRadius: number,
  arcSteps = 8,
): Pt[] {
  const maxRadius = f(Math.min(width, height) / 2);
  const r = Math.min(cornerRadius, maxRadius);
  if (r <= 0) return rectanglePoints(x, y, width, height);
  const points: Pt[] = [];
  const quarter = f(PI / 2);
  const corner = (cxx: number, cyy: number, base: number): void => {
    for (let i = 0; i <= arcSteps; i++) {
      const angle = f(base + f(f(f(i) * quarter) / arcSteps));
      points.push([f(cxx + f(r * cosf(angle))), f(cyy + f(r * sinf(angle)))]);
    }
  };
  corner(f(x + r), f(y + r), PI);
  corner(f(f(x + width) - r), f(y + r), f(f(-PI) / 2));
  corner(f(f(x + width) - r), f(f(y + height) - r), 0);
  corner(f(x + r), f(f(y + height) - r), f(PI / 2));
  return points;
}

/** `RoughMath.eggPoint`: a point on the egg curve (narrower top for positive `tilt`). */
export function eggPoint(
  angle: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  tilt: number,
): Pt {
  const normalizedY = sinf(angle);
  const modulation = f(1 - f(tilt * normalizedY));
  const effectiveRx = f(rx * modulation);
  return [f(cx + f(effectiveRx * cosf(angle))), f(cy + f(ry * sinf(angle)))];
}

/** `RoughMath.eggPolygonPoints`: polygon approximation for egg fills. */
export function eggPolygonPoints(
  cx: number,
  cy: number,
  width: number,
  height: number,
  tilt: number,
  stepCount: number,
): Pt[] {
  const rx = f(width / 2);
  const ry = f(height / 2);
  const increment = f(f(2 * PI) / stepCount);
  const points: Pt[] = [];
  for (let angle = 0; angle < f(2 * PI); angle = f(angle + increment)) {
    points.push(eggPoint(angle, cx, cy, rx, ry, tilt));
  }
  return points;
}

function eggWithParams(
  ctx: RoughCtx,
  increment: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  tilt: number,
  offset: number,
  overlap: number,
): PathOp[] {
  const radOffset = f(randOffset(ctx, f(0.5)) - f(PI / 2));
  const points: Pt[] = [];
  const blended = (angle: number, k: number, kc: number): Pt => {
    const [px, py] = eggPoint(angle, cx, cy, rx, ry, tilt);
    const jx = randOffset(ctx, offset);
    const x = f(f(jx + f(px * k)) + f(cx * kc));
    const jy = randOffset(ctx, offset);
    const y = f(f(jy + f(py * k)) + f(cy * kc));
    return [x, y];
  };
  const plain = (angle: number): Pt => {
    const [px, py] = eggPoint(angle, cx, cy, rx, ry, tilt);
    const jx = randOffset(ctx, offset);
    const x = f(jx + px);
    const jy = randOffset(ctx, offset);
    return [x, f(jy + py)];
  };
  points.push(blended(f(radOffset - increment), f(0.9), f(0.1)));
  const limit = f(f(f(PI * 2) + radOffset) - f(0.01));
  for (let angle = radOffset; angle < limit; angle = f(angle + increment))
    points.push(plain(angle));
  points.push(plain(f(f(radOffset + f(PI * 2)) + f(overlap * f(0.5)))));
  points.push(blended(f(radOffset + overlap), f(0.98), f(0.02)));
  points.push(blended(f(radOffset + f(overlap * f(0.5))), f(0.9), f(0.1)));
  return bezierFromPoints(ctx, points);
}

/** `RoughMath.eggOps`. */
export function eggOps(
  ctx: RoughCtx,
  cx: number,
  cy: number,
  width: number,
  height: number,
  tilt: number,
): PathOp[] {
  const increment = ellipseIncrement(ctx);
  let rx = f(width / 2);
  let ry = f(height / 2);
  rx = f(rx + randOffset(ctx, f(rx * f(0.05))));
  ry = f(ry + randOffset(ctx, f(ry * f(0.05))));
  const overlap = ellipseOverlap(ctx, increment);
  const o1 = eggWithParams(ctx, increment, cx, cy, rx, ry, tilt, 1, overlap);
  const o2 = eggWithParams(ctx, increment, cx, cy, rx, ry, tilt, f(1.5), 0);
  return [...o1, ...o2];
}

/** One hand-drawn pass of a rounded-rectangle corner (`RoughMath.cornerArcPass`). */
function cornerArcPass(
  ctx: RoughCtx,
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
  steps: number,
  offset: number,
): PathOp[] {
  const sweep = f(endAngle - startAngle);
  const increment = f(sweep / f(Math.max(steps, 1)));
  const joinJitter = Math.max(0, Math.min(offset, f(ctx.o.maxRandomnessOffset * f(0.25))));
  const point = (angle: number, jitter: number): Pt => {
    const x = f(f(cx + f(r * cosf(angle))) + randOffset(ctx, jitter));
    const y = f(f(cy + f(r * sinf(angle))) + randOffset(ctx, jitter));
    return [x, y];
  };
  const points: Pt[] = [point(f(startAngle - increment), offset)];
  for (let i = 0; i <= steps; i++) {
    const angle = i === steps ? endAngle : f(startAngle + f(increment * f(i)));
    points.push(point(angle, i === 0 || i === steps ? joinJitter : offset));
  }
  points.push(point(f(endAngle + increment), offset));
  return bezierFromPoints(ctx, points);
}

function cornerArcOps(
  ctx: RoughCtx,
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
): PathOp[] {
  const steps = Math.max(4, Math.trunc(f(ctx.o.curveStepCount / 2)));
  const first = cornerArcPass(ctx, cx, cy, r, startAngle, endAngle, steps, 1);
  const second = cornerArcPass(ctx, cx, cy, r, startAngle, endAngle, steps, f(1.5));
  return [...first, ...second];
}

/** `RoughMath.roundedRectangleOps` (legacy continuity). */
export function roundedRectangleOps(
  ctx: RoughCtx,
  x: number,
  y: number,
  width: number,
  height: number,
  cornerRadius: number,
): PathOp[] {
  const maxRadius = f(Math.min(width, height) / 2);
  const r = Math.min(cornerRadius, maxRadius);
  if (r <= 0) return rectangleOps(ctx, x, y, width, height);
  const right = f(x + width);
  const bottom = f(y + height);
  const halfPi = f(PI / 2);
  return [
    ...doubleLineOps(ctx, [f(x + r), y], [f(right - r), y]),
    ...cornerArcOps(ctx, f(right - r), f(y + r), r, f(-PI / 2), 0),
    ...doubleLineOps(ctx, [right, f(y + r)], [right, f(bottom - r)]),
    ...cornerArcOps(ctx, f(right - r), f(bottom - r), r, 0, halfPi),
    ...doubleLineOps(ctx, [f(right - r), bottom], [f(x + r), bottom]),
    ...cornerArcOps(ctx, f(x + r), f(bottom - r), r, halfPi, PI),
    ...doubleLineOps(ctx, [x, f(bottom - r)], [x, f(y + r)]),
    ...cornerArcOps(ctx, f(x + r), f(y + r), r, PI, f(f(3 * PI) / 2)),
  ];
}
