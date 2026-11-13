import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { curve, generateDrawing } from "@sketchy-js/core";
import { CRAYON_STYLE, resolveSketchOptions } from "@sketchy-js/core/options";
import { createFillStage } from "@sketchy-js/scene";
import { basicSketchy } from "@sketchy-js/scene/basic";
import type { Path } from "@sketchy-js/types";
import type { CrayonNumbers } from "../src/crayon-stroke.js";
import { crayonPasses } from "../src/crayon-stroke.js";

const fixture = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL(
        "../../../fixtures/swift-reference/v1.5.0/brushes/crayon-watercolor.json",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as {
  crayonLine: { commands: { path: [string, ...number[]][]; color: { a: number } }[] };
};

const style = Object.fromEntries(
  Object.entries(CRAYON_STYLE).map(([key, rule]) => [key, rule.default]),
) as unknown as CrayonNumbers;

function outline(): Path {
  const options = resolveSketchOptions({ seed: 42n, strokeWidth: 10 });
  const stage = createFillStage({
    fill: basicSketchy.resolveSpec("fill", { kind: options.fillStyle }),
    options,
    report: () => undefined,
  });
  const drawing = generateDrawing(
    curve([
      { x: 16, y: 150 },
      { x: 70, y: 40 },
      { x: 130, y: 150 },
      { x: 184, y: 60 },
    ]),
    options,
    stage,
  );
  return drawing!.sets[drawing!.sets.length - 1]!.ops;
}

describe("crayon line fixture", () => {
  it("replays the four wax passes", () => {
    const passes = crayonPasses(outline(), 10, style, 42n);
    expect(passes.map((p) => p.path.length)).toEqual(
      fixture.crayonLine.commands.map((c) => c.path.length),
    );
    passes.forEach((pass, index) => {
      expect(pass.opacity).toBeCloseTo(fixture.crayonLine.commands[index]!.color.a, 5);
      const expected = fixture.crayonLine.commands[index]!.path;
      let max = 0;
      for (let i = 0; i < Math.min(pass.path.length, expected.length); i++) {
        const op = pass.path[i]!;
        const e = expected[i]!;
        if (op.op !== e[0]) {
          max = Infinity;
          break;
        }
        const nums =
          op.op === "M" || op.op === "L"
            ? [op.x, op.y]
            : op.op === "C"
              ? [op.c1x, op.c1y, op.c2x, op.c2y, op.x, op.y]
              : [];
        nums.forEach((n, k) => {
          max = Math.max(max, Math.abs(n - (e[k + 1] as number)));
        });
      }
      expect(max).toBeLessThanOrEqual(1e-4);
    });
  });
});
