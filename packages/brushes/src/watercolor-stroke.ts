import {
  centerlines,
  effectiveWidth,
  noiseUnit,
  opacityAt,
  seamBlend,
  type StrokeSample,
} from "@sketchy-js/core";
import type { Path, Point } from "@sketchy-js/plugin";

type Opacity = Parameters<typeof opacityAt>[0];
type Tip = Parameters<typeof effectiveWidth>[0];

interface WashStyle {
  pigment: number;
  wetness: number;
  bleed: number;
  variation: number;
  edgeDarkening: number;
  layers: number;
  seed: bigint | number;
}

interface WashBrush {
  tip: Tip;
  opacityProfile: Opacity;
}
import { ellipsePath } from "./ellipse.js";
import {
  arcLengthParameters,
  averageCurve,
  linePath,
  resample,
  signedCurvatures,
  signedNoise,
  smoothScalars,
  stableForwards,
  uadd,
  umul,
} from "./watercolor-math.js";

/** One translucent glaze. `evenOdd` is unused; watercolor stacks with normal alpha. */
export interface WashPiece {
  path: Path;
  opacity: number;
}

interface Smooth {
  point: Point;
  t: number;
  forward: number;
  curvature: number;
  radius: number;
  cornerIn?: number;
  cornerOut?: number;
}

interface Station {
  center: Point;
  forward: number;
  outerLeft: Point;
  outerRight: Point;
  outerRadius: number;
  curvature: number;
  t: number;
  cornerIn?: number;
  cornerOut?: number;
}

const hypot = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y);

function tipScale(t: number): number {
  const edge = Math.min(Math.max(0, t), Math.max(0, 1 - t));
  if (edge >= 0.2) return 1;
  const mix = edge / 0.2;
  return 0.72 + 0.28 * (mix * mix * (3 - 2 * mix));
}

function tipFade(t: number): number {
  const edge = Math.min(Math.max(0, t), Math.max(0, 1 - t));
  if (edge >= 0.2) return 1;
  const mix = edge / 0.2;
  return mix * mix * (3 - 2 * mix);
}

function smoothWhole(samples: StrokeSample[], closed: boolean): Smooth[] {
  if (samples.length < 2) return [];
  let curve = resample(
    samples.map((s) => s.point),
    samples.map((s) => s.t),
    2,
    closed,
  );
  if (curve.length < 2) return [];
  for (let i = 0; i < 3; i++) curve = averageCurve(curve, 5, closed);
  curve = resample(
    curve.map((c) => c.point),
    curve.map((c) => c.t),
    2,
    closed,
  );
  curve = averageCurve(curve, 3, closed);
  if (curve.length < 2) return [];
  const forwards = stableForwards(
    curve.map((c) => c.point),
    closed,
  );
  const curvatures = smoothScalars(
    signedCurvatures(
      curve.map((c) => c.point),
      forwards,
      closed,
    ),
    4,
    closed,
  );
  const times = arcLengthParameters(
    curve.map((c) => c.point),
    closed,
  );
  return curve.map((item, index) => {
    const curvature = curvatures[index]!;
    return {
      point: item.point,
      t: times[index]!,
      forward: forwards[index]!,
      curvature,
      radius: 1 / Math.max(0.0004, Math.abs(curvature)),
    };
  });
}

function edgeWobble(
  t: number,
  side: number,
  width: number,
  style: WashStyle,
  layer: number,
  closed: boolean,
): number {
  const amount = style.bleed * 0.7 + style.variation * 0.55;
  if (!(amount > 0.02)) return 0;
  const seed = uadd(uadd(BigInt(style.seed), umul(BigInt(layer), 19n)), BigInt(side > 0 ? 5 : 31));
  const low = signedNoise(t, 4.2, seed, closed);
  const mid = signedNoise(t, 8.5, uadd(seed, 13n), closed);
  const high = signedNoise(t, 15, uadd(seed, 27n), closed);
  let wobble = (low * 0.55 + mid * 0.32 + high * 0.28) * width * 0.42 * amount;
  const gate = noiseUnit(t * 6.5 + (side > 0 ? 0.4 : 1.7), uadd(seed, 47n));
  if (gate > 0.66) wobble += ((gate - 0.66) / 0.34) * width * 0.28 * amount;
  const dry = noiseUnit(t * 8.4 + (side > 0 ? 0.2 : 2.4), uadd(seed, 90n));
  if (dry < 0.28) wobble -= width * 0.22 * amount * ((0.28 - dry) / 0.28);
  const inward = -width * 0.2 * amount;
  if (wobble < inward) wobble = inward;
  return wobble * (closed ? 1 : tipFade(t));
}

