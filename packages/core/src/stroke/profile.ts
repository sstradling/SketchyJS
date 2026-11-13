import type {
  BrushTip,
  OpacityProfile,
  OpacityStop,
  ThicknessProfile,
  VariableStrokeWidth,
  WidthStop,
} from "@sketchy-js/types";

const MASK = (1n << 64n) - 1n;

const u64 = (n: bigint): bigint => n & MASK;

/** Wrapping add, Swift `&+` on `UInt64`. */
const add = (a: bigint, b: bigint): bigint => u64(a + b);

/** Wrapping multiply, Swift `&*` on `UInt64`. */
const mul = (a: bigint, b: bigint): bigint => u64(a * b);

/**
 * SplitMix mix of `(seed, lattice index)` into `[0, 1)`.
 * Shared by `SeededNoise` and `VariableStrokeWidth`.
 */
function hashUnit(index: bigint, seed: bigint): number {
  let z = add(seed, mul(index, 0x9e3779b97f4a7c15n));
  z = mul(z ^ (z >> 30n), 0xbf58476d1ce4e5b9n);
  z = mul(z ^ (z >> 27n), 0x94d049bb133111ebn);
  z = z ^ (z >> 31n);
  return Math.fround(Number(z >> 40n) / 16777216);
}

/** 1-D value noise in `[0, 1)`. `x` is in noise cycles. Sketchy's `SeededNoise.unit`. */
export function noiseUnit(x: number, seed: bigint): number {
  const i = Math.floor(x);
  const fraction = x - i;
  const fade = fraction * fraction * (3 - 2 * fraction);
  const left = hashUnit(BigInt(i), seed);
  const right = hashUnit(BigInt(i) + 1n, seed);
  return left + (right - left) * fade;
}

/** Value noise that repeats every `period` lattice cells. `SeededNoise.unitPeriodic`. */
export function noiseUnitPeriodic(x: number, period: number, seed: bigint): number {
  const cells = Math.max(1, period);
  const span = cells;
  let wrapped = x % span;
  if (wrapped < 0) wrapped += span;
  const i = Math.floor(wrapped);
  const fraction = wrapped - i;
  const fade = fraction * fraction * (3 - 2 * fraction);
  const leftIndex = i % cells;
  const rightIndex = (leftIndex + 1) % cells;
  const left = hashUnit(BigInt(leftIndex), seed);
  const right = hashUnit(BigInt(rightIndex), seed);
  return left + (right - left) * fade;
}

/** Smooth value in `[-1, 1]`. `SeededNoise.signed`. */
export function noiseSigned(x: number, seed: bigint): number {
  return noiseUnit(x, seed) * 2 - 1;
}

