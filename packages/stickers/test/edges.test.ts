import { describe, expect, it } from "vitest";
import { Rng } from "@sketchy-js/core";
import {
  assertDeterministic,
  assertInputImmutable,
  assertInterleavingStable,
  assertWithinBudget,
  type EdgeInput,
  type PluginContext,
} from "@sketchy-js/plugin";
import { fullySmoothEdge } from "../src/edges/fully-smooth.js";
import { smoothEdge } from "../src/edges/smooth.js";
import { tornEdge } from "../src/edges/torn.js";
import { paper } from "../src/paper.js";

const ring = (side: number): EdgeInput => ({
  margin: 8,
  smoothness: 1,
  rings: [
    {
      hole: false,
      points: [
        { x: 0, y: 0 },
        { x: side, y: 0 },
        { x: side, y: side },
        { x: 0, y: side },
      ],
      corner: [true, true, true, true],
    },
  ],
});

const ctx = {
  rng: new Rng(1n),
  quality: "final" as const,
  maxOps: 200_000,
  warn() {},
} as unknown as PluginContext;

describe("sticker edges", () => {
  it("runs smooth, fully smooth, and torn through defineStickerEdge", () => {
    expect(smoothEdge.kind).toBe("edge");
    expect(fullySmoothEdge.id).toBe("fullySmooth");
    expect(tornEdge.id).toBe("torn");
    const input = ring(40);
    assertDeterministic(() => smoothEdge.generate(input, {}, ctx));
    assertInputImmutable((value) => fullySmoothEdge.generate(value, { radius: 6 }, ctx), input);
    const torn = assertInputImmutable(
      (value) =>
        tornEdge.generate(
          value,
          { depth: 4, length: 10, jaggedness: 0.4, seedHi: 1, seedLo: 2 },
          ctx,
        ),
      input,
    );
    assertWithinBudget(torn, 200_000);
    expect(torn[0]?.path.length).toBeGreaterThan(0);
    assertInterleavingStable(
      () => smoothEdge.generate(input, {}, ctx),
      () =>
        tornEdge.generate(
          ring(24),
          { depth: 3, length: 8, jaggedness: 0.2, seedHi: 4, seedLo: 5 },
          ctx,
        ),
    );
    const texture = {
      sheet: {
        paths: [
          [
            { op: "M" as const, x: 0, y: 0 },
            { op: "L" as const, x: 40, y: 0 },
            { op: "L" as const, x: 40, y: 40 },
            { op: "Z" as const },
          ],
        ],
        fillRule: "evenodd" as const,
        bounds: { x: 0, y: 0, width: 40, height: 40 },
        margin: 8,
      },
      paperColor: [1, 1, 1, 1] as const,
    };
    assertDeterministic(() =>
      paper.generate(texture, { amount: 0.5, scale: 10, seedHi: 1, seedLo: 2 }, ctx),
    );
    assertInputImmutable(
      (value) => paper.generate(value, { amount: 0.4, scale: 8, seedHi: 3, seedLo: 4 }, ctx),
      texture,
    );
  });
});
