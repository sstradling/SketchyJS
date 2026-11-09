import type { Rng as PluginRng } from "@sketchy/plugin";
import type { Seed } from "@sketchy/types";
import { fnv1a64 } from "./fnv.js";
import { SplitMix64, mix64, wrap64 } from "./splitmix64.js";
import { swiftDoubleInRange, swiftFloatInRange, swiftUnitFloat } from "./swift-random.js";

/** Converts a `Seed` to an unsigned 64-bit `bigint`; rejects non-integers and unsafe numbers. */
export function seedToBigInt(seed: Seed): bigint {
  if (typeof seed === "bigint") return wrap64(seed);
  if (!Number.isSafeInteger(seed) || seed < 0) {
    throw new RangeError(`seed must be a non-negative safe integer or a bigint, got ${seed}`);
  }
  return BigInt(seed);
}

const TWO_POW_53 = 9_007_199_254_740_992;

/**
 * Deterministic random stream implementing the plugin `Rng` contract.
 *
 * - `next()` is a 53-bit uniform double in `[0, 1)` and consumes one 64-bit value.
 * - `fork(label)` is pure: the child key depends only on this stream's key and the label, never
 *   on how many values were drawn. The child key is `mix64(key XOR fnv1a64(label))`.
 * - The Swift-parity methods (`swiftUnit`, `swiftFloat`, `swiftDouble`) reproduce Sketchy's
 *   `Float.random(in:using:)` and `Double.random(in:using:)` draws bit for bit. Built-in fills
 *   that share one stream with the outline use them.
 */
export class Rng implements PluginRng {
  readonly #source: SplitMix64;
  readonly #key: bigint;

  /** Creates a stream. A fresh `Rng` from the same seed always produces the same values. */
  constructor(seed: Seed) {
    const key = seedToBigInt(seed);
    this.#key = key;
    this.#source = new SplitMix64(key);
  }

  /** Raw unsigned 64-bit draw. */
  nextU64(): bigint {
    return this.#source.nextU64();
  }

  next(): number {
    return Number(this.#source.nextU64() >> 11n) / TWO_POW_53;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  int(minInclusive: number, maxExclusive: number): number {
    const span = Math.floor(maxExclusive) - Math.ceil(minInclusive);
    if (!(span > 0)) return Math.ceil(minInclusive);
    return Math.ceil(minInclusive) + Math.min(span - 1, Math.floor(this.next() * span));
  }

  /** Box-Muller transform. Consumes two draws and discards the second variate. */
  normal(mean = 0, sd = 1): number {
    const u1 = 1 - this.next();
    const u2 = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly [T, ...T[]]): T {
    const index = this.int(0, items.length);
    return items[index] as T;
  }

  fork(label: string): Rng {
    return new Rng(mix64(this.#key ^ fnv1a64(label)));
  }

  /** `Float.random(in: 0...1)` as `RoughRandom.unit()`. May consume more than one 64-bit value. */
  swiftUnit(): number {
    return swiftUnitFloat(this.#source);
  }

  /** `Float.random(in: lower...upper)`. */
  swiftFloat(lower: number, upper: number): number {
    return swiftFloatInRange(this.#source, lower, upper);
  }

  /** `Double.random(in: lower...upper)` (Swift `CGFloat`). */
  swiftDouble(lower: number, upper: number): number {
    return swiftDoubleInRange(this.#source, lower, upper);
  }
}
