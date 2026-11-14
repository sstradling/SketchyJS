import {
  centroid,
  clean,
  contains,
  dist,
  distanceToSegment,
  meanNearest,
  pathLength,
  projection,
  resample,
  segmentsIntersect,
  signedArea,
  type Pt,
} from "./geom.js";

export interface GuideRing {
  points: Pt[];
  closed: boolean;
}

/** Blends each rough sample toward the nearest point on the input silhouette. */
export function aim(
  points: readonly Pt[],
  closed: boolean,
  guides: readonly GuideRing[],
  smoothness: number,
  amplitude: number,
): Pt[] {
  const amount = Math.min(1, Math.max(0, smoothness));
  if (amount <= 0.001) return points.slice();
  const guide = matchingGuide(points, guides);
  if (guide) {
    return points.map((point) => mix(point, closest(point, guide.points, guide.closed), amount));
  }
  return smooth(points, closed, amount, amplitude);
}

function matchingGuide(points: readonly Pt[], guides: readonly GuideRing[]): GuideRing | undefined {
  const box = boxOf(points);
  const diagonal = Math.max(Math.hypot(box.width, box.height), 1);
  let best: GuideRing | undefined;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const guide of guides) {
    if (guide.points.length < 2) continue;
    const score = meanNearest(points, guide.points);
    if (score < bestScore) {
      bestScore = score;
      best = guide;
    }
  }
  if (!(bestScore < Math.max(28, diagonal * 0.22))) return undefined;
  return best;
}

function closest(point: Pt, ring: readonly Pt[], closed: boolean): Pt {
  const first = ring[0];
  if (!first) return point;
  if (ring.length < 2) return first;
  let best = first;
  let bestDistance = Number.POSITIVE_INFINITY;
  const segments = closed ? ring.length : ring.length - 1;
  for (let index = 0; index < segments; index++) {
    const start = ring[index]!;
    const end = ring[(index + 1) % ring.length]!;
    const projected = projection(point, start, end);
    const span = dist(point, projected);
    if (span < bestDistance) {
      bestDistance = span;
      best = projected;
    }
  }
  return best;
}

const mix = (a: Pt, b: Pt, t: number): Pt => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

function boxOf(points: readonly Pt[]): { width: number; height: number } {
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
  if (!Number.isFinite(minX)) return { width: 0, height: 0 };
  return { width: maxX - minX, height: maxY - minY };
}

/** Douglas–Peucker used when a shape has no silhouette guide. */
export function smooth(
  points: readonly Pt[],
  closed: boolean,
  smoothness: number,
  amplitude: number,
): Pt[] {
  const amount = Math.min(1, Math.max(0, smoothness));
  if (amount <= 0.001 || points.length < 4) return points.slice();
  const perimeter = pathLength(points, closed);
  if (perimeter <= 8) return points.slice();
  const epsilon = Math.min(
    Math.max(2.2, amplitude * 0.85) * amount,
    Math.max(perimeter * 0.035, 2.2),
  );
  if (epsilon <= 0.6) return points.slice();
  const simplified = simplify(points, closed, epsilon);
  const spaced = resample(simplified, closed, 2.5);
  const sigma = Math.min(1.2 + amount * 1.4, Math.max(perimeter * 0.012, 1.2));
  if (spaced.length < 4 || sigma <= 0.8) return simplified;
  return gaussian(spaced, closed, sigma);
}

function simplify(points: readonly Pt[], closed: boolean, epsilon: number): Pt[] {
  let ring = clean(points, true);
  if (ring.length < 4) return points.slice();
  if (!closed) {
    const open = rdp(ring, epsilon);
    return open.length >= 2 ? open : points.slice();
  }
  const center = centroid(ring);
  let anchor = 0;
  let farthest = -1;
  for (let i = 0; i < ring.length; i++) {
    const d = dist(ring[i]!, center);
    if (d > farthest) {
      farthest = d;
      anchor = i;
    }
  }
  ring = ring.slice(anchor).concat(ring.slice(0, anchor));
  const chain = ring.concat([ring[0]!]);
  const simplified = rdp(chain, epsilon);
  if (simplified.length >= 2 && dist(simplified[0]!, simplified[simplified.length - 1]!) <= epsilon)
    simplified.pop();
  return simplified.length >= 3 ? simplified : points.slice();
}

function rdp(points: readonly Pt[], epsilon: number): Pt[] {
  if (points.length < 3) return points.slice();
  const keep = points.map(() => false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const range = stack.pop()!;
    const start = range[0];
    const end = range[1];
    if (end <= start + 1) continue;
    let maxDistance = 0;
    let farthest = start;
    for (let index = start + 1; index < end; index++) {
      const span = distanceToSegment(points[index]!, points[start]!, points[end]!);
      if (span > maxDistance) {
        maxDistance = span;
        farthest = index;
      }
    }
    if (maxDistance > epsilon && farthest !== start && farthest !== end) {
      keep[farthest] = true;
      stack.push([start, farthest], [farthest, end]);
    }
  }
  return points.filter((_, index) => keep[index]);
}

