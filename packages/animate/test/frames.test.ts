import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { circle, generateDrawing, rectangle, type Shape } from "@sketchy-js/core";
import { resolveSketchOptions } from "@sketchy-js/core/options";
import { createFillStage } from "@sketchy-js/scene";
import { basicSketchy } from "@sketchy-js/scene/basic";
import type { Path, PathOp } from "@sketchy-js/types";
import { createAnimation } from "../src/controller.js";
import { varyPath, type VarianceConfig } from "../src/variance.js";

const root = fileURLToPath(
  new URL("../../../fixtures/swift-reference/v1.5.0/animation/frames.json", import.meta.url),
);

interface FrameCase {
  id: string;
  variance: number;
  steps: number;
  seed: string;
  frames: { step: number; path: [string, ...number[]][] }[];
}

const cases = (JSON.parse(readFileSync(root, "utf8")) as { cases: FrameCase[] }).cases;

function outline(shape: Shape): Path {
  const options = resolveSketchOptions({ seed: 42n, strokeWidth: 3 });
  const stage = createFillStage({
    fill: basicSketchy.resolveSpec("fill", { kind: options.fillStyle }),
    options,
    report: () => undefined,
  });
  const drawing = generateDrawing(shape, options, stage);
  const last = drawing?.sets[drawing.sets.length - 1];
  if (!last) throw new Error("no outline");
  return last.ops;
}

function toFixture(path: Path): [string, ...number[]][] {
  return path.map((op: PathOp) => {
    switch (op.op) {
      case "M":
      case "L":
        return [op.op, op.x, op.y];
      case "Q":
        return ["Q", op.cx, op.cy, op.x, op.y];
      case "C":
        return ["C", op.c1x, op.c1y, op.c2x, op.c2y, op.x, op.y];
      default:
        return ["Z"];
    }
  });
}

const shapes = {
  "circle-medium": circle(100, 100, 120),
  "rectangle-low": rectangle(30, 40, 140, 90),
} as const;

describe("animation frame fixtures", () => {
  for (const c of cases) {
    it(c.id, () => {
      const config: VarianceConfig = { steps: c.steps, variance: c.variance, seed: BigInt(c.seed) };
      const base = outline(shapes[c.id as keyof typeof shapes]);
      for (const frame of c.frames) {
        const actual = toFixture(varyPath(base, frame.step, config));
        expect(actual.map((op) => op[0])).toEqual(frame.path.map((op) => op[0]));
        let max = 0;
        for (let i = 0; i < actual.length; i++) {
          const a = actual[i]!;
          const e = frame.path[i]!;
          for (let k = 1; k < a.length; k++)
            max = Math.max(max, Math.abs((a[k] as number) - (e[k] as number)));
        }
        expect(max).toBeLessThanOrEqual(1e-4);
      }
    });
  }
});

describe("animation controller", () => {
  it("cancels a scheduled frame when the scene is resized", () => {
    const painted: number[] = [];
    let next = 1;
    const pending = new Map<number, (time: number) => void>();
    const host = {
      requestFrame(callback: (time: number) => void) {
        const id = next++;
        pending.set(id, (time) => {
          pending.delete(id);
          callback(time);
        });
        return id;
      },
      cancelFrame(handle: number) {
        pending.delete(handle);
      },
    };
    const scene = {
      version: 1 as const,
      size: { width: 10, height: 10 },
      nodes: [],
    };
    const controller = createAnimation(
      scene,
      { steps: 4, variance: 0.05, seed: 1n },
      { onFrame: (_s, index) => painted.push(index), host },
    );
    controller.start();
    expect(pending.size).toBe(1);
    controller.resize({ ...scene, size: { width: 20, height: 20 } });
    expect(pending.size).toBe(1);
    const stale = [...pending.keys()];
    expect(stale).toHaveLength(1);
    pending.get(stale[0]!)?.(0);
    expect(painted).toEqual([0]);
    expect(controller.frames).toHaveLength(4);
    controller.stop();
    expect(pending.size).toBe(0);
  });
});
