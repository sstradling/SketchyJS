import { describe, expect, it } from "vitest";
import {
  assertDeterministic,
  assertInputImmutable,
  assertInterleavingStable,
  assertWithinBudget,
  countOps,
  withRandomGuard,
} from "../src/index.js";

describe("withRandomGuard", () => {
  it("throws on each guarded nondeterministic global and restores them afterwards", () => {
    const snapshot = (): unknown[] => [
      Reflect.get(Math, "random"),
      Reflect.get(Date, "now"),
      Reflect.get(performance, "now"),
      Reflect.get(crypto, "getRandomValues"),
    ];
    const before = snapshot();
    expect(() => withRandomGuard(() => Math.random())).toThrow(/Math\.random/);
    expect(() => withRandomGuard(() => Date.now())).toThrow(/Date\.now/);
    expect(() => withRandomGuard(() => performance.now())).toThrow(/performance\.now/);
    expect(() => withRandomGuard(() => crypto.getRandomValues(new Uint8Array(1)))).toThrow(
      /crypto\.getRandomValues/,
    );
    expect(() => withRandomGuard(() => crypto.randomUUID())).toThrow(/crypto\.randomUUID/);
    expect(snapshot()).toEqual(before);
    expect(typeof Math.random()).toBe("number");
  });

  it("restores the globals even when the callback throws", () => {
    const before = Math.random;
    expect(() =>
      withRandomGuard(() => {
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(Math.random).toBe(before);
    expect(Object.getOwnPropertyDescriptor(performance, "now")).toBeUndefined();
  });

  it("returns the callback value", () => {
    expect(withRandomGuard(() => 7)).toBe(7);
  });
});

describe("assertDeterministic", () => {
  it("accepts a pure function and rejects clock and random reads", () => {
    expect(() => assertDeterministic(() => ({ v: 1 }))).not.toThrow();
    expect(() => assertDeterministic(() => ({ v: Date.now() }))).toThrow(/Date\.now/);
    let calls = 0;
    expect(() => assertDeterministic(() => ({ v: calls++ }))).toThrow(/not deterministic/);
  });
});

describe("assertInputImmutable", () => {
  const input = { path: [{ op: "M", x: 0, y: 0 }], bounds: { x: 0, y: 0, width: 1, height: 1 } };

  it("passes a plugin that only reads its input and returns fresh data", () => {
    const output = assertInputImmutable(
      (i: typeof input) => i.path.map((p) => ({ ...p, x: p.x + 1 })),
      input,
    );
    expect(output).toEqual([{ op: "M", x: 1, y: 0 }]);
  });

  it("does not freeze the caller's object", () => {
    assertInputImmutable((i: typeof input) => i.path.map((p) => ({ ...p })), input);
    expect(Object.isFrozen(input)).toBe(false);
  });

  it("reports a mutation of nested input", () => {
    expect(() =>
      assertInputImmutable((i: typeof input) => {
        (i.path[0] as { x: number }).x = 5;
        return [];
      }, input),
    ).toThrow(/mutated its input/);
    expect(() =>
      assertInputImmutable((i: typeof input) => {
        (i.path as unknown[]).push({ op: "Z" });
        return [];
      }, input),
    ).toThrow(/mutated its input/);
  });

  it("reports output that aliases input arrays or objects", () => {
    expect(() => assertInputImmutable((i: typeof input) => i.path, input)).toThrow(/aliases/);
    expect(() => assertInputImmutable((i: typeof input) => [{ nested: i.bounds }], input)).toThrow(
      /aliases/,
    );
  });

  it("guards nondeterminism while running", () => {
    expect(() => assertInputImmutable(() => [Math.random()], input)).toThrow(/Math\.random/);
  });
});

describe("assertInterleavingStable", () => {
  it("passes independent calls", () => {
    expect(() =>
      assertInterleavingStable(
        () => ({ a: 1 }),
        () => ({ b: 2 }),
      ),
    ).not.toThrow();
  });

  it("fails when another call changes the result", () => {
    let shared = 0;
    expect(() =>
      assertInterleavingStable(
        () => ({ a: shared }),
        () => {
          shared += 1;
        },
      ),
    ).toThrow(/hidden state/);
  });
});

describe("output budget", () => {
  const path = [
    { op: "M", x: 0, y: 0 },
    { op: "L", x: 1, y: 1 },
  ];

  it("counts path operations anywhere in the output", () => {
    expect(countOps([{ kind: "strokes", centerlines: [path, path] }])).toBe(4);
    expect(countOps([])).toBe(0);
  });

  it("enforces maxOps", () => {
    expect(() => assertWithinBudget([path], 2)).not.toThrow();
    expect(() => assertWithinBudget([path], 1)).toThrow(/budget of 1/);
  });

  it("rejects non-finite numbers", () => {
    expect(() => assertWithinBudget([[{ op: "M", x: Number.NaN, y: 0 }]], 10)).toThrow(
      /non-finite/,
    );
    expect(() => assertWithinBudget([[{ op: "M", x: 0, y: Infinity }]], 10)).toThrow(/non-finite/);
  });
});
