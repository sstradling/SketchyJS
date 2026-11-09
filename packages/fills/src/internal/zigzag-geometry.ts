import type { Path, PluginContext } from "@sketchy-js/plugin";
import { f, sqrtf, toInt } from "./f32.js";
import { linePolygonIntersections, type FillLine, type Pt } from "./line-helper.js";

/** The boundary a zigzag line pattern must stay inside. */
export type Boundary =
  | { readonly kind: "polygon"; readonly points: readonly Pt[] }
  | {
      readonly kind: "ellipse";
      readonly cx: number;
      readonly cy: number;
      readonly rx: number;
      readonly ry: number;
    };

interface Interval {
  lo: number;
  hi: number;
}

/** A fill line re-expressed as an origin plus unit direction and normal (`LineFrame`). */
interface Frame {
  startX: number;
  startY: number;
  dirX: number;
  dirY: number;
  normalX: number;
  normalY: number;
  length: number;
}

interface Tooth {
  start: Pt;
  peak: Pt;
  end: Pt;
}

const BOUNDARY_PAD = f(0.2);
const E3 = f(1e-3);

const span = (i: Interval): number => f(i.hi - i.lo);

function makeFrame(line: FillLine): Frame | undefined {
  let [start, end] = [line.start, line.end];
  if (![start[0], start[1], end[0], end[1]].every(Number.isFinite)) return undefined;
  if (start[0] > end[0]) [start, end] = [end, start];
  const dx = f(end[0] - start[0]);
  const dy = f(end[1] - start[1]);
  const chord = sqrtf(f(f(dx * dx) + f(dy * dy)));
  if (!(chord > E3 && Number.isFinite(chord))) return undefined;
  const ux = f(dx / chord);
  const uy = f(dy / chord);
  return {
    startX: start[0],
    startY: start[1],
    dirX: ux,
    dirY: uy,
    normalX: f(-uy),
    normalY: ux,
    length: chord,
  };
}

function pointAt(frame: Frame, t: number, side: number): Pt {
  return [
    f(f(frame.startX + f(t * frame.dirX)) + f(side * frame.normalX)),
    f(f(frame.startY + f(t * frame.dirY)) + f(side * frame.normalY)),
  ];
}

function pointInPolygon(point: Pt, polygon: readonly Pt[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  let previous = polygon.length - 1;
  for (let index = 0; index < polygon.length; index++) {
    const [cx, cy] = polygon[index]!;
    const [px, py] = polygon[previous]!;
    if (cy > point[1] !== py > point[1]) {
      const xCross = f(f(f(f(px - cx) * f(point[1] - cy)) / f(py - cy)) + cx);
      if (point[0] < xCross) inside = !inside;
    }
    previous = index;
  }
  return inside;
}

function distanceToEdges(point: Pt, polygon: readonly Pt[]): number {
  if (polygon.length < 2) return 3.4028234663852886e38;
  let best = 3.4028234663852886e38;
  for (let index = 0; index < polygon.length; index++) {
    const next = polygon[(index + 1) % polygon.length]!;
    const [ax, ay] = polygon[index]!;
    const vx = f(next[0] - ax);
    const vy = f(next[1] - ay);
    const lengthSquared = f(f(vx * vx) + f(vy * vy));
    let t = 0;
    if (!(lengthSquared < f(1e-12))) {
      const raw = f(f(f(f(point[0] - ax) * vx) + f(f(point[1] - ay) * vy)) / lengthSquared);
      t = Math.min(1, Math.max(0, raw));
    }
    const dx = f(point[0] - f(ax + f(t * vx)));
    const dy = f(point[1] - f(ay + f(t * vy)));
    best = Math.min(best, sqrtf(f(f(dx * dx) + f(dy * dy))));
  }
  return best;
}

function contains(point: Pt, boundary: Boundary): boolean {
  if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) return false;
  if (boundary.kind === "ellipse") {
    const { cx, cy, rx, ry } = boundary;
    if (!(rx > f(1e-4) && ry > f(1e-4))) return false;
    const nx = f(f(point[0] - cx) / rx);
    const ny = f(f(point[1] - cy) / ry);
    return f(f(nx * nx) + f(ny * ny)) <= f(1 + E3);
  }
  if (distanceToEdges(point, boundary.points) <= f(0.02)) return true;
  return pointInPolygon(point, boundary.points);
}

