import { describe, expect, expectTypeOf, it } from "vitest";
import {
  PLUGIN_API_VERSION,
  defineBrush,
  defineFill,
  defineStickerEdge,
  defineTexture,
  assertDeterministic,
  s,
  type BrushPlugin,
  type PluginContext,
  type Resolved,
} from "../src/index.js";

const options = {
  passes: s.int({ default: 2, min: 1, max: 3, description: "Rough passes." }),
  grain: s.number({ default: 0.3, min: 0, max: 1, unit: "ratio", description: "Paper tooth." }),
  mode: s.choice({ default: "soft", values: ["soft", "hard"], description: "Edge mode." }),
} as const;

const meta = {
  version: "0.1.0",
  api: "1.0",
  title: "Test",
  description: "A test plugin.",
  options,
} as const;

const unusedContext = {} as PluginContext;

describe("define*", () => {
  const brush = defineBrush({
    id: "contrib/test-brush",
    ...meta,
    generate: (input, opts) => [
      { role: "stroke", paths: [input.path], paint: { kind: "stroke", alpha: opts.grain } },
    ],
  });

  it("attaches kind and the ~sketchy brand", () => {
    expect(brush.kind).toBe("brush");
    expect(brush["~sketchy"]).toBe("brush");
    expect(defineFill({ id: "f", ...meta, generate: () => [] }).kind).toBe("fill");
    expect(defineTexture({ id: "t", ...meta, generate: () => [] }).kind).toBe("texture");
    expect(defineStickerEdge({ id: "e", ...meta, generate: () => [] }).kind).toBe("edge");
  });

  it("deep-freezes the definition including the option schema", () => {
    expect(Object.isFrozen(brush)).toBe(true);
    expect(Object.isFrozen(brush.options)).toBe(true);
    expect(Object.isFrozen(brush.options.passes)).toBe(true);
    expect(() => {
      (brush.options.passes as { default: number }).default = 9;
    }).toThrow(TypeError);
  });

  it("with() returns a reference to the same plugin with overrides", () => {
    const ref = brush.with({ passes: 3 });
    expect(ref.plugin).toBe(brush);
    expect(ref.options).toEqual({ passes: 3 });
    expect(brush.with().options).toEqual({});
  });

  it("generate receives the resolved options object it is given and does not mutate the definition", () => {
    const layers = brush.generate(
      {
        path: [],
        bounds: { x: 0, y: 0, width: 1, height: 1 },
        stroke: {
          width: 1,
          color: "#000",
          opacity: 1,
          cap: "round",
          join: "round",
          miterLimit: 10,
        },
      },
      { passes: 2, grain: 0.5, mode: "soft" },
      unusedContext,
    );
    expect(layers[0]?.paint).toEqual({ kind: "stroke", alpha: 0.5 });
  });

  it("has no side effects: defining twice yields independent objects", () => {
    const a = defineBrush({ id: "x", ...meta, generate: () => [] });
    const b = defineBrush({ id: "x", ...meta, generate: () => [] });
    expect(a).not.toBe(b);
  });

  it("infers option types from the schema", () => {
    expectTypeOf<Resolved<typeof options>>().toEqualTypeOf<{
      readonly passes: number;
      readonly grain: number;
      readonly mode: "soft" | "hard";
    }>();
    expectTypeOf(brush).toMatchTypeOf<BrushPlugin>();
    // @ts-expect-error passes must be a number
    brush.with({ passes: "x" });
    // @ts-expect-error mode must be one of the declared values
    brush.with({ mode: "medium" });
  });

  it("exposes the API version constant", () => {
    expect(PLUGIN_API_VERSION).toEqual({ major: 1, minor: 1 });
  });

  it("validates definition shape and option defaults in development", () => {
    expect(() => defineBrush({ ...meta, id: "", generate: () => [] })).toThrow(/id/);
    expect(() =>
      defineBrush({
        ...meta,
        id: "bad/default",
        options: { passes: s.int({ default: 4, min: 1, max: 3, description: "Bad." }) },
        generate: () => [],
      }),
    ).toThrow(/outside/);
    expect(() => defineBrush({ ...meta, id: "bad/generate", generate: "nope" as never })).toThrow(
      /generate/,
    );
  });

  it("provides deterministic and Math.random conformance checks", () => {
    expect(() => assertDeterministic(() => ({ value: 1 }))).not.toThrow();
    expect(() => assertDeterministic(() => ({ value: Math.random() }))).toThrow(/Math.random/);
    expect(() => assertDeterministic(() => ({ value: Math.random() }))).toThrow(/Math.random/);
  });
});
