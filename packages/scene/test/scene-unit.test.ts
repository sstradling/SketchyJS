import { describe, expect, it } from "vitest";
import { circle, polygon, rectangle } from "@sketchy-js/core";
import { defaultSketchOptions } from "@sketchy-js/core/options";
import { defineFill, s } from "@sketchy-js/plugin";
import type { Path } from "@sketchy-js/types";
import { alignFillStroke } from "../src/assemble.js";
import { PluginNotRegisteredError, PluginRegistrationError } from "../src/errors.js";
import { resolvePluginOptions } from "../src/options-resolve.js";
import { createSketchy } from "../src/registry.js";
import { computeSvgTransform, IDENTITY, transformPath } from "../src/transform.js";
import { RoughView, sketch } from "../src/basic.js";

const size = { width: 100, height: 100 };

describe("computeSvgTransform (SVG fit semantics)", () => {
  it("scales uniformly and centers the control-point box", () => {
    const [a, b, c, d, e, f] = computeSvgTransform("M0 0 L50 25", size);
    expect([a, b, c, d]).toEqual([2, 0, 0, 2]);
    expect(e).toBe(0);
    expect(f).toBe(25);
  });

  it("accounts for a non-zero origin", () => {
    const [a, , , , e, f] = computeSvgTransform("M10 10 L30 30", size);
    expect(a).toBe(5);
    expect(e).toBeCloseTo(-50 + 0, 6);
    expect(f).toBeCloseTo(-50 + 0, 6);
  });

  it("uses control points, not the curve, for the box", () => {
    const [a] = computeSvgTransform("M0 0 C0 100 100 100 100 0", size);
    expect(a).toBe(1);
  });

  it("returns the identity for a zero-width or zero-height box", () => {
    expect(computeSvgTransform("M0 0 L10 0", size)).toBe(IDENTITY);
    expect(computeSvgTransform("M5 5", size)).toBe(IDENTITY);
  });

  it("clamps a degenerate canvas to 1 x 1", () => {
    const [a] = computeSvgTransform("M0 0 L10 10", { width: 0, height: -5 });
    expect(a).toBeCloseTo(0.1, 10);
  });
});

describe("transformPath", () => {
  it("applies the matrix to every point and keeps Z", () => {
    const path: Path = [
      { op: "M", x: 1, y: 1 },
      { op: "Q", cx: 2, cy: 2, x: 3, y: 3 },
      { op: "C", c1x: 1, c1y: 0, c2x: 0, c2y: 1, x: 1, y: 1 },
      { op: "Z" },
    ];
    const out = transformPath(path, [2, 0, 0, 3, 10, 20]);
    expect(out[0]).toEqual({ op: "M", x: 12, y: 23 });
    expect(out[1]).toEqual({ op: "Q", cx: 14, cy: 26, x: 16, y: 29 });
    expect(out[2]).toEqual({ op: "C", c1x: 12, c1y: 20, c2x: 10, c2y: 23, x: 12, y: 23 });
    expect(out[3]).toEqual({ op: "Z" });
  });

  it("returns the same array for the identity matrix", () => {
    const path: Path = [{ op: "M", x: 1, y: 1 }];
    expect(transformPath(path, IDENTITY)).toBe(path);
  });
});

describe("alignFillStroke", () => {
  const shape: Path = [{ op: "M", x: 0, y: 0 }, { op: "Z" }];

  it("leaves a centered stroke unclipped", () => {
    expect(alignFillStroke(3, "center", shape)).toEqual({ width: 3 });
  });

  it("doubles the width and clips to the shape for inside alignment", () => {
    expect(alignFillStroke(3, "inside", shape)).toEqual({
      width: 6,
      clip: { paths: [shape], fillRule: "nonzero" },
    });
  });

  it("uses an inverse clip for outside alignment", () => {
    expect(alignFillStroke(3, "outside", shape).clip).toEqual({
      paths: [shape],
      fillRule: "nonzero",
      inverse: true,
    });
  });

  it("ignores alignment without an SVG shape", () => {
    expect(alignFillStroke(3, "inside", undefined)).toEqual({ width: 3 });
  });
});