/**
 * Blurs along the outline and restores the mean radius so the margin stays put.
 * A self-crossing blur is retried with a shorter radius.
 */
export function continuousOutline(points: readonly Pt[], closed: boolean, radius: number): Pt[] {
  const sampled = resample(points, closed, 1.6);
  const ring = clean(sampled, closed);
  if (ring.length < 8) return points.slice();
  const perimeter = pathLength(ring, closed);
  const automatic = Math.max(16, perimeter * 0.055);
  let sigma = radius > 0 ? radius : automatic;
  const originalArea = signedArea(ring);
  let best = ring;
  for (let attempt = 0; attempt < 4; attempt++) {
    const blurred = gaussian(ring, closed, Math.max(4, sigma));
    const restored = restoreMeanRadius(blurred, ring);
    const area = signedArea(restored);
    const simple = closed ? !segmentsIntersect(restored) && area * originalArea > 0 : true;
    if (simple) return restored;
    best = restored;
    sigma *= 0.55;
    if (sigma < 4) break;
  }
  return best;
}

function restoreMeanRadius(points: readonly Pt[], target: readonly Pt[]): Pt[] {
  const origin = centroid(points);
  const before = meanRadius(target, centroid(target));
  const after = meanRadius(points, origin);
  if (!(after > 0.5) || !(before > 0.5)) return points.slice();
  const scale = Math.min(1.25, Math.max(0.8, before / after));
  return points.map((point) => ({
    x: origin.x + (point.x - origin.x) * scale,
    y: origin.y + (point.y - origin.y) * scale,
  }));
}

function meanRadius(points: readonly Pt[], origin: Pt): number {
  if (points.length === 0) return 0;
  let total = 0;
  for (const point of points) total += Math.hypot(point.x - origin.x, point.y - origin.y);
  return total / points.length;
}

/** Arc-length gaussian. A repeated seam sample does not end the circular walk. */
export function gaussian(points: readonly Pt[], closed: boolean, sigma: number): Pt[] {
  const radius = sigma * 3;
  return points.map((_, index) => {
    let sx = 0;
    let sy = 0;
    let weight = 0;
    const add = (pointIndex: number, distance: number): void => {
      const scale = Math.exp(-0.5 * (distance / sigma) * (distance / sigma));
      const point = points[pointIndex]!;
      sx += point.x * scale;
      sy += point.y * scale;
      weight += scale;
    };
    add(index, 0);
    accumulate(points, index, closed, radius, 1, add);
    accumulate(points, index, closed, radius, -1, add);
    if (weight <= 0) return points[index]!;
    return { x: sx / weight, y: sy / weight };
  });
}

function accumulate(
  points: readonly Pt[],
  index: number,
  closed: boolean,
  radius: number,
  step: number,
  add: (pointIndex: number, distance: number) => void,
): void {
  const count = points.length;
  let cursor = index;
  let traveled = 0;
  for (let n = 0; n < count; n++) {
    const next = cursor + step;
    let wrapped: number;
    if (closed) {
      wrapped = ((next % count) + count) % count;
      if (wrapped === index) break;
    } else if (next < 0 || next >= count) break;
    else wrapped = next;
    const hop = dist(points[cursor]!, points[wrapped]!);
    if (hop < 1e-4) {
      cursor = wrapped;
      continue;
    }
    traveled += hop;
    if (traveled > radius) break;
    add(wrapped, traveled);
    cursor = wrapped;
  }
}

/** Scales `shape` about its centroid until it contains every point of `cover`. */
export function expandToCover(cover: readonly Pt[], shape: readonly Pt[]): Pt[] {
  const origin = centroid(shape);
  const scaled = (factor: number): Pt[] =>
    shape.map((point) => ({
      x: origin.x + (point.x - origin.x) * factor,
      y: origin.y + (point.y - origin.y) * factor,
    }));
  const covers = (ring: readonly Pt[]): boolean => cover.every((point) => contains(point, ring));
  if (covers(shape)) return shape.slice();
  let low = 1;
  let high = 1.06;
  let guardScale = 1;
  while (high < 1.8 && !covers(scaled(high))) {
    low = high;
    high += 0.06;
    guardScale += 0.06;
    if (guardScale > 1.8) break;
  }
  if (!covers(scaled(high))) return scaled(high);
  for (let i = 0; i < 8; i++) {
    const mid = (low + high) * 0.5;
    if (covers(scaled(mid))) high = mid;
    else low = mid;
  }
  return scaled(high * 1.02);
}
