import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Ajv } from "ajv";
import { describe, expect, it } from "vitest";
import { defaultSketchOptions } from "../../core/src/options/index.js";

interface ShapesFixture {
  cases: { id: string; drawing: { sets: { ops: (string | number)[][] }[] } | null }[];
}

const read = (relative: string): unknown =>
  JSON.parse(readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8"));
const schema = (name: string) => read(`../schemas/${name}.schema.json`) as object;

const ajv = new Ajv({ strict: true, allErrors: true });
const validators = Object.fromEntries(
  ["options", "path-operations", "scene", "geometry-snapshot", "color", "seed"].map((name) => [
    name,
    ajv.compile(schema(name)),
  ]),
);
const validate = (name: string, value: unknown): boolean => validators[name]!(value);

/** Converts the exporter's compact `["C", ...]` rows to `PathOp` objects. */
function toPathOps(rows: (string | number)[][]): object[] {
  return rows.map((row) => {
    const [op, ...n] = row as [string, ...number[]];
    switch (op) {
      case "M":
      case "L":
        return { op, x: n[0], y: n[1] };
      case "Q":
        return { op, cx: n[0], cy: n[1], x: n[2], y: n[3] };
      case "C":
        return { op, c1x: n[0], c1y: n[1], c2x: n[2], c2y: n[3], x: n[4], y: n[5] };
      default:
        return { op };
    }
  });
}

describe("options schema", () => {
  it("accepts the default options", () => {
    expect(validate("options", JSON.parse(JSON.stringify(defaultSketchOptions())))).toBe(true);
  });

  it("accepts a seeded, filled configuration", () => {
    const options = {
      ...defaultSketchOptions(),
      seed: "18446744073709551615",
      fillStyle: "crossHatch",
      fillSpacingPattern: [1, 2, 3],
    };
    expect(validate("options", JSON.parse(JSON.stringify(options)))).toBe(true);
  });

  it.each([
    ["opacity above 1", { strokeOpacity: 1.5 }],
    ["opacity below 0", { fillOpacity: -0.1 }],
    ["miter limit below 1", { strokeMiterLimit: 0.5 }],
    ["fill spacing above 100", { fillSpacing: 101 }],
    ["scribble tightness not an integer", { scribbleTightness: 2.5 }],
    ["scribble curvature above 50", { scribbleCurvature: 51 }],
    ["unknown fill style", { fillStyle: "cross-hatch" }],
    ["bad seed string", { seed: "abc" }],
    ["negative seed", { seed: -1 }],
    ["unknown key", { roughnes: 1 }],
  ])("rejects %s", (_name, patch) => {
    expect(
      validate("options", { ...JSON.parse(JSON.stringify(defaultSketchOptions())), ...patch }),
    ).toBe(false);
  });

  it("rejects a missing required option", () => {
    const { roughness: _roughness, ...rest } = defaultSketchOptions();
    expect(validate("options", rest)).toBe(false);
  });
});

describe("path operation schema", () => {
  it("accepts every operation kind", () => {
    expect(
      validate("path-operations", [
        { op: "M", x: 0, y: 0 },
        { op: "L", x: 1, y: 1 },
        { op: "Q", cx: 0, cy: 1, x: 2, y: 2 },
        { op: "C", c1x: 0, c1y: 1, c2x: 2, c2y: 3, x: 4, y: 5 },
        { op: "Z" },
      ]),
    ).toBe(true);
  });

  it("accepts every operation set exported from Swift", () => {
    const fixture = read(
      "../../../fixtures/swift-reference/v1.5.0/shapes/shapes.json",
    ) as ShapesFixture;
    let checked = 0;
    for (const item of fixture.cases) {
      for (const set of item.drawing?.sets ?? []) {
        expect(validate("path-operations", toPathOps(set.ops)), item.id).toBe(true);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(40);
  });

  it.each([
    ["unknown op", [{ op: "X", x: 0, y: 0 }]],
    ["missing coordinate", [{ op: "L", x: 0 }]],
    ["extra property on Z", [{ op: "Z", x: 0 }]],
    ["string coordinate", [{ op: "M", x: "0", y: 0 }]],
    ["not an array", { op: "Z" }],
  ])("rejects %s", (_name, value) => {
    expect(validate("path-operations", value)).toBe(false);
  });
});

describe("scene schema", () => {
  const drawing = {
    shape: "rectangle",
    outline: [[{ op: "M", x: 0, y: 0 }, { op: "Z" }]],
    layers: [
      {
        role: "stroke",
        paths: [
          [
            { op: "M", x: 0, y: 0 },
            { op: "L", x: 5, y: 5 },
          ],
        ],
        fillRule: "nonzero",
        paint: { kind: "stroke" },
        strokeWidth: 1,
      },
    ],
  };
  const scene = {
    version: 1,
    size: { width: 100, height: 100 },
    nodes: [{ type: "drawing", drawing }],
    plugins: [{ id: "hachure", version: "1.0.0", api: "1.0" }],
  };

  it("accepts a scene with drawings and groups", () => {
    expect(validate("scene", scene)).toBe(true);
    expect(
      validate("scene", {
        ...scene,
        nodes: [{ type: "group", transform: [1, 0, 0, 1, 5, 5], children: scene.nodes }],
      }),
    ).toBe(true);
  });

  it.each([
    ["wrong version", { ...scene, version: 2 }],
    [
      "unknown layer role",
      {
        ...scene,
        nodes: [
          {
            type: "drawing",
            drawing: { ...drawing, layers: [{ ...drawing.layers[0], role: "sparkle" }] },
          },
        ],
      },
    ],
    [
      "bad matrix length",
      { ...scene, nodes: [{ type: "group", transform: [1, 0, 0, 1], children: [] }] },
    ],
    [
      "bad fill rule",
      {
        ...scene,
        nodes: [
          {
            type: "drawing",
            drawing: { ...drawing, layers: [{ ...drawing.layers[0], fillRule: "odd" }] },
          },
        ],
      },
    ],
    ["missing size", { version: 1, nodes: [] }],
  ])("rejects %s", (_name, value) => {
    expect(validate("scene", value)).toBe(false);
  });
});

describe("color, seed and snapshot schemas", () => {
  it("validates colors", () => {
    for (const ok of ["#fff", "rebeccapurple", [0, 0, 0], [1, 0.5, 0.25, 0.5]])
      expect(validate("color", ok)).toBe(true);
    for (const bad of ["", [0, 0], [0, 0, 0, 1, 1], [2, 0, 0], 5])
      expect(validate("color", bad)).toBe(false);
  });

  it("validates seeds: safe integers and decimal strings up to 20 digits", () => {
    for (const ok of [0, 42, Number.MAX_SAFE_INTEGER, "0", "18446744073709551615"])
      expect(validate("seed", ok)).toBe(true);
    for (const bad of [-1, 1.5, 2 ** 53, "", "0x2a", "123456789012345678901", "-1", null])
      expect(validate("seed", bad)).toBe(false);
  });

  it("validates geometry snapshots", () => {
    const snapshot = {
      bounds: { x: 0, y: 0, width: 10, height: 10 },
      opCount: 2,
      paths: [[{ op: "M", x: 0, y: 0 }, { op: "Z" }]],
    };
    expect(validate("geometry-snapshot", snapshot)).toBe(true);
    expect(validate("geometry-snapshot", { ...snapshot, opCount: -1 })).toBe(false);
    expect(validate("geometry-snapshot", { ...snapshot, opCount: 1.5 })).toBe(false);
    expect(validate("geometry-snapshot", { bounds: snapshot.bounds, paths: [] })).toBe(false);
  });
});
