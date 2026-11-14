import type { Path, PathOp } from "@sketchy-js/types";
import { dist, type Pt } from "./geom.js";

export interface Centerline {
  points: Pt[];
  closed: boolean;
  /** Outline before smoothness moves it toward the silhouette. */
  source: Pt[];
}

/**
 * Flattens outline operations into open and closed polylines.
 *
 * A contour that returns to its start within 1.25 px without a close is a sheet.
 * Cubics split until both controls sit within 0.8 of the chord, or depth 8.
 * Quadratics become cubics the same way CoreGraphics does.
 */
export function flattenPath(ops: readonly PathOp[]): Centerline[] {
  const walker = new Walker();
  for (const op of ops) walker.op(op);
  walker.finishOpen();
  return walker.pieces;
}

/** Applies an affine matrix to path operations before flattening (SVG groups). */
export function transformOps(
  ops: readonly PathOp[],
  m: readonly [number, number, number, number, number, number],
): PathOp[] {
  const [a, b, c, d, e, f] = m;
  const x = (px: number, py: number): number => a * px + c * py + e;
  const y = (px: number, py: number): number => b * px + d * py + f;
  return ops.map((op) => {
    switch (op.op) {
      case "M":
      case "L":
        return { op: op.op, x: x(op.x, op.y), y: y(op.x, op.y) };
      case "Q":
        return {
          op: "Q",
          cx: x(op.cx, op.cy),
          cy: y(op.cx, op.cy),
          x: x(op.x, op.y),
          y: y(op.x, op.y),
        };
      case "C":
        return {
          op: "C",
          c1x: x(op.c1x, op.c1y),
          c1y: y(op.c1x, op.c1y),
          c2x: x(op.c2x, op.c2y),
          c2y: y(op.c2x, op.c2y),
          x: x(op.x, op.y),
          y: y(op.x, op.y),
        };
      case "Z":
        return { op: "Z" };
    }
  });
}

class Walker {
  pieces: Centerline[] = [];
  private current: Pt[] = [];

  op(op: PathOp): void {
    switch (op.op) {
      case "M":
        this.move({ x: op.x, y: op.y });
        break;
      case "L":
        this.line({ x: op.x, y: op.y });
        break;
      case "Q":
        this.quad({ x: op.cx, y: op.cy }, { x: op.x, y: op.y });
        break;
      case "C":
        this.cubic({ x: op.c1x, y: op.c1y }, { x: op.c2x, y: op.c2y }, { x: op.x, y: op.y });
        break;
      case "Z":
        this.close();
        break;
    }
  }

  move(point: Pt): void {
    this.finishOpen();
    this.current = [point];
  }

  line(point: Pt): void {
    if (this.current.length === 0) {
      this.current = [point];
      return;
    }
    this.current.push(point);
  }

  quad(control: Pt, end: Pt): void {
    const start = this.current[this.current.length - 1];
    if (!start) {
      this.line(end);
      return;
    }
    const c1 = {
      x: start.x + (2 / 3) * (control.x - start.x),
      y: start.y + (2 / 3) * (control.y - start.y),
    };
    const c2 = {
      x: end.x + (2 / 3) * (control.x - end.x),
      y: end.y + (2 / 3) * (control.y - end.y),
    };
    this.cubic(c1, c2, end);
  }

  cubic(control1: Pt, control2: Pt, end: Pt): void {
    const start = this.current[this.current.length - 1];
    if (!start) {
      this.line(end);
      return;
    }
    this.flattenCubic(start, control1, control2, end, 0);
  }

  close(): void {
    if (this.current.length < 3) {
      this.current = [];
      return;
    }
    this.pieces.push({ points: this.current, closed: true, source: [] });
    this.current = [];
  }

  finishOpen(): void {
    if (this.current.length < 2) {
      this.current = [];
      return;
    }
    const first = this.current[0];
    const last = this.current[this.current.length - 1];
    if (
      this.current.length >= 3 &&
      first &&
      last &&
      Math.hypot(last.x - first.x, last.y - first.y) <= 1.25
    ) {
      this.pieces.push({ points: this.current, closed: true, source: [] });
      this.current = [];
      return;
    }
    this.pieces.push({ points: this.current, closed: false, source: [] });
    this.current = [];
  }

  private flattenCubic(p0: Pt, p1: Pt, p2: Pt, p3: Pt, depth: number): void {
    const flat =
      depth > 8 || (segmentDistance(p1, p0, p3) <= 0.8 && segmentDistance(p2, p0, p3) <= 0.8);
    if (flat) {
      this.current.push(p3);
      return;
    }
    const p01 = mid(p0, p1);
    const p12 = mid(p1, p2);
    const p23 = mid(p2, p3);
    const p012 = mid(p01, p12);
    const p123 = mid(p12, p23);
    const split = mid(p012, p123);
    this.flattenCubic(p0, p01, p012, split, depth + 1);
    this.flattenCubic(split, p123, p23, p3, depth + 1);
  }
}

const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 });

function segmentDistance(point: Pt, start: Pt, end: Pt): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 1e-8) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.min(
    1,
    Math.max(0, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared),
  );
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

/** Drops a later contour that retraces one already kept. */
export function dropDuplicatePasses(pieces: readonly Centerline[]): Centerline[] {
  const kept: Centerline[] = [];
  for (const piece of pieces) {
    if (kept.some((other) => matches(piece, other))) continue;
    kept.push(piece);
  }
  return kept;
}

function matches(a: Centerline, b: Centerline): boolean {
  if (a.closed !== b.closed || a.points.length < 2 || b.points.length < 2) return false;
  const left = box(a.points);
  const right = box(b.points);
  const diagonal = Math.max(
    Math.hypot(left.width, left.height),
    Math.hypot(right.width, right.height),
    1,
  );
  const centerGap = Math.hypot(left.midX - right.midX, left.midY - right.midY);
  if (centerGap >= Math.max(16, diagonal * 0.18)) return false;
  return mean(a.points, b.points) < Math.max(10, diagonal * 0.07);
}

function mean(from: readonly Pt[], to: readonly Pt[]): number {
  const stride = Math.max(1, Math.floor(from.length / 48));
  let total = 0;
  let count = 0;
  for (let index = 0; index < from.length; index += stride) {
    let best = Number.POSITIVE_INFINITY;
    for (const point of to) best = Math.min(best, dist(from[index]!, point));
    total += best;
    count += 1;
  }
  return count > 0 ? total / count : Number.POSITIVE_INFINITY;
}

function box(points: readonly Pt[]): { width: number; height: number; midX: number; midY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const width = maxX - minX;
  const height = maxY - minY;
  return { width, height, midX: minX + width / 2, midY: minY + height / 2 };
}

/** Outline operation sets, in paint order, as one path. */
export function outlineOps(sets: readonly { type: string; ops: Path }[]): PathOp[] {
  const ops: PathOp[] = [];
  for (const set of sets) if (set.type === "path") ops.push(...set.ops);
  return ops;
}
