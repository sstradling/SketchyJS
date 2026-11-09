import type { PathOp, Point } from "@sketchy-js/types";
import { f, hypotf } from "../f32.js";
import type { Pt } from "../rough/context.js";
import { svgPathToOps } from "../svg/path.js";

/** An ellipse region for fills: center and radii after padding and offset. */
export interface EllipseRegion {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

/** A closed polygon ring. */
export type Ring = readonly Pt[];

/**
 * `FillGeometry.ellipse`: shrinks both radii by `padding` and shifts the center by `offset`.
 * Returns `undefined` when a radius is not positive and finite after padding.
 */
export function fillEllipse(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  padding: number,
  offset: Point,
): EllipseRegion | undefined {
  const pad = f(padding);
  const arx = f(rx - pad);
  const ary = f(ry - pad);
  if (!(arx > 0 && ary > 0 && Number.isFinite(arx) && Number.isFinite(ary))) return undefined;
  return { cx: f(cx + f(offset.x)), cy: f(cy + f(offset.y)), rx: arx, ry: ary };
}

/** `FillGeometry.signedArea`: shoelace area in `Float`; positive for screen-clockwise rings. */
export function signedArea(points: Ring): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const next = points[(i + 1) % points.length]!;
    const p = points[i]!;
    sum = f(sum + f(f(p[0] * next[1]) - f(next[0] * p[1])));
  }
  return f(sum / 2);
}

function cleaned(points: Ring): Pt[] {
  const ring: Pt[] = [];
  for (const point of points) {
    const last = ring.at(-1);
    if (last && hypotf(f(point[0] - last[0]), f(point[1] - last[1])) < f(1e-3)) continue;
    ring.push([point[0], point[1]]);
  }
  const first = ring[0];
  const last = ring.at(-1);
  if (
    ring.length >= 2 &&
    first &&
    last &&
    hypotf(f(first[0] - last[0]), f(first[1] - last[1])) < f(1e-3)
  ) {
    ring.pop();
  }
  return ring;
}

interface Edge {
  sx: number;
  sy: number;
  ex: number;
  ey: number;
}

function intersection(a: Edge, b: Edge): Pt | undefined {
  const dax = f(a.ex - a.sx);
  const day = f(a.ey - a.sy);
  const dbx = f(b.ex - b.sx);
  const dby = f(b.ey - b.sy);
  const denom = f(f(dax * dby) - f(day * dbx));
  if (Math.abs(denom) < f(1e-5)) return undefined;
  const t = f(f(f(f(b.sx - a.sx) * dby) - f(f(b.sy - a.sy) * dbx)) / denom);
  return [f(a.sx + f(t * dax)), f(a.sy + f(t * day))];
}

function contains(point: Pt, polygon: Ring): boolean {
  let inside = false;
  let j = polygon.length - 1;
  for (let i = 0; i < polygon.length; i++) {
    const [xi, yi] = polygon[i]!;
    const [xj, yj] = polygon[j]!;
    if (yi > point[1] !== yj > point[1]) {
      const x = f(f(f(f(xj - xi) * f(point[1] - yi)) / f(yj - yi)) + xi);
      if (point[0] < x) inside = !inside;
    }
    j = i;
  }
  return inside;
}

function distanceToSegment(p: Pt, s: Pt, e: Pt): number {
  const dx = f(e[0] - s[0]);
  const dy = f(e[1] - s[1]);
  const lengthSquared = f(f(dx * dx) + f(dy * dy));
  if (!(lengthSquared > f(1e-8))) return hypotf(f(p[0] - s[0]), f(p[1] - s[1]));
  const t = Math.max(
    0,
    Math.min(1, f(f(f(f(p[0] - s[0]) * dx) + f(f(p[1] - s[1]) * dy)) / lengthSquared)),
  );
  return hypotf(f(p[0] - f(s[0] + f(t * dx))), f(p[1] - f(s[1] + f(t * dy))));
}

function distanceToBoundary(p: Pt, polygon: Ring): number {
  let best = Number.MAX_VALUE;
  for (let i = 0; i < polygon.length; i++) {
    best = Math.min(best, distanceToSegment(p, polygon[i]!, polygon[(i + 1) % polygon.length]!));
  }
  return best;
}

function side(p: Pt, q: Pt, r: Pt): number {
  return f(f(f(q[0] - p[0]) * f(r[1] - p[1])) - f(f(q[1] - p[1]) * f(r[0] - p[0])));
}

function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const ab = f(side(a, b, c) * side(a, b, d));
  const cd = f(side(c, d, a) * side(c, d, b));
  return ab < 0 && cd < 0;
}

