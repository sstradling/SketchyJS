import type { PathOp } from "@sketchy-js/types";

/** A point in stroke geometry. Coordinates stay in double precision until a path stores them. */
export interface Vec {
  x: number;
  y: number;
}

/** Signed angle from `from` to `to`, wrapped into (-π, π]. Matches `StrokeJoinGeometry.signedAngleDelta`. */
export function signedAngleDelta(from: number, to: number): number {
  let delta = to - from;
  const turn = Math.PI * 2;
  while (delta > Math.PI) delta -= turn;
  while (delta <= -Math.PI) delta += turn;
  return delta;
}

export const hypot = (x: number, y: number): number => Math.hypot(x, y);

export const dist = (a: Vec, b: Vec): number => hypot(b.x - a.x, b.y - a.y);

/** Unit vector at `angle`. */
export function unit(angle: number): Vec {
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

/** Offset `point` by `half` on the side `sign` (+1 left of `tangent`, -1 right). */
export function offsetPoint(point: Vec, tangent: number, half: number, sign: number): Vec {
  const normal = tangent + Math.PI / 2;
  return {
    x: point.x + Math.cos(normal) * half * sign,
    y: point.y + Math.sin(normal) * half * sign,
  };
}

/** Intersection of two infinite lines. `undefined` when they are parallel. */
export function lineIntersection(a: Vec, da: Vec, b: Vec, db: Vec): Vec | undefined {
  const cross = da.x * db.y - da.y * db.x;
  if (Math.abs(cross) <= 1e-5) return undefined;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = (dx * db.y - dy * db.x) / cross;
  return { x: a.x + da.x * t, y: a.y + da.y * t };
}

/**
 * One cubic of a circular arc.
 *
 * `delta` is the signed sweep. The control-point scale `(4/3) tan(δ/4)` is the
 * approximation CoreGraphics uses for `CGPath` arcs (verified on the rectangle
 * round-join fixture).
 */
export function arcCubic(center: Vec, radius: number, start: number, delta: number): PathOp {
  const k = (4 / 3) * Math.tan(delta / 4);
  const c0 = Math.cos(start);
  const s0 = Math.sin(start);
  const end = start + delta;
  const c1 = Math.cos(end);
  const s1 = Math.sin(end);
  return {
    op: "C",
    c1x: center.x + radius * (c0 - k * s0),
    c1y: center.y + radius * (s0 + k * c0),
    c2x: center.x + radius * (c1 + k * s1),
    c2y: center.y + radius * (s1 - k * c1),
    x: center.x + radius * c1,
    y: center.y + radius * s1,
  };
}

/**
 * Cubics for an arc. Joins shorter than ~108° stay one cubic, matching
 * `CGPath.copy(strokingWithWidth:)`. Wider sweeps (round caps are 180°) split
 * into 90° pieces.
 */
export function arcToCubics(center: Vec, radius: number, start: number, sweep: number): PathOp[] {
  const limit = Math.PI / 2 + 0.2;
  const count = Math.max(1, Math.ceil(Math.abs(sweep) / limit - 1e-9));
  const step = sweep / count;
  const ops: PathOp[] = [];
  for (let i = 0; i < count; i++) ops.push(arcCubic(center, radius, start + step * i, step));
  return ops;
}

/** SwiftUI `Path` stores line and quad coordinates as `Float`. Arc cubics stay in double. */
export const f32 = (n: number): number => Math.fround(n);

export function f32p(p: Vec): Vec {
  return { x: f32(p.x), y: f32(p.y) };
}
