const MASK_64 = (1n << 64n) - 1n;
const GAMMA = 0x9e3779b97f4a7c15n;
const MIX_1 = 0xbf58476d1ce4e5b9n;
const MIX_2 = 0x94d049bb133111ebn;

/** Wraps `value` to an unsigned 64-bit integer, like Swift's `&+` and `&*` results. */
export function wrap64(value: bigint): bigint {
  return value & MASK_64;
}

/**
 * The SplitMix64 output function (Steele, Lea and Flood). Also used by `Rng.fork` to turn a
 * 64-bit key into a well-mixed key.
 */
export function mix64(value: bigint): bigint {
  let z = wrap64(value);
  z = wrap64((z ^ (z >> 30n)) * MIX_1);
  z = wrap64((z ^ (z >> 27n)) * MIX_2);
  return z ^ (z >> 31n);
}

/**
 * SplitMix64 generator, bit-exact with Sketchy's `SplitMix64` (Swift `RandomNumberGenerator`).
 *
 * State is a `bigint` masked to 64 bits after every step. For seed 42 the first outputs are
 * 13679457532755275413, 2949826092126892291, 5139283748462763858, 6349198060258255764.
 */
export class SplitMix64 {
  #state: bigint;

  /** Creates a generator. `seed` is wrapped modulo 2^64, so negative values are accepted. */
  constructor(seed: bigint) {
    this.#state = wrap64(seed);
  }

  /** Advances the state and returns the next unsigned 64-bit value. */
  nextU64(): bigint {
    this.#state = wrap64(this.#state + GAMMA);
    return mix64(this.#state);
  }

  /** Current state, for tests and diagnostics. */
  get state(): bigint {
    return this.#state;
  }
}