function segmentsIntersect(points: Ring): boolean {
  const count = points.length;
  if (count < 4) return false;
  for (let i = 0; i < count; i++) {
    for (let j = i + 1; j < count; j++) {
      const gap = Math.min(Math.abs(i - j), count - Math.abs(i - j));
      if (gap <= 1) continue;
      if (segmentsCross(points[i]!, points[(i + 1) % count]!, points[j]!, points[(j + 1) % count]!))
        return true;
    }
  }
  return false;
}

function accepts(result: Ring, original: Ring, padding: number, originalArea: number): boolean {
  if (result.length < 3) return false;
  const area = signedArea(result);
  if (!(Math.abs(area) > 1 && f(area * originalArea) > 0)) return false;
  if (segmentsIntersect(result)) return false;
  if (!(padding > 0)) return true;
  for (let i = 0; i < result.length; i++) {
    const s = result[i]!;
    const e = result[(i + 1) % result.length]!;
    const mid: Pt = [f(f(s[0] + e[0]) / 2), f(f(s[1] + e[1]) / 2)];
    if (!contains(mid, original)) return false;
    if (f(distanceToBoundary(mid, original) + f(0.75)) < padding) return false;
  }
  return true;
}

/**
 * `FillGeometry.offsetPolygon`: insets (positive) or outsets a ring by moving each edge along its
 * normal and re-intersecting neighbors. Returns `undefined` when the result degenerates,
 * self-intersects, or leaves the original shape.
 */
export function offsetPolygon(points: Ring, padding: number): Ring | undefined {
  const ring = cleaned(points);
  if (ring.length < 3) return undefined;
  const area = signedArea(ring);
  if (!(Math.abs(area) > f(1e-3))) return undefined;
  const sign = area > 0 ? 1 : -1;
  const edges: Edge[] = [];
  for (let i = 0; i < ring.length; i++) {
    const s = ring[i]!;
    const e = ring[(i + 1) % ring.length]!;
    const dx = f(e[0] - s[0]);
    const dy = f(e[1] - s[1]);
    const length = hypotf(dx, dy);
    if (!(length > f(1e-4))) continue;
    const nx = f(f(f(-dy) / length) * sign);
    const ny = f(f(dx / length) * sign);
    const ox = f(nx * padding);
    const oy = f(ny * padding);
    edges.push({ sx: f(s[0] + ox), sy: f(s[1] + oy), ex: f(e[0] + ox), ey: f(e[1] + oy) });
  }
  if (edges.length < 3) return undefined;
  const result: Pt[] = [];
  for (let i = 0; i < edges.length; i++) {
    const previous = edges[(i + edges.length - 1) % edges.length]!;
    const current = edges[i]!;
    const point = intersection(previous, current) ?? ([previous.ex, previous.ey] as Pt);
    if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) return undefined;
    result.push(point);
  }
  return accepts(result, ring, padding, area) ? result : undefined;
}

/**
 * `FillGeometry.polygon`: pads (inset) then offsets a polygon. Padding under `1e-4` is ignored.
 * Returns `undefined` when padding collapses the shape or fewer than three points remain.
 */
export function fillPolygon(points: Ring, padding: number, offset: Point): Ring | undefined {
  const pad = f(padding);
  let inset: Ring = points;
  if (!(Math.abs(pad) < f(1e-4))) {
    const offsetPoints = offsetPolygon(points, pad);
    if (!offsetPoints) return undefined;
    inset = offsetPoints;
  }
  if (inset.length < 3) return undefined;
  if (offset.x === 0 && offset.y === 0) return inset;
  const dx = f(offset.x);
  const dy = f(offset.y);
  return inset.map((p): Pt => [f(p[0] + dx), f(p[1] + dy)]);
}

class ContourBuilder {
  contours: Pt[][] = [];
  private current: Pt[] = [];
  private pen: Pt | undefined;

  move(x: number, y: number): void {
    this.finishOpen();
    this.pen = [f(x), f(y)];
    this.current = [[f(x), f(y)]];
  }

  line(x: number, y: number): void {
    this.add(f(x), f(y));
  }

  quad(cx: number, cy: number, x: number, y: number): void {
    const start = this.pen;
    if (!start) return this.line(x, y);
    const [fcx, fcy, fx, fy] = [f(cx), f(cy), f(x), f(y)];
    this.sample((t) => {
      const u = f(1 - t);
      const uu = f(u * u);
      const tt = f(t * t);
      const bx = f(f(f(f(uu * start[0]) + f(f(f(2 * u) * t) * fcx))) + f(tt * fx));
      const by = f(f(f(f(uu * start[1]) + f(f(f(2 * u) * t) * fcy))) + f(tt * fy));
      return [bx, by];
    });
    this.add(fx, fy);
  }

