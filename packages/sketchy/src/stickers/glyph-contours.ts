import { svgPathToOps } from "../core/index.js";
import type { Path, PathOp } from "../types/index.js";

/**
 * Unions glyph contours that overlap with the same winding.
 *
 * Solid SVG fills use even-odd once a path has more than one contour. That
 * keeps a counter open and also punches out a region covered by two contours
 * that wind the same way. Fredoka builds `b`, `d`, `g`, `p`, and `q` as a bowl
 * overlapping a stem. Those solids are replaced by the union Sketchy walks in
 * `GlyphContourResolver`. The basic SVG bundle cannot import the clipper
 * adapter, so the union stays in this module. A glyph whose solid
 * contours do not overlap is returned unchanged, so every other outline stays
 * byte-for-byte.
 *
 * Request flow: `buildScene` and sticker `generateOne` call `resolveGlyphContours`
 * for a solid SVG path before the drawing is generated. The even-odd fill then
 * paints the union.
 */

/** Flatness of a rebuilt outline, in points. Untouched glyphs keep their curves. */
export const GLYPH_FLATNESS = 0.08;

/** How close two vertices must be before they are the same point. */
const MERGE_DISTANCE = 0.004;

/** How far off an edge the inside/outside probe sits, before it is shortened to the edge. */
const PROBE = 0.06;

type Pt = { x: number; y: number };

/** One closed subpath: the original curves, a flattened ring, and its signed area. */
type Contour = {
  ops: PathOp[];
  ring: Pt[];
  area: number;
};

/**
 * Returns `d` when its solid contours do not overlap.
 *
 * Solid contours share the winding of the largest ring. A ring with the other
 * winding is a counter and is kept. Overlapping solids are replaced by their
 * clipper union. The union outline is flattened; counters keep their curves.
 */
export function resolveGlyphContours(d: string): string {
  const contours = extract(svgPathToOps(d));
  const dominant = contours.reduce<Contour | undefined>(
    (best, contour) =>
      best === undefined || Math.abs(contour.area) > Math.abs(best.area) ? contour : best,
    undefined,
  );
  if (!dominant) return d;
  const solidIsPositive = dominant.area >= 0;
  const solids = contours.filter(
    (contour) => contour.area >= 0 === solidIsPositive && Math.abs(contour.area) > 0.25,
  );
  const holes = contours.filter(
    (contour) => contour.area >= 0 !== solidIsPositive && Math.abs(contour.area) > 0.25,
  );
  if (solids.length < 2 || !solidsOverlap(solids)) return d;

  const ops: PathOp[] = [];
  const solidRings: Pt[][] = [];
  let changed = false;
  for (const component of overlapComponents(solids)) {
    if (component.length === 1) {
      ops.push(...component[0]!.ops);
      solidRings.push(component[0]!.ring);
      continue;
    }
    const rings = unionRings(component.map((contour) => contour.ring));
    if (!rings || !plausible(rings, component)) {
      for (const contour of component) {
        ops.push(...contour.ops);
        solidRings.push(contour.ring);
      }
      continue;
    }
    changed = true;
    for (const ring of rings) {
      if (ring.length < 3) continue;
      const first = ring[0]!;
      ops.push({ op: "M", x: first.x, y: first.y });
      for (const point of ring.slice(1)) ops.push({ op: "L", x: point.x, y: point.y });
      ops.push({ op: "Z" });
      solidRings.push(ring);
    }
  }
  if (!changed) return d;
  for (const hole of holes) {
    const sample = interiorSample(hole.ring);
    if (!sample || !insideAny(sample, solidRings)) continue;
    // Union rings use the positive winding. A counter has to wind the other
    // way so a nonzero fill stays empty there as well.
    ops.push(...(hole.area >= 0 ? reversed(hole.ops) : hole.ops));
  }
  return pathData(ops);
}

