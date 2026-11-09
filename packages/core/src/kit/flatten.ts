import type { FlatSubpath, Path, Point } from "@sketchy-js/plugin";

function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function cubicPoint(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const ab = lerp(p0, p1, t);
  const bc = lerp(p1, p2, t);
  const cd = lerp(p2, p3, t);
  return lerp(lerp(ab, bc, t), lerp(bc, cd, t), t);
}

function steps(control: readonly Point[], tolerance: number): number {
  let length = 0;
  for (let i = 1; i < control.length; i++) {
    length += Math.hypot(control[i]!.x - control[i - 1]!.x, control[i]!.y - control[i - 1]!.y);
  }
  return Math.max(2, Math.min(256, Math.ceil(Math.sqrt(length / Math.max(tolerance, 1e-6)) * 2)));
}

function subpathLength(points: readonly Point[], closed: boolean): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    length += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
  }
  const first = points[0];
  const last = points.at(-1);
  if (closed && first && last) length += Math.hypot(first.x - last.x, first.y - last.y);
  return length;
}

/**
 * Flattens a path to polylines. Curves are sampled with a step count derived from their control
 * polygon length and `tolerance` (default 0.25), capped at 256 steps.
 */
export function flattenPath(path: Path, tolerance = 0.25): readonly FlatSubpath[] {
  const out: FlatSubpath[] = [];
  let points: Point[] = [];
  let start: Point | undefined;
  const flush = (closed: boolean): void => {
    if (points.length > 1) out.push({ points, closed, length: subpathLength(points, closed) });
    points = [];
  };
  for (const op of path) {
    const pen = points.at(-1);
    switch (op.op) {
      case "M":
        flush(false);
        start = { x: op.x, y: op.y };
        points = [start];
        break;
      case "L":
        points.push({ x: op.x, y: op.y });
        break;
      case "Q": {
        const a = pen ?? { x: op.x, y: op.y };
        const c = { x: op.cx, y: op.cy };
        const b = { x: op.x, y: op.y };
        const n = steps([a, c, b], tolerance);
        for (let i = 1; i <= n; i++) points.push(lerp(lerp(a, c, i / n), lerp(c, b, i / n), i / n));
        break;
      }
      case "C": {
        const a = pen ?? { x: op.x, y: op.y };
        const c1 = { x: op.c1x, y: op.c1y };
        const c2 = { x: op.c2x, y: op.c2y };
        const b = { x: op.x, y: op.y };
        const n = steps([a, c1, c2, b], tolerance);
        for (let i = 1; i <= n; i++) points.push(cubicPoint(a, c1, c2, b, i / n));
        break;
      }
      case "Z":
        flush(true);
        if (start) points = [start];
        break;
    }
  }
  flush(false);
  return out;
}
