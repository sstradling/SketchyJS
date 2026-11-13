import { defineFill, type Path, type PathOp, type Point } from "@sketchy-js/plugin";

/**
 * Scribble fill: one continuous zigzag across the region. Sketchy's `ScribbleFillGenerator`.
 * The legs are geometric and do not consume the random stream. Concave shapes are clipped by
 * the host (`clip: "region"`).
 *
 * Request flow: scene fill stage -> this plugin -> ray intersections -> one or more centerlines.
 */

const f32 = (n: number): number => Math.fround(n);

interface Options {
  origin: number;
  tightness: number;
  curvature: number;
  pattern?: readonly number[];
}

function project(point: Point, origin: Point, angle: number): number {
  return (point.x - origin.x) * Math.cos(angle) + (point.y - origin.y) * Math.sin(angle);
}

function onAxis(center: Point, angle: number, distance: number): Point {
  return {
    x: center.x + distance * Math.cos(angle),
    y: center.y + distance * Math.sin(angle),
  };
}

/**
 * Control-point bounds. `CGPath.boundingBox` includes handles, unlike the tight
 * `boundingBoxOfPath`, and the scribble scan uses that box.
 */
function pathBounds(path: Path): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const add = (x: number, y: number): void => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const op of path) {
    if (op.op === "M" || op.op === "L") add(op.x, op.y);
    else if (op.op === "Q") {
      add(op.cx, op.cy);
      add(op.x, op.y);
    } else if (op.op === "C") {
      add(op.c1x, op.c1y);
      add(op.c2x, op.c2y);
      add(op.x, op.y);
    }
  }
  return { minX, minY, maxX, maxY };
}

function segmentHit(p1: Point, p2: Point, p3: Point, p4: Point): Point | undefined {
  const d1 = { x: p2.x - p1.x, y: p2.y - p1.y };
  const d2 = { x: p4.x - p3.x, y: p4.y - p3.y };
  const cross = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(cross) <= 1e-10) return undefined;
  const d3 = { x: p1.x - p3.x, y: p1.y - p3.y };
  const t1 = (d2.x * d3.y - d2.y * d3.x) / cross;
  const t2 = (d1.x * d3.y - d1.y * d3.x) / cross;
  if (t1 < 0 || t1 > 1 || t2 < 0 || t2 > 1) return undefined;
  return { x: p1.x + t1 * d1.x, y: p1.y + t1 * d1.y };
}

function quadPoint(start: Point, control: Point, end: Point, t: number): Point {
  const mt = 1 - t;
  return {
    x: mt * mt * start.x + 2 * mt * t * control.x + t * t * end.x,
    y: mt * mt * start.y + 2 * mt * t * control.y + t * t * end.y,
  };
}

function cubicPoint(start: Point, c1: Point, c2: Point, end: Point, t: number): Point {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  return {
    x: mt2 * mt * start.x + 3 * mt2 * t * c1.x + 3 * mt * t2 * c2.x + t2 * t * end.x,
    y: mt2 * mt * start.y + 3 * mt2 * t * c1.y + 3 * mt * t2 * c2.y + t2 * t * end.y,
  };
}

function quadSegments(start: Point, control: Point, end: Point): number {
  const chord = Math.hypot(end.x - start.x, end.y - start.y);
  const poly =
    Math.hypot(control.x - start.x, control.y - start.y) +
    Math.hypot(end.x - control.x, end.y - control.y);
  const curviness = chord > 0.001 ? poly / chord : 1;
  const raw = Math.ceil((curviness - 1) * 6 + Math.sqrt(poly) * 0.5);
  return Math.max(3, Math.min(32, raw));
}

function cubicSegments(start: Point, c1: Point, c2: Point, end: Point): number {
  const chord = Math.hypot(end.x - start.x, end.y - start.y);
  const poly =
    Math.hypot(c1.x - start.x, c1.y - start.y) +
    Math.hypot(c2.x - c1.x, c2.y - c1.y) +
    Math.hypot(end.x - c2.x, end.y - c2.y);
  const curviness = chord > 0.001 ? poly / chord : 1;
  const raw = Math.ceil((curviness - 1) * 6 * 1.25 + Math.sqrt(poly) * 0.6);
  return Math.max(3, Math.min(32, raw));
}

interface Curve {
  kind: "L" | "Q" | "C";
  at: Point;
  c?: Point;
  c1?: Point;
  c2?: Point;
}