/** Solids that share area, directly or through a chain of overlaps. */
function overlapComponents(solids: readonly Contour[]): Contour[][] {
  const parent = solids.map((_, index) => index);
  const find = (index: number): number => {
    let cursor = index;
    while (parent[cursor] !== cursor) cursor = parent[cursor]!;
    return cursor;
  };
  for (let index = 0; index < solids.length; index++) {
    for (let other = index + 1; other < solids.length; other++) {
      if (!overlaps(solids[index]!.ring, solids[other]!.ring)) continue;
      const left = find(index);
      const right = find(other);
      if (left !== right) parent[right] = left;
    }
  }
  const groups = new Map<number, Contour[]>();
  solids.forEach((contour, index) => {
    const root = find(index);
    const group = groups.get(root) ?? [];
    group.push(contour);
    groups.set(root, group);
  });
  return [...groups.values()];
}

/** Compact SVG path data. Untouched glyphs never go through this. */
function pathData(path: Path): string {
  const n = (value: number): string => {
    const rounded = Number(value.toFixed(3));
    return Object.is(rounded, -0) ? "0" : String(rounded);
  };
  let d = "";
  for (const op of path) {
    if (op.op === "M") d += `M${n(op.x)},${n(op.y)}`;
    else if (op.op === "L") d += `L${n(op.x)},${n(op.y)}`;
    else if (op.op === "Q") d += `Q${n(op.cx)},${n(op.cy)},${n(op.x)},${n(op.y)}`;
    else if (op.op === "C")
      d += `C${n(op.c1x)},${n(op.c1y)},${n(op.c2x)},${n(op.c2y)},${n(op.x)},${n(op.y)}`;
    else d += "Z";
  }
  return d;
}

/** Splits `ops` into closed contours. An unclosed subpath is closed. */
function extract(ops: readonly PathOp[]): Contour[] {
  const contours: Contour[] = [];
  let subpath: PathOp[] = [];
  let ring: Pt[] = [];
  let last: Pt | undefined;
  let open = false;

  const finish = (): void => {
    if (!open || !last) return;
    subpath.push({ op: "Z" });
    if (ring.length >= 2 && hypot(ring[0]!, ring[ring.length - 1]!) < MERGE_DISTANCE) {
      ring.pop();
    }
    if (ring.length >= 3) {
      contours.push({ ops: subpath, ring, area: signedArea(ring) });
    }
    subpath = [];
    ring = [];
    last = undefined;
    open = false;
  };

  for (const op of ops) {
    if (op.op === "M") {
      finish();
      last = { x: op.x, y: op.y };
      subpath = [{ op: "M", x: op.x, y: op.y }];
      ring = [last];
      open = true;
    } else if (op.op === "L" && last) {
      subpath.push(op);
      appendLine({ x: op.x, y: op.y }, ring);
      last = { x: op.x, y: op.y };
    } else if (op.op === "Q" && last) {
      subpath.push(op);
      flattenQuad(last, { x: op.cx, y: op.cy }, { x: op.x, y: op.y }, ring);
      last = { x: op.x, y: op.y };
    } else if (op.op === "C" && last) {
      subpath.push(op);
      flattenCubic(
        last,
        { x: op.c1x, y: op.c1y },
        { x: op.c2x, y: op.c2y },
        { x: op.x, y: op.y },
        ring,
      );
      last = { x: op.x, y: op.y };
    } else if (op.op === "Z") {
      finish();
    }
  }
  finish();
  return contours;
}

/** True when two solid rings cross or one sits inside the other. */
function solidsOverlap(solids: readonly Contour[]): boolean {
  for (let index = 0; index < solids.length; index++) {
    for (let other = index + 1; other < solids.length; other++) {
      if (overlaps(solids[index]!.ring, solids[other]!.ring)) return true;
    }
  }
  return false;
}

/**
 * True when the rings share area across their boundaries.
 * A ring sitting entirely inside another is an even-odd hole, not a stem,
 * so it is left alone. A shared vertex alone does not count.
 */
function overlaps(left: readonly Pt[], right: readonly Pt[]): boolean {
  if (!boundsInset(left, 0.2).intersects(boundsOf(right))) return false;
  if (edgesCross(left, right)) return true;
  return partialInside(left, right) || partialInside(right, left);
}

