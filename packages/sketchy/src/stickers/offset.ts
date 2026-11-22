import { clean, dist, lineIntersection, segmentsIntersect, signedArea, type Pt } from "./geom.js";

/**
 * Miter offset of a closed ring, Sketchy's `offsetClosed`.
 *
 * Positive `distance` grows the ring (paper margin). Negative `distance` shrinks a hole.
 * A miter longer than about 3.2 times the travel is beveled. Returns undefined when the
 * offset flips winding or crosses itself, which is the signal to use the round dilation.
 */
export function offsetClosed(points: readonly Pt[], distance: number): Pt[] | undefined {
  const ring = clean(points, true);
  if (ring.length < 3 || Math.abs(distance) <= 0.2) return undefined;
  const area = signedArea(ring);
  if (Math.abs(area) <= 1) return undefined;
  const sign = area > 0 ? 1 : -1;
  const edges: { start: Pt; end: Pt }[] = [];
  for (let index = 0; index < ring.length; index++) {
    const start = ring[index]!;
    const end = ring[(index + 1) % ring.length]!;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const span = Math.hypot(dx, dy);
    if (span <= 0.05) continue;
    const inwardX = (-dy / span) * sign;
    const inwardY = (dx / span) * sign;
    const shift = { x: -inwardX * distance, y: -inwardY * distance };
    edges.push({
      start: { x: start.x + shift.x, y: start.y + shift.y },
      end: { x: end.x + shift.x, y: end.y + shift.y },
    });
  }
  if (edges.length < 3) return undefined;
  const maxMiter = Math.max(4, Math.abs(distance) * 3.2);
  const result: Pt[] = [];
  for (let index = 0; index < edges.length; index++) {
    const previous = edges[(index + edges.length - 1) % edges.length]!;
    const current = edges[index]!;
    const hit = lineIntersection(previous.start, previous.end, current.start, current.end);
    if (hit && dist(hit, previous.end) <= maxMiter && dist(hit, current.start) <= maxMiter)
      result.push(hit);
    else {
      result.push(previous.end);
      result.push(current.start);
    }
  }
  const cleaned = clean(result, true);
  if (cleaned.length < 3) return undefined;
  const grown = signedArea(cleaned);
  if (!(grown * area > 0) || Math.abs(grown) <= 4) return undefined;
  if (segmentsIntersect(cleaned)) return undefined;
  return cleaned;
}

/** Outward unit normals. Closed rings follow the winding so the paper grows away from the fill. */
export function outwardNormals(points: readonly Pt[], closed: boolean): Pt[] {
  const count = points.length;
  const winding = signedArea(points) >= 0 ? 1 : -1;
  return points.map((_, index) => {
    const previous = closed ? (index + count - 1) % count : Math.max(0, index - 1);
    const next = closed ? (index + 1) % count : Math.min(count - 1, index + 1);
    const dx = points[next]!.x - points[previous]!.x;
    const dy = points[next]!.y - points[previous]!.y;
    const span = Math.hypot(dx, dy);
    if (span <= 1e-4) return { x: 0, y: -1 };
    if (closed) return { x: (dy / span) * winding, y: (-dx / span) * winding };
    return { x: -dy / span, y: dx / span };
  });
}

/** Moves each sample along its outward normal. A concave sample stays outside the curve. */
export function normalOffset(points: readonly Pt[], distance: number): Pt[] {
  const ring = clean(points, true);
  if (ring.length < 3) return points.slice();
  const normals = outwardNormals(ring, true);
  return ring.map((point, index) => {
    const normal = normals[index]!;
    return { x: point.x + normal.x * distance, y: point.y + normal.y * distance };
  });
}