function ellipseInterval(
  origin: Pt,
  dir: Pt,
  length: number,
  b: Extract<Boundary, { kind: "ellipse" }>,
): Interval | undefined {
  const { cx, cy, rx, ry } = b;
  if (!(rx > f(1e-4) && ry > f(1e-4) && length > E3)) return undefined;
  if (![origin[0], origin[1], dir[0], dir[1]].every(Number.isFinite)) return undefined;
  const ox = f(origin[0] - cx);
  const oy = f(origin[1] - cy);
  const invRx2 = f(1 / f(rx * rx));
  const invRy2 = f(1 / f(ry * ry));
  const a = f(f(f(dir[0] * dir[0]) * invRx2) + f(f(dir[1] * dir[1]) * invRy2));
  const bb = f(2 * f(f(f(ox * dir[0]) * invRx2) + f(f(oy * dir[1]) * invRy2)));
  const c = f(f(f(f(ox * ox) * invRx2) + f(f(oy * oy) * invRy2)) - 1);
  if (!(a > f(1e-12) && Number.isFinite(a) && Number.isFinite(bb) && Number.isFinite(c)))
    return undefined;
  const discriminant = f(f(bb * bb) - f(f(4 * a) * c));
  if (!(discriminant >= 0 && Number.isFinite(discriminant))) return undefined;
  const root = sqrtf(discriminant);
  const t0 = f(f(f(-bb) - root) / f(2 * a));
  const t1 = f(f(f(-bb) + root) / f(2 * a));
  const lo = Math.max(0, Math.min(t0, t1));
  const hi = Math.min(length, Math.max(t0, t1));
  if (!(f(hi - lo) > E3 && Number.isFinite(lo) && Number.isFinite(hi))) return undefined;
  return { lo, hi };
}

function polygonIntervals(origin: Pt, dir: Pt, length: number, polygon: readonly Pt[]): Interval[] {
  if (!(length > E3 && polygon.length >= 3)) return [];
  if (!Number.isFinite(origin[0]) || !Number.isFinite(origin[1])) return [];
  const end: Pt = [f(origin[0] + f(dir[0] * length)), f(origin[1] + f(dir[1] * length))];
  const hits = linePolygonIntersections(origin, end, polygon);
  const mergeDistance = Math.max(f(1e-4), f(length * f(1e-5)));
  const parameters: number[] = [];
  for (const hit of hits) {
    if (!Number.isFinite(hit[0]) || !Number.isFinite(hit[1])) continue;
    const t = f(f(f(hit[0] - origin[0]) * dir[0]) + f(f(hit[1] - origin[1]) * dir[1]));
    if (!Number.isFinite(t)) continue;
    parameters.push(Math.min(length, Math.max(0, t)));
  }
  parameters.sort((a, b) => a - b);
  const markers: number[] = [];
  for (const t of parameters) {
    const last = markers.at(-1);
    if (last !== undefined && f(t - last) <= mergeDistance) continue;
    markers.push(t);
  }
  if (markers.length === 0 || (markers[0] ?? 0) > mergeDistance) markers.unshift(0);
  const last = markers.at(-1);
  if (last !== undefined && f(length - last) > mergeDistance) markers.push(length);
  const intervals: Interval[] = [];
  for (let index = 0; index < markers.length - 1; index++) {
    const lo = markers[index]!;
    const hi = markers[index + 1]!;
    if (!(f(hi - lo) > mergeDistance)) continue;
    const midT = f(f(lo + hi) / 2);
    const mid: Pt = [f(origin[0] + f(dir[0] * midT)), f(origin[1] + f(dir[1] * midT))];
    if (contains(mid, { kind: "polygon", points: polygon })) intervals.push({ lo, hi });
  }
  return intervals;
}