/** Some vertices are inside the other ring and some are not. */
function partialInside(points: readonly Pt[], ring: readonly Pt[]): boolean {
  let inside = 0;
  for (const point of points) {
    if (ringContains(point, ring) && !onRing(point, ring)) inside += 1;
  }
  return inside > 0 && inside < points.length;
}

/** True when a segment of `left` crosses a segment of `right` away from a shared vertex. */
function edgesCross(left: readonly Pt[], right: readonly Pt[]): boolean {
  if (left.length < 2 || right.length < 2) return false;
  for (let leftIndex = 0; leftIndex < left.length; leftIndex++) {
    const start = left[leftIndex]!;
    const end = left[(leftIndex + 1) % left.length]!;
    for (let rightIndex = 0; rightIndex < right.length; rightIndex++) {
      if (segmentHit(start, end, right[rightIndex]!, right[(rightIndex + 1) % right.length]!)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Boundary of the union of counterclockwise-or-otherwise rings.
 * `undefined` when the boundary does not close. This is Sketchy's walk.
 * The basic SVG bundle cannot import the clipper adapter, so the union stays here.
 */
function unionRings(polygons: readonly Pt[][]): Pt[][] | undefined {
  const oriented = polygons.map((ring) => {
    const cleanedRing = cleaned(ring);
    return signedArea(cleanedRing) < 0 ? [...cleanedRing].reverse() : cleanedRing;
  });
  if (oriented.some((ring) => ring.length < 3)) return undefined;

  type Segment = { start: Pt; end: Pt; polygon: number };
  const segments: Segment[] = [];
  oriented.forEach((ring, index) => {
    for (let pointIndex = 0; pointIndex < ring.length; pointIndex++) {
      const start = ring[pointIndex]!;
      const end = ring[(pointIndex + 1) % ring.length]!;
      if (hypot(start, end) < MERGE_DISTANCE) continue;
      segments.push({ start, end, polygon: index });
    }
  });

  const hits: { t: number; point: Pt }[][] = segments.map(() => []);
  for (let index = 0; index < segments.length; index++) {
    for (let other = index + 1; other < segments.length; other++) {
      if (segments[index]!.polygon === segments[other]!.polygon) continue;
      const hit = segmentHit(
        segments[index]!.start,
        segments[index]!.end,
        segments[other]!.start,
        segments[other]!.end,
      );
      if (!hit) continue;
      hits[index]!.push({ t: hit.t, point: hit.point });
      hits[other]!.push({ t: hit.u, point: hit.point });
    }
  }

  const vertices: Pt[] = [];
  const vertex = (point: Pt): number => {
    const found = vertices.findIndex((existing) => hypot(existing, point) <= MERGE_DISTANCE);
    if (found >= 0) return found;
    vertices.push(point);
    return vertices.length - 1;
  };

  const directed: [number, number][] = [];
  segments.forEach((segment, index) => {
    const splits = hits[index]!.slice().sort((a, b) => a.t - b.t);
    const points = [segment.start];
    let lastT = 0;
    for (const hit of splits) {
      if (hit.t - lastT > 1e-5 && hit.t < 1 - 1e-5) {
        points.push(hit.point);
        lastT = hit.t;
      }
    }
    points.push(segment.end);
    for (let pointIndex = 0; pointIndex < points.length - 1; pointIndex++) {
      const from = vertex(points[pointIndex]!);
      const to = vertex(points[pointIndex + 1]!);
      if (from !== to) directed.push([from, to]);
    }
  });

  const boundary: [number, number][] = [];
  const seen = new Set<string>();
  for (const [from, to] of directed) {
    const start = vertices[from]!;
    const end = vertices[to]!;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (!(length > MERGE_DISTANCE)) continue;
    const normalX = -dy / length;
    const normalY = dx / length;
    const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    const distance = Math.min(PROBE, Math.max(0.01, length * 0.2));
    const left = { x: mid.x + normalX * distance, y: mid.y + normalY * distance };
    const right = { x: mid.x - normalX * distance, y: mid.y - normalY * distance };
    const insideLeft = insideAny(left, oriented);
    const insideRight = insideAny(right, oriented);
    if (insideLeft === insideRight) continue;
    const edge: [number, number] = insideLeft ? [from, to] : [to, from];
    const key = `${edge[0]}->${edge[1]}`;
    if (!seen.has(key)) {
      seen.add(key);
      boundary.push(edge);
    }
  }
  if (boundary.length === 0) return undefined;

  const outgoing = new Map<number, number[]>();
  const unused = new Set<string>();
  for (const edge of boundary) {
    const list = outgoing.get(edge[0]) ?? [];
    list.push(edge[1]);
    outgoing.set(edge[0], list);
    unused.add(`${edge[0]}->${edge[1]}`);
  }

  const rings: Pt[][] = [];
  for (const edge of boundary) {
    if (!unused.has(`${edge[0]}->${edge[1]}`)) continue;
    const indices = [edge[0]];
    let current = edge[0];
    let next = edge[1];
    let closed = false;
    for (let steps = 0; steps <= boundary.length + 2; steps++) {
      if (!unused.delete(`${current}->${next}`)) break;
      indices.push(next);
      if (next === edge[0]) {
        closed = true;
        break;
      }
      const options = (outgoing.get(next) ?? []).filter((candidate) =>
        unused.has(`${next}->${candidate}`),
      );
      const chosen = chooseNext(current, next, options, vertices);
      if (chosen === undefined) break;
      current = next;
      next = chosen;
    }
    if (!closed || indices.length < 4) continue;
    indices.pop();
    const ring = cleaned(indices.map((index) => vertices[index]!));
    if (!(Math.abs(signedArea(ring)) > 0.4)) continue;
    rings.push(signedArea(ring) < 0 ? [...ring].reverse() : ring);
  }
  if (rings.length === 0 || unused.size > 0) return undefined;
  return rings;
}

/** Next boundary edge. Several choices take the sharpest right turn. */
function chooseNext(
  arrivedFrom: number,
  at: number,
  options: readonly number[],
  vertices: readonly Pt[],
): number | undefined {
  const first = options[0];
  if (first === undefined) return undefined;
  if (options.length === 1) return first;
  const incoming = {
    x: vertices[at]!.x - vertices[arrivedFrom]!.x,
    y: vertices[at]!.y - vertices[arrivedFrom]!.y,
  };
  return options.reduce((best, candidate) =>
    clockwiseAngle(incoming, vertices[candidate]!, vertices[at]!) <
    clockwiseAngle(incoming, vertices[best]!, vertices[at]!)
      ? candidate
      : best,
  );
}

/** Clockwise angle from `incoming` to the segment that runs toward `toward`. */
function clockwiseAngle(incoming: Pt, toward: Pt, from: Pt): number {
  const outgoing = { x: toward.x - from.x, y: toward.y - from.y };
  const cross = incoming.x * outgoing.y - incoming.y * outgoing.x;
  const dot = incoming.x * outgoing.x + incoming.y * outgoing.y;
  let angle = -Math.atan2(cross, dot);
  if (angle < 0) angle += Math.PI * 2;
  return angle;
}

/** The union should cover the largest piece and not grow past the pieces combined. */
function plausible(rings: readonly Pt[][], solids: readonly Contour[]): boolean {
  const unionArea = rings.reduce((sum, ring) => sum + Math.abs(signedArea(ring)), 0);
  const largest = Math.max(...solids.map((contour) => Math.abs(contour.area)));
  const total = solids.reduce((sum, contour) => sum + Math.abs(contour.area), 0);
  return unionArea + 0.5 >= largest * 0.9 && unionArea <= total * 1.02 + 1;
}

/** Even-odd test. The sample is nudged off horizontal vertex rows. */
function ringContains(point: Pt, ring: readonly Pt[]): boolean {
  if (ring.length < 3) return false;
  const y = point.y + 0.000017;
  let inside = false;
  let previous = ring.length - 1;
  for (let index = 0; index < ring.length; index++) {
    const current = ring[index]!;
    const prior = ring[previous]!;
    if (current.y > y !== prior.y > y) {
      const x = ((prior.x - current.x) * (y - current.y)) / (prior.y - current.y) + current.x;
      if (point.x < x) inside = !inside;
    }
    previous = index;
  }
  return inside;
}

function insideAny(point: Pt, rings: readonly Pt[][]): boolean {
  return rings.some((ring) => ringContains(point, ring));
}

/** True when `point` lies on a segment of `ring`. */
function onRing(point: Pt, ring: readonly Pt[]): boolean {
  for (let index = 0; index < ring.length; index++) {
    const start = ring[index]!;
    const end = ring[(index + 1) % ring.length]!;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (!(length > 1e-6)) continue;
    const t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / (length * length);
    if (t < -0.01 || t > 1.01) continue;
    const clamped = Math.min(1, Math.max(0, t));
    const closest = { x: start.x + dx * clamped, y: start.y + dy * clamped };
    if (hypot(closest, point) < 0.05) return true;
  }
  return false;
}

/** A crossing or a T-junction of two segments. Vertex-to-vertex contact is ignored. */
function segmentHit(
  start: Pt,
  end: Pt,
  otherStart: Pt,
  otherEnd: Pt,
): { t: number; u: number; point: Pt } | undefined {
  const rx = end.x - start.x;
  const ry = end.y - start.y;
  const sx = otherEnd.x - otherStart.x;
  const sy = otherEnd.y - otherStart.y;
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < 1e-9) return undefined;
  const qpx = otherStart.x - start.x;
  const qpy = otherStart.y - start.y;
  const t = (qpx * sy - qpy * sx) / denom;
  const u = (qpx * ry - qpy * rx) / denom;
  const eps = 1e-5;
  if (t < -eps || t > 1 + eps || u < -eps || u > 1 + eps) return undefined;
  const tInterior = t > eps && t < 1 - eps;
  const uInterior = u > eps && u < 1 - eps;
  if (!tInterior && !uInterior) return undefined;
  const clampedT = Math.min(1, Math.max(0, t));
  return {
    t: clampedT,
    u: Math.min(1, Math.max(0, u)),
    point: { x: start.x + rx * clampedT, y: start.y + ry * clampedT },
  };
}

/** Average of the ring. For a counter this lands in the opening. */
function interiorSample(ring: readonly Pt[]): Pt | undefined {
  if (ring.length === 0) return undefined;
  const total = ring.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), {
    x: 0,
    y: 0,
  });
  return { x: total.x / ring.length, y: total.y / ring.length };
}

/** Drops repeated points, including a closing point that repeats the start. */
function cleaned(points: readonly Pt[]): Pt[] {
  const ring: Pt[] = [];
  for (const point of points) {
    const last = ring[ring.length - 1];
    if (last && hypot(last, point) < MERGE_DISTANCE) continue;
    ring.push(point);
  }
  if (ring.length >= 2 && hypot(ring[0]!, ring[ring.length - 1]!) < MERGE_DISTANCE) ring.pop();
  return ring;
}

type Box = { minX: number; minY: number; maxX: number; maxY: number };

function boundsOf(ring: readonly Pt[]): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of ring) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { minX, minY, maxX, maxY };
}