function stations(
  samples: StrokeSample[],
  closed: boolean,
  width: number,
  brush: WashBrush,
  style: WashStyle,
  layer: number,
): Station[] {
  const center = smoothWhole(samples, closed);
  if (center.length < 2) return [];
  const halves = smoothScalars(
    center.map((sample) => {
      const tip = effectiveWidth(brush.tip, width, sample.forward);
      const end = closed ? 1 : tipScale(sample.t);
      return Math.max(0.2, tip * 0.5 * end);
    }),
    6,
    closed,
  );
  let lefts = [...halves];
  let rights = [...halves];
  center.forEach((sample, index) => {
    const half = halves[index]!;
    if (!(sample.radius < half * 1.05)) return;
    const limit = Math.max(half * 0.72, sample.radius * 0.92);
    if (sample.curvature > 0) lefts[index] = Math.min(half, limit);
    else if (sample.curvature < 0) rights[index] = Math.min(half, limit);
  });
  lefts = smoothScalars(lefts, 8, closed);
  rights = smoothScalars(rights, 8, closed);
  return center.map((sample, index) => {
    let left = lefts[index]!;
    let right = rights[index]!;
    const leftWobble = edgeWobble(sample.t, 1, width, style, 0, closed);
    const rightWobble = edgeWobble(sample.t, -1, width, style, 0, closed);
    if (layer === 0) {
      left += leftWobble;
      right += rightWobble;
    } else {
      const flutter =
        signedNoise(sample.t, 11, uadd(BigInt(style.seed), umul(BigInt(layer), 23n)), closed) *
        width *
        0.012;
      const step = width * 0.012 * layer + flutter;
      left += leftWobble + step;
      right += rightWobble + step;
    }
    left = Math.max(0.35, left);
    right = Math.max(0.35, right);
    const normal = sample.forward + Math.PI / 2;
    const nx = Math.cos(normal);
    const ny = Math.sin(normal);
    return {
      center: sample.point,
      forward: sample.forward,
      outerLeft: { x: sample.point.x + nx * left, y: sample.point.y + ny * left },
      outerRight: { x: sample.point.x - nx * right, y: sample.point.y - ny * right },
      outerRadius: Math.max(left, right),
      curvature: sample.curvature,
      t: sample.t,
    };
  });
}

function cap(from: Point, center: Point, to: Point, forward: number): Point[] {
  const start = Math.atan2(from.y - center.y, from.x - center.x);
  const end = Math.atan2(to.y - center.y, to.x - center.x);
  let sweep = end - start;
  if (sweep > Math.PI) sweep -= 2 * Math.PI;
  if (sweep < -Math.PI) sweep += 2 * Math.PI;
  const mid = start + sweep / 2;
  const delta = Math.atan2(Math.sin(mid - forward), Math.cos(mid - forward));
  if (Math.abs(delta) > Math.PI / 2) sweep += sweep > 0 ? -2 * Math.PI : 2 * Math.PI;
  const startRadius = hypot(center, from);
  const endRadius = hypot(center, to);
  const points: Point[] = [];
  for (let step = 1; step <= 8; step++) {
    const u = step / 8;
    const angle = start + sweep * u;
    const radius = startRadius * (1 - u) + endRadius * u;
    points.push({ x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius });
  }
  return points;
}

