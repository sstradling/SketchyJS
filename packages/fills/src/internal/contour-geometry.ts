import type { ContourEasingName, ContourGuideInput, Point } from "@sketchy-js/plugin";
import { FLOAT_MAX, PI, cosf, f, hypotf, powf, roundf, sinf, sqrtf } from "./f32.js";

/**
 * Clipped contour strokes before roughness. Sketchy's `ContourGeometry`.
 *
 * Each stroke is a full-width copy of the guide's bow, clipped to the polygon
 * with the even-odd rule. Intensity 0 is the straight chord. Intensity 1 keeps
 * the guide's bow. A lower intensity flattens that bow; it does not tighten the circle.
 */

export interface ContourStroke {
  readonly slot: number;
  readonly offset: number;
  readonly scale: number;
  readonly points: readonly Point[];
}

export interface ContourPlan {
  readonly strokes: readonly ContourStroke[];
  /** Phase distance that brings every slot back to where it started. */
  readonly period: number;
  readonly gap: number;
  readonly slotCount: number;
  /** Unit vector from the guide side of the shape toward the far side. */
  readonly travel: Point;
  /** Slot shift after wrapping, in `0..<slotCount`. */
  readonly phaseSlots: number;
}

export interface ContourPlanOptions {
  readonly gap: number;
  readonly fillAngle: number;
  readonly intensity: number;
  readonly intensityStart?: number;
  readonly intensityEnd?: number;
  readonly gradientAngle: number;
  readonly easing: ContourEasingName;
  readonly falloff: number;
  readonly drift?: { readonly angle: number; readonly phase: number };
  readonly guide?: ContourGuideInput;
}

interface Field {
  start: number;
  end: number;
  dirX: number;
  dirY: number;
  minP: number;
  span: number;
  easing: ContourEasingName;
}

const EMPTY: ContourPlan = {
  strokes: [],
  period: 1,
  gap: 1,
  slotCount: 1,
  travel: { x: 0, y: 1 },
  phaseSlots: 0,
};

/** Maps `t` in 0...1 through the easing curve. Sketchy's `ContourEasing.value`. */
export function easingValue(easing: ContourEasingName, t: number): number {
  const u = clamp01(t);
  if (easing === "easeIn") return f(u * u);
  if (easing === "easeOut") {
    const v = f(1 - u);
    return f(1 - f(v * v));
  }
  if (easing === "easeInOut") return f(f(f(u * u) * f(3 - f(2 * u))));
  return u;
}

/** `0.22` at the guide when falloff is 1, and `1` at the far side. */
export function widthScale(u: number, falloff: number): number {
  const proximity = f(1 - clamp01(u));
  return f(1 - f(f(falloff * proximity) * f(1 - 0.22)));
}

/** One slot of the repeating field. `u` is 0 at the guide and 1 at the far side. */
export function placements(
  count: number,
  falloff: number,
  phaseSlots: number,
): { slot: number; u: number }[] {
  const n = Math.max(count, 1);
  const exponent = f(1 + clamp01(falloff));
  return Array.from({ length: n }, (_, slot) => {
    const raw = f(f(f(slot) + phaseSlots) / f(n));
    const wrapped = f(raw - f(Math.floor(raw)));
    return { slot, u: powf(wrapped, exponent) };
  });
}

/**
 * Plans contour centerlines for one polygon. Returns no strokes when the shape
 * is too small to scan. The caller roughens each stroke afterwards.
 */
export function planContour(polygon: readonly Point[], options: ContourPlanOptions): ContourPlan {
  if (polygon.length < 3) return EMPTY;
  const scan = makeScan(polygon, options);
  if (!scan) return EMPTY;
  const gap = Math.max(options.gap, 0.5);
  const count = Math.min(360, Math.max(2, roundf(f(scan.span / gap))));
  const drift = driftComponent(options, scan.travel);
  const period = f(f(f(count) * gap) / Math.max(Math.abs(drift.along), 0.001));
  const phase = wrapped(drift.phase, period);
  const phaseSlots = slotShift(phase, drift.along, gap, count);
  const falloff = clamp01(options.falloff);
  const strokes: ContourStroke[] = [];
  const pieceCount = new Map<number, number>();
  const minChord = Math.max(8, f(scan.across * 0.35));
  for (const placement of placements(count, falloff, phaseSlots)) {
    const offset = scan.position(placement.u);
    const scale = widthScale(placement.u, falloff);
    for (const piece of scan.pieces(offset, polygon)) {
      if (chord(piece) < minChord) continue;
      const pieceIndex = pieceCount.get(placement.slot) ?? 0;
      pieceCount.set(placement.slot, pieceIndex + 1);
      strokes.push({ slot: placement.slot, offset, scale, points: piece });
    }
  }
  return {
    strokes,
    period,
    gap,
    slotCount: count,
    travel: scan.travel,
    phaseSlots,
  };
}