/** Pulls `value` toward `join` within `window` of either end. Sketchy's `seamBlend`. */
export function seamBlend(value: number, join: number, t: number, window: number): number {
  if (!(window > 0)) return value;
  const edge = Math.min(Math.max(0, t), Math.max(0, 1 - t));
  if (edge >= window) return value;
  const mix = edge / window;
  const smooth = mix * mix * (3 - 2 * mix);
  return join + (value - join) * smooth;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function interpolate(values: readonly number[], t: number): number {
  if (values.length === 0) return 1;
  const first = values[0] ?? 1;
  if (values.length === 1) return first;
  const scaled = t * (values.length - 1);
  const lower = Math.floor(scaled);
  const upper = Math.min(lower + 1, values.length - 1);
  const fraction = scaled - lower;
  const a = values[lower] ?? first;
  const b = values[upper] ?? a;
  return a + (b - a) * fraction;
}

interface ResolvedVariable {
  amount: number;
  minimum: number;
  maximum: number;
  taperStart: number;
  taperEnd: number;
  pressure: readonly number[];
  seed: bigint;
  frequency: number;
}

/**
 * Resolves the public `VariableStrokeWidth` arguments the way Swift's initializer does.
 * `amount` is how much of `[minimum, maximum]` the noise uses. Variation alone is the
 * whole span, so the amount is 1. Explicit bounds with variation 0 also use the whole span.
 */
function resolveVariable(width: VariableStrokeWidth): ResolvedVariable {
  const variation = Math.min(1, Math.max(0, width.variation));
  const explicit = width.minimum !== undefined || width.maximum !== undefined;
  let minimum = 1;
  let maximum = 1;
  let amount = 0;
  if (explicit || variation > 0) {
    const lower = width.minimum ?? 1 - variation;
    const upper = width.maximum ?? 1 + variation;
    minimum = Math.min(lower, upper);
    maximum = Math.max(lower, upper);
    amount = explicit ? (variation > 0 ? variation : 1) : 1;
  } else if (width.pressure.length > 0 || width.taperStart > 0 || width.taperEnd > 0) {
    const peak = width.pressure.reduce((m, v) => Math.max(m, v), 1);
    minimum = 0;
    maximum = Math.max(1, peak);
    amount = 0;
  }
  return {
    amount,
    minimum,
    maximum,
    taperStart: Math.min(1, Math.max(0, width.taperStart)),
    taperEnd: Math.min(1, Math.max(0, width.taperEnd)),
    pressure: width.pressure,
    seed: BigInt(width.seed),
    frequency: Math.max(0.5, width.frequency),
  };
}

/** Width multiplier of a variable profile. Sketchy's `VariableStrokeWidth.multiplier`. */
export function variableMultiplier(width: VariableStrokeWidth, t: number): number {
  const resolved = resolveVariable(width);
  const clamped = clamp01(t);
  const body = noisyBody(resolved, clamped);
  const pressure = resolved.pressure.length === 0 ? 1 : interpolate(resolved.pressure, clamped);
  const taper = Math.min(
    taperIn(resolved.taperStart, clamped),
    taperOut(resolved.taperEnd, clamped),
  );
  const raw = body * pressure * taper;
  const floor = resolved.taperStart > 0 || resolved.taperEnd > 0 ? 0 : resolved.minimum;
  return Math.min(resolved.maximum, Math.max(floor, raw));
}

function noisyBody(width: ResolvedVariable, t: number): number {
  if (!(width.amount > 0)) return 1;
  if (!(width.maximum > width.minimum)) return width.minimum;
  const noise = noiseSigned(t * width.frequency, width.seed);
  const center = (width.minimum + width.maximum) / 2;
  const half = (width.maximum - width.minimum) / 2;
  return center + noise * half * Math.min(width.amount, 1);
}

function taperIn(start: number, t: number): number {
  if (!(start > 0)) return 1;
  return t < start ? t / start : 1;
}

function taperOut(end: number, t: number): number {
  if (!(end > 0)) return 1;
  const endStart = 1 - end;
  return t > endStart ? (1 - t) / end : 1;
}

/** Absolute width through stops. Empty stops return `undefined`. */
export function widthAtStops(stops: readonly WidthStop[], t: number): number | undefined {
  if (stops.length === 0) return undefined;
  const clamped = clamp01(t);
  const sorted = [...stops].sort((a, b) => a.position - b.position);
  const collapsed: WidthStop[] = [];
  for (const stop of sorted) {
    const last = collapsed[collapsed.length - 1];
    if (last && last.position === stop.position) collapsed[collapsed.length - 1] = stop;
    else collapsed.push(stop);
  }
  const first = collapsed[0];
  const last = collapsed[collapsed.length - 1];
  if (!first || !last) return undefined;
  if (clamped <= first.position) return first.width;
  if (clamped >= last.position) return last.width;
  for (let i = 1; i < collapsed.length; i++) {
    const right = collapsed[i]!;
    if (clamped <= right.position) {
      const left = collapsed[i - 1]!;
      const span = right.position - left.position;
      if (span <= 0) return right.width;
      const fraction = (clamped - left.position) / span;
      return left.width + (right.width - left.width) * fraction;
    }
  }
  return last.width;
}

/** Thickness multiplier at `t`. `.stops` returns 1; use `thicknessWidth` for point widths. */
export function thicknessMultiplier(profile: ThicknessProfile, t: number): number {
  const clamped = clamp01(t);
  switch (profile.kind) {
    case "uniform":
      return 1;
    case "taperIn":
      return taperIn(profile.start, clamped);
    case "taperOut":
      return taperOut(profile.end, clamped);
    case "taperBoth":
      return Math.min(taperIn(profile.start, clamped), taperOut(profile.end, clamped));
    case "pressure":
    case "custom":
      return interpolate(profile.values, clamped);
    case "variable":
      return variableMultiplier(profile.width, clamped);
    case "stops":
      return 1;
  }
}

/** Stroke width in points at `t`. Non-empty stops ignore `strokeWidth`. */
export function thicknessWidth(profile: ThicknessProfile, t: number, strokeWidth: number): number {
  if (profile.kind === "stops") return widthAtStops(profile.stops, t) ?? strokeWidth;
  return thicknessMultiplier(profile, t) * strokeWidth;
}

/** True when an open stroke should vary its width. */
export function thicknessVaries(profile: ThicknessProfile): boolean {
  if (profile.kind === "uniform") return false;
  if (profile.kind === "stops") return profile.stops.length > 0;
  return true;
}

/**
 * Effective width of an elliptical tip. A circular tip, or one that is not
 * direction sensitive, returns `baseWidth`. Sketchy's `BrushTip.effectiveWidth`.
 */
export function effectiveWidth(tip: BrushTip, baseWidth: number, strokeAngle: number): number {
  if (!tip.directionSensitive || tip.roundness >= 1) return baseWidth;
  const a = baseWidth / 2;
  const b = a * tip.roundness;
  const relative = strokeAngle - tip.angle;
  const cosTheta = Math.cos(relative);
  const sinTheta = Math.sin(relative);
  const denominator = Math.sqrt((b * cosTheta) ** 2 + (a * sinTheta) ** 2);
  if (denominator <= 0.001) return baseWidth;
  return (2 * a * b) / denominator;
}

function opacityInterpolate(stops: readonly OpacityStop[], t: number): number {
  if (stops.length === 0) return 1;
  const ordered = [...stops].sort((a, b) => a.position - b.position);
  const first = ordered[0]!;
  if (t <= first.position) return first.opacity;
  for (let i = 1; i < ordered.length; i++) {
    const right = ordered[i]!;
    if (t > right.position) continue;
    const left = ordered[i - 1]!;
    const span = right.position - left.position;
    if (span <= 0.000001) return right.opacity;
    const fraction = (t - left.position) / span;
    return left.opacity + (right.opacity - left.opacity) * fraction;
  }
  return ordered[ordered.length - 1]!.opacity;
}

/** Opacity multiplier at `t`, not including `strokeOpacity`. Sketchy's `OpacityProfile.value`. */
export function opacityAt(profile: OpacityProfile, t: number, periodic = false): number {
  const clamped = clamp01(t);
  switch (profile.kind) {
    case "uniform":
      return 1;
    case "values":
      return clamp01(interpolate(profile.values.map(clamp01), clamped));
    case "stops":
      return clamp01(opacityInterpolate(profile.stops, clamped));
    case "noise": {
      const { minimum, maximum, variation, seed, frequency } = profile.noise;
      if (!(maximum > minimum) || !(variation > 0)) return (minimum + maximum) / 2;
      const noise = periodic
        ? noiseUnitPeriodic(
            clamped * Math.max(1, Math.round(frequency)),
            Math.max(1, Math.round(frequency)),
            BigInt(seed),
          )
        : noiseUnit(clamped * frequency, BigInt(seed));
      const signed = noise * 2 - 1;
      const mid = (minimum + maximum) / 2;
      const half = (maximum - minimum) / 2;
      return clamp01(Math.min(maximum, Math.max(minimum, mid + signed * half * variation)));
    }
  }
}

/** True when opacity is not a single constant. Sketchy's `variesAlongStroke`. */
export function opacityVaries(profile: OpacityProfile): boolean {
  switch (profile.kind) {
    case "uniform":
      return false;
    case "values": {
      const values = profile.values.map(clamp01);
      const first = values[0];
      if (first === undefined) return false;
      return values.some((v) => Math.abs(v - first) > 0.000001);
    }
    case "stops": {
      const first = profile.stops[0];
      if (!first) return false;
      return profile.stops.some((s) => Math.abs(s.opacity - first.opacity) > 0.000001);
    }
    case "noise":
      return (
        profile.noise.variation > 0 && profile.noise.maximum - profile.noise.minimum > 0.000001
      );
  }
}
