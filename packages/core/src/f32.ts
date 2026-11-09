/**
 * Swift `Float` arithmetic helpers.
 *
 * Sketchy's generators run in 32-bit `Float`. JavaScript numbers are doubles, so every Swift
 * operation that stores a `Float` is written as `f(a op b)`. Rounding after each single
 * operation matches IEEE 754 binary32 for `+ - * / sqrt`; `sin`, `cos`, `tan` and `atan2` are
 * computed in double precision and then rounded, which stays within one binary32 ulp of the
 * platform `sinf` family (see docs/phase-1.md for the measured Darwin deltas).
 */
export const f = Math.fround;

/** Swift `Float.pi` = 0x40490fda: the stdlib constant is truncated, not rounded to nearest (Math.fround(Math.PI) would be 0x40490fdb). */
export const PI = 3.1415925025939941;

/** `Float` sine. */
export const sinf = (x: number): number => f(Math.sin(x));
/** `Float` cosine. */
export const cosf = (x: number): number => f(Math.cos(x));
/** `Float` tangent. */
export const tanf = (x: number): number => f(Math.tan(x));
/** `Float` arctangent of `y / x`. */
export const atan2f = (y: number, x: number): number => f(Math.atan2(y, x));
/** `Float` square root. */
export const sqrtf = (x: number): number => f(Math.sqrt(x));
/** Swift `hypot(Float, Float)`. */
export const hypotf = (x: number, y: number): number => f(Math.hypot(x, y));

/** Largest finite `Float` (`Float.greatestFiniteMagnitude`). */
export const FLOAT_MAX = 3.4028234663852886e38;
