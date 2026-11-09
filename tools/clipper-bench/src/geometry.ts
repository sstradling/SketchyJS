export type Pt = readonly [number, number];
export type Ring = Pt[];
/** A polygon with holes: `rings[0]` is the outer ring, the rest are holes. */
export type Polygon = Ring[];
export type MultiPolygon = Polygon[];

/** Signed area (shoelace); positive for counter-clockwise rings in a y-up frame. */
export function ringArea(ring: readonly Pt[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i] as Pt;
    const [x2, y2] = ring[(i + 1) % ring.length] as Pt;
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

/** Area of a multipolygon: outer rings minus holes. */
export function multiArea(multi: MultiPolygon): number {
  let total = 0;
  for (const polygon of multi) {
    polygon.forEach((ring, index) => {
      const area = Math.abs(ringArea(ring));
      total += index === 0 ? area : -area;
    });
  }
  return total;
}

export function vertexCount(multi: MultiPolygon): number {
  return multi.reduce((n, polygon) => n + polygon.reduce((m, ring) => m + ring.length, 0), 0);
}

export function holeCount(multi: MultiPolygon): number {
  return multi.reduce((n, polygon) => n + polygon.length - 1, 0);
}

/** Even-odd point in multipolygon test over every ring. */
export function containsPoint(multi: MultiPolygon, [px, py]: Pt): boolean {
  let inside = false;
  for (const polygon of multi) {
    for (const ring of polygon) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i] as Pt;
        const [xj, yj] = ring[j] as Pt;
        if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
      }
    }
  }
  return inside;
}

function orient(a: Pt, b: Pt, c: Pt): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function properlyCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

/**
 * Counts proper crossings between non-adjacent edges across all rings of a multipolygon, using a
 * uniform grid to avoid the quadratic scan. A valid union or offset result has zero.
 */
export function selfIntersections(multi: MultiPolygon): number {
  interface Edge {
    a: Pt;
    b: Pt;
    ring: number;
    index: number;
    length: number;
  }
  const edges: Edge[] = [];
  let ringId = 0;
  for (const polygon of multi) {
    for (const ring of polygon) {
      ring.forEach((a, index) =>
        edges.push({
          a,
          b: ring[(index + 1) % ring.length] as Pt,
          ring: ringId,
          index,
          length: ring.length,
        }),
      );
      ringId += 1;
    }
  }
  if (edges.length === 0) return 0;
  const xs = edges.flatMap((e) => [e.a[0], e.b[0]]);
  const ys = edges.flatMap((e) => [e.a[1], e.b[1]]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const size = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY, 1);
  const cells = Math.max(1, Math.min(256, Math.floor(Math.sqrt(edges.length))));
  const cell = size / cells;
  const grid = new Map<number, number[]>();
  const clampCell = (v: number) => Math.max(0, Math.min(cells - 1, Math.floor(v / cell)));
  edges.forEach((edge, id) => {
    const x0 = clampCell(Math.min(edge.a[0], edge.b[0]) - minX);
    const x1 = clampCell(Math.max(edge.a[0], edge.b[0]) - minX);
    const y0 = clampCell(Math.min(edge.a[1], edge.b[1]) - minY);
    const y1 = clampCell(Math.max(edge.a[1], edge.b[1]) - minY);
    for (let gx = x0; gx <= x1; gx++) {
      for (let gy = y0; gy <= y1; gy++) {
        const key = gy * cells + gx;
        const bucket = grid.get(key);
        if (bucket) bucket.push(id);
        else grid.set(key, [id]);
      }
    }
  });
  const seen = new Set<number>();
  let count = 0;
  for (const bucket of grid.values()) {
    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        const ia = bucket[i] as number;
        const ib = bucket[j] as number;
        const key = ia * edges.length + ib;
        if (seen.has(key)) continue;
        seen.add(key);
        const e = edges[ia] as Edge;
        const f = edges[ib] as Edge;
        if (e.ring === f.ring) {
          const gap = Math.abs(e.index - f.index);
          if (gap === 1 || gap === e.length - 1) continue;
        }
        if (properlyCross(e.a, e.b, f.a, f.b)) count += 1;
      }
    }
  }
  return count;
}

/** Regular polygon approximating a circle. */
export function circle(center: Pt, radius: number, segments: number): Ring {
  return Array.from({ length: segments }, (_, i) => {
    const t = (2 * Math.PI * i) / segments;
    return [center[0] + radius * Math.cos(t), center[1] + radius * Math.sin(t)] as Pt;
  });
}
