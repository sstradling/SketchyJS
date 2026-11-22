/**
 * Point geometry for sticker sheets.
 *
 * These are the `CGFloat` helpers from `StickerBackingBuilder` and `SilhouetteUnion`.
 * Coordinates stay in double precision: the rough outline is already `Float`, and the
 * sheet math in Sketchy runs in `CGFloat` (double on the reference platform).
 */

export interface Pt {
  x: number;
  y: number;
}

export const dist = (a: Pt, b: Pt): number => Math.hypot(b.x - a.x, b.y - a.y);

/** Signed area. Positive is counter-clockwise. An unclosed ring still closes for the sum. */
export function signedArea(points: readonly Pt[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const next = points[(i + 1) % points.length]!;
    const p = points[i]!;
    sum += p.x * next.y - next.x * p.y;
  }
  return sum / 2;
}

export function centroid(points: readonly Pt[]): Pt {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  const n = Math.max(points.length, 1);
  return { x: x / n, y: y / n };
}

/** Even-odd point in polygon. Matches the sticker builder's ray test. */
export function contains(point: Pt, polygon: readonly Pt[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  let previous = polygon.length - 1;
  for (let index = 0; index < polygon.length; index++) {
    const current = polygon[index]!;
    const prev = polygon[previous]!;
    const crosses = current.y > point.y !== prev.y > point.y;
    if (crosses) {
      const x = ((prev.x - current.x) * (point.y - current.y)) / (prev.y - current.y) + current.x;
      if (point.x < x) inside = !inside;
    }
    previous = index;
  }
  return inside;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  width: number;
  height: number;
  midX: number;
  midY: number;
}

export function bounds(points: readonly Pt[]): Bounds {
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
  if (!Number.isFinite(minX))
    return { minX: 0, minY: 0, maxX: 0, width: 0, height: 0, midX: 0, midY: 0 };
  const width = maxX - minX;
  const height = maxY - minY;
  return { minX, minY, maxX, width, height, midX: minX + width / 2, midY: minY + height / 2 };
}

/** Drops non-finite points and points closer than 0.3 to the previous one. */
export function clean(points: readonly Pt[], dropClosingDuplicate: boolean): Pt[] {
  const ring: Pt[] = [];
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    const last = ring[ring.length - 1];
    if (last && dist(last, point) < 0.3) continue;
    ring.push(point);
  }
  if (dropClosingDuplicate && ring.length >= 2 && dist(ring[0]!, ring[ring.length - 1]!) < 0.3)
    ring.pop();
  return ring;
}

export function pathLength(points: readonly Pt[], closed: boolean): number {
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i++) total += dist(points[i - 1]!, points[i]!);
  if (closed) total += dist(points[points.length - 1]!, points[0]!);
  return total;
}

/** Closest point on the segment, clamped to the segment. */
export function projection(point: Pt, start: Pt, end: Pt): Pt {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 1e-8) return start;
  const t = Math.min(
    1,
    Math.max(0, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared),
  );
  return { x: start.x + t * dx, y: start.y + t * dy };
}

export function distanceToSegment(point: Pt, start: Pt, end: Pt): number {
  return dist(point, projection(point, start, end));
}

/** Infinite-line intersection. `t` is not clamped; callers check the miter length. */
export function lineIntersection(a0: Pt, a1: Pt, b0: Pt, b1: Pt): Pt | undefined {
  const dax = a1.x - a0.x;
  const day = a1.y - a0.y;
  const dbx = b1.x - b0.x;
  const dby = b1.y - b0.y;
  const denom = dax * dby - day * dbx;
  if (Math.abs(denom) <= 1e-5) return undefined;
  const t = ((b0.x - a0.x) * dby - (b0.y - a0.y) * dbx) / denom;
  return { x: a0.x + t * dax, y: a0.y + t * day };
}

function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const side = (p: Pt, q: Pt, r: Pt): number =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return side(a, b, c) * side(a, b, d) < -1e-4 && side(c, d, a) * side(c, d, b) < -1e-4;
}

/** True when non-adjacent edges of a closed ring properly cross. */
export function segmentsIntersect(points: readonly Pt[]): boolean {
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

/** Average distance from samples of `from` to the nearest point of `to`. */
export function meanNearest(from: readonly Pt[], to: readonly Pt[]): number {
  if (from.length === 0 || to.length === 0) return Number.POSITIVE_INFINITY;
  const stride = Math.max(1, Math.floor(from.length / 48));
  let total = 0;
  let count = 0;
  for (let index = 0; index < from.length; index += stride) {
    let best = Number.POSITIVE_INFINITY;
    const sample = from[index]!;
    for (const point of to) best = Math.min(best, dist(sample, point));
    total += best;
    count += 1;
  }
  return count > 0 ? total / count : Number.POSITIVE_INFINITY;
}

/**
 * Walks `points` and emits samples about `spacing` apart.
 * A closed ring drops the last sample when it sits within 0.45 spacing of the start.
 */
export function resample(points: readonly Pt[], closed: boolean, spacing: number): Pt[] {
  if (points.length < 2 || spacing <= 0.25) return points.slice();
  const source = clean(points, closed);
  if (source.length < 2) return points.slice();
  const result: Pt[] = [source[0]!];
  let cursor = source[0]!;
  let remaining = spacing;
  const segments = closed ? source.length : source.length - 1;
  const perimeter = pathLength(source, closed);
  const stepLimit = Math.floor(perimeter / spacing) + source.length + 8;
  let guardSteps = 0;
  let index = 0;
  while (index < segments && guardSteps < stepLimit) {
    guardSteps += 1;
    const end = source[(index + 1) % source.length]!;
    const span = dist(cursor, end);
    if (span < 1e-4) {
      index += 1;
      cursor = end;
      continue;
    }
    if (span + 1e-4 < remaining) {
      remaining -= span;
      index += 1;
      cursor = end;
      continue;
    }
    const step = remaining / span;
    cursor = { x: cursor.x + (end.x - cursor.x) * step, y: cursor.y + (end.y - cursor.y) * step };
    result.push(cursor);
    remaining = spacing;
  }
  const last = source[source.length - 1]!;
  if (!closed && dist(result[result.length - 1]!, last) > spacing * 0.35) result.push(last);
  if (closed && result.length >= 3 && dist(result[result.length - 1]!, result[0]!) < spacing * 0.45)
    result.pop();
  return result.length >= 2 ? result : points.slice();
}
