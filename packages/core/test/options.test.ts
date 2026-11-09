import type { SketchOptions } from "@sketchy/types";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  ANIMATION_SPEED_SECONDS,
  ANIMATION_VARIANCE_FACTOR,
  OPTION_GROUPS,
  STRUCTURAL_SKETCH_KEYS,
  SKETCH_OPTIONS,
  applyRule,
  computedHachureGap,
  defaultSketchOptions,
  effectiveFillWeight,
  resolveFitScale,
  resolveTileWidth,
  swiftClamp,
} from "../src/options/index.js";
import type { NumericRule, OptionRule } from "../src/options/index.js";
import { decodeNumber, loadFixture } from "./fixtures.js";

type Json = number | string | boolean | null | Json[] | { [key: string]: Json };

interface ClampRow {
  input: number | string;
  stored: number | string;
}
interface ClampTable {
  param: string;
  kind: string;
  rows: ClampRow[];
}

const defaults = loadFixture<Record<string, Json>>("options/defaults.json");
const clamps =
  loadFixture<Record<string, ClampTable[] | string | unknown[]>>("options/clamps.json");

const isNumeric = (rule: OptionRule): rule is NumericRule =>
  rule.type === "float" || rule.type === "double" || rule.type === "int";

const asFloat = (rule: NumericRule, value: number) =>
  rule.type === "float" ? Math.fround(value) : value;

/** Maps fixture groups and parameters to spec rules. */
const GROUP_BY_FIXTURE: Record<
  string,
  { group: keyof typeof OPTION_GROUPS; rename?: Record<string, string> }
> = {
  crayonStyle: { group: "crayonStyle" },
  watercolorStyle: { group: "watercolorStyle" },
  stickerTear: { group: "stickerTear" },
  stickerTexture: { group: "stickerTexture" },
  stickerShadow: { group: "stickerShadow" },
  stickerBacking: {
    group: "stickerBacking",
    rename: { "fullySmooth.radius": "fullySmoothRadius" },
  },
  stickerImage: { group: "stickerImage" },
  animationConfig: { group: "animationConfig" },
};

/** Parameters whose stored value is computed by a helper rather than a plain rule. */
const DERIVED_PARAMS: Record<string, (input: number) => number> = {
  "stickerImage.resolvedTileWidth(imageWidth=100)": (scale) =>
    resolveTileWidth(applyRule(scale, OPTION_GROUPS.stickerImage.scale), 100),
  "stickerImage.resolvedFitScale": (scale) =>
    resolveFitScale(applyRule(scale, OPTION_GROUPS.stickerImage.scale)),
};

describe("swiftClamp", () => {
  it("follows Swift min/max NaN semantics: NaN collapses to the lower bound", () => {
    expect(swiftClamp(Number.NaN, 0, 1)).toBe(0);
    expect(swiftClamp(Number.NaN, 0.2, 1)).toBe(0.2);
    expect(Math.min(1, Math.max(0, Number.NaN))).toBeNaN();
  });

  it("passes infinity through when only a lower bound exists", () => {
    expect(swiftClamp(Number.POSITIVE_INFINITY, 0, undefined)).toBe(Number.POSITIVE_INFINITY);
    expect(swiftClamp(Number.NEGATIVE_INFINITY, 0, undefined)).toBe(0);
  });
});

describe("clamp rules against Swift clamp tables", () => {
  for (const [fixtureGroup, { group, rename }] of Object.entries(GROUP_BY_FIXTURE)) {
    const tables = clamps[fixtureGroup] as ClampTable[];
    for (const table of tables) {
      const key = rename?.[table.param] ?? table.param;
      it(`${fixtureGroup}.${table.param}`, () => {
        const derived = DERIVED_PARAMS[`${fixtureGroup}.${table.param}`];
        const rule = (OPTION_GROUPS[group] as Record<string, OptionRule>)[key];
        for (const row of table.rows) {
          const input = decodeNumber(row.input);
          const expected = decodeNumber(row.stored);
          if (derived) {
            expect(derived(input), `input ${row.input}`).toBe(expected);
            continue;
          }
          expect(rule, `missing spec rule for ${fixtureGroup}.${table.param}`).toBeDefined();
          if (!rule || !isNumeric(rule)) throw new Error("expected a numeric rule");
          if (rule.type === "int" && !Number.isFinite(input)) continue;
          expect(applyRule(input, rule), `input ${row.input}`).toBe(asFloat(rule, expected));
        }
      });
    }
  }

  it("covers every clamp table the exporter produced", () => {
    const exported = Object.keys(clamps).filter((k) => !["note", "optionsDerived"].includes(k));
    expect(exported.sort()).toEqual(Object.keys(GROUP_BY_FIXTURE).sort());
  });
});

describe("Options derived values", () => {
  const rows = clamps["optionsDerived"] as {
    strokeWidth: number;
    fillWeight: number;
    fillSpacing: number;
    effectiveFillWeight: number;
    computedHachureGap: number;
  }[];

  it("effectiveFillWeight and computedHachureGap match Swift for every row", () => {
    expect(rows.length).toBeGreaterThan(50);
    for (const row of rows) {
      expect(effectiveFillWeight(row.strokeWidth, row.fillWeight)).toBe(
        Math.fround(row.effectiveFillWeight),
      );
      expect(computedHachureGap(row.strokeWidth, row.fillWeight, row.fillSpacing)).toBe(
        Math.fround(row.computedHachureGap),
      );
    }
  });
});

