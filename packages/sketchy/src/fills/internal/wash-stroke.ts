import type { Point, WashPassInput } from "../../plugin/index.js";
import { PI, f, hypotf, sinf } from "./f32.js";

/**
 * Shared crayon-wash stroke recipe. Sketchy's `WashStroke` and `WashPass.sky`.
 *
 * A pass walks across a region. Each stroke gets its own trim and a sine bow,
 * then the rough centerline the other fills use. Lengths are points.
 */

/** Two sky passes. Widths, gaps, and trims are the mockup's canvas pixels. */
export const SKY_WASH: readonly WashPassInput[] = [
  {
    spacingMin: 22,
    spacingSpan: 8,
    widthMin: 42,
    widthSpan: 16,
    opacityMin: 0.16,
    opacitySpan: 0.08,
    trimMax: 28,
    angleSpread: 7,
    bow: 18,
    minLength: 24,
    roughness: 2.1,
    bowing: 1.8,
    randomness: 2.6,
    seed: 1400n,
  },
  {
    spacingMin: 34,
    spacingSpan: 14,
    widthMin: 28,
    widthSpan: 14,
    opacityMin: 0.1,
    opacitySpan: 0.06,
    trimMax: 48,
    angleSpread: 16,
    bow: 18,
    minLength: 24,
    roughness: 2.1,
    bowing: 1.8,
    randomness: 2.6,
    seed: 2600n,
  },
];

/** Scales spacing, width, trim, bow, and the minimum length. Angle and seeds stay put. */
export function scaleWash(pass: WashPassInput, factor: number): WashPassInput {
  const scale = Math.max(0.05, factor);
  const s = (n: number): number => f(n * scale);
  return {
    ...pass,
    spacingMin: s(pass.spacingMin),
    spacingSpan: s(pass.spacingSpan),
    widthMin: s(pass.widthMin),
    widthSpan: s(pass.widthSpan),
    trimMax: s(pass.trimMax),
    bow: s(pass.bow),
    minLength: s(pass.minLength),
  };
}

/** Trims both ends, then lays a sine bow along the normal. `bow` 0 keeps the centerline. */
export function shapeWash(
  points: readonly Point[],
  trimStart: number,
  trimEnd: number,
  bow: number,
): Point[] {
  const trimmed = trim(points, trimStart, trimEnd);
  if (trimmed.length < 2) return [];
  if (!(Math.abs(bow) > 0.01)) return trimmed;
  const count = trimmed.length;
  return trimmed.map((point, index) => {
    const t = f(f(index) / f(Math.max(count - 1, 1)));
    const side = f(f(sinf(f(t * PI)) * bow) + f(sinf(f(f(t * PI) * 2)) * f(bow * 0.35)));
    const normal = normalAt(trimmed, index);
    return { x: f(point.x + f(normal.x * side)), y: f(point.y + f(normal.y * side)) };
  });
}

/** Drops a prefix and a suffix, measured along the polyline. */
export function trim(points: readonly Point[], start: number, end: number): Point[] {
  if (points.length < 2) return [];
  const total = length(points);
  const cutStart = Math.min(Math.max(0, start), f(total * 0.45));
  const cutEnd = Math.min(Math.max(0, end), f(total * 0.45));
  if (f(f(total - cutStart) - cutEnd) < 1) return [];
  const kept: Point[] = [];
  let traveled = 0;
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1]!;
    const b = points[index]!;
    const span = hypotf(f(b.x - a.x), f(b.y - a.y));
    const next = f(traveled + span);
    if (next >= cutStart && traveled <= f(total - cutEnd)) {
      if (kept.length === 0) {
        const t = span > 0.001 ? Math.min(1, Math.max(0, f(f(cutStart - traveled) / span))) : 0;
        kept.push({ x: f(a.x + f(f(b.x - a.x) * t)), y: f(a.y + f(f(b.y - a.y) * t)) });
      }
      if (next <= f(total - cutEnd)) kept.push(b);
      else {
        const t =
          span > 0.001 ? Math.min(1, Math.max(0, f(f(f(total - cutEnd) - traveled) / span))) : 1;
        kept.push({ x: f(a.x + f(f(b.x - a.x) * t)), y: f(a.y + f(f(b.y - a.y) * t)) });
        break;
      }
    }
    traveled = next;
  }
  return kept;
}

function length(points: readonly Point[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1]!;
    const b = points[index]!;
    total = f(total + hypotf(f(b.x - a.x), f(b.y - a.y)));
  }
  return total;
}

function normalAt(points: readonly Point[], index: number): Point {
  const previous = points[Math.max(0, index - 1)]!;
  const next = points[Math.min(points.length - 1, index + 1)]!;
  const dx = f(next.x - previous.x);
  const dy = f(next.y - previous.y);
  const span = hypotf(dx, dy);
  if (!(span > 1e-4)) return { x: 0, y: -1 };
  return { x: f(-dy / span), y: f(dx / span) };
}