/** 80-step ellipse, matching `ContourFiller.ellipsePolygon`. */
export function ellipsePolygon(cx: number, cy: number, rx: number, ry: number): Point[] {
  const steps = 80;
  const out: Point[] = [];
  for (let index = 0; index < steps; index++) {
    const angle = f(f(f(f(index) / f(steps)) * 2) * PI);
    out.push({ x: f(cx + f(rx * cosf(angle))), y: f(cy + f(ry * sinf(angle))) });
  }
  return out;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function intensityField(polygon: readonly Point[], options: ContourPlanOptions): Field {
  const start = options.intensityStart ?? options.intensity;
  const end = options.intensityEnd ?? options.intensity;
  const radians = f(f(options.gradientAngle * PI) / 180);
  const dirX = cosf(radians);
  const dirY = sinf(radians);
  let low = FLOAT_MAX;
  let high = -FLOAT_MAX;
  for (const point of polygon) {
    const projection = f(f(point.x * dirX) + f(point.y * dirY));
    low = Math.min(low, projection);
    high = Math.max(high, projection);
  }
  return {
    start,
    end,
    dirX,
    dirY,
    minP: low,
    span: Math.max(f(high - low), 0.001),
    easing: options.easing,
  };
}

function fieldValue(field: Field, point: Point): number {
  const t = clamp01(
    f(f(f(f(point.x * field.dirX) + f(point.y * field.dirY)) - field.minP) / field.span),
  );
  return f(field.start + f(f(field.end - field.start) * easingValue(field.easing, t)));
}

function chord(points: readonly Point[]): number {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return 0;
  return hypotf(f(last.x - first.x), f(last.y - first.y));
}

/** Slot shift in `0..<count`. A value within 1e-4 of an integer snaps to it. */
function slotShift(phase: number, along: number, gap: number, count: number): number {
  if (!(count > 0) || !(gap > 0)) return 0;
  let slots = (phase * along) / gap;
  slots = slots % count;
  if (slots < 0) slots += count;
  const nearest = Math.sign(slots) * Math.round(Math.abs(slots));
  if (Math.abs(slots - nearest) < 1e-4) {
    slots = nearest % count;
    if (slots < 0) slots += count;
  }
  return f(slots);
}

function wrapped(phase: number, period: number): number {
  if (!(period > 0) || !Number.isFinite(period) || Math.abs(phase) <= period) return phase;
  const turns = Math.floor(phase / period);
  return f(phase - turns * period);
}

function driftComponent(
  options: ContourPlanOptions,
  travel: Point,
): { along: number; phase: number } {
  if (!options.drift) return { along: 1, phase: 0 };
  const radians = f(f(options.drift.angle * PI) / 180);
  const along = f(f(cosf(radians) * travel.x) + f(sinf(radians) * travel.y));
  return { along, phase: options.drift.phase };
}

interface Frame {
  origin: Point;
  travel: Point;
  tangent: Point;
}

interface Scan {
  travel: Point;
  span: number;
  across: number;
  position(u: number): number;
  pieces(offset: number, polygon: readonly Point[]): Point[][];
}

function frameU(frame: Frame, point: Point): number {
  return f(
    f(f(point.x - frame.origin.x) * frame.tangent.x) +
      f(f(point.y - frame.origin.y) * frame.tangent.y),
  );
}

function frameS(frame: Frame, point: Point): number {
  return f(
    f(f(point.x - frame.origin.x) * frame.travel.x) +
      f(f(point.y - frame.origin.y) * frame.travel.y),
  );
}

function framePoint(frame: Frame, u: number, s: number): Point {
  return {
    x: f(frame.origin.x + f(frame.tangent.x * u) + f(frame.travel.x * s)),
    y: f(frame.origin.y + f(frame.tangent.y * u) + f(frame.travel.y * s)),
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

function normalize(point: Point): Point {
  const length = hypotf(point.x, point.y);
  if (!(length > 1e-5)) return { x: 0, y: 1 };
  return { x: f(point.x / length), y: f(point.y / length) };
}

function makeScan(polygon: readonly Point[], options: ContourPlanOptions): Scan | undefined {
  const guide = options.guide;
  if (!guide) return lineScan(options.fillAngle, polygon, options);
  if (guide.kind === "arc") return arcScan(guide, polygon, options);
  return polylineScan(guide.points, guide.closed, polygon, options);
}

function arcScan(
  guide: Extract<ContourGuideInput, { kind: "arc" }>,
  polygon: readonly Point[],
  options: ContourPlanOptions,
): Scan | undefined {
  if (!(guide.radius > 1)) return undefined;
  const center = { x: guide.x, y: guide.y };
  const mid = centroid(polygon);
  const toward = normalize({ x: f(mid.x - center.x), y: f(mid.y - center.y) });
  const guidePoint = {
    x: f(center.x + f(toward.x * guide.radius)),
    y: f(center.y + f(toward.y * guide.radius)),
  };
  let into = { x: f(mid.x - guidePoint.x), y: f(mid.y - guidePoint.y) };
  if (hypotf(into.x, into.y) < 1) into = { x: f(-toward.x), y: f(-toward.y) };
  const travel = normalize(into);
  const tangent = { x: travel.y, y: f(-travel.x) };
  const frame: Frame = { origin: guidePoint, travel, tangent };
  const centerU = frameU(frame, center);
  const centerS = frameS(frame, center);
  const sigma = centerS >= 0 ? 1 : -1;
  return finishScan(
    frame,
    (u) => arcDepth(f(u - centerU), guide.radius, centerS, sigma),
    polygon,
    options,
  );
}

function lineScan(
  angle: number,
  polygon: readonly Point[],
  options: ContourPlanOptions,
): Scan | undefined {
  const radians = f(f(angle * PI) / 180);
  const tangent = { x: cosf(radians), y: sinf(radians) };
  const travel = { x: f(-tangent.y), y: tangent.x };
  const frame: Frame = { origin: centroid(polygon), travel, tangent };
  return finishScan(frame, () => 0, polygon, options);
}

function polylineScan(
  points: readonly Point[],
  closed: boolean,
  polygon: readonly Point[],
  options: ContourPlanOptions,
): Scan | undefined {
  if (points.length < 2) return undefined;
  const mid = centroid(polygon);
  const closest = closestFrame(mid, points, closed);
  let travel = closest.normal;
  const into = { x: f(mid.x - closest.anchor.x), y: f(mid.y - closest.anchor.y) };
  if (f(f(into.x * closest.normal.x) + f(into.y * closest.normal.y)) < 0) {
    travel = { x: f(-closest.normal.x), y: f(-closest.normal.y) };
  }
  travel = normalize(travel);
  const tangent = { x: travel.y, y: f(-travel.x) };
  const frame: Frame = { origin: closest.anchor, travel, tangent };
  const samples = points
    .map((point) => [frameU(frame, point), frameS(frame, point)] as const)
    .sort((a, b) => a[0] - b[0]);
  if (samples.length < 2) return undefined;
  return finishScan(frame, (u) => interpolate(samples, u), polygon, options);
}

function finishScan(
  frame: Frame,
  guideS: (u: number) => number,
  polygon: readonly Point[],
  options: ContourPlanOptions,
): Scan | undefined {
  const us = polygon.map((point) => frameU(frame, point));
  const ss = polygon.map((point) => frameS(frame, point));
  const uMin = Math.min(...us);
  const uMax = Math.max(...us);
  const sMin = Math.min(...ss);
  const sMax = Math.max(...ss);
  if (!(uMax - uMin > 1) || !(sMax - sMin > 0.5)) return undefined;
  const crest = guideS(f((uMin + uMax) / 2));
  const guideAtLow = Math.abs(sMin - crest) <= Math.abs(sMax - crest);
  const bow = bowDeviation(guideS, uMin, uMax);
  const field = intensityField(polygon, options);
  const span = Math.max(f(sMax - sMin), 0.001);
  return {
    travel: frame.travel,
    span,
    across: f(uMax - uMin),
    position(u) {
      const t = clamp01(u);
      return guideAtLow ? f(sMin + f(t * span)) : f(sMax - f(t * span));
    },
    pieces(offset, ring) {
      return widePieces(offset, frame, uMin, uMax, bow, field, ring);
    },
  };
}

/** Depth of a circular guide along `travel`. The crest sits at `s == 0`. */
function arcDepth(du: number, radius: number, centerS: number, sigma: number): number {
  const limit = f(radius * 0.995);
  if (Math.abs(du) <= limit) {
    return f(centerS - f(sigma * sqrtf(Math.max(0, f(f(radius * radius) - f(du * du))))));
  }
  const edge = f(limit * (du < 0 ? -1 : 1));
  const edgeS = f(centerS - f(sigma * sqrtf(Math.max(0, f(f(radius * radius) - f(edge * edge))))));
  const slope = f(f(sigma * edge) / sqrtf(Math.max(0.01, f(f(radius * radius) - f(edge * edge)))));
  return f(edgeS + f(slope * f(du - edge)));
}

function bowDeviation(
  guideS: (u: number) => number,
  uMin: number,
  uMax: number,
): (u: number) => number {
  const span = Math.max(f(uMax - uMin), 0.001);
  const start = guideS(uMin);
  const end = guideS(uMax);
  return (u) => {
    const clamped = Math.min(uMax, Math.max(uMin, u));
    const t = f(f(clamped - uMin) / span);
    return f(guideS(clamped) - f(start + f(f(end - start) * t)));
  };
}

function interpolate(samples: readonly (readonly [number, number])[], u: number): number {
  const first = samples[0];
  if (!first) return 0;
  if (u <= first[0]) return first[1];
  const last = samples[samples.length - 1];
  if (!last) return 0;
  if (u >= last[0]) return last[1];
  for (let index = 1; index < samples.length; index++) {
    const left = samples[index - 1]!;
    const right = samples[index]!;
    if (u <= right[0]) {
      const span = Math.max(f(right[0] - left[0]), 0.001);
      const t = f(f(u - left[0]) / span);
      return f(left[1] + f(f(right[1] - left[1]) * t));
    }
  }
  return last[1];
}

function widePieces(
  s0: number,
  frame: Frame,
  uMin: number,
  uMax: number,
  bow: (u: number) => number,
  field: Field,
  polygon: readonly Point[],
): Point[][] {
  const span = Math.max(f(uMax - uMin), 1);
  const steps = Math.min(48, Math.max(16, Math.trunc(span / 10)));
  const pad = f(f(span * 0.08) + 4);
  const chain: Point[] = [];
  for (let step = 0; step <= steps; step++) {
    const u = f(f(uMin - pad) + f(f(f(span + f(pad * 2)) * f(step)) / f(steps)));
    const clamped = Math.min(uMax, Math.max(uMin, u));
    const k = fieldValue(field, framePoint(frame, clamped, s0));
    const depth = f(s0 + f(k * bow(clamped)));
    chain.push(framePoint(frame, u, depth));
  }
  return clipChain(chain, polygon);
}

function clipChain(chain: readonly Point[], polygon: readonly Point[]): Point[][] {
  if (chain.length < 2) return [];
  const work = chain;
  const events: { param: number; point: Point }[] = [];
  const segments = work.length - 1;
  const edges = polygon.length;
  for (let index = 0; index < segments; index++) {
    for (let edge = 0; edge < edges; edge++) {
      const hit = segmentHit(
        work[index]!,
        work[index + 1]!,
        polygon[edge]!,
        polygon[(edge + 1) % edges]!,
      );
      if (hit === undefined) continue;
      const a = work[index]!;
      const b = work[index + 1]!;
      events.push({
        param: f(index + hit),
        point: { x: f(a.x + f(f(b.x - a.x) * hit)), y: f(a.y + f(f(b.y - a.y) * hit)) },
      });
    }
  }
  const ordered = dedupEvents(events);
  const pieces: Point[][] = [];
  let inside = contains(work[0]!, polygon);
  let current: Point[] = inside ? [work[0]!] : [];
  let cursor = 0;
  for (const event of ordered) {
    if (inside) {
      current.push(...vertices(work, cursor, event.param));
      current.push(event.point);
      appendPiece(current, pieces);
      current = [];
    } else {
      current = [event.point];
    }
    inside = !inside;
    cursor = event.param;
  }
  if (inside) {
    current.push(...vertices(work, cursor, segments));
    current.push(work[segments]!);
    appendPiece(current, pieces);
  }
  return pieces;
}

function vertices(work: readonly Point[], start: number, end: number): Point[] {
  const first = Math.floor(start) + 1;
  const last = Math.min(Math.floor(end), work.length - 1);
  if (last < first) return [];
  return work.slice(first, last + 1);
}

function appendPiece(points: readonly Point[], pieces: Point[][]): void {
  const cleaned: Point[] = [];
  for (const point of points) {
    const last = cleaned[cleaned.length - 1];
    if (last && hypotf(f(point.x - last.x), f(point.y - last.y)) < 0.15) continue;
    cleaned.push(point);
  }
  if (cleaned.length >= 2) pieces.push(cleaned);
}

function dedupEvents(events: { param: number; point: Point }[]): { param: number; point: Point }[] {
  const kept: { param: number; point: Point }[] = [];
  for (const event of [...events].sort((a, b) => a.param - b.param)) {
    const last = kept[kept.length - 1];
    if (last && hypotf(f(event.point.x - last.point.x), f(event.point.y - last.point.y)) < 0.6)
      continue;
    kept.push(event);
  }
  return kept;
}

function segmentHit(a: Point, b: Point, c: Point, d: Point): number | undefined {
  const rx = f(b.x - a.x);
  const ry = f(b.y - a.y);
  const sx = f(d.x - c.x);
  const sy = f(d.y - c.y);
  const denom = f(f(rx * sy) - f(ry * sx));
  if (Math.abs(denom) < 1e-6) return undefined;
  const qx = f(c.x - a.x);
  const qy = f(c.y - a.y);
  const t = f(f(f(qx * sy) - f(qy * sx)) / denom);
  const u = f(f(f(qx * ry) - f(qy * rx)) / denom);
  if (t < -1e-4 || t > 1 + 1e-4 || u < -1e-4 || u > 1 + 1e-4) return undefined;
  return Math.min(1, Math.max(0, t));
}

function contains(point: Point, polygon: readonly Point[]): boolean {
  let inside = false;
  let previous = polygon.length - 1;
  for (let index = 0; index < polygon.length; index++) {
    const current = polygon[index]!;
    const prior = polygon[previous]!;
    if (current.y > point.y !== prior.y > point.y) {
      const x = f(
        f(f(f(prior.x - current.x) * f(point.y - current.y)) / f(prior.y - current.y)) + current.x,
      );
      if (point.x < x) inside = !inside;
    }
    previous = index;
  }
  return inside;
}

function closestFrame(
  point: Point,
  guide: readonly Point[],
  closed: boolean,
): { anchor: Point; normal: Point } {
  const count = guide.length;
  const segments = closed ? count : count - 1;
  let best = FLOAT_MAX;
  let anchor = guide[0]!;
  let normal = { x: 0, y: 1 };
  for (let index = 0; index < segments; index++) {
    const start = guide[index]!;
    const end = guide[(index + 1) % count]!;
    const dx = f(end.x - start.x);
    const dy = f(end.y - start.y);
    const lengthSquared = f(f(dx * dx) + f(dy * dy));
    let t = 0;
    if (lengthSquared > 1e-6) {
      t = Math.min(
        1,
        Math.max(
          0,
          f(f(f(f(point.x - start.x) * dx) + f(f(point.y - start.y) * dy)) / lengthSquared),
        ),
      );
    }
    const candidate = { x: f(start.x + f(dx * t)), y: f(start.y + f(dy * t)) };
    const distance = hypotf(f(point.x - candidate.x), f(point.y - candidate.y));
    if (distance < best) {
      best = distance;
      anchor = candidate;
      const length = sqrtf(lengthSquared);
      if (length > 1e-4) normal = { x: f(-dy / length), y: f(dx / length) };
    }
  }
  return { anchor, normal };
}
