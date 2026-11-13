import { noiseSigned, noiseUnitPeriodic } from "@sketchy-js/core";
import type { Path, PathOp, Point } from "@sketchy-js/plugin";

/** A point with the parameter Sketchy's watercolor smoother carries along. */
export interface CurvePoint {
  point: Point;
  t: number;
}

const MASK = (1n << 64n) - 1n;
export const uadd = (a: bigint, b: bigint): bigint => (a + b) & MASK;
export const umul = (a: bigint, b: bigint): bigint => (a * b) & MASK;

export const hypot = (x: number, y: number): number => Math.hypot(x, y);

export function signedNoise(t: number, cycles: number, seed: bigint, closed: boolean): number {
  if (closed) {
    const cells = Math.max(1, Math.round(cycles));
    return noiseUnitPeriodic(t * cells, cells, seed) * 2 - 1;
  }
  return noiseSigned(t * cycles, seed);
}

/** Even steps along a polyline. Sketchy's `resample`. */
export function resample(
  points: Point[],
  times: number[],
  spacing: number,
  closed: boolean,
): CurvePoint[] {
  if (points.length < 2 || points.length !== times.length) return [];
  const segments = closed ? points.length : points.length - 1;
  const lengths = [0];
  for (let index = 0; index < segments; index++) {
    const next = (index + 1) % points.length;
    const a = points[index]!;
    const b = points[next]!;
    lengths.push(lengths[lengths.length - 1]! + hypot(b.x - a.x, b.y - a.y));
  }
  const total = lengths[lengths.length - 1]!;
  if (!(total > spacing)) return points.map((point, i) => ({ point, t: times[i]! }));
  const result: CurvePoint[] = [];
  let cursor = 0;
  let segment = 0;
  const limit = closed ? total - spacing * 0.5 : total;
  while (cursor <= limit + 0.001) {
    while (segment < segments - 1 && lengths[segment + 1]! < cursor) segment += 1;
    const span = Math.max(0.0001, lengths[segment + 1]! - lengths[segment]!);
    const u = Math.min(1, Math.max(0, (cursor - lengths[segment]!) / span));
    const next = (segment + 1) % points.length;
    const a = points[segment]!;
    const b = points[next]!;
    result.push({
      point: { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u },
      t: times[segment]! + (times[next]! - times[segment]!) * u,
    });
    cursor += spacing;
  }
  if (!closed) {
    const last = result[result.length - 1];
    const end = points[points.length - 1]!;
    if (last && hypot(last.point.x - end.x, last.point.y - end.y) > spacing * 0.35) {
      result.push({ point: end, t: times[times.length - 1]! });
    } else if (last) {
      result[result.length - 1] = { point: end, t: times[times.length - 1]! };
    }
  }
  return result;
}

function reflected(curve: CurvePoint[], index: number, closed: boolean): CurvePoint {
  const count = curve.length;
  if (closed) return curve[((index % count) + count) % count]!;
  if (index >= 0 && index < count) return curve[index]!;
  if (index < 0) {
    const source = Math.min(count - 1, -index);
    const end = curve[0]!;
    const other = curve[source]!;
    return {
      point: { x: end.point.x * 2 - other.point.x, y: end.point.y * 2 - other.point.y },
      t: end.t,
    };
  }
  const source = Math.max(0, 2 * (count - 1) - index);
  const end = curve[count - 1]!;
  const other = curve[source]!;
  return {
    point: { x: end.point.x * 2 - other.point.x, y: end.point.y * 2 - other.point.y },
    t: end.t,
  };
}

/** Moving average. Sketchy's `averageCurve`. */
export function averageCurve(curve: CurvePoint[], reach: number, closed: boolean): CurvePoint[] {
  if (curve.length < 3 || !(reach > 0)) return curve;
  return curve.map((_, index) => {
    let x = 0;
    let y = 0;
    let t = 0;
    let weight = 0;
    for (let offset = -reach; offset <= reach; offset++) {
      const sample = reflected(curve, index + offset, closed);
      const influence = 1 - Math.abs(offset) / (reach + 1);
      x += sample.point.x * influence;
      y += sample.point.y * influence;
      t += sample.t * influence;
      weight += influence;
    }
    return { point: { x: x / weight, y: y / weight }, t: t / weight };
  });
}

export function arcLengthParameters(points: Point[], closed: boolean): number[] {
  if (points.length < 2) return points.map(() => 0);
  const lengths = [0];
  const segments = closed ? points.length : points.length - 1;
  for (let index = 0; index < segments; index++) {
    const next = (index + 1) % points.length;
    const a = points[index]!;
    const b = points[next]!;
    lengths.push(lengths[lengths.length - 1]! + hypot(b.x - a.x, b.y - a.y));
  }
  const total = Math.max(lengths[lengths.length - 1]!, 0.0001);
  if (closed) return points.map((_, i) => lengths[i]! / total);
  return lengths.map((length) => length / total);
}

