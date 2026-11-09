import { describe, expect, it } from "vitest";
import {
  SplitMix64,
  swiftDoubleInRange,
  swiftFloatInRange,
  swiftUnitFloat,
} from "../src/rng/index.js";
import { loadFixture } from "./fixtures.js";

interface Draw {
  value: number;
  bits?: number;
  consumed: number;
}
interface RangeSet {
  lower: number;
  upper: number;
  rows: { seed: string; draws: Draw[] }[];
}
interface UnitFixture {
  unit: { seed: string; draws: Draw[] }[];
  rejectionSeedsFloat: { seed: string; value: number; bits: number; consumed: number }[];
  rejectionSeedsDouble: { seed: string; value: number; consumed: number }[];
  floatRanges: RangeSet[];
  doubleRanges: RangeSet[];
}

/** Fixture floats are Swift shortest-decimal Float strings; compare after `Math.fround`. */
const fixture = loadFixture<UnitFixture>("rng/unit-float.json");

/** A SplitMix64 that counts how many 64-bit values a conversion consumed. */
function counting(seed: string): { nextU64(): bigint; calls: () => number } {
  const inner = new SplitMix64(BigInt(seed));
  let calls = 0;
  return {
    nextU64() {
      calls += 1;
      return inner.nextU64();
    },
    calls: () => calls,
  };
}

function floatBits(value: number): number {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, value);
  return view.getUint32(0);
}

describe("swiftUnitFloat (Float.random(in: 0...1))", () => {
  it.each(fixture.unit.map((u) => [u.seed, u] as const))(
    "matches Swift for seed %s",
    (seed, row) => {
      const source = counting(seed);
      for (const draw of row.draws) {
        const before = source.calls();
        const value = swiftUnitFloat(source);
        expect(value).toBe(Math.fround(draw.value));
        expect(floatBits(value)).toBe(draw.bits);
        expect(source.calls() - before).toBe(draw.consumed);
      }
    },
  );

  it("reproduces the seed 42 unit floats used by the Swift tests", () => {
    const source = new SplitMix64(42n);
    const first = Array.from({ length: 6 }, () => Math.fround(swiftUnitFloat(source)));
    expect(first).toEqual(
      [0.18718612, 0.69688326, 0.07445711, 0.05583018, 0.14172578, 0.23634118].map(Math.fround),
    );
  });

  it("rejects and redraws for the seeds where Swift consumed two values", () => {
    expect(fixture.rejectionSeedsFloat.length).toBeGreaterThanOrEqual(4);
    for (const row of fixture.rejectionSeedsFloat) {
      const source = counting(row.seed);
      const value = swiftUnitFloat(source);
      expect(value).toBe(Math.fround(row.value));
      expect(floatBits(value)).toBe(row.bits);
      expect(source.calls()).toBe(row.consumed);
      expect(row.consumed).toBeGreaterThan(1);
    }
  });

  it("returns values that are multiples of 2^-24 in [0, 1]", () => {
    const source = new SplitMix64(123n);
    for (let i = 0; i < 2000; i++) {
      const value = swiftUnitFloat(source);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
      expect((value * 16_777_216) % 1).toBe(0);
    }
  });
});

describe("swiftFloatInRange (Float.random(in: lo...hi))", () => {
  for (const set of fixture.floatRanges) {
    it(`matches Swift for ${set.lower}...${set.upper}`, () => {
      for (const row of set.rows) {
        const source = counting(row.seed);
        for (const draw of row.draws) {
          const before = source.calls();
          expect(swiftFloatInRange(source, set.lower, set.upper)).toBe(Math.fround(draw.value));
          expect(source.calls() - before).toBe(draw.consumed);
        }
      }
    });
  }
});

describe("swiftDoubleInRange (Double.random(in: lo...hi))", () => {
  for (const set of fixture.doubleRanges) {
    it(`matches Swift for ${set.lower}...${set.upper}`, () => {
      for (const row of set.rows) {
        const source = counting(row.seed);
        for (const draw of row.draws) {
          const before = source.calls();
          expect(swiftDoubleInRange(source, set.lower, set.upper)).toBe(draw.value);
          expect(source.calls() - before).toBe(draw.consumed);
        }
      }
    });
  }

  it("redraws for the seeds where Swift consumed two values", () => {
    expect(fixture.rejectionSeedsDouble.length).toBeGreaterThanOrEqual(2);
    for (const row of fixture.rejectionSeedsDouble) {
      const source = counting(row.seed);
      expect(swiftDoubleInRange(source, 0, 1)).toBe(row.value);
      expect(source.calls()).toBe(row.consumed);
    }
  });
});