  cubic(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void {
    const start = this.pen;
    if (!start) return this.line(x, y);
    const [a, b, c, d, e, g] = [f(c1x), f(c1y), f(c2x), f(c2y), f(x), f(y)];
    this.sample((t) => {
      const u = f(1 - t);
      const uuu = f(f(u * u) * u);
      const uut = f(f(3 * u) * u);
      const utt = f(f(3 * u) * t);
      const ttt = f(f(t * t) * t);
      const bx = f(f(f(f(uuu * start[0]) + f(f(uut * t) * a)) + f(f(utt * t) * c)) + f(ttt * e));
      const by = f(f(f(f(uuu * start[1]) + f(f(uut * t) * b)) + f(f(utt * t) * d)) + f(ttt * g));
      return [bx, by];
    });
    this.add(e, g);
  }

  close(): void {
    if (this.current.length >= 3) this.contours.push(this.current);
    this.current = [];
    this.pen = undefined;
  }

  finish(): void {
    this.finishOpen();
  }

  private finishOpen(): void {
    if (this.current.length >= 3) this.contours.push(this.current);
    this.current = [];
  }

  private sample(point: (t: number) => Pt): void {
    const steps = 6;
    for (let step = 1; step < steps; step++) {
      const p = point(f(f(step) / f(steps)));
      this.add(p[0], p[1]);
    }
  }

  private add(x: number, y: number): void {
    const last = this.current.at(-1);
    if (last && hypotf(f(x - last[0]), f(y - last[1])) < f(1e-3)) {
      this.pen = [x, y];
      return;
    }
    this.current.push([x, y]);
    this.pen = [x, y];
  }
}

/** `FillGeometry.flatten`: samples curves with six steps into polygon contours. */
export function flattenContours(ops: readonly PathOp[]): Pt[][] {
  const builder = new ContourBuilder();
  for (const op of ops) {
    if (op.op === "M") builder.move(op.x, op.y);
    else if (op.op === "L") builder.line(op.x, op.y);
    else if (op.op === "Q") builder.quad(op.cx, op.cy, op.x, op.y);
    else if (op.op === "C") builder.cubic(op.c1x, op.c1y, op.c2x, op.c2y, op.x, op.y);
    else builder.close();
  }
  builder.finish();
  return builder.contours;
}

function offsetContours(contours: readonly Ring[], padding: number): Ring[] | undefined {
  const rings = contours.map(cleaned).filter((r) => r.length >= 3);
  if (rings.length === 0) return undefined;
  let outer = rings[0]!;
  for (const r of rings) if (Math.abs(signedArea(outer)) < Math.abs(signedArea(r))) outer = r;
  const outerSign = signedArea(outer) >= 0;
  const result: Ring[] = [];
  for (const ring of rings) {
    const isHole = signedArea(ring) >= 0 !== outerSign;
    const local = isHole ? f(-padding) : padding;
    if (Math.abs(local) < f(1e-4)) result.push(ring);
    else {
      const adjusted = offsetPolygon(ring, local);
      if (adjusted) result.push(adjusted);
    }
  }
  return result.length === 0 ? undefined : result;
}

/**
 * `FillGeometry.svgContours`: flattens an SVG path, applies padding and offset, and sorts the
 * contours by descending absolute area (outer contour first). `undefined` when nothing remains.
 */
export function svgContours(d: string, padding: number, offset: Point): Ring[] | undefined {
  const contours = flattenContours(svgPathToOps(d));
  if (contours.length === 0) return undefined;
  const pad = f(padding);
  let adjusted: readonly Ring[] = contours;
  if (!(Math.abs(pad) < f(1e-4))) {
    const o = offsetContours(contours, pad);
    if (!o) return undefined;
    adjusted = o;
  }
  const dx = f(offset.x);
  const dy = f(offset.y);
  return adjusted
    .map((c) => c.map((p): Pt => [f(p[0] + dx), f(p[1] + dy)]))
    .sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)));
}

/** Shortest decimal text that round-trips a `Float`, like Swift's `description`. */
export function floatText(value: number): string {
  for (let digits = 1; digits <= 9; digits++) {
    const text = value.toPrecision(digits);
    if (f(Number(text)) === value) return String(Number(text));
  }
  return String(value);
}

/** `FillGeometry.svgPath(from:)`: closed `M L ... Z` text for contours. */
export function contoursToSvgPath(contours: readonly Ring[]): string {
  return contours
    .map((contour) => {
      const first = contour[0];
      if (!first) return "";
      let text = `M ${floatText(first[0])} ${floatText(first[1])}`;
      for (const p of contour.slice(1)) text += ` L ${floatText(p[0])} ${floatText(p[1])}`;
      return `${text} Z`;
    })
    .join(" ");
}
