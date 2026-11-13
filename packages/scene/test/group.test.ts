import { describe, expect, it } from "vitest";
import { path, rectangle } from "@sketchy-js/core";
import { RoughView } from "../src/basic.js";
import { SketchGroup, SketchPart } from "../src/stickers.js";
import type { DrawLayer, SceneNode } from "@sketchy-js/types";

const sheet = {
  width: 12,
  smoothness: 1,
  edge: "smooth" as const,
  color: [0.98, 0.96, 0.9, 1] as const,
};

function layersOf(node: SceneNode): readonly DrawLayer[] {
  return node.type === "drawing" ? node.drawing.layers : [];
}

describe("SketchGroup", () => {
  it("keeps stroke and backing widths fixed when a part is scaled", () => {
    const view = new RoughView()
      .with({
        seed: 1n,
        strokeWidth: 4,
        roughness: 0,
        bowing: 0,
        maxRandomnessOffset: 0,
        fillColor: [0, 0, 0, 0],
      })
      .draw(rectangle(20, 20, 40, 24));
    const scene = new SketchGroup([new SketchPart(view).scale(2)], sheet).build({
      width: 240,
      height: 180,
    });
    const strokes = scene.nodes.flatMap(layersOf).filter((layer) => layer.role === "stroke");
    expect(strokes.length).toBeGreaterThan(0);
    for (const layer of strokes) expect(layer.strokeWidth).toBe(4);
    const paper = scene.nodes
      .flatMap(layersOf)
      .find((layer) => layer.role === "sheet" && layer.strokeWidth === undefined);
    expect(paper).toBeDefined();
  });

  it("suppresses a child's own backing while the group has one", () => {
    const child = new RoughView()
      .with({
        seed: 2n,
        strokeWidth: 3,
        stickerBacking: { ...sheet, width: 30, color: [1, 0, 0, 1] },
      })
      .draw(rectangle(30, 30, 50, 40));
    const scene = new SketchGroup([child], sheet).build({ width: 200, height: 160 });
    const sheets = scene.nodes.filter((node) =>
      layersOf(node).some((layer) => layer.role === "sheet"),
    );
    expect(sheets).toHaveLength(1);
  });

  it("keeps an SVG path in authored coordinates", () => {
    const view = new RoughView()
      .with({ seed: 3n, strokeWidth: 2, roughness: 0, bowing: 0, maxRandomnessOffset: 0 })
      .draw(path("M 4 6 H 18 V 20 H 4 Z"));
    const scene = new SketchGroup([view], sheet).build({ width: 400, height: 300 });
    const ink = scene.nodes.flatMap(layersOf).find((layer) => layer.role === "stroke");
    const xs = ink?.paths.flatMap((p) => p.flatMap((op) => (op.op === "Z" ? [] : [op.x]))) ?? [];
    expect(Math.max(...xs)).toBeLessThan(40);
    expect(Math.max(...xs)).toBeGreaterThan(10);
  });
});
