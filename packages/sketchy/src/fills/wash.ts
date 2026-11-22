import {
  defineFill,
  type FillInput,
  type FillPart,
  type Path,
  type Point,
  type RoughStream,
  type WashPassInput,
} from "../plugin/index.js";
import { ellipsePolygon } from "./internal/contour-geometry.js";
import { PI, cosf, f, sinf } from "./internal/f32.js";
import { mixSeed } from "./internal/mix.js";
import { SKY_WASH } from "./internal/wash-stroke.js";

/**
 * Wash fill: separate crayon strokes around `fillAngle`. Sketchy's `WashFiller`.
 *
 * Each stroke has its own angle scatter, width, opacity, end trim, and sine bow.
 * Strokes are clipped to the polygon with the even-odd rule, then roughened with
 * the pass's own roughness so a contour fill can run the same recipe.
 *
 * Request flow: scene fill stage -> this plugin -> one stroke part per width/opacity bucket.
 */

interface Frame {
  dx: number;
  dy: number;
  px: number;
  py: number;
}

interface Bucket {
  width: number;
  opacity: number;
  paths: Path[];
}

function polygonOf(input: FillInput): Point[] {
  const shape = input.region.shape;
  if (shape?.kind === "ellipse") return ellipsePolygon(shape.cx, shape.cy, shape.rx, shape.ry);
  return input.region.rings[0]?.points.map((point) => ({ x: point.x, y: point.y })) ?? [];
}

function frame(angle: number): Frame {
  const dx = cosf(angle);
  const dy = sinf(angle);
  return { dx, dy, px: f(-dy), py: dx };
}

function along(line: Frame, point: Point): number {
  return f(f(point.x * line.dx) + f(point.y * line.dy));
}

function perp(line: Frame, point: Point): number {
  return f(f(point.x * line.px) + f(point.y * line.py));
}

function pointAt(line: Frame, alongValue: number, perpValue: number): Point {
  return {
    x: f(f(line.dx * alongValue) + f(line.px * perpValue)),
    y: f(f(line.dy * alongValue) + f(line.py * perpValue)),
  };
}

function centroid(polygon: readonly Point[]): Point {
  let x = 0;
  let y = 0;
  for (const point of polygon) {
    x = f(x + point.x);
    y = f(y + point.y);
  }
  const count = f(polygon.length);
  return { x: f(x / count), y: f(y / count) };
}

/** Even-odd crossings of an infinite line with the polygon, sorted along the line. */
function intersections(polygon: readonly Point[], line: Frame, here: number): number[] {
  const hits: number[] = [];
  for (let index = 0; index < polygon.length; index++) {
    const a = polygon[index]!;
    const b = polygon[(index + 1) % polygon.length]!;
    const d1 = perp(line, a);
    const d2 = perp(line, b);
    const den = f(d2 - d1);
    if (Math.abs(den) < 1e-5) continue;
    const t = f(f(here - d1) / den);
    if (t < -0.001 || t > 1.001) continue;
    const at = f(
      along(line, a) + f(f(along(line, b) - along(line, a)) * Math.min(1, Math.max(0, t))),
    );
    const last = hits[hits.length - 1];
    if (last !== undefined && Math.abs(last - at) < 0.6) continue;
    hits.push(at);
  }
  hits.sort((a, b) => a - b);
  const unique: number[] = [];
  for (const hit of hits) {
    const last = unique[unique.length - 1];
    if (last === undefined || Math.abs(last - hit) > 0.6) unique.push(hit);
  }
  if (unique.length % 2 === 1) unique.pop();
  return unique;
}

function endInset(pass: WashPassInput, width: number, random: RoughStream): number {
  const stretch = random.unit() < 0.28 ? f(f(random.unit() * pass.trimMax) * 0.7) : 0;
  return f(f(f(f(width / 2) + 4) + f(random.unit() * pass.trimMax)) + stretch);
}

function sineStroke(line: Frame, here: number, from: number, to: number, bow: number): Point[] {
  const steps = 9;
  const points: Point[] = [];
  for (let step = 0; step <= steps; step++) {
    const t = f(f(step) / f(steps));
    const at = f(from + f(f(to - from) * t));
    const side = f(f(sinf(f(t * PI)) * bow) + f(sinf(f(f(t * PI) * 2)) * f(bow * 0.35)));
    points.push(pointAt(line, at, f(here + side)));
  }
  return points;
}

