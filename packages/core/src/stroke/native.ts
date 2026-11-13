import type { BrushCap, BrushJoin, Path, PathOp } from "@sketchy-js/types";
import {
  arcToCubics,
  dist,
  lineIntersection,
  offsetPoint,
  signedAngleDelta,
  unit,
  type Vec,
} from "./math.js";

/** One straight piece of a centerline, with the tangent of travel. */
interface Segment {
  a: Vec;
  b: Vec;
  angle: number;
}

interface Contour {
  closed: boolean;
  segments: Segment[];
}

const line = (p: Vec): PathOp => ({ op: "L", x: p.x, y: p.y });

/**
 * Splits a path into contours of straight segments. Curves are flattened by the
 * caller; this stroker is the CoreGraphics polyline case (the stroke fixtures).
 */
function contours(path: Path): Contour[] {
  const out: Contour[] = [];
  let current: Vec[] = [];
  let start: Vec | undefined;
  const flush = (closed: boolean): void => {
    if (current.length >= 2) {
      const segments: Segment[] = [];
      for (let i = 1; i < current.length; i++) {
        const a = current[i - 1]!;
        const b = current[i]!;
        if (dist(a, b) <= 1e-9) continue;
        segments.push({ a, b, angle: Math.atan2(b.y - a.y, b.x - a.x) });
      }
      if (segments.length > 0) out.push({ closed, segments });
    }
    current = [];
    start = undefined;
  };
  for (const op of path) {
    if (op.op === "M") {
      flush(false);
      start = { x: op.x, y: op.y };
      current = [start];
    } else if (op.op === "L" && current.length > 0) {
      current.push({ x: op.x, y: op.y });
    } else if (op.op === "Z" && start && current.length > 0) {
      current.push(start);
      flush(true);
    }
  }
  flush(false);
  return out;
}

/** Outer miter tip, or `undefined` when the limit rejects it. Sketchy's `acceptedMiter`. */
function acceptedMiter(
  incoming: Vec,
  outgoing: Vec,
  vertex: Vec,
  incomingTangent: number,
  outgoingTangent: number,
  half: number,
  turn: number,
  miterLimit: number,
): Vec | undefined {
  const wedge = Math.PI - Math.abs(turn);
  const formula = 1 / Math.max(Math.sin(wedge / 2), 0.001);
  if (formula > miterLimit) return undefined;
  const tip = lineIntersection(incoming, unit(incomingTangent), outgoing, unit(outgoingTangent));
  if (!tip) return undefined;
  const toTip = { x: tip.x - vertex.x, y: tip.y - vertex.y };
  const toOuter = { x: incoming.x - vertex.x, y: incoming.y - vertex.y };
  if (toTip.x * toOuter.x + toTip.y * toOuter.y <= 0) return undefined;
  const innerSign = turn > 0 ? 1 : -1;
  const inner =
    lineIntersection(
      offsetPoint(vertex, incomingTangent, half, innerSign),
      unit(incomingTangent),
      offsetPoint(vertex, outgoingTangent, half, innerSign),
      unit(outgoingTangent),
    ) ?? vertex;
  const miterLength = dist(tip, inner);
  if (miterLength / Math.max(half * 2, 0.001) > miterLimit) return undefined;
  return tip;
}

/** Points added on one side at a corner, after the incoming offset is already drawn. */
function joinOps(
  vertex: Vec,
  incomingTangent: number,
  outgoingTangent: number,
  half: number,
  sign: number,
  join: BrushJoin,
  miterLimit: number,
): PathOp[] {
  const turn = signedAngleDelta(incomingTangent, outgoingTangent);
  if (Math.abs(turn) < 0.01 || half <= 0.05) return [];
  const incoming = offsetPoint(vertex, incomingTangent, half, sign);
  const outgoing = offsetPoint(vertex, outgoingTangent, half, sign);
  const outerSign = turn > 0 ? -1 : 1;
  if (sign !== outerSign) return [line(outgoing)];
  if (join === "bevel") return [line(outgoing)];
  if (join === "miter" || (typeof join === "object" && false)) {
    const tip = acceptedMiter(
      incoming,
      outgoing,
      vertex,
      incomingTangent,
      outgoingTangent,
      half,
      turn,
      miterLimit,
    );
    return tip ? [line(tip), line(outgoing)] : [line(outgoing)];
  }
  if (typeof join === "object") return [line(outgoing)];
  const start = Math.atan2(incoming.y - vertex.y, incoming.x - vertex.x);
  const sweep = signedAngleDelta(start, Math.atan2(outgoing.y - vertex.y, outgoing.x - vertex.x));
  return arcToCubics(vertex, half, start, sweep);
}