function reflectedPoint(points: Point[], index: number, closed: boolean): Point {
  const count = points.length;
  if (closed) return points[((index % count) + count) % count]!;
  if (index >= 0 && index < count) return points[index]!;
  if (index < 0) {
    const source = Math.min(count - 1, -index);
    const end = points[0]!;
    const other = points[source]!;
    return { x: end.x * 2 - other.x, y: end.y * 2 - other.y };
  }
  const source = Math.max(0, 2 * (count - 1) - index);
  const end = points[count - 1]!;
  const other = points[source]!;
  return { x: end.x * 2 - other.x, y: end.y * 2 - other.y };
}

export function blendAngle(angle: number, target: number, amount: number): number {
  const keep = 1 - amount;
  return Math.atan2(
    Math.sin(angle) * keep + Math.sin(target) * amount,
    Math.cos(angle) * keep + Math.cos(target) * amount,
  );
}

/** Chord direction averaged as a vector. Sketchy's `stableForwards`. */
export function stableForwards(points: Point[], closed: boolean): number[] {
  const count = points.length;
  if (count < 2) return [0];
  const reach = Math.min(6, Math.max(1, Math.floor(count / 8)));
  const raw = points.map((_, index) => {
    const before = reflectedPoint(points, index - reach, closed);
    const after = reflectedPoint(points, index + reach, closed);
    return Math.atan2(after.y - before.y, after.x - before.x);
  });
  const window = 3;
  const angles = raw.map((_, index) => {
    let sx = 0;
    let sy = 0;
    for (let offset = -window; offset <= window; offset++) {
      const sample = closed
        ? (((index + offset) % count) + count) % count
        : Math.min(count - 1, Math.max(0, index + offset));
      const influence = 1 - Math.abs(offset) / (window + 1);
      sx += Math.cos(raw[sample]!) * influence;
      sy += Math.sin(raw[sample]!) * influence;
    }
    if (sx * sx + sy * sy < 0.0001) return raw[index]!;
    return Math.atan2(sy, sx);
  });
  if (closed || count <= 2) return angles;
  const look = Math.min(8, count - 1);
  const startAngle = Math.atan2(points[look]!.y - points[0]!.y, points[look]!.x - points[0]!.x);
  const endIndex = count - 1;
  const endAngle = Math.atan2(
    points[endIndex]!.y - points[endIndex - look]!.y,
    points[endIndex]!.x - points[endIndex - look]!.x,
  );
  return angles.map((angle, index) => {
    let value = angle;
    const startWeight = Math.max(0, 1 - index / look);
    const endWeight = Math.max(0, 1 - (endIndex - index) / look);
    if (startWeight > 0) value = blendAngle(value, startAngle, startWeight);
    if (endWeight > 0) value = blendAngle(value, endAngle, endWeight);
    return value;
  });
}

export function neighbor(index: number, count: number, closed: boolean): number {
  if (closed) return ((index % count) + count) % count;
  return Math.min(count - 1, Math.max(0, index));
}

export function smoothScalars(values: number[], reach: number, closed: boolean): number[] {
  if (values.length < 3 || !(reach > 0)) return values;
  return values.map((value, index) => {
    if (!closed && (index === 0 || index === values.length - 1)) return value;
    let sum = 0;
    let weight = 0;
    for (let offset = -reach; offset <= reach; offset++) {
      const sample = neighbor(index + offset, values.length, closed);
      const influence = 1 - Math.abs(offset) / (reach + 1);
      sum += values[sample]! * influence;
      weight += influence;
    }
    return sum / weight;
  });
}

export function signedCurvatures(points: Point[], forwards: number[], closed: boolean): number[] {
  const count = points.length;
  const reach = Math.min(5, Math.max(1, Math.floor(count / 10)));
  return points.map((_, index) => {
    const before = closed ? (index - reach + count) % count : Math.max(0, index - reach);
    const after = closed ? (index + reach) % count : Math.min(count - 1, index + reach);
    let delta = forwards[after]! - forwards[before]!;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    const distance = Math.max(
      1,
      hypot(points[after]!.x - points[before]!.x, points[after]!.y - points[before]!.y),
    );
    return delta / distance;
  });
}

export function linePath(points: Point[], close = true): Path {
  const ops: PathOp[] = points.map((p, i) =>
    i === 0 ? { op: "M", x: p.x, y: p.y } : { op: "L", x: p.x, y: p.y },
  );
  if (close && ops.length > 0) ops.push({ op: "Z" });
  return ops;
}

/** Even-odd containment, used by watercolor grain. */
export function pointInPath(path: Path, point: Point): boolean {
  let inside = false;
  let cursor = { x: 0, y: 0 };
  let start = cursor;
  const hit = (a: Point, b: Point): void => {
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  };
  for (const op of path) {
    if (op.op === "M") {
      cursor = { x: op.x, y: op.y };
      start = cursor;
    } else if (op.op === "L" || op.op === "Q" || op.op === "C") {
      const next = { x: op.x, y: op.y };
      hit(cursor, next);
      cursor = next;
    } else if (op.op === "Z") {
      hit(cursor, start);
      cursor = start;
    }
  }
  return inside;
}