describe("defaults against Swift Mirror dump", () => {
  const sketch = (defaults["options"] as Record<string, Json>) ?? {};

  it("every Options field is covered by a scalar rule or the structural list", () => {
    const covered = new Set<string>([...Object.keys(SKETCH_OPTIONS), ...STRUCTURAL_SKETCH_KEYS]);
    const missing = Object.keys(sketch).filter((key) => !covered.has(key));
    expect(missing).toEqual([]);
    const stale = [...covered].filter((key) => !(key in sketch));
    expect(stale).toEqual([]);
  });

  it("scalar defaults equal Swift defaults", () => {
    for (const [key, rule] of Object.entries(SKETCH_OPTIONS) as [string, OptionRule][]) {
      const swift = sketch[key];
      if (isNumeric(rule))
        expect(asFloat(rule, rule.default), key).toBe(asFloat(rule, swift as number));
      else expect(rule.default, key).toBe(swift);
    }
  });

  it("structural defaults equal Swift defaults", () => {
    const options = defaultSketchOptions();
    expect(sketch["seed"]).toBeNull();
    expect(options.seed).toBeUndefined();
    expect(sketch["fillOffset"]).toEqual({ width: 0, height: 0 });
    expect(options.fillOffset).toEqual({ x: 0, y: 0 });
    expect((sketch["strokeColor"] as { uiColor: Json }).uiColor).toEqual({
      r: 0,
      g: 0,
      b: 0,
      a: 1,
    });
    expect(options.strokeColor).toEqual([0, 0, 0, 1]);
    expect((sketch["fillColor"] as { uiColor: Json }).uiColor).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    expect(options.fillColor).toEqual([0, 0, 0, 0]);
    for (const nullable of [
      "fillSpacingPattern",
      "scribbleTightnessPattern",
      "svgFillWeight",
      "svgStrokeWidth",
      "stickerBacking",
    ]) {
      expect(sketch[nullable], nullable).toBeNull();
    }
    const profile = sketch["brushProfile"] as Record<string, Json>;
    expect(profile).toMatchObject({
      cap: "round",
      join: "round",
      thicknessProfile: "uniform",
      opacityProfile: "uniform",
      crayon: null,
      watercolor: null,
    });
    expect(profile["tip"]).toEqual({ roundness: 1, angle: 0, directionSensitive: false });
    expect(options.brushProfile).toEqual({
      tip: { roundness: 1, angle: 0, directionSensitive: false },
      thicknessProfile: { kind: "uniform" },
      cap: "round",
      join: "round",
      opacityProfile: { kind: "uniform" },
    });
  });

  it("style defaults equal Swift defaults", () => {
    const compare = (
      fixtureKey: string,
      table: Record<string, OptionRule>,
      structural: string[] = [],
    ) => {
      const swift = defaults[fixtureKey] as Record<string, Json>;
      for (const [swiftKey, value] of Object.entries(swift)) {
        if (swiftKey === "seed" || structural.includes(swiftKey)) continue;
        const rule = table[swiftKey];
        expect(rule, `${fixtureKey}.${swiftKey} has no spec rule`).toBeDefined();
        if (rule && isNumeric(rule))
          expect(asFloat(rule, rule.default), `${fixtureKey}.${swiftKey}`).toBe(
            asFloat(rule, value as number),
          );
      }
    };
    compare("crayonStyle", OPTION_GROUPS.crayonStyle);
    compare("watercolorStyle", OPTION_GROUPS.watercolorStyle);
    compare("stickerTear", OPTION_GROUPS.stickerTear);
    compare("stickerTexturePaper", OPTION_GROUPS.stickerTexture);
    compare("stickerShadow", OPTION_GROUPS.stickerShadow, ["inkColor"]);
    compare("stickerBacking", OPTION_GROUPS.stickerBacking, [
      "edge",
      "image",
      "paperColor",
      "shadow",
      "texture",
    ]);
    compare("animationConfig", OPTION_GROUPS.animationConfig, ["speed", "variance"]);
  });

  it("animation speed and variance constants equal Swift", () => {
    const animation = defaults["animation"] as {
      speedDurationSeconds: Json;
      varianceFactor: Record<string, number>;
    };
    expect(animation.speedDurationSeconds).toEqual(ANIMATION_SPEED_SECONDS);
    for (const [name, factor] of Object.entries(animation.varianceFactor)) {
      expect(
        Math.fround(ANIMATION_VARIANCE_FACTOR[name as keyof typeof ANIMATION_VARIANCE_FACTOR]),
      ).toBe(Math.fround(factor));
    }
  });

  it("fill style raw values map to the TypeScript camelCase names", () => {
    const raw = defaults["fillStyleRawValues"] as Record<string, string>;
    const names = Object.keys(raw).sort();
    const fillStyle = SKETCH_OPTIONS.fillStyle.values;
    expect([...fillStyle].sort()).toEqual(names);
    expect(raw).toMatchObject({
      crossHatch: "cross-hatch",
      sunBurst: "sunburst",
      starBurst: "starburst",
      zigzagLine: "zigzag-line",
    });
  });
});

describe("SketchOptions type coverage", () => {
  it("the spec keys plus structural keys are exactly the keys of SketchOptions", () => {
    type Covered = keyof typeof SKETCH_OPTIONS | (typeof STRUCTURAL_SKETCH_KEYS)[number];
    expectTypeOf<Covered>().toEqualTypeOf<keyof SketchOptions>();
  });

  it("defaultSketchOptions returns a fresh object each call", () => {
    const a = defaultSketchOptions();
    const b = defaultSketchOptions();
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    expect(a.fillOffset).not.toBe(b.fillOffset);
  });
});