describe("plugin option resolution", () => {
  const plugin = {
    id: "t",
    options: { n: s.int({ default: 2, min: 1, max: 5, description: "n" }) },
  };

  it("applies defaults and overrides", () => {
    expect(resolvePluginOptions(plugin)).toEqual({ n: 2 });
    expect(resolvePluginOptions(plugin, { n: 4 })).toEqual({ n: 4 });
  });

  it("rejects unknown names, wrong types and out-of-range values", () => {
    expect(() => resolvePluginOptions(plugin, { m: 1 })).toThrow(/no option "m"/);
    expect(() => resolvePluginOptions(plugin, { n: 1.5 })).toThrow(TypeError);
    expect(() => resolvePluginOptions(plugin, { n: 9 })).toThrow(RangeError);
  });
});

describe("SketchyRegistry", () => {
  const make = (id: string) =>
    defineFill({
      id,
      version: "1.0.0",
      api: "1.1",
      title: id,
      description: id,
      options: { gap: s.number({ default: 3, min: 0.1, max: 50, description: "gap" }) },
      generate: () => [],
    });

  it("is immutable: use returns a new registry", () => {
    const base = createSketchy();
    const next = base.use(make("alpha"));
    expect(base.has("fill", "alpha")).toBe(false);
    expect(next.has("fill", "alpha")).toBe(true);
  });

  it("rejects a different plugin under the same id unless replace is set", () => {
    const registry = createSketchy().use(make("alpha"));
    expect(() => registry.use(make("alpha"))).toThrow(PluginRegistrationError);
    expect(registry.use(make("alpha"), { replace: true }).has("fill", "alpha")).toBe(true);
  });

  it("accepts the identical plugin twice", () => {
    const plugin = make("alpha");
    expect(() => createSketchy().use(plugin).use(plugin)).not.toThrow();
  });

  it("resolves aliases, refs and registered ids with explicit options", () => {
    const plugin = make("alpha");
    const registry = createSketchy().use(plugin, { alias: "a" });
    expect(registry.resolveSpec("fill", { kind: "a", gap: 7 }).options).toEqual({ gap: 7 });
    expect(registry.resolveSpec("fill", plugin).options).toEqual({ gap: 3 });
    expect(registry.find("fill", "a")).toBe(plugin);
    expect(registry.list("fill")).toEqual([plugin]);
  });

  it("reports unregistered plugins and kind mismatches", () => {
    const registry = createSketchy();
    expect(() => registry.resolveSpec("fill", { kind: "missing" })).toThrow(
      PluginNotRegisteredError,
    );
    expect(() => registry.resolveSpec("brush", make("alpha"))).toThrow(/not a brush/);
    expect(() => registry.resolveSpec("fill", 42)).toThrow(TypeError);
  });

  it("rejects ids that do not match the id pattern", () => {
    expect(() => createSketchy().use(make("Bad Id"))).toThrow(TypeError);
  });
});

describe("custom fill plugins through the scene builder", () => {
  const stripes = defineFill({
    id: "stripes",
    version: "2.0.0",
    api: "1.1",
    title: "Stripes",
    description: "Horizontal stripes.",
    options: { rows: s.int({ default: 3, min: 1, max: 20, description: "Rows." }) },
    stream: "shared",
    generate(input, options, ctx) {
      const { x, y, width, height } = input.region.bounds;
      const lines = Array.from({ length: options.rows }, (_, i) =>
        ctx.geom.rough.line(
          { x, y: y + ((i + 0.5) * height) / options.rows },
          { x: x + width, y: y + ((i + 0.5) * height) / options.rows },
        ),
      );
      return [{ kind: "strokes", centerlines: [lines.flat()], clip: "none" }];
    },
  });

  it("draws plugin output and records which plugin built the scene", () => {
    const scene = createSketchy()
      .use(stripes)
      .view()
      .with({ seed: 1n, fill: stripes.with({ rows: 5 }) })
      .draw(rectangle(0, 0, 40, 40))
      .build(size);
    const layers = scene.nodes[0]!.type === "drawing" ? scene.nodes[0]!.drawing.layers : [];
    expect(layers.map((l) => l.role)).toEqual(["fill", "stroke"]);
    expect(scene.plugins).toEqual([{ id: "stripes", version: "2.0.0", api: "1.1" }]);
  });

  it("uses a direct plugin object without registration", () => {
    const scene = new RoughView()
      .with({ seed: 1n, fill: stripes })
      .draw(rectangle(0, 0, 40, 40))
      .build(size);
    expect(scene.diagnostics).toBeUndefined();
  });
});

