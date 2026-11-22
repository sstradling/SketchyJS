const MASK = (1n << 64n) - 1n;

const add = (a: bigint, b: bigint): bigint => (a + b) & MASK;
const mul = (a: bigint, b: bigint): bigint => (a * b) & MASK;

/**
 * Mixes a drawing seed with a slot so each contour stroke keeps its own sequence.
 * Sketchy's `ContourField.mix`. The slot is an `Int`; a negative value uses the
 * two's-complement bit pattern, matching `UInt64(bitPattern:)`.
 */
export function mixSeed(seed: bigint, slot: number): bigint {
  const slotBits = BigInt(Math.trunc(slot)) & MASK;
  let x = add(seed & MASK, 0x9e3779b97f4a7c15n);
  x = x ^ mul(slotBits, 0xbf58476d1ce4e5b9n);
  x = mul(x ^ (x >> 30n), 0xbf58476d1ce4e5b9n);
  x = mul(x ^ (x >> 27n), 0x94d049bb133111ebn);
  return x ^ (x >> 31n);
}
