import { describe, expect, it } from "vitest";
import { line, rectangle } from "@sketchy-js/core";
import { sketch } from "@sketchy-js/scene/basic";
import { renderToSvgString } from "@sketchy-js/svg-renderer";
import type { Path } from "@sketchy-js/types";
import { renderToCanvas, type Canvas2D } from "../src/index.js";

/** Records the paths each fill or stroke call paints, in order. */
function recorder(): { context: Canvas2D; painted: { op: "fill" | "stroke"; ops: Path }[] } {
  const painted: { op: "fill" | "stroke"; ops: Path }[] = [];
  let current: Path[number][] = [];
  const context = {
    canvas: { width: 200, height: 160 },
    save() {},
    restore() {},
    beginPath() {
      current = [];
    },
    moveTo(x: number, y: number) {
      current.push({ op: "M", x, y });
    },
    lineTo(x: number, y: number) {
      current.push({ op: "L", x, y });
    },
    quadraticCurveTo(cx: number, cy: number, x: number, y: number) {
      current.push({ op: "Q", cx, cy, x, y });
    },
    bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number) {
      current.push({ op: "C", c1x, c1y, c2x, c2y, x, y });
    },
    closePath() {
      current.push({ op: "Z" });
    },
    fill() {
      painted.push({ op: "fill", ops: current });
    },
    stroke() {
      painted.push({ op: "stroke", ops: current });
    },
    clip() {},
    setTransform() {},
    fillRect() {},
    fillStyle: "",
    strokeStyle: "",
    globalAlpha: 1,
    lineWidth: 1,
    lineCap: "round" as const,
    lineJoin: "round" as const,
    miterLimit: 10,
  };
  return { context, painted };
}

describe("canvas and SVG share a scene", () => {
  it("paints the same path operations for a hachure rectangle", () => {
    const scene = sketch(rectangle(20, 30, 120, 80), { width: 200, height: 160 }, { seed: 7n });
    const { context, painted } = recorder();
    renderToCanvas(scene, context);
    const svg = renderToSvgString(scene);
    const pathCount = svg.match(/<path /g)?.length ?? 0;
    expect(painted.length).toBe(pathCount);
    expect(painted.every((p) => p.op === "stroke")).toBe(true);
    const first = painted[0]?.ops[0];
    expect(first?.op).toBe("M");
    expect(svg).toContain("<path ");
  });

  it("fills a curved-bevel stroke in both renderers", () => {
    const scene = sketch(
      line(10, 20, 80, 60),
      { width: 120, height: 80 },
      {
        seed: 3n,
        strokeWidth: 8,
        brushProfile: {
          tip: { roundness: 1, angle: 0, directionSensitive: false },
          thicknessProfile: { kind: "uniform" },
          cap: "round",
          join: { kind: "curvedBevel", bulge: 0.65 },
          opacityProfile: { kind: "uniform" },
        },
      },
    );
    const layer =
      scene.nodes[0]?.type === "drawing"
        ? scene.nodes[0].drawing.layers.find((l) => l.role === "stroke")
        : undefined;
    expect(layer?.strokeWidth).toBeUndefined();
    const { context, painted } = recorder();
    renderToCanvas(scene, context);
    expect(painted.some((p) => p.op === "fill")).toBe(true);
    expect(renderToSvgString(scene)).toContain("fill=");
  });
});