/** Flattens the region path into the segments the ray walker intersects. */
function curvesOf(path: Path): { start: Point; curves: Curve[] }[] {
  const subs: { start: Point; curves: Curve[] }[] = [];
  let cur: Curve[] = [];
  let start: Point | undefined;
  let cursor: Point | undefined;
  const flush = (): void => {
    if (start && cur.length > 0) subs.push({ start, curves: cur });
    cur = [];
    start = undefined;
    cursor = undefined;
  };
  for (const op of path) {
    if (op.op === "M") {
      flush();
      start = { x: op.x, y: op.y };
      cursor = start;
    } else if (op.op === "L" && cursor) {
      cur.push({ kind: "L", at: { x: op.x, y: op.y } });
      cursor = { x: op.x, y: op.y };
    } else if (op.op === "Q" && cursor) {
      cur.push({ kind: "Q", at: { x: op.x, y: op.y }, c: { x: op.cx, y: op.cy } });
      cursor = { x: op.x, y: op.y };
    } else if (op.op === "C" && cursor) {
      cur.push({
        kind: "C",
        at: { x: op.x, y: op.y },
        c1: { x: op.c1x, y: op.c1y },
        c2: { x: op.c2x, y: op.c2y },
      });
      cursor = { x: op.x, y: op.y };
    } else if (op.op === "Z" && start && cursor) {
      cur.push({ kind: "L", at: start });
      cursor = start;
    }
  }
  flush();
  return subs;
}

function dedupe(points: Point[], tolerance: number): Point[] {
  const result: Point[] = [];
  for (const point of points) {
    const duplicate = result.some(
      (existing) => Math.hypot(existing.x - point.x, existing.y - point.y) < tolerance,
    );
    if (!duplicate) result.push(point);
  }
  return result;
}

function intersections(
  path: Path,
  origin: Point,
  angle: number,
  bounds: { width: number; height: number },
): Point[] {
  const rayLength = Math.max(bounds.width, bounds.height) * 3;
  const rayStart = {
    x: origin.x - rayLength * Math.cos(angle),
    y: origin.y - rayLength * Math.sin(angle),
  };
  const rayEnd = {
    x: origin.x + rayLength * Math.cos(angle),
    y: origin.y + rayLength * Math.sin(angle),
  };
  const hits: Point[] = [];
  for (const sub of curvesOf(path)) {
    let cursor = sub.start;
    for (const curve of sub.curves) {
      if (curve.kind === "L") {
        const hit = segmentHit(rayStart, rayEnd, cursor, curve.at);
        if (hit) hits.push(hit);
      } else if (curve.kind === "Q" && curve.c) {
        const n = quadSegments(cursor, curve.c, curve.at);
        for (let i = 0; i < n; i++) {
          const p1 = quadPoint(cursor, curve.c, curve.at, i / n);
          const p2 = quadPoint(cursor, curve.c, curve.at, (i + 1) / n);
          const hit = segmentHit(rayStart, rayEnd, p1, p2);
          if (hit) hits.push(hit);
        }
      } else if (curve.kind === "C" && curve.c1 && curve.c2) {
        const n = cubicSegments(cursor, curve.c1, curve.c2, curve.at);
        for (let i = 0; i < n; i++) {
          const p1 = cubicPoint(cursor, curve.c1, curve.c2, curve.at, i / n);
          const p2 = cubicPoint(cursor, curve.c1, curve.c2, curve.at, (i + 1) / n);
          const hit = segmentHit(rayStart, rayEnd, p1, p2);
          if (hit) hits.push(hit);
        }
      }
      cursor = curve.at;
    }
  }
  return dedupe(hits, 0.5);
}

function positions(
  options: Options,
  minProjection: number,
  traversal: number,
  reduction: number,
): number[] {
  const pattern = options.pattern;
  if (pattern && pattern.length > 0) {
    const out: number[] = [];
    const section = traversal / pattern.length;
    pattern.forEach((tightness, index) => {
      const sectionStart = minProjection + index * section;
      const count = Math.max(1, Math.trunc(Math.max(1, Math.min(100, tightness)) * reduction));
      for (let i = 1; i <= count; i++) out.push(sectionStart + (i / (count + 1)) * section);
    });
    return out;
  }
  const base = Math.max(1, Math.min(100, options.tightness));
  const count = Math.max(2, Math.trunc(base * reduction));
  const out: number[] = [];
  for (let i = 1; i <= count; i++) out.push(minProjection + (i / (count + 1)) * traversal);
  return out;
}

function toPath(points: readonly Point[], curvature: number): Path {
  const ops: PathOp[] = [{ op: "M", x: f32(points[0]!.x), y: f32(points[0]!.y) }];
  if (curvature <= 0 || points.length < 3) {
    for (let i = 1; i < points.length; i++) {
      const p = points[i]!;
      ops.push({ op: "L", x: f32(p.x), y: f32(p.y) });
    }
    return ops;
  }
  for (let i = 1; i < points.length; i++) {
    const curr = points[i]!;
    if (i < points.length - 1) {
      const prev = points[i - 1]!;
      const next = points[i + 1]!;
      const distPrev = Math.hypot(curr.x - prev.x, curr.y - prev.y);
      const distNext = Math.hypot(next.x - curr.x, next.y - curr.y);
      const entryT = Math.max(0.1, 1 - (distPrev * curvature) / distPrev);
      const exitT = Math.min(0.9, (distNext * curvature) / distNext);
      const entry = {
        x: prev.x + (curr.x - prev.x) * entryT,
        y: prev.y + (curr.y - prev.y) * entryT,
      };
      const exit = { x: curr.x + (next.x - curr.x) * exitT, y: curr.y + (next.y - curr.y) * exitT };
      ops.push({ op: "L", x: f32(entry.x), y: f32(entry.y) });
      ops.push({ op: "Q", cx: f32(curr.x), cy: f32(curr.y), x: f32(exit.x), y: f32(exit.y) });
    } else {
      ops.push({ op: "L", x: f32(curr.x), y: f32(curr.y) });
    }
  }
  return ops;
}