function ribbon(rows: Station[], closed: boolean): Path {
  const first = rows[0];
  const last = rows[rows.length - 1];
  if (!first || !last) return [];
  const left = rows.map((row) => row.outerLeft);
  const right = rows.map((row) => row.outerRight);
  const points = [...left];
  if (!closed)
    points.push(
      ...cap(left[left.length - 1]!, last.center, right[right.length - 1]!, last.forward),
    );
  else points.push(right[right.length - 1]!);
  for (let i = right.length - (closed ? 1 : 2); i >= 0; i--) points.push(right[i]!);
  if (!closed) points.push(...cap(right[0]!, first.center, left[0]!, first.forward + Math.PI));
  return linePath(points);
}

function sideRim(
  start: Station,
  end: Station,
  side: number,
  presence: number,
  opacity: number,
): WashPiece[] {
  const startOuter = side > 0 ? start.outerLeft : start.outerRight;
  const endOuter = side > 0 ? end.outerLeft : end.outerRight;
  const startHalf = Math.max(0.5, hypot(start.center, startOuter));
  const endHalf = Math.max(0.5, hypot(end.center, endOuter));
  const startDepth = Math.min(startHalf * 0.62, startHalf * (0.1 + 0.28 * presence));
  const endDepth = Math.min(endHalf * 0.62, endHalf * (0.1 + 0.28 * presence));
  const mix = (from: Point, to: Point, amount: number): Point => ({
    x: from.x + (to.x - from.x) * amount,
    y: from.y + (to.y - from.y) * amount,
  });
  const startMid = mix(startOuter, start.center, startDepth / startHalf);
  const endMid = mix(endOuter, end.center, endDepth / endHalf);
  const startDeep = mix(startOuter, start.center, Math.min(0.7, (startDepth * 2.4) / startHalf));
  const endDeep = mix(endOuter, end.center, Math.min(0.7, (endDepth * 2.4) / endHalf));
  return [
    { path: linePath([startOuter, endOuter, endMid, startMid]), opacity },
    { path: linePath([startMid, endMid, endDeep, startDeep]), opacity: opacity * 0.55 },
  ];
}

function brokenRim(
  rows: Station[],
  pigment: number,
  darkening: number,
  seed: bigint,
  closed: boolean,
): WashPiece[] {
  if (!(darkening > 0.02) || rows.length < 2) return [];
  const pieces: WashPiece[] = [];
  const limit = closed ? rows.length : rows.length - 1;
  for (let index = 0; index < limit; index++) {
    const start = rows[index]!;
    const end = rows[(index + 1) % rows.length]!;
    if (start.cornerIn !== undefined || end.cornerIn !== undefined) continue;
    const gate = noiseUnit(start.t * 3.4, uadd(seed, 71n));
    const flicker = noiseUnit(start.t * 9.5, uadd(seed, 93n));
    const presence = Math.max(0, (gate - 0.22) / 0.78) * (0.25 + 0.75 * flicker);
    if (presence < 0.18) continue;
    const pool = noiseUnit(start.t * 5.1, uadd(seed, 5n));
    const opacity = Math.min(
      1,
      pigment * (0.12 + 0.7 * darkening) * presence * (0.35 + 1.2 * pool),
    );
    for (const side of [1, -1]) {
      const turn = (start.curvature + end.curvature) * 0.5;
      const inside = turn > 0.02 ? 1 : turn < -0.02 ? -1 : 0;
      if (inside !== 0 && side === inside && Math.abs(turn) > 0.045) continue;
      const sidePool = side > 0 ? opacity : opacity * (0.55 + 0.45 * pool);
      pieces.push(...sideRim(start, end, side, presence, sidePool));
    }
  }
  return pieces;
}

function sampleCenter(center: Smooth[], t: number): Smooth {
  const first = center[0]!;
  const last = center[center.length - 1]!;
  if (center.length < 2 || t <= first.t) return first;
  if (t >= last.t) return last;
  let low = 0;
  let high = center.length - 1;
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (center[mid]!.t < t) low = mid;
    else high = mid;
  }
  const start = center[low]!;
  const end = center[high]!;
  const span = Math.max(0.0001, end.t - start.t);
  const u = Math.min(1, Math.max(0, (t - start.t) / span));
  return {
    point: {
      x: start.point.x + (end.point.x - start.point.x) * u,
      y: start.point.y + (end.point.y - start.point.y) * u,
    },
    t,
    forward: Math.atan2(
      Math.sin(start.forward) * (1 - u) + Math.sin(end.forward) * u,
      Math.cos(start.forward) * (1 - u) + Math.cos(end.forward) * u,
    ),
    curvature: start.curvature * (1 - u) + end.curvature * u,
    radius: start.radius * (1 - u) + end.radius * u,
  };
}