function boundsInset(ring: readonly Pt[], pad: number): { intersects(other: Box): boolean } {
  const box = boundsOf(ring);
  const grown = {
    minX: box.minX - pad,
    minY: box.minY - pad,
    maxX: box.maxX + pad,
    maxY: box.maxY + pad,
  };
  return {
    intersects(other: Box): boolean {
      return (
        grown.minX <= other.maxX &&
        grown.maxX >= other.minX &&
        grown.minY <= other.maxY &&
        grown.maxY >= other.minY
      );
    },
  };
}

/** Positive when the ring runs the same way as a clockwise screen square (y down). */
function signedArea(points: readonly Pt[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let index = 0; index < points.length; index++) {
    const next = points[(index + 1) % points.length]!;
    const point = points[index]!;
    sum += point.x * next.y - next.x * point.y;
  }
  return sum / 2;
}

/** Reverses one closed subpath so its winding flips and the shape stays. */
function reversed(ops: readonly PathOp[]): PathOp[] {
  type Command = { kind: "L" | "Q" | "C"; points: Pt[]; start: Pt };
  const commands: Command[] = [];
  let cursor: Pt | undefined;
  for (const op of ops) {
    if (op.op === "M") {
      cursor = { x: op.x, y: op.y };
    } else if (op.op === "L" && cursor) {
      commands.push({ kind: "L", points: [{ x: op.x, y: op.y }], start: cursor });
      cursor = { x: op.x, y: op.y };
    } else if (op.op === "Q" && cursor) {
      commands.push({
        kind: "Q",
        points: [
          { x: op.cx, y: op.cy },
          { x: op.x, y: op.y },
        ],
        start: cursor,
      });
      cursor = { x: op.x, y: op.y };
    } else if (op.op === "C" && cursor) {
      commands.push({
        kind: "C",
        points: [
          { x: op.c1x, y: op.c1y },
          { x: op.c2x, y: op.c2y },
          { x: op.x, y: op.y },
        ],
        start: cursor,
      });
      cursor = { x: op.x, y: op.y };
    }
  }
  if (!cursor) return [...ops];
  const result: PathOp[] = [{ op: "M", x: cursor.x, y: cursor.y }];
  for (const command of [...commands].reverse()) {
    if (command.kind === "L") result.push({ op: "L", x: command.start.x, y: command.start.y });
    else if (command.kind === "Q") {
      const control = command.points[0]!;
      result.push({
        op: "Q",
        cx: control.x,
        cy: control.y,
        x: command.start.x,
        y: command.start.y,
      });
    } else {
      const c1 = command.points[1]!;
      const c2 = command.points[0]!;
      result.push({
        op: "C",
        c1x: c1.x,
        c1y: c1.y,
        c2x: c2.x,
        c2y: c2.y,
        x: command.start.x,
        y: command.start.y,
      });
    }
  }
  result.push({ op: "Z" });
  return result;
}

