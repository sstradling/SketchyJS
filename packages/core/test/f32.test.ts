import { describe, expect, it } from "vitest";
import { f, FLOAT_MAX, PI } from "../src/f32.js";

const bits = (x: number): number => new Uint32Array(new Float32Array([x]).buffer)[0]!;

describe("Float emulation constants", () => {
  it("PI is Swift's Float.pi (0x40490fda), one ulp below the nearest float to pi", () => {
    expect(bits(PI)).toBe(0x40490fda);
    expect(f(PI)).toBe(PI);
    expect(bits(f(Math.PI))).toBe(0x40490fdb);
  });

  it("changes ray angles the way Swift does: Float(69) * 2 * pi / 92", () => {
    const swiftAngle = f(f(f(f(69) * 2) * PI) / 92);
    expect(bits(swiftAngle)).toBe(0x4096cbe3);
  });

  it("FLOAT_MAX is Float.greatestFiniteMagnitude", () => {
    expect(f(FLOAT_MAX)).toBe(FLOAT_MAX);
    expect(f(FLOAT_MAX * 2)).toBe(Infinity);
  });
});
