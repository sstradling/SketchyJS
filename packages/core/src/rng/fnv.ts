const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = (1n << 64n) - 1n;

/** 64-bit FNV-1a over the UTF-8 bytes of `label`. Used to key `Rng.fork`. */
export function fnv1a64(label: string): bigint {
  let hash = FNV_OFFSET;
  for (const byte of new TextEncoder().encode(label)) {
    hash ^= BigInt(byte);
    hash = (hash * FNV_PRIME) & MASK_64;
  }
  return hash;
}
