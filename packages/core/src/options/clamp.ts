import type { NumericRule } from "./rule.js";

/**
 * Swift `max(lo, x)`: returns `x` when `x >= lo`, otherwise `lo`. NaN therefore becomes `lo`,
 * which differs from `Math.max` (NaN propagates). `min(hi, x)` is `x < hi ? x : hi`.
 */
export function swiftClamp(
  value: number,
  min: number | undefined,
  max: number | undefined,
): number {
  let result = value;
  if (min !== undefined) result = result >= min ? result : min;
  if (max !== undefined) result = result < max ? result : max;
  return result;
}

/**
 * Applies a rule the way the Swift initializer or modifier does.
 *
 * Integer rules never receive NaN or infinity (Swift cannot represent them); float rules are
 * rounded to 32-bit precision after clamping.
 */
export function applyRule(value: number, rule: NumericRule): number {
  if (rule.nonFiniteTo !== undefined && !Number.isFinite(value)) return rule.nonFiniteTo;
  const clamped = swiftClamp(value, rule.min, rule.max);
  if (rule.type === "float") return Math.fround(clamped);
  if (rule.type === "int") return Math.trunc(clamped);
  return clamped;
}

/** `StickerImage.resolvedTileWidth`: repeat width after the 4-point minimum. */
export function resolveTileWidth(scale: number, imageWidth: number): number {
  const natural = Math.max(imageWidth, 1);
  return Math.max(4, scale > 0 ? scale : natural);
}

/**
 * `StickerImage.resolvedFitScale`. A non-positive or non-finite scale means 1
 * ("fit the bounds"). The 0.05 floor is applied later, when the rect is drawn.
 */
export function resolveFitScale(scale: number): number {
  return scale > 0 && Number.isFinite(scale) ? scale : 1;
}

/** `Options.effectiveFillWeight`: `-1` means half the stroke width, at least 1. */
export function effectiveFillWeight(strokeWidth: number, fillWeight: number): number {
  const result = fillWeight < 0 ? Math.max(strokeWidth / 2, 1) : fillWeight;
  return Math.fround(result);
}

/** `Options.computedHachureGap`: effective fill weight times spacing clamped to 0.5...100. */
export function computedHachureGap(
  strokeWidth: number,
  fillWeight: number,
  fillSpacing: number,
): number {
  const weight = effectiveFillWeight(strokeWidth, fillWeight);
  const spacing = swiftClamp(fillSpacing, 0.5, 100);
  return Math.fround(weight * spacing);
}