function insideIntervals(frame: Frame, side: number, boundary: Boundary): Interval[] {
  const origin = pointAt(frame, 0, side);
  const dir: Pt = [frame.dirX, frame.dirY];
  if (boundary.kind === "ellipse") {
    const interval = ellipseInterval(origin, dir, frame.length, boundary);
    return interval ? [interval] : [];
  }
  return polygonIntervals(origin, dir, frame.length, boundary.points);
}

function merged(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a.lo - b.lo);
  const result: Interval[] = [];
  for (const interval of sorted) {
    const last = result.at(-1);
    if (!last) {
      result.push({ ...interval });
    } else if (interval.lo <= f(last.hi + E3)) {
      last.hi = Math.max(last.hi, interval.hi);
    } else {
      result.push({ ...interval });
    }
  }
  return result;
}

function intersectIntervals(lhs: Interval[], rhs: Interval[]): Interval[] {
  const result: Interval[] = [];
  for (const left of lhs) {
    for (const right of rhs) {
      const lo = Math.max(left.lo, right.lo);
      const hi = Math.min(left.hi, right.hi);
      if (f(hi - lo) > E3) result.push({ lo, hi });
    }
  }
  return merged(result);
}

function insetIntervals(intervals: Interval[], pad: number): Interval[] {
  const out: Interval[] = [];
  for (const interval of intervals) {
    const sp = span(interval);
    if (!(sp > E3)) continue;
    const used = Math.min(pad, f(sp * f(0.05)));
    const lo = f(interval.lo + used);
    const hi = f(interval.hi - used);
    if (!(f(hi - lo) > E3)) continue;
    out.push({ lo, hi });
  }
  return out;
}

function toothSamples(
  tooth: Tooth,
  startT: number,
  endT: number,
  half: number,
  frame: Frame,
): Pt[] {
  const sp = f(endT - startT);
  const ramp = (u: number): Pt => pointAt(frame, f(startT + f(sp * u)), f(half * f(f(2 * u) - 1)));
  return [
    tooth.start,
    tooth.peak,
    tooth.end,
    ramp(f(0.33)),
    ramp(f(0.67)),
    pointAt(frame, endT, 0),
  ];
}

function placeTeeth(
  frame: Frame,
  interval: Interval,
  half: number,
  pitch: number,
  boundary: Boundary,
): Tooth[] | undefined {
  const sp = span(interval);
  if (!(sp > 0)) return undefined;
  const count = toInt(Math.floor(f(sp / pitch)));
  if (count < 1) return undefined;
  const margin = Math.max(0, f(f(sp - f(f(count) * pitch)) / 2));
  const teeth: Tooth[] = [];
  for (let index = 0; index < count; index++) {
    const startT = f(f(interval.lo + margin) + f(f(index) * pitch));
    const endT = f(startT + pitch);
    if (!(endT <= f(interval.hi + E3) && endT <= f(frame.length + E3))) return undefined;
    const tooth: Tooth = {
      start: pointAt(frame, startT, f(-half)),
      peak: pointAt(frame, endT, half),
      end: pointAt(frame, endT, f(-half)),
    };
    if (!toothSamples(tooth, startT, endT, half, frame).every((p) => contains(p, boundary))) {
      return undefined;
    }
    teeth.push(tooth);
  }
  return teeth;
}

