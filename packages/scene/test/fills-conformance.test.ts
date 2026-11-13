import { describe, expect, it } from "vitest";
import { Rng, type Pt } from "@sketchy-js/core";
import { resolveSketchOptions } from "@sketchy-js/core/options";
import { assertDeterministic } from "@sketchy-js/plugin";
import type { Diagnostic, FillStyle, PathOp, SketchOptions } from "@sketchy-js/types";
import { basicSketchy } from "../src/basic.js";
import { createFillStage } from "../src/fill-stage.js";

const styles: FillStyle[] = [
  "solid",
  "hachure",
  "zigzag",
  "crossHatch",
  "dots",
  "dashed",
  "zigzagLine",
  "sunBurst",
  "starBurst",
  "scribble",
];

const rect = (x: number, y: number, w: number, h: number): Pt[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];

/** Region cases from docs/contributing-plugins.md that a single-ring polygon can express. */
const regions: [string, Pt[]][] = [
  [
    "zero-area collinear ring",
    [
      [0, 0],
      [10, 10],
      [20, 20],
    ],
  ],
  ["zero width", rect(5, 5, 0, 40)],
  ["zero height", rect(5, 5, 40, 0)],
  ["thin sliver 0.01 px", rect(5, 5, 60, 0.01)],
  [
    "concave C shape",
    [
      [0, 0],
      [60, 0],
      [60, 15],
      [15, 15],
      [15, 45],
      [60, 45],
      [60, 60],
      [0, 60],
    ],
  ],
  ["far from origin", rect(1e6, 1e6, 50, 50)],
  ["small region", rect(0, 0, 3, 3)],
];

function run(
  style: FillStyle,
  polygon: Pt[],
  extra: Partial<SketchOptions> = {},
): { ops: PathOp[][]; diagnostics: Diagnostic[] } {
  const options = resolveSketchOptions({ fillStyle: style, seed: 5n, ...extra });
  const diagnostics: Diagnostic[] = [];
  const stage = createFillStage({
    fill: basicSketchy.resolveSpec("fill", { kind: style }),
    options,
    report: (d) => diagnostics.push(d),
  });
  const sets = stage.run(
    { kind: "polygon", points: polygon },
    { o: options, rng: new Rng(options.seed ?? 0n) },
  );
  return { ops: sets.map((s) => [...s.ops]), diagnostics };
}

const finite = (ops: PathOp[][]): boolean =>
  ops.every((path) =>
    path.every((op) => Object.values(op).every((v) => typeof v === "string" || Number.isFinite(v))),
  );

describe.each(styles)("built-in %s fill conformance", (style) => {
  it.each(regions)(
    "handles %s without throwing or emitting non-finite numbers",
    (_name, polygon) => {
      const { ops, diagnostics } = run(style, polygon);
      expect(finite(ops)).toBe(true);
      expect(diagnostics.filter((d) => d.code === "fill-non-finite")).toEqual([]);
    },
  );

  it.each([0, 45, 90, -45, 720])("handles fill angle %s", (angle) => {
    const { ops } = run(style, rect(0, 0, 80, 60), { fillAngle: angle });
    expect(finite(ops)).toBe(true);
  });

  it("is deterministic for the same seed and never uses Math.random", () => {
    assertDeterministic(() => run(style, regions[4]![1]));
  });

  it("copes with a gap far larger than the region", () => {
    const { ops } = run(style, rect(0, 0, 20, 20), { fillSpacing: 500 });
    expect(finite(ops)).toBe(true);
  });

  it("stays within the operation budget for a tiny gap", () => {
    const { ops, diagnostics } = run(style, rect(0, 0, 60, 60), { fillSpacing: 0.1 });
    const total = ops.reduce((n, p) => n + p.length, 0);
    expect(total <= 200_000 || diagnostics.some((d) => d.code === "fill-max-ops")).toBe(true);
  });
});

describe("fill plugin metadata", () => {
  it.each(styles)("%s is registered as a shared-stream fill using plugin api 1.0", (style) => {
    const { plugin } = basicSketchy.resolveSpec("fill", { kind: style });
    expect(plugin.kind).toBe("fill");
    expect(plugin.id).toBe(style);
    expect(plugin.api).toBe("1.0");
    expect(plugin.stream).toBe("shared");
    expect(plugin.paints === "area").toBe(style === "solid");
  });
});
