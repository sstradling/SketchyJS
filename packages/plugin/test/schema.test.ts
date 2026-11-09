import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { s, type OptionSchema } from "../src/index.js";
import {
  PluginApiError,
  PluginOptionError,
  assertPluginApi,
  canonicalJson,
  checkPluginApi,
  hashOptions,
  resolveOptions,
  toJsonSchema,
  validateDefinition,
  validateSchema,
} from "../src/schema/index.js";

const schema = {
  passes: s.int({ default: 2, min: 1, max: 3, description: "Passes." }),
  grain: s.number({ default: 0.3, min: 0, max: 1, description: "Grain." }),
  soft: s.boolean({ default: true, description: "Soft." }),
  mode: s.choice({ default: "a", values: ["a", "b"], description: "Mode." }),
  tint: s.color({ default: "inherit", description: "Tint." }),
  span: s.range({ default: [0.2, 0.8], min: 0, max: 1, description: "Span." }),
} as const satisfies OptionSchema;

describe("resolveOptions (lenient)", () => {
  it("fills defaults for missing and undefined options without diagnostics", () => {
    const { value, diagnostics } = resolveOptions(schema, { grain: undefined });
    expect(value).toEqual({
      passes: 2,
      grain: 0.3,
      soft: true,
      mode: "a",
      tint: "inherit",
      span: [0.2, 0.8],
    });
    expect(diagnostics).toEqual([]);
  });

  it("clamps out-of-range numbers and reports option-clamped", () => {
    const { value, diagnostics } = resolveOptions(schema, { grain: 5, passes: -4 });
    expect(value.grain).toBe(1);
    expect(value.passes).toBe(1);
    expect(diagnostics.map((d) => d.code)).toEqual(["option-clamped", "option-clamped"]);
  });

  it("uses the default for NaN, infinity and wrong types (option-invalid)", () => {
    const { value, diagnostics } = resolveOptions(schema, {
      grain: Number.NaN,
      passes: Number.POSITIVE_INFINITY,
      soft: "yes",
      mode: "zzz",
      tint: 5,
    });
    expect(value).toMatchObject({ grain: 0.3, passes: 2, soft: true, mode: "a", tint: "inherit" });
    expect(diagnostics.every((d) => d.code === "option-invalid")).toBe(true);
    expect(diagnostics).toHaveLength(5);
  });

  it("rounds fractional ints to nearest and reports option-rounded", () => {
    const { value, diagnostics } = resolveOptions(schema, { passes: 2.6 });
    expect(value.passes).toBe(3);
    expect(diagnostics.map((d) => d.code)).toEqual(["option-rounded"]);
  });

  it("rounds before clamping", () => {
    const { value } = resolveOptions(schema, { passes: 3.6 });
    expect(value.passes).toBe(3);
  });

  it("swaps reversed ranges and clamps each end", () => {
    const { value, diagnostics } = resolveOptions(schema, { span: [0.9, 0.1] });
    expect(value.span).toEqual([0.1, 0.9]);
    expect(diagnostics.map((d) => d.code)).toEqual(["option-swapped"]);
    expect(resolveOptions(schema, { span: [-1, 2] }).value.span).toEqual([0, 1]);
  });

  it("rejects malformed ranges", () => {
    for (const bad of [[1], [1, 2, 3], ["a", 1], [Number.NaN, 1], "x"]) {
      expect(resolveOptions(schema, { span: bad }).value.span).toEqual([0.2, 0.8]);
    }
  });

  it("ignores unknown keys with option-unknown but ignores the host-owned seed silently", () => {
    const { value, diagnostics } = resolveOptions(schema, { nope: 1, seed: 7 });
    expect(value).not.toHaveProperty("nope");
    expect(value).not.toHaveProperty("seed");
    expect(diagnostics.map((d) => [d.code, d.option])).toEqual([["option-unknown", "nope"]]);
  });

  it("is idempotent: resolving a resolved object changes nothing", () => {
    const once = resolveOptions(schema, { grain: 5, passes: 9 }).value;
    expect(resolveOptions(schema, once).value).toEqual(once);
    expect(resolveOptions(schema, once).diagnostics).toEqual([]);
  });

  it("does not let prototype keys leak in", () => {
    const hostile = JSON.parse('{"__proto__": {"polluted": true}, "constructor": 1}') as Record<
      string,
      unknown
    >;
    const { value } = resolveOptions(schema, hostile);
    expect(value).not.toHaveProperty("polluted");
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
  });
});

describe("resolveOptions (strict)", () => {
  it.each([
    ["clamped", { grain: 5 }, "option-clamped"],
    ["invalid", { grain: Number.NaN }, "option-invalid"],
    ["rounded", { passes: 1.5 }, "option-rounded"],
    ["unknown", { nope: 1 }, "option-unknown"],
    ["swapped", { span: [0.9, 0.1] }, "option-swapped"],
    ["bad choice", { mode: "zzz" }, "option-invalid"],
  ])("throws PluginOptionError for %s", (_name, overrides, code) => {
    try {
      resolveOptions(schema, overrides, "strict");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(PluginOptionError);
      expect((error as PluginOptionError).code).toBe(code);
    }
  });

  it("accepts valid options", () => {
    expect(resolveOptions(schema, { grain: 0.5, passes: 3 }, "strict").value.grain).toBe(0.5);
  });
});

