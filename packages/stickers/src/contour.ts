import type { Path, PathOp } from "@sketchy-js/types";
import { clean, dist, lineIntersection, type Pt } from "./geom.js";

/** A turn of at least this many radians is a real corner. About 52°. */
const CORNER_TURN = 0.9;

/**
 * The paper outline. Smooth edges are Catmull-Rom curves between corners.
 * Torn edges and short runs stay lines. `continuous` ignores corners so the
 * tangent does not break, including across the seam.
 */
export function contourPath(
  points: readonly Pt[],
  closed: boolean,
  curved: boolean,
  continuous = false,
): Path {
  let ring = clean(points, closed);
  if (curved && !continuous && closed) ring = unchamfer(ring);
  if (continuous && ring.length >= 4) return closed ? closedSpline(ring) : openSpline(ring);
  if (!curved || ring.length < 4)
    return polyline(ring.length === 0 ? points : ring, closed && ring.length >= 3);
  let corners = ring.map((_, index) => index).filter((index) => isCorner(ring, index, closed));
  if (!closed) {
    if (corners[0] !== 0) corners = [0, ...corners];
    if (corners[corners.length - 1] !== ring.length - 1) corners = [...corners, ring.length - 1];
  }
  if (closed && corners.length === 0) return closedSpline(ring);
  if (corners.length === 0) return openSpline(ring);
  const ops: PathOp[] = [];
  const chainCount = closed ? corners.length : corners.length - 1;
  for (let index = 0; index < chainCount; index++) {
    const start = corners[index]!;
    const end = closed ? corners[(index + 1) % corners.length]! : corners[index + 1]!;
    // One corner means the chain returns to itself the long way around the ring.
    // `slice` would otherwise return that single point.
    const chain =
      closed && start === end
        ? ring.slice(start).concat(ring.slice(0, start + 1))
        : slice(ring, start, end);
    appendSpline(ops, chain, ops.length === 0);
  }
  if (closed) ops.push({ op: "Z" });
  return ops;
}

/** True when the turn at `index` is a corner the smooth edge should keep sharp. */
export function isCorner(points: readonly Pt[], index: number, closed: boolean): boolean {
  const count = points.length;
  const previous = closed ? (index + count - 1) % count : index - 1;
  const next = closed ? (index + 1) % count : index + 1;
  if (previous < 0 || next >= count || previous === index || next === index) return false;
  if (dist(points[previous]!, points[index]!) <= 0.4) return false;
  if (dist(points[index]!, points[next]!) <= 0.4) return false;
  return Math.abs(turning(points[previous]!, points[index]!, points[next]!)) >= CORNER_TURN;
}

function unchamfer(points: Pt[]): Pt[] {
  const count = points.length;
  if (count < 5) return points;
  const skip = points.map(() => false);
  const replacement: (Pt | undefined)[] = points.map(() => undefined);
  for (let index = 0; index < count; index++) {
    if (skip[index]) continue;
    const previous = points[(index + count - 1) % count]!;
    const current = points[index]!;
    const next = points[(index + 1) % count]!;
    const after = points[(index + 2) % count]!;
    const span = dist(current, next);
    const firstTurn = Math.abs(turning(previous, current, next));
    const secondTurn = Math.abs(turning(current, next, after));
    const hit = lineIntersection(previous, current, next, after);
    if (
      !(span < 14) ||
      !(firstTurn < CORNER_TURN) ||
      !(secondTurn < CORNER_TURN) ||
      !(firstTurn + secondTurn >= CORNER_TURN) ||
      !hit ||
      !(dist(hit, current) < 18) ||
      !(dist(hit, next) < 18)
    )
      continue;
    replacement[index] = hit;
    skip[(index + 1) % count] = true;
  }
  const result: Pt[] = [];
  for (let index = 0; index < count; index++) {
    if (skip[index]) continue;
    result.push(replacement[index] ?? points[index]!);
  }
  return result.length >= 4 ? result : points;
}

function turning(a: Pt, b: Pt, c: Pt): number {
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const vx = c.x - b.x;
  const vy = c.y - b.y;
  return Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
}

function slice(points: readonly Pt[], start: number, end: number): Pt[] {
  if (end >= start) return points.slice(start, end + 1);
  return points.slice(start).concat(points.slice(0, end + 1));
}

function closedSpline(points: readonly Pt[]): Path {
  const first = points[0];
  if (!first || points.length < 2) return [];
  const ops: PathOp[] = [{ op: "M", x: first.x, y: first.y }];
  const count = points.length;
  for (let index = 0; index < count; index++) {
    const p0 = points[(index - 1 + count) % count]!;
    const p1 = points[index]!;
    const p2 = points[(index + 1) % count]!;
    const p3 = points[(index + 2) % count]!;
    const [c1, c2] = splineControls(p0, p1, p2, p3);
    ops.push({ op: "C", c1x: c1.x, c1y: c1.y, c2x: c2.x, c2y: c2.y, x: p2.x, y: p2.y });
  }
  ops.push({ op: "Z" });
  return ops;
}

function openSpline(points: readonly Pt[]): Path {
  const ops: PathOp[] = [];
  appendSpline(ops, points, true);
  return ops;
}

function appendSpline(ops: PathOp[], chain: readonly Pt[], needsMove: boolean): void {
  const first = chain[0];
  if (!first) return;
  if (needsMove || ops.length === 0) ops.push({ op: "M", x: first.x, y: first.y });
  if (chain.length < 2) return;
  if (chain.length === 2) {
    const end = chain[1]!;
    ops.push({ op: "L", x: end.x, y: end.y });
    return;
  }
  for (let index = 0; index < chain.length - 1; index++) {
    const p1 = chain[index]!;
    const p2 = chain[index + 1]!;
    const p0 = index === 0 ? { x: 2 * p1.x - p2.x, y: 2 * p1.y - p2.y } : chain[index - 1]!;
    const p3 =
      index + 2 < chain.length ? chain[index + 2]! : { x: 2 * p2.x - p1.x, y: 2 * p2.y - p1.y };
    const [c1, c2] = splineControls(p0, p1, p2, p3);
    ops.push({ op: "C", c1x: c1.x, c1y: c1.y, c2x: c2.x, c2y: c2.y, x: p2.x, y: p2.y });
  }
}

/** Uniform Catmull-Rom segment from `p1` to `p2`. */
function splineControls(p0: Pt, p1: Pt, p2: Pt, p3: Pt): [Pt, Pt] {
  return [
    { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 },
    { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 },
  ];
}

function polyline(points: readonly Pt[], closed: boolean): Path {
  const first = points[0];
  if (!first) return [];
  const ops: PathOp[] = [{ op: "M", x: first.x, y: first.y }];
  for (const point of points.slice(1)) ops.push({ op: "L", x: point.x, y: point.y });
  if (closed) ops.push({ op: "Z" });
  return ops;
}

/** Axis-aligned bounds of every endpoint and control, matching `CGPath.boundingBox`. */
export function controlBounds(path: Path): [number, number, number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const take = (x: number, y: number): void => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const op of path) {
    if (op.op === "Z") continue;
    if (op.op === "Q") take(op.cx, op.cy);
    if (op.op === "C") {
      take(op.c1x, op.c1y);
      take(op.c2x, op.c2y);
    }
    take(op.x, op.y);
  }
  if (!Number.isFinite(minX)) return [0, 0, 0, 0];
  return [minX, minY, maxX - minX, maxY - minY];
}