function appendLine(point: Pt, ring: Pt[]): void {
  const last = ring[ring.length - 1];
  if (last && hypot(last, point) < 1e-6) return;
  ring.push(point);
}

function flattenQuad(from: Pt, control: Pt, to: Pt, ring: Pt[], depth = 0): void {
  if (depth > 14 || curveDeviation(from, control, to) <= GLYPH_FLATNESS) {
    ring.push(to);
    return;
  }
  const leftControl = midpoint(from, control);
  const rightControl = midpoint(control, to);
  const mid = midpoint(leftControl, rightControl);
  flattenQuad(from, leftControl, mid, ring, depth + 1);
  flattenQuad(mid, rightControl, to, ring, depth + 1);
}

function flattenCubic(from: Pt, control1: Pt, control2: Pt, to: Pt, ring: Pt[], depth = 0): void {
  const deviation = Math.max(
    curveDeviation(from, control1, to),
    curveDeviation(from, control2, to),
  );
  if (depth > 14 || deviation <= GLYPH_FLATNESS) {
    ring.push(to);
    return;
  }
  const p01 = midpoint(from, control1);
  const p12 = midpoint(control1, control2);
  const p23 = midpoint(control2, to);
  const p012 = midpoint(p01, p12);
  const p123 = midpoint(p12, p23);
  const mid = midpoint(p012, p123);
  flattenCubic(from, p01, p012, mid, ring, depth + 1);
  flattenCubic(mid, p123, p23, to, ring, depth + 1);
}

/** Distance from `control` to the chord `start`–`end`. */
function curveDeviation(start: Pt, control: Pt, end: Pt): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return hypot(control, start);
  return Math.abs((control.x - start.x) * dy - (control.y - start.y) * dx) / length;
}

function midpoint(start: Pt, end: Pt): Pt {
  return { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
}

function hypot(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