describe("scene building", () => {
  const roles = (scene: ReturnType<typeof sketch>): string[] =>
    scene.nodes.flatMap((n) => (n.type === "drawing" ? n.drawing.layers.map((l) => l.role) : []));

  it("paints the fill before the outline", () => {
    expect(
      roles(sketch(rectangle(0, 0, 50, 50), size, { seed: 1n, fillStyle: "hachure" })),
    ).toEqual(["fill", "stroke"]);
    expect(roles(sketch(circle(50, 50, 40), size, { seed: 1n, fillStyle: "solid" }))).toEqual([
      "fill",
      "stroke",
    ]);
  });

  it("is repeatable and seed-dependent", () => {
    const a = sketch(circle(50, 50, 40), size, { seed: 3n });
    expect(JSON.stringify(sketch(circle(50, 50, 40), size, { seed: 3n }))).toBe(JSON.stringify(a));
    expect(JSON.stringify(sketch(circle(50, 50, 40), size, { seed: 4n }))).not.toBe(
      JSON.stringify(a),
    );
  });

  it("creates one node per fill spacing pass with growing weight", () => {
    const scene = sketch(rectangle(0, 0, 50, 50), size, {
      seed: 1n,
      fillStyle: "hachure",
      fillSpacingPattern: [1, 2, 3],
    });
    expect(scene.nodes).toHaveLength(3);
    const widths = scene.nodes.map((n) =>
      n.type === "drawing" ? n.drawing.layers[0]!.strokeWidth! : 0,
    );
    expect(widths[1]!).toBeGreaterThan(widths[0]!);
    expect(widths[2]!).toBeGreaterThan(widths[1]!);
  });

  it("reports unsupported scribble and watercolor fills once and still draws the outline", () => {
    const scene = sketch([rectangle(0, 0, 20, 20), rectangle(30, 30, 20, 20)], size, {
      seed: 1n,
      fillStyle: "scribble",
    });
    expect(scene.diagnostics?.map((d) => d.code)).toEqual(["fill-style-unsupported"]);
    expect(roles(scene)).toEqual(["stroke", "stroke"]);
  });

  it("reports unsupported brush profiles and sticker backing", () => {
    const scene = sketch(rectangle(0, 0, 20, 20), size, {
      seed: 1n,
      brushProfile: { ...defaultSketchOptions().brushProfile, crayon: { grain: 0.5 } as never },
      stickerBacking: { kind: "sheet" } as never,
    });
    expect(scene.diagnostics?.map((d) => d.code).sort()).toEqual([
      "brush-unsupported",
      "sticker-unsupported",
    ]);
  });

  it("skips shapes with no points", () => {
    const scene = sketch(polygon([]), size, { seed: 1n });
    expect(scene.nodes).toEqual([]);
    expect(scene.diagnostics?.map((d) => d.code)).toEqual(["shape-empty"]);
  });

  it("stacks views without sharing state", () => {
    const base = new RoughView().with({ seed: 1n });
    const a = base.with({ strokeWidth: 5 }).draw(rectangle(0, 0, 10, 10));
    const b = base.draw(rectangle(0, 0, 10, 10));
    expect(a.build(size)).not.toEqual(b.build(size));
    expect(base.build(size).nodes).toEqual([]);
  });
});
