import { afterEach, describe, expect, it, vi } from "vitest";
import { Rng, fnv1a64, seedToBigInt } from "../src/rng/index.js";

afterEach(() => vi.restoreAllMocks());

const draw = (rng: Rng, count: number): number[] => Array.from({ length: count }, () => rng.next());

describe("Rng", () => {
  it("is deterministic per seed and differs between seeds", () => {
    expect(draw(new Rng(42), 20)).toEqual(draw(new Rng(42), 20));
    expect(draw(new Rng(42), 20)).not.toEqual(draw(new Rng(43), 20));
  });

  it("accepts number and bigint seeds interchangeably", () => {
    expect(draw(new Rng(99), 5)).toEqual(draw(new Rng(99n), 5));
  });

  it("never touches Math.random", () => {
    const spy = vi.spyOn(Math, "random");
    const rng = new Rng(1);
    rng.next();
    rng.range(0, 5);
    rng.int(0, 5);
    rng.normal();
    rng.chance(0.5);
    rng.pick([1, 2, 3]);
    rng.fork("a").next();
    rng.swiftUnit();
    expect(spy).not.toHaveBeenCalled();
  });

  it("next() is in [0, 1) with 53-bit resolution", () => {
    const rng = new Rng(5);
    for (let i = 0; i < 2000; i++) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      expect((value * 2 ** 53) % 1).toBe(0);
    }
  });

  it("range, int and pick stay in bounds", () => {
    const rng = new Rng(8);
    for (let i = 0; i < 1000; i++) {
      const r = rng.range(-3, 7);
      expect(r).toBeGreaterThanOrEqual(-3);
      expect(r).toBeLessThan(7);
      const n = rng.int(2, 6);
      expect(Number.isInteger(n) && n >= 2 && n < 6).toBe(true);
      expect(["a", "b", "c"]).toContain(rng.pick(["a", "b", "c"]));
    }
  });

  it("int handles empty and reversed ranges without throwing", () => {
    const rng = new Rng(3);
    expect(rng.int(4, 4)).toBe(4);
    expect(rng.int(5, 2)).toBe(5);
  });

  it("normal has roughly the requested mean and spread", () => {
    const rng = new Rng(11);
    const values = Array.from({ length: 20_000 }, () => rng.normal(10, 2));
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
    expect(mean).toBeCloseTo(10, 1);
    expect(Math.sqrt(variance)).toBeCloseTo(2, 1);
  });

  it("chance(0) is never true and chance(1) is always true", () => {
    const rng = new Rng(2);
    for (let i = 0; i < 200; i++) {
      expect(rng.chance(0)).toBe(false);
      expect(rng.chance(1)).toBe(true);
    }
  });
});

describe("Rng.fork", () => {
  it("is pure: it consumes nothing from the parent", () => {
    const withFork = new Rng(42);
    withFork.fork("a");
    withFork.fork("b");
    expect(draw(withFork, 10)).toEqual(draw(new Rng(42), 10));
  });

  it("does not depend on how many values the parent has drawn", () => {
    const early = new Rng(42);
    const late = new Rng(42);
    draw(late, 50);
    expect(draw(early.fork("grit"), 8)).toEqual(draw(late.fork("grit"), 8));
  });

  it("returns an identical stream for the same label and different streams for different labels", () => {
    const rng = new Rng(7);
    expect(draw(rng.fork("pass:0"), 6)).toEqual(draw(rng.fork("pass:0"), 6));
    expect(draw(rng.fork("pass:0"), 6)).not.toEqual(draw(rng.fork("pass:1"), 6));
  });

  it("chains: a fork of a fork is a function of the whole label path", () => {
    const rng = new Rng(7);
    expect(draw(rng.fork("a").fork("b"), 4)).toEqual(draw(rng.fork("a").fork("b"), 4));
    expect(draw(rng.fork("a").fork("b"), 4)).not.toEqual(draw(rng.fork("b").fork("a"), 4));
  });

  it("produces different streams for different parent seeds", () => {
    expect(draw(new Rng(1).fork("x"), 4)).not.toEqual(draw(new Rng(2).fork("x"), 4));
  });
});

describe("seedToBigInt", () => {
  it("accepts non-negative safe integers and wraps bigints to 64 bits", () => {
    expect(seedToBigInt(0)).toBe(0n);
    expect(seedToBigInt(Number.MAX_SAFE_INTEGER)).toBe(BigInt(Number.MAX_SAFE_INTEGER));
    expect(seedToBigInt(2n ** 64n + 3n)).toBe(3n);
    expect(seedToBigInt(-1n)).toBe(2n ** 64n - 1n);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53])("rejects %s", (bad) => {
    expect(() => seedToBigInt(bad)).toThrow(RangeError);
  });
});

describe("fnv1a64", () => {
  it("matches published FNV-1a 64-bit test vectors", () => {
    expect(fnv1a64("")).toBe(0xcbf29ce484222325n);
    expect(fnv1a64("a")).toBe(0xaf63dc4c8601ec8cn);
    expect(fnv1a64("foobar")).toBe(0x85944171f73967e8n);
  });

  it("hashes UTF-8 bytes, so non-ASCII labels are stable", () => {
    expect(fnv1a64("é")).toBe(fnv1a64("\u00e9"));
    expect(fnv1a64("é")).not.toBe(fnv1a64("e"));
  });
});