function alongOpacity(t: number, closed: boolean, brush: WashBrush, strokeOpacity: number): number {
  const join = opacityAt(brush.opacityProfile, 0, true);
  const raw = opacityAt(brush.opacityProfile, t, closed);
  const blended = closed ? seamBlend(raw, join, t, 0.08) : raw;
  return Math.min(1, Math.max(0, blended * strokeOpacity));
}

/**
 * Watercolor outline washes. Sketchy's `WatercolorStroke.commands`: pale layers first,
 * then the edged body, granules, and bleed blooms. Pieces stack with normal alpha.
 */
export function watercolorStrokePieces(
  path: Path,
  width: number,
  brush: WashBrush,
  style: WashStyle,
  strokeOpacity: number,
): WashPiece[] {
  if (width < 0.5 || !(strokeOpacity > 0) || !(style.pigment > 0)) return [];
  const lines = centerlines(path);
  const line = lines.reduce<(typeof lines)[number] | undefined>((best, item) => {
    if (!best || item.samples.length > best.samples.length) return item;
    return best;
  }, undefined);
  if (!line) return [];
  const pieces: WashPiece[] = [];
  for (let layer = style.layers - 1; layer >= 0; layer--) {
    const rows = stations(line.samples, line.closed, width, brush, style, layer);
    if (rows.length < 2) continue;
    const darkening = style.edgeDarkening;
    const pigment = style.pigment * (1 - 0.12 * layer);
    const core = Math.min(1, pigment * (0.34 + 0.08 * (1 - darkening)) * strokeOpacity);
    pieces.push({ path: ribbon(rows, line.closed), opacity: core });
    if (layer === 0) {
      pieces.push(
        ...brokenRim(
          rows,
          pigment * strokeOpacity,
          darkening,
          uadd(BigInt(style.seed), umul(BigInt(layer), 17n)),
          line.closed,
        ),
      );
    }
  }
  const smooth = smoothWhole(line.samples, line.closed);
  if (smooth.length >= 2) {
    const speckCount = 11 + Math.round(style.variation * 6);
    for (let index = 0; index < speckCount; index++) {
      const seed = uadd(BigInt(style.seed), umul(BigInt(index), 0x9e3779b97f4a7c15n));
      const along = noiseUnit(index, uadd(seed, 41n));
      const across = signedNoise(index, 1, uadd(seed, 87n), false);
      const size = noiseUnit(index, uadd(seed, 13n));
      const tone = noiseUnit(index, uadd(seed, 59n));
      const t = line.closed ? along : 0.07 + along * 0.86;
      const sample = sampleCenter(smooth, t);
      const half = Math.max(
        0.2,
        effectiveWidth(brush.tip, width, sample.forward) *
          0.5 *
          (line.closed ? 1 : tipScale(sample.t)),
      );
      const radius = half * (0.04 + 0.07 * size);
      if (radius < 0.3) continue;
      const normal = sample.forward + Math.PI / 2;
      const reach = across * half * 0.62;
      const fade = line.closed ? 1 : tipScale(sample.t);
      const opacity =
        style.pigment *
        alongOpacity(sample.t, line.closed, brush, strokeOpacity) *
        fade *
        (0.12 + 0.16 * tone);
      pieces.push({
        path: ellipsePath(
          sample.point.x + Math.cos(normal) * reach,
          sample.point.y + Math.sin(normal) * reach,
          0,
          radius * 2,
          radius * 2,
        ),
        opacity: Math.min(1, opacity),
      });
    }
  }
  return pieces.filter((piece) => piece.opacity > 0.004 && piece.path.length > 0);
}