function teethFitting(
  frame: Frame,
  interval: Interval,
  half: number,
  pitch: number,
  boundary: Boundary,
): Tooth[] {
  const direct = placeTeeth(frame, interval, half, pitch, boundary);
  if (direct) return direct;
  let insetLow = 0;
  let insetHigh = Math.max(0, f(span(interval) / 2));
  let best: Tooth[] = [];
  for (let step = 0; step < 20; step++) {
    const mid = f(f(insetLow + insetHigh) / 2);
    const shrunk: Interval = { lo: f(interval.lo + mid), hi: f(interval.hi - mid) };
    const teeth = placeTeeth(frame, shrunk, half, pitch, boundary);
    if (teeth) {
      best = teeth;
      insetHigh = mid;
    } else {
      insetLow = mid;
    }
  }
  return best;
}

function containedPlain(
  frame: Frame,
  interval: Interval,
  boundary: Boundary,
): Interval | undefined {
  const fits = (i: Interval): boolean => {
    const mid = f(f(i.lo + i.hi) / 2);
    return (
      contains(pointAt(frame, i.lo, 0), boundary) &&
      contains(pointAt(frame, mid, 0), boundary) &&
      contains(pointAt(frame, i.hi, 0), boundary)
    );
  };
  if (fits(interval)) return interval;
  let lo = interval.lo;
  let hi = interval.hi;
  for (let step = 0; step < 16; step++) {
    const sp = f(hi - lo);
    if (sp < f(0.5)) return undefined;
    lo = f(lo + f(sp * f(0.08)));
    hi = f(hi - f(sp * f(0.08)));
    if (fits({ lo, hi })) return { lo, hi };
  }
  return undefined;
}

type Emit = (from: Pt, to: Pt) => void;

function appendPlain(frame: Frame, intervals: Interval[], boundary: Boundary, emit: Emit): void {
  for (const interval of intervals) {
    const clipped = containedPlain(frame, interval, boundary);
    if (!clipped) continue;
    emit(pointAt(frame, clipped.lo, 0), pointAt(frame, clipped.hi, 0));
  }
}

function appendPattern(line: FillLine, zigOffset: number, boundary: Boundary, emit: Emit): void {
  const frame = makeFrame(line);
  if (!frame) return;
  const center = insideIntervals(frame, 0, boundary);
  const half = f(zigOffset / 2);
  const pitch = f(zigOffset * 2);
  if (!(Number.isFinite(zigOffset) && zigOffset > 0 && Number.isFinite(pitch))) {
    appendPlain(frame, center, boundary, emit);
    return;
  }
  const safe = insetIntervals(
    intersectIntervals(
      insideIntervals(frame, half, boundary),
      insideIntervals(frame, f(-half), boundary),
    ),
    BOUNDARY_PAD,
  );
  let drewTeeth = false;
  for (const interval of safe) {
    const teeth = teethFitting(frame, interval, half, pitch, boundary);
    if (teeth.length === 0) continue;
    for (const tooth of teeth) {
      emit(tooth.start, tooth.peak);
      emit(tooth.peak, tooth.end);
    }
    drewTeeth = true;
  }
  if (!drewTeeth) appendPlain(frame, center, boundary, emit);
}

/**
 * `ZigzagLineGeometry.operations`: for each hachure line, either a row of zigzag teeth that fit
 * inside the boundary, or a plain line clipped to it. Every segment is a rough double line.
 */
export function zigzagLinePaths(
  lines: readonly FillLine[],
  zigOffset: number,
  boundary: Boundary,
  ctx: PluginContext,
): Path[] {
  const out: Path[] = [];
  const emit: Emit = (from, to) => {
    if (![from[0], from[1], to[0], to[1]].every(Number.isFinite)) return;
    const dx = f(to[0] - from[0]);
    const dy = f(to[1] - from[1]);
    if (f(f(dx * dx) + f(dy * dy)) < f(1e-8)) return;
    out.push(ctx.geom.rough.line({ x: from[0], y: from[1] }, { x: to[0], y: to[1] }));
  };
  for (const line of lines) appendPattern(line, zigOffset, boundary, emit);
  return out;
}
