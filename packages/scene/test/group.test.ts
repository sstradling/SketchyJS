import { describe, expect, it } from "vitest";
import { line, path, rectangle } from "@sketchy-js/core";
import { StickerOptionsError } from "@sketchy-js/stickers";
import { RoughView } from "../src/basic.js";
import { buildStickerScene, SketchGroup, SketchPart } from "../src/stickers.js";
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

  it("keeps a path part's transform when the group has no backing", () => {
    const view = new RoughView()
      .with({ seed: 1n, strokeWidth: 2, roughness: 0, bowing: 0, maxRandomnessOffset: 0 })
      .draw(path("M 10 10 H 30 V 30 H 10 Z"));
    const scene = new SketchGroup([new SketchPart(view).offset(100, 0)]).build({
      width: 400,
      height: 400,
    });
    const ink = scene.nodes.flatMap(layersOf).find((layer) => layer.role === "stroke");
    const xs = ink?.paths.flatMap((p) => p.flatMap((op) => (op.op === "Z" ? [] : [op.x]))) ?? [];
    expect(Math.min(...xs)).toBeGreaterThan(90);
    expect(Math.max(...xs)).toBeLessThan(150);
  });

  it("keeps a child backing margin in unscaled points", () => {
    const view = new RoughView()
      .with({
        seed: 1n,
        strokeWidth: 0,
        roughness: 0,
        bowing: 0,
        maxRandomnessOffset: 0,
        fillStyle: "solid",
        fillColor: [0, 0, 1, 1],
        stickerBacking: { ...sheet, width: 10 },
      })
      .draw(rectangle(10, 10, 20, 20));
    const scene = new SketchGroup([new SketchPart(view).scale(2)]).build({
      width: 400,
      height: 400,
    });
    const paper = scene.nodes.flatMap(layersOf).find((layer) => layer.role === "sheet");
    const xs = paper?.paths.flatMap((p) => p.flatMap((op) => (op.op === "Z" ? [] : [op.x]))) ?? [];
    const minX = Math.min(...xs);
    expect(minX).toBeGreaterThan(5);
    expect(minX).toBeLessThan(16);
  });

  it("keeps an open stroke inside the shared sheet", () => {
    const view = new RoughView()
      .with({
        seed: 1n,
        strokeWidth: 8,
        roughness: 0,
        bowing: 0,
        maxRandomnessOffset: 0,
        fillColor: [0, 0, 0, 0],
      })
      .draw(line(20, 40, 120, 40));
    const scene = new SketchGroup([view], { ...sheet, width: 6 }).build({
      width: 200,
      height: 120,
    });
    const paper = scene.nodes.flatMap(layersOf).find((layer) => layer.role === "sheet");
    const ys = paper?.paths.flatMap((p) => p.flatMap((op) => (op.op === "Z" ? [] : [op.y]))) ?? [];
    expect(ys.length).toBeGreaterThan(4);
    expect(Math.min(...ys)).toBeLessThan(34);
    expect(Math.max(...ys)).toBeGreaterThan(46);
  });

  it("paints shadow, sheet, image, then fibers", () => {
    const href = "data:image/png;base64,aaaa";
    const backing = {
      ...sheet,
      image: {
        source: { href, width: 8, height: 8 },
        placement: "tile" as const,
        scale: 16,
        opacity: 1,
      },
      texture: { amount: 0.4, scale: 12, seed: 3n },
    };
    const single = new RoughView()
      .with({ seed: 1n, strokeWidth: 2, roughness: 0, stickerBacking: backing })
      .draw(rectangle(10, 10, 40, 30));
    const grouped = new SketchGroup(
      [
        new RoughView()
          .with({ seed: 1n, strokeWidth: 2, roughness: 0 })
          .draw(rectangle(10, 10, 40, 30)),
      ],
      backing,
    ).build({ width: 120, height: 80 });
    for (const scene of [
      buildStickerScene(single.registry(), single.contents(), { width: 120, height: 80 }),
      grouped,
    ]) {
      const roles = scene.nodes.flatMap(layersOf).map((layer) => layer.role);
      const imageAt = roles.indexOf("sticker-image");
      const textureAt = roles.indexOf("texture");
      expect(roles.indexOf("sheet-shadow")).toBe(-1);
      expect(roles.indexOf("sheet")).toBeLessThan(imageAt);
      expect(imageAt).toBeGreaterThanOrEqual(0);
      expect(textureAt).toBeGreaterThan(imageAt);
    }
  });

  it("places the shared sheet with the part transform before the group transform", () => {
    const view = new RoughView()
      .with({ seed: 1n, strokeWidth: 2, roughness: 0, bowing: 0, maxRandomnessOffset: 0 })
      .draw(rectangle(0, 0, 10, 10));
    const scene = new SketchGroup([new SketchPart(view).offset(10, 0)], sheet)
      .transformBy([0, 1, -1, 0, 0, 0])
      .build({ width: 80, height: 80 });
    const ink = scene.nodes.flatMap(layersOf).find((layer) => layer.role === "stroke");
    const points = ink?.paths.flatMap((p) =>
      p.flatMap((op) => (op.op === "Z" ? [] : [[op.x, op.y] as const])),
    );
    expect(points?.some(([x, y]) => Math.abs(x + 10) < 1e-6 && Math.abs(y - 20) < 1e-6)).toBe(true);
    const paper = scene.nodes.flatMap(layersOf).find((layer) => layer.role === "sheet");
    const sheetPoints = paper?.paths.flatMap((p) =>
      p.flatMap((op) => (op.op === "Z" ? [] : [[op.x, op.y] as const])),
    );
    expect(sheetPoints?.some(([x, y]) => x < -8 && y > 18)).toBe(true);
  });

  it("applies a part transform before the group transform", () => {
    const view = new RoughView()
      .with({ seed: 1n, strokeWidth: 2, roughness: 0, bowing: 0, maxRandomnessOffset: 0 })
      .draw(rectangle(0, 0, 10, 10));
    const scene = new SketchGroup([new SketchPart(view).offset(10, 0)])
      .transformBy([0, 1, -1, 0, 0, 0])
      .build({ width: 80, height: 80 });
    const ink = scene.nodes.flatMap(layersOf).find((layer) => layer.role === "stroke");
    const points = ink?.paths.flatMap((p) =>
      p.flatMap((op) => (op.op === "Z" ? [] : [[op.x, op.y] as const])),
    );
    expect(points?.some(([x, y]) => Math.abs(x) < 1e-6 && Math.abs(y - 10) < 1e-6)).toBe(true);
    expect(points?.some(([x, y]) => Math.abs(x + 10) < 1e-6 && Math.abs(y - 20) < 1e-6)).toBe(true);
  });

  it("composes transformBy after the transform already on the group", () => {
    const view = new RoughView()
      .with({ seed: 1n, strokeWidth: 2, roughness: 0, bowing: 0, maxRandomnessOffset: 0 })
      .draw(rectangle(0, 0, 4, 4));
    const turned = new SketchGroup([view])
      .transformBy([0, 1, -1, 0, 0, 0])
      .transformBy([1, 0, 0, 1, 5, 0]);
    const movedFirst = new SketchGroup([view])
      .transformBy([1, 0, 0, 1, 5, 0])
      .transformBy([0, 1, -1, 0, 0, 0]);
    const corner = (scene: ReturnType<SketchGroup["build"]>) => {
      const ink = scene.nodes.flatMap(layersOf).find((layer) => layer.role === "stroke");
      const points = ink?.paths.flatMap((p) =>
        p.flatMap((op) => (op.op === "Z" ? [] : [[op.x, op.y] as const])),
      );
      return points?.find(([x, y]) => Math.abs(x) + Math.abs(y) > 0) ?? [0, 0];
    };
    const size = { width: 40, height: 40 };
    const after = corner(turned.build(size));
    const before = corner(movedFirst.build(size));
    expect(Math.hypot(after[0] - before[0], after[1] - before[1])).toBeGreaterThan(1);
  });

  it("throws on a non-finite backing width and clamps a negative width to no sheet", () => {
    const view = new RoughView().with({ seed: 1n, strokeWidth: 2 }).draw(rectangle(10, 10, 20, 20));
    expect(() =>
      new SketchGroup([view], { ...sheet, width: Number.NaN }).build({ width: 80, height: 80 }),
    ).toThrow(StickerOptionsError);
    const scene = new SketchGroup([view], { ...sheet, width: -4 }).build({ width: 80, height: 80 });
    expect(scene.nodes.flatMap(layersOf).some((layer) => layer.role === "sheet")).toBe(false);
  });

  it("throws StickerOptionsError when a group shadow has no color", () => {
    const view = new RoughView().with({ seed: 1n, strokeWidth: 2 }).draw(rectangle(10, 10, 20, 20));
    const backing = {
      ...sheet,
      shadow: { opacity: 0.4, x: 3, y: 4, radius: 2 },
    };
    expect(() =>
      new SketchGroup([view], backing as unknown as typeof sheet).build({ width: 80, height: 80 }),
    ).toThrow(StickerOptionsError);
  });
});