describe("validateSchema and validateDefinition", () => {
  it("accepts a valid schema", () => {
    expect(validateSchema(schema)).toEqual([]);
  });

  it("reports every class of mistake", () => {
    const bad = {
      Bad_Name: s.number({ default: 5, min: 0, max: 1, description: "x" }),
      seed: s.boolean({ default: true, description: "reserved" }),
      noDesc: s.boolean({ default: true, description: " " }),
      minMax: s.number({ default: 0, min: 2, max: 1, description: "x" }),
      fractionalInt: s.int({ default: 1.5, min: 0, max: 3, description: "x" }),
      intBounds: s.int({ default: 1, min: 0.5, max: 3, description: "x" }),
      emptyChoice: s.choice({ default: "a" as never, values: [], description: "x" }),
      dupChoice: s.choice({ default: "a", values: ["a", "a"], description: "x" }),
      offChoice: s.choice({ default: "c" as never, values: ["a", "b"], description: "x" }),
      badRange: s.range({ default: [0.9, 0.1], min: 0, max: 1, description: "x" }),
      logZero: s.number({ default: 1, min: 0, max: 2, scale: "log", description: "x" }),
      badStep: s.number({ default: 1, min: 0, max: 2, step: 0, description: "x" }),
      badUi: s.number({ default: 1, min: 0, max: 2, uiMin: -1, description: "x" }),
      noColor: s.color({ default: "", description: "x" }),
    } as unknown as OptionSchema;
    const problems = validateSchema(bad).join("\n");
    for (const needle of [
      "Bad_Name",
      '"seed": name is reserved',
      "noDesc",
      "min <= max",
      "int default must be an integer",
      "int min and max must be integers",
      "values must not be empty",
      "values must be unique",
      "default must be one of values",
      "min <= lo <= hi <= max",
      "log scale needs min > 0",
      "step must be > 0",
      "uiMin and uiMax",
      "default must be a color string",
    ]) {
      expect(problems, needle).toContain(needle);
    }
  });

  it("validates definition metadata", () => {
    const ok = {
      id: "contrib/charcoal",
      version: "1.2.3",
      api: "1.0",
      title: "T",
      description: "D",
      options: schema,
    } as const;
    expect(validateDefinition(ok)).toEqual([]);
    expect(validateDefinition({ ...ok, id: "Bad Id" }).join()).toContain("kebab-case");
    expect(validateDefinition({ ...ok, version: "1" }).join()).toContain("semver");
    expect(validateDefinition({ ...ok, api: "one" as never }).join()).toContain('api "one"');
    expect(validateDefinition({ ...ok, title: " " }).join()).toContain("title");
  });
});

describe("toJsonSchema", () => {
  const ajv = new Ajv2020({ strict: false });
  const json = toJsonSchema(schema, { title: "Test", seed: true });
  const validate = ajv.compile(json);

  it("accepts resolved defaults and valid overrides", () => {
    expect(validate(resolveOptions(schema, {}).value)).toBe(true);
    expect(validate({ grain: 0.5, seed: 7 })).toBe(true);
    expect(validate({ seed: "18446744073709551615" })).toBe(true);
  });

  it("rejects out-of-range, wrong-typed and unknown values", () => {
    expect(validate({ grain: 2 })).toBe(false);
    expect(validate({ passes: 1.5 })).toBe(false);
    expect(validate({ mode: "z" })).toBe(false);
    expect(validate({ span: [0.5] })).toBe(false);
    expect(validate({ span: [0.5, 2] })).toBe(false);
    expect(validate({ nope: 1 })).toBe(false);
    expect(validate({ seed: -1 })).toBe(false);
  });

  it("omits seed unless requested", () => {
    expect(toJsonSchema(schema).properties).not.toHaveProperty("seed");
  });

  it("is serializable plain data", () => {
    expect(JSON.parse(JSON.stringify(json))).toEqual(json);
  });
});

describe("hashOptions and canonicalJson", () => {
  it("is stable across key order and ignores undefined", () => {
    expect(canonicalJson({ b: 1, a: [2, { d: 1, c: undefined }] })).toBe('{"a":[2,{"d":1}],"b":1}');
    expect(hashOptions("x", "1.0.0", { a: 1, b: 2 })).toBe(
      hashOptions("x", "1.0.0", { b: 2, a: 1 }),
    );
  });

  it("changes with id, version and values", () => {
    const base = hashOptions("x", "1.0.0", { a: 1 });
    expect(hashOptions("y", "1.0.0", { a: 1 })).not.toBe(base);
    expect(hashOptions("x", "1.0.1", { a: 1 })).not.toBe(base);
    expect(hashOptions("x", "1.0.0", { a: 2 })).not.toBe(base);
  });

  it("shares a cache entry for {} and explicit defaults once resolved", () => {
    const a = hashOptions("x", "1", resolveOptions(schema, {}).value);
    const b = hashOptions("x", "1", resolveOptions(schema, { passes: 2 }).value);
    expect(a).toBe(b);
  });
});

describe("plugin API compatibility", () => {
  it("accepts equal or lower minor with the same major", () => {
    expect(checkPluginApi("a/b", "1.0").ok).toBe(true);
    expect(checkPluginApi("a/b", "1.1", { major: 1, minor: 2 }).ok).toBe(true);
  });

  it("rejects a newer minor with the documented message", () => {
    const result = checkPluginApi("acme/chalk", "1.2", { major: 1, minor: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(PluginApiError);
      expect(result.error.code).toBe("api-minor-too-high");
      expect(result.error.message).toBe(
        "acme/chalk needs plugin API 1.2, host provides 1.1. Upgrade @sketchy/scene.",
      );
    }
  });

  it("rejects major mismatches in both directions and malformed strings", () => {
    expect(checkPluginApi("a/b", "2.0").ok).toBe(false);
    expect(checkPluginApi("a/b", "0.9").ok).toBe(false);
    expect(() => assertPluginApi("a/b", "1.x")).toThrow(PluginApiError);
    expect(() => assertPluginApi("a/b", "1.0")).not.toThrow();
  });
});
