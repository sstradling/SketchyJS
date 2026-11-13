import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Path, PathOp, WatercolorStyle } from "@sketchy-js/types";
import { watercolorFillCommands } from "../src/watercolor-fill.js";
import { watercolorStrokeCommands } from "../src/watercolor-stroke.js";

const style: WatercolorStyle = {
  pigment: 0.72,
  wetness: 0.6,
  edgeDarkening: 0.75,
  layers: 3,
  variation: 0.45,
  bleed: 0.5,
  seed: 1,
};

const line: Path = [
  { op: "M", x: 10, y: 40 },
  { op: "L", x: 180, y: 36 },
];

const square: Path = [
  { op: "M", x: 20, y: 20 },
  { op: "L", x: 160, y: 24 },
  { op: "L", x: 150, y: 140 },
  { op: "L", x: 28, y: 130 },
  { op: "Z" },
];

describe("watercolor port", () => {
  it("matches the first glaze opacity of a default 3-layer wash", () => {
    const commands = watercolorStrokeCommands(line, 12, style, 1);
    expect(commands.length).toBeGreaterThan(10);
    expect(commands[0]?.opacity).toBeCloseTo(0.19699200782775883, 12);
    expect(commands.every((command) => command.paths.length === 1 && command.opacity > 0.004)).toBe(
      true,
    );
    const closed = commands.every((command) => command.paths[0]?.at(-1)?.op === "Z");
    expect(closed).toBe(true);
  });

  it("builds a cornered closed stroke and a clipped fill", () => {
    const stroke = watercolorStrokeCommands(square, 12, style, 1, 4);
    expect(stroke.length).toBeGreaterThan(10);
    const fill = watercolorFillCommands(square, style, 1);
    expect(fill.length).toBeGreaterThan(20);
    expect(fill.every((command) => command.clip === true)).toBe(true);
    expect(fill[0]?.paths[0]).toBe(square);
    expect(fill[0]?.opacity).toBeCloseTo(Math.fround(0.72) * 0.2, 12);
    const ellipses = fill.filter((command) => command.paths[0]?.some((op) => op.op === "C"));
    expect(ellipses.length).toBeGreaterThan(0);
    const cubic = ellipses[0]?.paths[0]?.find(
      (op): op is Extract<PathOp, { op: "C" }> => op.op === "C",
    );
    expect(cubic).toBeDefined();
  });

  it("drops an invisible wash", () => {
    expect(watercolorStrokeCommands(line, 0.2, style, 1)).toEqual([]);
    expect(watercolorFillCommands(square, { ...style, pigment: 0 }, 1)).toEqual([]);
  });

  it("accepts a bigint seed and stays finite on the fixture ellipse", () => {
    const raw = JSON.parse(
      readFileSync("fixtures/swift-reference/v1.5.0/brushes/crayon-watercolor.json", "utf8"),
    ) as {
      watercolorEllipseFill: { commands: { clip?: [string, ...number[]][] }[] };
    };
    const clip = raw.watercolorEllipseFill.commands.find((command) => command.clip)?.clip;
    expect(clip).toBeDefined();
    const path: PathOp[] = [];
    for (const element of clip ?? []) {
      const [op, ...nums] = element;
      if (op === "M") path.push({ op: "M", x: nums[0]!, y: nums[1]! });
      else if (op === "L") path.push({ op: "L", x: nums[0]!, y: nums[1]! });
      else if (op === "C") {
        path.push({
          op: "C",
          c1x: nums[0]!,
          c1y: nums[1]!,
          c2x: nums[2]!,
          c2y: nums[3]!,
          x: nums[4]!,
          y: nums[5]!,
        });
      } else if (op === "Z") path.push({ op: "Z" });
    }
    const seeded = watercolorFillCommands(path, { ...style, seed: 42n }, 0.9);
    expect(seeded.length).toBeGreaterThan(30);
    expect(seeded.every((command) => Number.isFinite(command.opacity))).toBe(true);
  });
});
