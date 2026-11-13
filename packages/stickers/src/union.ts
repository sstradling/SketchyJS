import { contains, signedArea, type Pt } from "./geom.js";

/**
 * One closed ring in a sticker silhouette. Rings from the same shape share
 * `shape`. Even-odd nesting is per shape, so a hole in one drawing does not
 * become a hole in another.
 */
export interface SilhouetteRing {
  points: Pt[];
  shape: number;
  isHole: boolean;
}

/**
 * Vector union of sticker silhouettes. Overlapping exteriors merge. A hole
 * stays open until another shape covers it. Components that only touch at a
 * corner stay separate. This is Sketchy's `SilhouetteUnion`: the Darwin group
 * contour is this walk, not a Clipper integer union.
 *
 * Request flow: `groupSilhouette` offsets each part by half its stroke, then
 * calls `combineSilhouettes` before the shared sheet is offset.
 */
export function combineSilhouettes(rings: readonly SilhouetteRing[]): SilhouetteRing[] {
  const shapes = new Map<number, SilhouetteRing[]>();
  for (const ring of rings) {
    const list = shapes.get(ring.shape) ?? [];
    list.push(ring);
    shapes.set(ring.shape, list);
  }
  const edges = boundaryEdges(shapes);
  return chain(edges).map((loop, index) => ({
    points: loop.points,
    shape: index,
    isHole: loop.isHole,
  }));
}

interface Edge {
  start: Pt;
  end: Pt;
}

function boundaryEdges(shapes: Map<number, SilhouetteRing[]>): Edge[] {
  const segments: [Pt, Pt][] = [];
  for (const ring of [...shapes.values()].flat()) {
    if (ring.points.length < 3) continue;
    for (let index = 0; index < ring.points.length; index++) {
      const start = ring.points[index]!;
      const end = ring.points[(index + 1) % ring.points.length]!;
      if (Math.hypot(end.x - start.x, end.y - start.y) > 0.05) segments.push([start, end]);
    }
  }
  const pieces = split(segments);
  const edges: Edge[] = [];
  for (const [start, end] of pieces) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length <= 0.05) continue;
    const offset = Math.min(0.35, length * 0.25);
    const left = {
      x: (start.x + end.x) * 0.5 + (-dy / length) * offset,
      y: (start.y + end.y) * 0.5 + (dx / length) * offset,
    };
    const right = {
      x: (start.x + end.x) * 0.5 - (-dy / length) * offset,
      y: (start.y + end.y) * 0.5 - (dx / length) * offset,
    };
    const coverLeft = covered(left, shapes);
    const coverRight = covered(right, shapes);
    if (coverLeft && !coverRight) edges.push({ start, end });
    else if (coverRight && !coverLeft) edges.push({ start: end, end: start });
  }
  return dedupe(edges);
}