function capOps(from: Vec, to: Vec, cap: BrushCap, tangent: number, end: boolean): PathOp[] {
  if (cap === "butt") return [line(to)];
  const half = dist(from, to) / 2;
  if (cap === "square") {
    // CoreGraphics extends a square cap along the centerline, by half the width.
    const dir = unit(end ? tangent : tangent + Math.PI);
    const ox = dir.x * half;
    const oy = dir.y * half;
    return [
      line({ x: from.x + ox, y: from.y + oy }),
      line({ x: to.x + ox, y: to.y + oy }),
      line(to),
    ];
  }
  const center = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const start = Math.atan2(from.y - center.y, from.x - center.x);
  const outward = end ? tangent : tangent + Math.PI;
  const decreasing = Math.abs(signedAngleDelta(start - Math.PI / 2, outward));
  const increasing = Math.abs(signedAngleDelta(start + Math.PI / 2, outward));
  const sweep = decreasing <= increasing ? -Math.PI : Math.PI;
  return arcToCubics(center, half, start, sweep);
}

/** One closed offset loop of a closed contour. `sign` is +1 (left) or -1 (right). */
function closedLoop(
  segments: readonly Segment[],
  half: number,
  sign: number,
  join: BrushJoin,
  miterLimit: number,
): PathOp[] {
  const first = segments[0]!;
  const start = offsetPoint(first.a, first.angle, half, sign);
  const ops: PathOp[] = [{ op: "M", x: start.x, y: start.y }];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    const next = segments[(i + 1) % segments.length]!;
    ops.push(line(offsetPoint(seg.b, seg.angle, half, sign)));
    ops.push(...joinOps(seg.b, seg.angle, next.angle, half, sign, join, miterLimit));
  }
  ops.push({ op: "Z" });
  return ops;
}

/** Open ribbon: left side forward, end cap, right side back, start cap. */
function openRibbon(
  segments: readonly Segment[],
  half: number,
  cap: BrushCap,
  join: BrushJoin,
  miterLimit: number,
): PathOp[] {
  const first = segments[0]!;
  const last = segments[segments.length - 1]!;
  const leftStart = offsetPoint(first.a, first.angle, half, 1);
  const rightStart = offsetPoint(first.a, first.angle, half, -1);
  const ops: PathOp[] = [{ op: "M", x: leftStart.x, y: leftStart.y }];
  const right: PathOp[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    ops.push(line(offsetPoint(seg.b, seg.angle, half, 1)));
    right.push(line(offsetPoint(seg.b, seg.angle, half, -1)));
    const next = segments[i + 1];
    if (!next) continue;
    ops.push(...joinOps(seg.b, seg.angle, next.angle, half, 1, join, miterLimit));
    right.push(...joinOps(seg.b, seg.angle, next.angle, half, -1, join, miterLimit));
  }
  const leftEnd = offsetPoint(last.b, last.angle, half, 1);
  const rightEnd = offsetPoint(last.b, last.angle, half, -1);
  ops.push(...capOps(leftEnd, rightEnd, cap, last.angle, true));
  ops.push(...reverseOps(right, rightStart));
  ops.push(...capOps(rightStart, leftStart, cap, first.angle, false));
  ops.push({ op: "Z" });
  return ops;
}

/** Replays `ops` backwards. They were drawn starting at `start`. */
function reverseOps(ops: readonly PathOp[], start: Vec): PathOp[] {
  const out: PathOp[] = [];
  for (let i = ops.length - 1; i >= 0; i--) {
    const op = ops[i]!;
    const prev = i === 0 ? start : endpoint(ops[i - 1]!, start);
    if (op.op === "L") out.push(line(prev));
    else if (op.op === "C")
      out.push({
        op: "C",
        c1x: op.c2x,
        c1y: op.c2y,
        c2x: op.c1x,
        c2y: op.c1y,
        x: prev.x,
        y: prev.y,
      });
  }
  return out;
}

function endpoint(op: PathOp, fallback: Vec): Vec {
  if (op.op === "L" || op.op === "C" || op.op === "Q" || op.op === "M") return { x: op.x, y: op.y };
  return fallback;
}

/**
 * Filled outline of a uniform polyline stroke, matching CoreGraphics
 * `CGPath.copy(strokingWithWidth:)` for butt, round, and square caps and for
 * miter, round, and bevel joins.
 *
 * A closed contour becomes two loops (the hole and the outside). An open
 * contour is one ribbon. Curved bevel is not handled here.
 *
 * @param path centerline of line segments and closes
 * @param width stroke width in px; `<= 0` returns an empty path
 */
export function nativePolylineOutline(
  path: Path,
  width: number,
  cap: BrushCap,
  join: BrushJoin,
  miterLimit: number,
): Path {
  if (!(width > 0)) return [];
  const limit = Math.max(1, miterLimit);
  const half = width / 2;
  const simple: BrushJoin = typeof join === "object" ? "bevel" : join;
  const ops: PathOp[] = [];
  for (const contour of contours(path)) {
    if (contour.closed) {
      // The left offset follows the centerline. The right offset is the other
      // boundary, walked backwards, so both loops wind the same way and the
      // stroke interior is the filled region between them.
      ops.push(...closedLoop(contour.segments, half, 1, simple, limit));
      const right = closedLoop(contour.segments, half, -1, simple, limit);
      const move = right[0]!;
      const start = move.op === "M" ? { x: move.x, y: move.y } : { x: 0, y: 0 };
      ops.push(move, ...reverseOps(right.slice(1, -1), start), { op: "Z" });
    } else {
      ops.push(...openRibbon(contour.segments, half, cap, simple, limit));
    }
  }
  return ops;
}
