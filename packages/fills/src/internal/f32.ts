/**
 * `Float` (binary32) arithmetic helpers for the Swift-parity fills. Every Swift operation that
 * stores a `Float` is written `f(a op b)`. See `@sketchy-js/core` `f32.ts` for the rationale; the
 * copy exists because fills depend only on `@sketchy-js/plugin`.
 */
export const f = Math.fround;
/** Swift `Float.pi` = 0x40490fda: the stdlib constant is truncated, not rounded to nearest (Math.fround(Math.PI) would be 0x40490fdb). */
export const PI = 3.1415925025939941;
export const sinf = (x: number): number => f(Math.sin(x));
export const cosf = (x: number): number => f(Math.cos(x));
export const tanf = (x: number): number => f(Math.tan(x));
export const atan2f = (y: number, x: number): number => f(Math.atan2(y, x));
export const sqrtf = (x: number): number => f(Math.sqrt(x));
export const hypotf = (x: number, y: number): number => f(Math.hypot(x, y));
/** `Float.greatestFiniteMagnitude`. */
export const FLOAT_MAX = 3.4028234663852886e38;
/** Swift `Int(x)` for a finite `Float`: truncation toward zero. Non-finite input yields 0. */
export const toInt = (x: number): number => (Number.isFinite(x) ? Math.trunc(x) : 0);