function dedupe(edges: readonly Edge[]): Edge[] {
  const quantize = (value: number): number => Math.round(value / 0.25);
  const seen = new Set<string>();
  return edges.filter((edge) => {
    const key = `${quantize(edge.start.x)},${quantize(edge.start.y)},${quantize(edge.end.x)},${quantize(edge.end.y)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function collinearCuts(first: [Pt, Pt], second: [Pt, Pt]): [number, number][] {
  const r = { x: first[1].x - first[0].x, y: first[1].y - first[0].y };
  const s = { x: second[1].x - second[0].x, y: second[1].y - second[0].y };
  const length = Math.hypot(r.x, r.y);
  const other = Math.hypot(s.x, s.y);
  if (length <= 0.05 || other <= 0.05) return [];
  const cross = r.x * s.y - r.y * s.x;
  if (Math.abs(cross) >= 0.02 * length * other) return [];
  const fromStart = { x: second[0].x - first[0].x, y: second[0].y - first[0].y };
  const fromEnd = { x: second[1].x - first[0].x, y: second[1].y - first[0].y };
  if (Math.abs(fromStart.x * r.y - fromStart.y * r.x) / length >= 0.4) return [];
  const t0 = (fromStart.x * r.x + fromStart.y * r.y) / (length * length);
  const t1 = (fromEnd.x * r.x + fromEnd.y * r.y) / (length * length);
  const low = Math.min(t0, t1);
  const high = Math.max(t0, t1);
  if (!(high > 0.001) || !(low < 0.999)) return [];
  const u0 = (fromStart.x * s.x + fromStart.y * s.y) / (other * other);
  return [
    [t0, u0],
    [t1, u0 + ((t1 - t0) * length) / other],
  ];
}

function covered(point: Pt, shapes: Map<number, SilhouetteRing[]>): boolean {
  for (const rings of shapes.values()) {
    const hits = rings.filter((ring) => contains(point, ring.points)).length;
    if (hits % 2 === 1) return true;
  }
  return false;
}

function split(segments: [Pt, Pt][]): [Pt, Pt][] {
  const cuts: number[][] = segments.map(() => [0, 1]);
  for (let index = 0; index < segments.length; index++) {
    for (let other = index + 1; other < segments.length; other++) {
      const hit = intersection(segments[index]!, segments[other]!);
      if (hit) {
        if (hit[0] > 0.001 && hit[0] < 0.999) cuts[index]!.push(hit[0]);
        if (hit[1] > 0.001 && hit[1] < 0.999) cuts[other]!.push(hit[1]);
      }
      for (const mark of collinearCuts(segments[index]!, segments[other]!)) {
        if (mark[0] > 0.001 && mark[0] < 0.999) cuts[index]!.push(mark[0]);
        if (mark[1] > 0.001 && mark[1] < 0.999) cuts[other]!.push(mark[1]);
      }
    }
  }
  const pieces: [Pt, Pt][] = [];
  segments.forEach(([start, end], index) => {
    const marks = cuts[index]!.slice().sort((a, b) => a - b);
    let previous = marks[0]!;
    for (const mark of marks.slice(1)) {
      if (mark - previous <= 0.002) continue;
      pieces.push([pointAt(start, end, previous), pointAt(start, end, mark)]);
      previous = mark;
    }
  });
  return pieces;
}

interface Loop {
  points: Pt[];
  isHole: boolean;
}

function chain(edges: readonly Edge[]): Loop[] {
  const keyOf = (point: Pt): string => `${Math.round(point.x / 0.2)},${Math.round(point.y / 0.2)}`;
  const unused = new Map<string, Edge[]>();
  for (const edge of edges) {
    const key = keyOf(edge.start);
    const list = unused.get(key) ?? [];
    list.push(edge);
    unused.set(key, list);
  }
  const loops: Loop[] = [];
  const startKeys = [...unused.keys()].sort();
  for (const startKey of startKeys) {
    let edge = unused.get(startKey)?.pop();
    while (edge) {
      const points = [edge.start];
      let guardSteps = 0;
      while (guardSteps < edges.length + 2) {
        points.push(edge.end);
        const endKey = keyOf(edge.end);
        if (endKey === startKey) break;
        const options = unused.get(endKey);
        if (!options || options.length === 0) break;
        const incoming = { x: edge.end.x - edge.start.x, y: edge.end.y - edge.start.y };
        let bestIndex = 0;
        let bestTurn = Number.POSITIVE_INFINITY;
        options.forEach((candidate, index) => {
          const outgoing = {
            x: candidate.end.x - candidate.start.x,
            y: candidate.end.y - candidate.start.y,
          };
          const turn = Math.atan2(
            incoming.x * outgoing.y - incoming.y * outgoing.x,
            incoming.x * outgoing.x + incoming.y * outgoing.y,
          );
          const score = turn >= 0 ? turn : turn + 2 * Math.PI;
          if (score < bestTurn) {
            bestTurn = score;
            bestIndex = index;
          }
        });
        edge = options[bestIndex]!;
        options.splice(bestIndex, 1);
        guardSteps += 1;
      }
      if (points.length >= 4 && keyOf(points[points.length - 1]!) === startKey) {
        points.pop();
        loops.push({ points, isHole: signedArea(points) < 0 });
      }
      edge = unused.get(startKey)?.pop();
    }
  }
  return loops.filter((loop) => Math.abs(signedArea(loop.points)) > 4);
}

function intersection(first: [Pt, Pt], second: [Pt, Pt]): [number, number] | undefined {
  const r = { x: first[1].x - first[0].x, y: first[1].y - first[0].y };
  const s = { x: second[1].x - second[0].x, y: second[1].y - second[0].y };
  const denominator = r.x * s.y - r.y * s.x;
  if (Math.abs(denominator) <= 1e-6) return undefined;
  const qp = { x: second[0].x - first[0].x, y: second[0].y - first[0].y };
  const t = (qp.x * s.y - qp.y * s.x) / denominator;
  const u = (qp.x * r.y - qp.y * r.x) / denominator;
  if (!(t > -0.001) || !(t < 1.001) || !(u > -0.001) || !(u < 1.001)) return undefined;
  return [Math.min(1, Math.max(0, t)), Math.min(1, Math.max(0, u))];
}

function pointAt(start: Pt, end: Pt, t: number): Pt {
  return { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };
}
