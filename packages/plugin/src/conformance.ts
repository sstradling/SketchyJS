/** Runs a plugin callback while making accidental unseeded randomness fail loudly. */
/* eslint-disable no-restricted-syntax -- this helper deliberately replaces Math.random. */
export function withRandomGuard<T>(callback: () => T): T {
  const original = Math.random;
  Math.random = () => {
    throw new Error("plugin used Math.random(); use ctx.rng instead");
  };
  try {
    return callback();
  } finally {
    Math.random = original;
  }
}
/* eslint-enable no-restricted-syntax */

/** Checks the two minimum plugin conformance guarantees needed by Phase 1. */
export function assertDeterministic<T>(generate: () => T): void {
  const first = withRandomGuard(generate);
  const second = withRandomGuard(generate);
  if (JSON.stringify(first) !== JSON.stringify(second))
    throw new Error("plugin output is not deterministic for the same input and seed");
}