/** Builds scribble centerlines for a closed path. Empty when the region has no area. */
export function scribblePaths(path: Path, _polygon: readonly Point[], options: Options): Path[] {
  const box = pathBounds(path);
  const width = box.maxX - box.minX;
  const height = box.maxY - box.minY;
  if (!(width > 0) || !(height > 0)) return [];
  const originAngle = (options.origin * Math.PI) / 180;
  const curvatureNormalized = Math.max(0, Math.min(50, options.curvature)) / 50;
  const curvature = curvatureNormalized * 0.3;
  const reduction = 1 - curvatureNormalized * 0.6;
  const traversalAngle = originAngle + Math.PI / 2;
  const center = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
  const corners = [
    { x: box.minX, y: box.minY },
    { x: box.maxX, y: box.minY },
    { x: box.maxX, y: box.maxY },
    { x: box.minX, y: box.maxY },
  ];
  const projections = corners.map((corner) => project(corner, center, traversalAngle));
  const minProjection = Math.min(...projections);
  const maxProjection = Math.max(...projections);
  const traversal = maxProjection - minProjection;
  if (!(traversal > 0)) return [];
  const edgePadding = Math.min(width, height) * 0.02;
  const spots = positions(options, minProjection, traversal, reduction);
  if (spots.length === 0) return [];
  const segments: Point[][] = [];
  let current: Point[] = [];
  let goRight = true;
  let lastSpacing = traversal / (spots.length + 1);
  spots.forEach((position, index) => {
    const rayOrigin = onAxis(
      center,
      traversalAngle,
      position - (minProjection + maxProjection) / 2,
    );
    const hits = intersections(path, rayOrigin, originAngle, { width, height });
    if (hits.length < 2) {
      if (current.length > 0) segments.push(current);
      current = [];
      return;
    }
    const sorted = [...hits].sort(
      (a, b) => project(a, rayOrigin, originAngle) - project(b, rayOrigin, originAngle),
    );
    const left = sorted[0]!;
    const right = sorted[sorted.length - 1]!;
    const span = Math.hypot(right.x - left.x, right.y - left.y);
    if (!(span > 0.5)) return;
    const inset = Math.min(edgePadding, span * 0.35);
    const dx = (right.x - left.x) / span;
    const dy = (right.y - left.y) / span;
    const leftInset = { x: left.x + dx * inset, y: left.y + dy * inset };
    const rightInset = { x: right.x - dx * inset, y: right.y - dy * inset };
    const start = goRight ? leftInset : rightInset;
    const end = goRight ? rightInset : leftInset;
    if (index > 0) lastSpacing = spots[index]! - spots[index - 1]!;
    if (current.length > 0) {
      const last = current[current.length - 1]!;
      if (Math.hypot(start.x - last.x, start.y - last.y) > lastSpacing * 2.5 + edgePadding) {
        segments.push(current);
        current = [];
      }
    }
    const last = current[current.length - 1];
    if (!last || Math.hypot(start.x - last.x, start.y - last.y) > 0.5) current.push(start);
    current.push(end);
    goRight = !goRight;
  });
  if (current.length > 0) segments.push(current);
  return segments
    .filter((segment) => segment.length >= 2)
    .map((segment) => toPath(segment, curvature));
}

/** Scribble fill plugin. Options bridge from `SketchOptions` by name. */
export const scribble = /*#__PURE__*/ defineFill({
  id: "scribble",
  version: "0.1.0",
  api: "1.0",
  title: "Scribble",
  description: "A continuous zigzag across the shape. Concave shapes are clipped to the region.",
  stochastic: false,
  stream: "shared",
  options: {
    scribbleOrigin: {
      type: "number",
      default: 0,
      min: -100000,
      max: 100000,
      unit: "deg",
      description: "Stroke bearing in degrees. 0 is to the right and positive is clockwise.",
    },
    scribbleTightness: {
      type: "int",
      default: 10,
      min: 1,
      max: 100,
      description: "How many crossings the zigzag makes.",
    },
    scribbleCurvature: {
      type: "number",
      default: 0,
      min: 0,
      max: 50,
      description: "How much each turn rounds, from 0 to 50.",
    },
  },
  generate(input, options) {
    const pattern = input.fill.pattern;
    const polygon = input.region.rings[0]?.points ?? [];
    const paths = scribblePaths(input.region.path, polygon, {
      origin: options.scribbleOrigin,
      tightness: options.scribbleTightness,
      curvature: options.scribbleCurvature,
      ...(pattern ? { pattern } : {}),
    });
    if (paths.length === 0) return [];
    const clip = input.region.shape?.kind === "ellipse" ? "none" : "region";
    return [{ kind: "strokes" as const, centerlines: paths, clip }];
  },
});
