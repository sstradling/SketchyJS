/**
 * A deterministic seed. `bigint` covers the full unsigned 64-bit range that Swift's `UInt64` seeds
 * use. A `number` must be a non-negative safe integer. In JSON a seed is a non-negative safe
 * integer or a decimal string.
 */
export type Seed = bigint | number;

/** Seed in its serialized form: a non-negative safe integer or a decimal string of up to 20 digits. */
export type SerializedSeed = number | string;
