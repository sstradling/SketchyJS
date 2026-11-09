/**
 * Conformance helpers for plugin authors and for the built-in plugins' own tests.
 *
 * Each helper is a plain function that throws on failure, so it works under any test runner.
 * They check one guarantee each; docs/contributing-plugins.md section 3 lists which guarantees
 * of the full suite are implemented here and which are still planned.
 */

type Guarded = { readonly owner: object; readonly key: string; readonly label: string };

const NONDETERMINISTIC_GLOBALS = (): Guarded[] => {
  const globals = globalThis as { performance?: object; crypto?: object };
  const targets: Guarded[] = [
    { owner: Math, key: "random", label: "Math.random" },
    { owner: Date, key: "now", label: "Date.now" },
  ];
  if (globals.performance && typeof (globals.performance as { now?: unknown }).now === "function")
    targets.push({ owner: globals.performance, key: "now", label: "performance.now" });
  if (globals.crypto) {
    for (const key of ["getRandomValues", "randomUUID"] as const)
      if (typeof (globals.crypto as Record<string, unknown>)[key] === "function")
        targets.push({ owner: globals.crypto, key, label: `crypto.${key}` });
  }
  return targets;
};

/**
 * Runs a plugin callback with `Math.random`, `Date.now`, `performance.now`,
 * `crypto.getRandomValues`, and `crypto.randomUUID` replaced by functions that throw, so
 * accidental unseeded randomness or clock reads fail loudly. The originals are always restored.
 *
 * Not covered: `new Date()` with no arguments, and DOM or Canvas globals.
 */
export function withRandomGuard<T>(callback: () => T): T {
  const saved: { target: Guarded; descriptor: PropertyDescriptor | undefined }[] = [];
  for (const target of NONDETERMINISTIC_GLOBALS()) {
    saved.push({ target, descriptor: Object.getOwnPropertyDescriptor(target.owner, target.key) });
    Object.defineProperty(target.owner, target.key, {
      configurable: true,
      writable: true,
      value: () => {
        throw new Error(`plugin used ${target.label}(); use ctx.rng instead`);
      },
    });
  }
  try {
    return callback();
  } finally {
    for (const { target, descriptor } of saved.reverse()) {
      if (descriptor) Object.defineProperty(target.owner, target.key, descriptor);
      else Reflect.deleteProperty(target.owner, target.key);
    }
  }
}

/** Checks repeatability: two guarded runs of `generate` must give identical JSON. */
export function assertDeterministic<T>(generate: () => T): void {
  const first = withRandomGuard(generate);
  const second = withRandomGuard(generate);
  if (JSON.stringify(first) !== JSON.stringify(second))
    throw new Error("plugin output is not deterministic for the same input and seed");
}

const isObject = (value: unknown): value is object => typeof value === "object" && value !== null;

function deepFreeze<T>(value: T): T {
  if (!isObject(value) || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function collectObjects(value: unknown, into: Set<object>): void {
  if (!isObject(value) || into.has(value)) return;
  into.add(value);
  for (const child of Object.values(value)) collectObjects(child, into);
}

function findAlias(value: unknown, inputs: Set<object>, seen: Set<object>): boolean {
  if (!isObject(value) || seen.has(value)) return false;
  if (inputs.has(value)) return true;
  seen.add(value);
  return Object.values(value).some((child) => findAlias(child, inputs, seen));
}

/**
 * Checks input immutability and output aliasing. `generate` receives a deep-frozen structural
 * copy of `input`; in strict-mode code (every ES module) a write to it throws, which is reported
 * as a mutation. The returned value must not contain any array or object taken from the input.
 * Returns the output so a test can make further assertions.
 */
export function assertInputImmutable<I, O>(generate: (input: I) => O, input: I): O {
  const frozen = deepFreeze(structuredClone(input));
  let output: O;
  try {
    output = withRandomGuard(() => generate(frozen));
  } catch (error) {
    if (
      error instanceof TypeError &&
      /read only|not extensible|frozen|Cannot (add|assign|delete)/i.test(error.message)
    )
      throw new Error(`plugin mutated its input: ${error.message}`, { cause: error });
    throw error;
  }
  const inputObjects = new Set<object>();
  collectObjects(frozen, inputObjects);
  if (findAlias(output, inputObjects, new Set()))
    throw new Error("plugin output aliases an object or array from its input; return fresh data");
  return output;
}

/**
 * Checks that calls do not share hidden state: `a`, then `b`, then `a` again must give the same
 * result for `a` both times. Pass two different inputs, seeds, or plugin instances.
 */
export function assertInterleavingStable<A, B>(a: () => A, b: () => B): void {
  const first = withRandomGuard(a);
  withRandomGuard(b);
  const second = withRandomGuard(a);
  if (JSON.stringify(first) !== JSON.stringify(second))
    throw new Error("plugin output changed after an unrelated call; it keeps hidden state");
}

/** Counts path operations (objects with a string `op`) anywhere in a plugin's output. */
export function countOps(output: unknown): number {
  let count = 0;
  const path = new Set<object>();
  const visit = (value: unknown): void => {
    if (!isObject(value) || path.has(value)) return;
    path.add(value);
    if (typeof (value as { op?: unknown }).op === "string") count++;
    for (const child of Object.values(value)) visit(child);
    path.delete(value);
  };
  visit(output);
  return count;
}

/**
 * Checks the output budget: the number of path operations must not exceed `maxOps`
 * (`PluginContext.maxOps`) and every number in the output must be finite.
 */
export function assertWithinBudget(output: unknown, maxOps: number): void {
  const ops = countOps(output);
  if (ops > maxOps)
    throw new Error(`plugin emitted ${ops} operations, over the budget of ${maxOps}`);
  const seen = new Set<object>();
  const visit = (value: unknown): void => {
    if (typeof value === "number" && !Number.isFinite(value))
      throw new Error("plugin output contains a non-finite number");
    if (!isObject(value) || seen.has(value)) return;
    seen.add(value);
    for (const child of Object.values(value)) visit(child);
  };
  visit(output);
}
