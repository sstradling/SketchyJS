import { describe, expect, it } from "vitest";
import { SplitMix64, mix64, wrap64 } from "../src/rng/index.js";
import { loadFixture } from "./fixtures.js";

interface Splitmix64Fixture {
  documented: { seed: string; firstFour: string[] };
  vectors: { seed: string; values: string[] }[];
  seedDerivation: { seed: string; index: number; multiplier: string; derived: string }[];
}

const fixture = loadFixture<Splitmix64Fixture>("rng/splitmix64.json");

describe("SplitMix64", () => {
  it("matches the documented Swift sequence for seed 42", () => {
    const rng = new SplitMix64(42n);
    const first = Array.from({ length: 4 }, () => rng.nextU64().toString());
    expect(first).toEqual([
      "13679457532755275413",
      "2949826092126892291",
      "5139283748462763858",
      "6349198060258255764",
    ]);
    expect(first).toEqual(fixture.documented.firstFour);
  });

  it.each(fixture.vectors.map((v) => [v.seed, v] as const))(
    "reproduces the Swift stream for seed %s",
    (_seed, vector) => {
      const rng = new SplitMix64(BigInt(vector.seed));
      const produced = vector.values.map(() => rng.nextU64().toString());
      expect(produced).toEqual(vector.values);
    },
  );

  it("wraps seeds modulo 2^64, including negative values", () => {
    expect(new SplitMix64(-1n).nextU64()).toBe(new SplitMix64(2n ** 64n - 1n).nextU64());
    expect(new SplitMix64(2n ** 64n + 5n).nextU64()).toBe(new SplitMix64(5n).nextU64());
  });

  it("advances the state by the golden gamma with wrapping", () => {
    const rng = new SplitMix64(2n ** 64n - 1n);
    rng.nextU64();
    expect(rng.state).toBe(wrap64(2n ** 64n - 1n + 0x9e3779b97f4a7c15n));
  });

  it("keeps generators independent", () => {
    const a = new SplitMix64(7n);
    const b = new SplitMix64(7n);
    a.nextU64();
    a.nextU64();
    expect(b.nextU64()).toBe(new SplitMix64(7n).nextU64());
  });

  it("reproduces the wrapping arithmetic Swift uses to derive facet seeds", () => {
    for (const row of fixture.seedDerivation) {
      const derived = wrap64(BigInt(row.seed) + BigInt(row.index) * BigInt(row.multiplier));
      expect(derived.toString()).toBe(row.derived);
    }
  });

  it("mix64 is the output function of the stream", () => {
    const rng = new SplitMix64(42n);
    expect(mix64(42n + 0x9e3779b97f4a7c15n)).toBe(rng.nextU64());
  });
});
