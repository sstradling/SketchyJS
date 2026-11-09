import { wrap64 } from "./splitmix64.js";

/** A source of unsigned 64-bit values; `SplitMix64` satisfies it. */
export interface U64Source {
  nextU64(): bigint;
}

const MASK_32 = 0xffff_ffffn;

/**
 * Swift's `RandomNumberGenerator.next(upperBound:)` for an unsigned integer type of `bits` width:
 * a multiply-high reduction with rejection.
 *
 * ```
 * let tmp = (T.max % upperBound) + 1
 * let range = tmp == upperBound ? 0 : tmp
 * var m = next<T>().multipliedFullWidth(by: upperBound)
 * while m.low < range { m = next<T>().multipliedFullWidth(by: upperBound) }
 * return m.high
 * ```
 *
 * For 32-bit `T`, `next<T>()` is the low 32 bits of `next()`. Each rejection consumes one more
 * 64-bit value, so draw counts are not fixed.
 */
function nextBelow(source: U64Source, upperBound: bigint, bits: 32 | 64): bigint {
  const max = bits === 32 ? MASK_32 : wrap64(-1n);
  const tmp = (max % upperBound) + 1n;
  const range = tmp === upperBound ? 0n : tmp;
  const draw = (): bigint => (bits === 32 ? source.nextU64() & MASK_32 : source.nextU64());
  for (;;) {
    const product = draw() * upperBound;
    const low = product & max;
    if (low >= range) return product >> BigInt(bits);
  }
}

/**
 * `Float.random(in: 0...1, using:)` as used by `RoughRandom.unit()`. The result is a multiple of
 * 2^-24 in `[0, 1]`. Rejection may consume more than one 64-bit value.
 */
export function swiftUnitFloat(source: U64Source): number {
  const significand = nextBelow(source, (1n << 24n) + 1n, 32);
  return Number(significand) / 16_777_216;
}

/** `Float.random(in: lower...upper, using:)`: `delta * unit + lower`, rounded to Float at each step. */
export function swiftFloatInRange(source: U64Source, lower: number, upper: number): number {
  const lo = Math.fround(lower);
  const delta = Math.fround(Math.fround(upper) - lo);
  const unit = swiftUnitFloat(source);
  return Math.fround(Math.fround(delta * unit) + lo);
}

/**
 * `Double.random(in: lower...upper, using:)` (used for `CGFloat`): a 53-bit significand reduced
 * with `next(upperBound: 2^53 + 1)` over the full 64-bit draw.
 */
export function swiftDoubleInRange(source: U64Source, lower: number, upper: number): number {
  const delta = upper - lower;
  const significand = nextBelow(source, (1n << 53n) + 1n, 64);
  return delta * (Number(significand) / 9_007_199_254_740_992) + lower;
}
