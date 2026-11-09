import type {
  FillRegion,
  FlatSubpath,
  GeometryKit,
  Path,
  PathOp,
  Point,
  Rect,
  RoughKit,
  Sample,
  Segment,
} from "@sketchy-js/plugin";
import { flattenPath } from "./flatten.js";

/** Picks the point at arclength `s` along a polyline given cumulative lengths. */
function sampleAt(points: readonly Point[], cumulative: readonly number[], s: number): Sample {
  let i = 1;
  while (i < cumulative.length - 1 && cumulative[i]! < s) i++;
  const a = points[i - 1]!;
  const b = points[i]!;
  const span = cumulative[i]! - cumulative[i - 1]!;
  const t = span > 0 ? (s - cumulative[i - 1]!) / span : 0;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const tangent = { x: dx / len, y: dy / len };
  return {
    point: { x: a.x + dx * t, y: a.y + dy * t },
    tangent,
    normal: { x: -tangent.y, y: tangent.x },
    s,
  };
}

/** Samples a subpath every `spacing` units of arclength, always including both ends. */
function resample(sub: FlatSubpath, spacing: number): readonly Sample[] {
  const points = sub.closed ? [...sub.points, sub.points[0]!] : sub.points;
  if (points.length < 2 || !(spacing > 0)) return [];
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) {
    cumulative.push(
      cumulative[i - 1]! +
        Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y),
    );
  }
  const total = cumulative.at(-1)!;
  const count = Math.max(1, Math.round(total / spacing));
  const samples: Sample[] = [];
  for (let k = 0; k <= count; k++) samples.push(sampleAt(points, cumulative, (total * k) / count));
  return samples;
}

const toOps = (points: readonly Point[], close: boolean): PathOp[] => {
  const ops: PathOp[] = points.map((p, i) =>
    i === 0 ? { op: "M", x: p.x, y: p.y } : { op: "L", x: p.x, y: p.y },
  );
  if (close && ops.length > 0) ops.push({ op: "Z" });
  return ops;
};

/** Variable-width band: left side forward, right side back. A closed loop gives two rings. */
function ribbon(samples: readonly Sample[], halfWidths: readonly number[], closed: boolean): Path {
  if (samples.length < 2) return [];
  const side = (sign: 1 | -1): Point[] =>
    samples.map((s, i) => {
      const w = halfWidths[Math.min(i, halfWidths.length - 1)] ?? 0;
      return { x: s.point.x + s.normal.x * w * sign, y: s.point.y + s.normal.y * w * sign };
    });
  const left = side(1);
  const right = side(-1);
  if (closed) return [...toOps(left, true), ...toOps(right.reverse(), true)];
  return toOps([...left, ...right.reverse()], true);
}

function bounds(path: Path): Rect {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const sub of flattenPath(path)) {
    for (const p of sub.points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  if (minX === Infinity) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Even-odd point containment against every ring of a region. */
function inside(rings: readonly FlatSubpath[], p: Point): boolean {
  let hit = false;
  for (const ring of rings) {
    const pts = ring.points;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i]!;
      const b = pts[j]!;
      if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
        hit = !hit;
    }
  }
  return hit;
}

/** Parameters where segment `a`-`b` crosses the ring edges, in `(0, 1)`. */
function crossings(rings: readonly FlatSubpath[], a: Point, b: Point): number[] {
  const ts: number[] = [];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  for (const ring of rings) {
    const pts = ring.points;
    for (let i = 0; i < pts.length; i++) {
      const c = pts[i]!;
      const d = pts[(i + 1) % pts.length]!;
      const ex = d.x - c.x;
      const ey = d.y - c.y;
      const denom = dx * ey - dy * ex;
      if (denom === 0) continue;
      const t = ((c.x - a.x) * ey - (c.y - a.y) * ex) / denom;
      const u = ((c.x - a.x) * dy - (c.y - a.y) * dx) / denom;
      if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
    }
  }
  return ts.sort((x, y) => x - y);
}

/** Keeps the parts of `segments` that lie inside the region (even-odd). */
function clipSegments(region: FillRegion, segments: readonly Segment[]): readonly Segment[] {
  const out: Segment[] = [];
  for (const { a, b } of segments) {
    const cuts = [0, ...crossings(region.rings, a, b), 1];
    for (let i = 0; i < cuts.length - 1; i++) {
      const t0 = cuts[i]!;
      const t1 = cuts[i + 1]!;
      if (t1 - t0 < 1e-9) continue;
      const tm = (t0 + t1) / 2;
      const mid = { x: a.x + (b.x - a.x) * tm, y: a.y + (b.y - a.y) * tm };
      if (!inside(region.rings, mid)) continue;
      out.push({
        a: { x: a.x + (b.x - a.x) * t0, y: a.y + (b.y - a.y) * t0 },
        b: { x: a.x + (b.x - a.x) * t1, y: a.y + (b.y - a.y) * t1 },
      });
    }
  }
  return out;
}

/** Builds the plugin geometry kit around a bound rough kit. */
export function createGeometryKit(rough: RoughKit): GeometryKit {
  return {
    flatten: flattenPath,
    resample,
    ribbon,
    polygon: (points, closed = true) => toOps(points, closed),
    bounds,
    clipSegments,
    rough,
  };
}