function quantize(value: number, scale: number): number {
  return f(f(Math.sign(value) * Math.round(Math.abs(f(value * scale)))) / scale);
}

function paint(
  polygon: readonly Point[],
  pass: WashPassInput,
  angle: number,
  seed: bigint,
  ctx: Parameters<NonNullable<typeof wash.generate>>[2],
): FillPart[] {
  const base = f(f(angle * PI) / 180);
  const guide = frame(base);
  const projections = polygon.map((point) => perp(guide, point));
  const minP = Math.min(...projections);
  const maxP = Math.max(...projections);
  if (!(maxP - minP > 1)) return [];
  const anchorAlong = along(guide, centroid(polygon));
  const random = ctx.geom.rough.isolated(mixSeed(seed, Number(pass.seed & 0x7fffffffn)));
  const buckets = new Map<string, Bucket>();
  let index = 0;
  let cursor = minP;
  while (cursor <= maxP && index < 400) {
    index += 1;
    const step = f(pass.spacingMin + f(random.unit() * pass.spacingSpan));
    const fraction = f(f(cursor - minP) / Math.max(f(maxP - minP), 0.001));
    cursor = f(cursor + step);
    const scatter = f(f(f(random.unit() - 0.5) * pass.angleSpread) * f(PI / 180));
    const line = frame(f(base + scatter));
    const baseHere = f(f(minP + f(fraction * f(maxP - minP))) + f(f(random.unit() - 0.5) * 10));
    const anchor = pointAt(guide, anchorAlong, baseHere);
    const here = perp(line, anchor);
    const hits = intersections(polygon, line, here);
    if (hits.length < 2) continue;
    const width = f(pass.widthMin + f(random.unit() * pass.widthSpan));
    const opacity = Math.min(
      1,
      Math.max(0, f(pass.opacityMin + f(random.unit() * pass.opacitySpan))),
    );
    let pair = 0;
    while (pair + 1 < hits.length) {
      const lo = hits[pair]!;
      const hi = hits[pair + 1]!;
      pair += 2;
      const trimA = endInset(pass, width, random);
      const trimB = endInset(pass, width, random);
      const from = f(lo + trimA);
      const to = f(hi - trimB);
      if (f(to - from) < pass.minLength) continue;
      const bow = f(f(random.unit() - 0.5) * pass.bow);
      const samples = sineStroke(line, here, from, to, bow);
      const slotSeed = mixSeed(mixSeed(seed, Number(pass.seed & 0x7fffffffn)), index * 19 + pair);
      const path = ctx.geom.rough
        .isolated(slotSeed, {
          roughness: pass.roughness,
          bowing: pass.bowing,
          maxRandomnessOffset: pass.randomness,
        })
        .curve(samples);
      if (path.length === 0) continue;
      const keyWidth = quantize(width, 2);
      const keyOpacity = quantize(opacity, 50);
      const key = `${keyWidth}:${keyOpacity}`;
      const bucket = buckets.get(key) ?? { width: keyWidth, opacity: keyOpacity, paths: [] };
      bucket.paths.push(path);
      buckets.set(key, bucket);
    }
  }
  return [...buckets.values()]
    .filter((bucket) => bucket.paths.length > 0)
    .sort((a, b) => (a.width === b.width ? a.opacity - b.opacity : a.width - b.width))
    .map((bucket) => ({
      kind: "strokes" as const,
      centerlines: [bucket.paths.flat()],
      clip: "none" as const,
      strokeWidth: bucket.width,
      opacity: bucket.opacity,
    }));
}

export const wash = /*#__PURE__*/ defineFill({
  id: "wash",
  version: "0.1.0",
  api: "1.0",
  title: "Wash",
  description: "Separate crayon strokes around the fill angle, with scatter, trim, and a sine bow.",
  options: {},
  stochastic: true,
  stream: "shared",
  generate(input, _options, ctx) {
    const polygon = polygonOf(input);
    if (polygon.length < 3) return [];
    const passes = input.washPasses && input.washPasses.length > 0 ? input.washPasses : SKY_WASH;
    const parts: FillPart[] = [];
    for (const pass of passes) {
      parts.push(...paint(polygon, pass, input.fill.angle, input.seed ?? pass.seed, ctx));
    }
    return parts;
  },
});

export { SKY_WASH as skyWash, scaleWash } from "./internal/wash-stroke.js";
