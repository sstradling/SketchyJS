import { f, FLOAT_MAX } from "./f32.js";

/** A point as `[x, y]` in `Float` values. */
export type Pt = readonly [number, number];

/** A fill line from `start` to `end` (`FillLine`). */
export interface FillLine {
  readonly start: Pt;
  readonly end: Pt;
}

/** Length of a fill line in `Float` (`FillLine.length`). */
export function lineLength(line: FillLine): number {
  const dx = f(line.end[0] - line.start[0]);
  const dy = f(line.end[1] - line.start[1]);
  return f(Math.sqrt(f(f(dx * dx) + f(dy * dy))));
}

/** General-form line `a x + b y + c = 0` through two points (`LineHelper.Line`). */
export interface Line {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly p1: Pt;
  readonly p2: Pt;
  readonly isUndefined: boolean;
}

const EPS = f(1e-5);

/** `LineHelper.Line.init`. */
export function makeLine(p1: Pt, p2: Pt): Line {
  const a = f(p2[1] - p1[1]);
  const b = f(p1[0] - p2[0]);
  const c = f(f(p2[0] * p1[1]) - f(p1[0] * p2[1]));
  return { a, b, c, p1, p2, isUndefined: a === 0 && b === 0 && c === 0 };
}

/** Inclusive range test with a `1e-5` margin (`LineHelper.inRange`). Platform libm can flip it. */
export function inRange(value: number, a: number, b: number): boolean {
  const min = f(Math.min(a, b) - EPS);
  const max = f(Math.max(a, b) + EPS);
  return value >= min && value <= max;
}

/** `LineHelper.intersection`: segment intersection, `undefined` when the segments do not meet. */
export function intersection(l1: Line, l2: Line): Pt | undefined {
  if (l1.isUndefined || l2.isUndefined) return undefined;
  let slope1 = FLOAT_MAX;
  let slope2 = FLOAT_MAX;
  let intercept1 = 0;
  let intercept2 = 0;
  if (Math.abs(l1.b) > EPS) {
    slope1 = f(f(-l1.a) / l1.b);
    intercept1 = f(f(-l1.c) / l1.b);
  }
  if (Math.abs(l2.b) > EPS) {
    slope2 = f(f(-l2.a) / l2.b);
    intercept2 = f(f(-l2.c) / l2.b);
  }
  if (slope1 === FLOAT_MAX && slope2 === FLOAT_MAX) return undefined;

  if (slope1 === FLOAT_MAX) {
    const xi = l1.p1[0];
    const yi = f(f(slope2 * xi) + intercept2);
    if (!inRange(yi, l1.p1[1], l1.p2[1]) || !inRange(yi, l2.p1[1], l2.p2[1])) return undefined;
    if (Math.abs(l2.a) < EPS && !inRange(xi, l2.p1[0], l2.p2[0])) return undefined;
    return [xi, yi];
  }
  if (slope2 === FLOAT_MAX) {
    const xi = l2.p1[0];
    const yi = f(f(slope1 * xi) + intercept1);
    if (!inRange(yi, l1.p1[1], l1.p2[1]) || !inRange(yi, l2.p1[1], l2.p2[1])) return undefined;
    if (Math.abs(l1.a) < EPS && !inRange(xi, l1.p1[0], l1.p2[0])) return undefined;
    return [xi, yi];
  }
  if (slope1 === slope2) {
    if (intercept1 === intercept2) {
      if (inRange(l1.p1[0], l2.p1[0], l2.p2[0])) return l1.p1;
      if (inRange(l1.p2[0], l2.p1[0], l2.p2[0])) return l1.p2;
    }
    return undefined;
  }
  const xi = f(f(intercept2 - intercept1) / f(slope1 - slope2));
  const yi = f(f(slope1 * xi) + intercept1);
  if (!inRange(xi, l1.p1[0], l1.p2[0]) || !inRange(xi, l2.p1[0], l2.p2[0])) return undefined;
  return [xi, yi];
}

/** `LineHelper.linePolygonIntersections`: hits of one segment against every polygon edge. */
export function linePolygonIntersections(start: Pt, end: Pt, polygon: readonly Pt[]): Pt[] {
  const hits: Pt[] = [];
  const scan = makeLine(start, end);
  for (let i = 0; i < polygon.length; i++) {
    const edge = makeLine(polygon[i]!, polygon[(i + 1) % polygon.length]!);
    const point = intersection(scan, edge);
    if (point) hits.push(point);
  }
  return hits;
}
