import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { circle, roundedRectangle, type Shape } from "@sketchy-js/core";
import { crayon } from "@sketchy-js/brushes";
import { contour, wash } from "@sketchy-js/fills";
import type { Color, DrawLayer, InteriorShade, SceneNode } from "@sketchy-js/types";
import { closeRingContours } from "./support/close-ring.js";
import { assembleDrawing } from "../src/assemble.js";
import { basicSketchy } from "../src/basic.js";
import { applyCrayon } from "../src/brush-host.js";
import { sketchScene } from "../src/functional.js";
import { edgeShade, halo, pitRecess, pitShadow } from "../src/shades.js";
import { toFixtureOps } from "./support/compare-sets.js";
import { compareOps, generateFixtureDrawing, TOLERANCE, type FixtureOp } from "./support/swift.js";

/**
 * Rendered commands for the 1.6.0 cases whose geometry is a path, not only a
 * generator set: closed ribbons, crayon wax, the contour hole clip, and shade
 * silhouettes. Structure first, then 1e-4 px.
 */

const root = fileURLToPath(new URL("../../../fixtures/swift-reference/v1.6.0/", import.meta.url));
const read = <T>(relative: string): T => JSON.parse(readFileSync(root + relative, "utf8")) as T;

interface Command {
  style: string;
  fillRule: string;
  path: FixtureOp[];
  clip?: FixtureOp[];
  lineWidth?: number;
  color: { r: number; g: number; b: number; a: number };
  shade?: {
    kind: string;
    opacity?: number;
    x?: number;
    y?: number;
    blur?: number;
    glow?: number;
    width?: number;
    angle?: number;
    center?: [number, number];
    startRadius?: number;
    endRadius?: number;
    color?: { r: number; g: number; b: number; a: number };
    stops?: {
      location: number;
      opacity: number;
      color: { r: number; g: number; b: number; a: number };
    }[];
  };
}

const registry = basicSketchy.use(contour).use(wash).use(crayon);

function expectClose(
  actual: readonly FixtureOp[],
  expected: readonly FixtureOp[],
  label: string,
): void {
  const result = compareOps(actual, expected);
  expect(result.structural, `${label}: ${result.message ?? "structure"}`).toBe(true);
  expect(result.maxDelta, `${label} max delta ${result.maxDelta}`).toBeLessThanOrEqual(TOLERANCE);
}

function layersOf(node: SceneNode): readonly DrawLayer[] {
  if (node.type !== "drawing") throw new Error(`expected a drawing, got ${node.type}`);
  return node.drawing.layers;
}

function sceneLayers(
  shape: Shape,
  size: { width: number; height: number },
  options: Record<string, unknown>,
): readonly DrawLayer[] {
  const scene = sketchScene(registry, shape, size, options);
  const node = scene.nodes[0];
  expect(node, "scene node").toBeDefined();
  return layersOf(node!);
}

function rgba(color: Color): { r: number; g: number; b: number; a: number } {
  if (typeof color === "string") return { r: 0, g: 0, b: 0, a: 1 };
  return { r: color[0] ?? 0, g: color[1] ?? 0, b: color[2] ?? 0, a: color[3] ?? 1 };
}

function expectColor(
  actual: { r: number; g: number; b: number; a: number },
  expected: { r: number; g: number; b: number; a: number },
  label: string,
): void {
  for (const channel of ["r", "g", "b", "a"] as const) {
    expect(
      Math.abs(actual[channel] - expected[channel]),
      `${label} ${channel}`,
    ).toBeLessThanOrEqual(TOLERANCE);
  }
}

const stops = {
  kind: "stops" as const,
  stops: [
    { position: 0, width: 4 },
    { position: 0.15, width: 14 },
    { position: 0.85, width: 14 },
    { position: 1, width: 4 },
  ],
};

const roundBrush = {
  tip: { roundness: 1, angle: 0, directionSensitive: false },
  cap: "round" as const,
  join: "round" as const,
  opacityProfile: { kind: "uniform" as const },
};

describe("v1.6.0 closed rings", () => {
  const doc = read<{ cases: { id: string; commands?: Command[]; first?: Command[] }[] }>(
    "strokes/closed-width.json",
  );
  const ring = circle(80, 80, 100);
  const size = { width: 160, height: 160 };

  function ribbon(commands: Command[], options: Record<string, unknown>, id: string): void {
    const layers = sceneLayers(ring, size, options);
    const stroke = commands.find((command) => command.style === "stroke")!;
    const filled = commands.find((command) => command.style === "fill")!;
    const hachure = layers.find((layer) => layer.strokeWidth !== undefined)!;
    const outline = layers.find(
      (layer) => layer.role === "stroke" && layer.strokeWidth === undefined,
    )!;
    expect(outline.fillRule, id).toBe("nonzero");
    expectClose(toFixtureOps(hachure.paths.flat()), stroke.path, `${id} hachure`);
    expectClose(toFixtureOps(outline.paths.flat()), filled.path, `${id} ribbon`);
  }

  it("closed-ring-stops keeps the width stops on the winding ribbon", () => {
    const item = doc.cases.find((entry) => entry.id === "closed-ring-stops")!;
    ribbon(
      item.commands!,
      {
        seed: 9n,
        roughness: 0.25,
        strokeWidth: 8,
        strokeColor: [0, 0, 0, 1],
        brushProfile: { ...roundBrush, thicknessProfile: stops },
      },
      item.id,
    );
  });

  it("closed-ring-variable uses the flat marker tip", () => {
    const item = doc.cases.find((entry) => entry.id === "closed-ring-variable")!;
    ribbon(
      item.commands!,
      {
        seed: 9n,
        roughness: 0.25,
        strokeWidth: 8,
        strokeColor: [0, 0, 0, 1],
        brushProfile: {
          tip: { roundness: 0.2, angle: 0, directionSensitive: true },
          thicknessProfile: {
            kind: "variable",
            width: {
              variation: 0.35,
              taperStart: 0,
              taperEnd: 0,
              pressure: [],
              seed: 9,
              frequency: 3,
            },
          },
          cap: "butt",
          join: "bevel",
          opacityProfile: { kind: "uniform" },
        },
      },
      item.id,
    );
  });

  it("closed-ring-same-seed repeats the ribbon", () => {
    const item = doc.cases.find((entry) => entry.id === "closed-ring-same-seed")!;
    const options = {
      seed: 21n,
      roughness: 0.3,
      strokeWidth: 8,
      strokeColor: [0, 0, 0, 1],
      brushProfile: { ...roundBrush, thicknessProfile: stops },
    };
    ribbon(item.first!, options, item.id);
    const again = sceneLayers(ring, size, options);
    const first = sceneLayers(ring, size, options);
    expect(JSON.stringify(again)).toBe(JSON.stringify(first));
  });

  it("closed-crayon-ring scales wax by the closed profile", () => {
    const item = doc.cases.find((entry) => entry.id === "closed-crayon-ring")!;
    const layers = sceneLayers(ring, size, {
      seed: 11n,
      roughness: 0.2,
      strokeWidth: 12,
      strokeColor: [0, 0, 0, 1],
      keepInvisibleCrayonLayers: true,
      brushProfile: {
        ...roundBrush,
        crayon: {
          grain: 0.28,
          edgeRoughness: 0.75,
          widthVariation: 0.18,
          opacityVariation: 0.35,
          passes: 2,
          baseOpacity: 0.8,
          baseSoftness: 0.5,
          grit: 0.92,
          flakeSize: 1.45,
          seed: 11n,
        },
        thicknessProfile: {
          kind: "variable",
          width: {
            variation: 0.35,
            taperStart: 0,
            taperEnd: 0,
            pressure: [],
            seed: 11,
            frequency: 3,
          },
        },
      },
    });
    expect(layers, "wax pass count").toHaveLength(item.commands!.length);
    layers.forEach((layer, index) => {
      const command = item.commands![index]!;
      expect(layer.fillRule, `pass ${index}`).toBe("nonzero");
      expectClose(toFixtureOps(layer.paths.flat()), command.path, `crayon pass ${index}`);
      const paint =
        layer.paint.kind === "solid" ? rgba(layer.paint.color) : { r: 0, g: 0, b: 0, a: 1 };
      const alpha = (layer.paint.alpha ?? 1) * paint.a;
      expect(Math.abs(alpha - command.color.a), `pass ${index} alpha`).toBeLessThanOrEqual(
        TOLERANCE,
      );
    });
  });

  it("leaves the unclosed closed-width.json case list unchanged", () => {
    const known = new Set([
      "width-samples-stops",
      "width-samples-variable",
      "closed-ring-stops",
      "closed-ring-variable",
      "closed-crayon-ring",
      "closed-ring-same-seed",
    ]);
    expect(doc.cases.map((entry) => entry.id)).toEqual([...known]);
  });
});

describe("v1.6.0 closed rings with an explicit Z", () => {
  const doc = read<{
    cases: {
      id: string;
      commands?: Command[];
      first?: Command[];
      second?: Command[];
      identical?: boolean;
      sets?: { type: string; ops: FixtureOp[] }[];
    }[];
  }>("strokes/closed-width-z.json");
  const size = { width: 160, height: 160 };
  const ring = circle(80, 80, 100);
  const rounded = roundedRectangle(24, 28, 112, 84, 18);

  function closedDrawing(shape: Shape, raw: Record<string, unknown>) {
    const drawing = generateFixtureDrawing(shape, raw);
    expect(drawing, "drawing").toBeDefined();
    return {
      ...drawing!,
      sets: drawing!.sets.map((set) =>
        set.type === "path" ? { ...set, ops: closeRingContours(set.ops) } : set,
      ),
    };
  }

  const stopsProfile = { ...roundBrush, thicknessProfile: stops };
  const markerProfile = {
    tip: { roundness: 0.2, angle: 0, directionSensitive: true },
    thicknessProfile: {
      kind: "variable" as const,
      width: {
        variation: 0.35,
        taperStart: 0,
        taperEnd: 0,
        pressure: [] as number[],
        seed: 9,
        frequency: 3,
      },
    },
    cap: "butt" as const,
    join: "bevel" as const,
    opacityProfile: { kind: "uniform" as const },
  };
  function crayonProfile(seed: bigint) {
    return {
      ...roundBrush,
      crayon: {
        grain: 0.28,
        edgeRoughness: 0.75,
        widthVariation: 0.18,
        opacityVariation: 0.35,
        passes: 2,
        baseOpacity: 0.8,
        baseSoftness: 0.5,
        grit: 0.92,
        flakeSize: 1.45,
        seed,
      },
      thicknessProfile: {
        kind: "variable" as const,
        width: {
          variation: 0.35,
          taperStart: 0,
          taperEnd: 0,
          pressure: [] as number[],
          seed: Number(seed),
          frequency: 3,
        },
      },
    };
  }

  function layersFor(shape: Shape, raw: Record<string, unknown>, keepInvisible = false) {
    const drawing = closedDrawing(shape, raw);
    const assembled = assembleDrawing(drawing, size);
    if (!raw.brushProfile || !(raw.brushProfile as { crayon?: unknown }).crayon)
      return assembled.layers;
    const crayon = registry.resolveSpec("brush", {
      kind: "crayon",
      grain: 0.28,
      edgeRoughness: 0.75,
      widthVariation: 0.18,
      opacityVariation: 0.35,
      passes: 2,
      baseOpacity: 0.8,
      baseSoftness: 0.5,
      grit: 0.92,
      flakeSize: 1.45,
    });
    return applyCrayon(assembled, crayon, drawing.options, keepInvisible).layers;
  }

  function expectCommands(layers: readonly DrawLayer[], commands: Command[], id: string) {
    expect(layers.length, id).toBe(commands.length);
    layers.forEach((layer, index) => {
      const command = commands[index]!;
      expectClose(toFixtureOps(layer.paths.flat()), command.path, `${id} command ${index}`);
      if (command.style === "fill" && command.fillRule === "winding") {
        expect(layer.fillRule, `${id} ${index}`).toBe("nonzero");
      }
      if (layer.paint.kind === "solid" && typeof layer.paint.color !== "string") {
        const paint = rgba(layer.paint.color);
        const alpha = (layer.paint.alpha ?? 1) * paint.a;
        expect(Math.abs(alpha - command.color.a), `${id} alpha ${index}`).toBeLessThanOrEqual(
          TOLERANCE,
        );
      }
    });
  }

  it.each([
    [
      "closed-z-ring-stops",
      ring,
      {
        seed: 9n,
        roughness: 0.25,
        strokeWidth: 8,
        strokeColor: [0, 0, 0, 1],
        brushProfile: stopsProfile,
      },
    ],
    [
      "closed-z-ring-variable",
      ring,
      {
        seed: 9n,
        roughness: 0.25,
        strokeWidth: 8,
        strokeColor: [0, 0, 0, 1],
        brushProfile: markerProfile,
      },
    ],
    [
      "closed-z-rounded-rect-stops",
      rounded,
      {
        seed: 17n,
        roughness: 0.25,
        strokeWidth: 8,
        strokeColor: [0, 0, 0, 1],
        brushProfile: stopsProfile,
      },
    ],
  ] as const)("%s", (id, shape, raw) => {
    const item = doc.cases.find((entry) => entry.id === id)!;
    const drawing = closedDrawing(shape, raw);
    expect(drawing.sets.length, id).toBe(item.sets!.length);
    drawing.sets.forEach((set, index) => {
      expect(set.type, `${id} set ${index}`).toBe(item.sets![index]!.type);
      expectClose(toFixtureOps(set.ops), item.sets![index]!.ops, `${id} set ${index}`);
    });
    expectCommands(layersFor(shape, raw), item.commands!, id);
  });

  it("closed-z-crayon-ring keeps the invisible fill wax and the closed stroke wax", () => {
    const item = doc.cases.find((entry) => entry.id === "closed-z-crayon-ring")!;
    const raw = {
      seed: 11n,
      roughness: 0.2,
      strokeWidth: 12,
      strokeColor: [0, 0, 0, 1],
      keepInvisibleCrayonLayers: true,
      brushProfile: crayonProfile(11n),
    };
    const drawing = closedDrawing(ring, raw);
    expect(drawing.sets.length).toBe(item.sets!.length);
    drawing.sets.forEach((set, index) => {
      expectClose(
        toFixtureOps(set.ops),
        item.sets![index]!.ops,
        `closed-z-crayon-ring set ${index}`,
      );
    });
    expectCommands(layersFor(ring, raw, true), item.commands!, item.id);
  });

  it("closed-z-crayon-fill waxes the real fill and the closed stroke without the parity flag", () => {
    const item = doc.cases.find((entry) => entry.id === "closed-z-crayon-fill")!;
    const raw = {
      seed: 13n,
      roughness: 0.2,
      bowing: 0,
      strokeWidth: 12,
      strokeColor: [0, 0, 0, 1],
      fillStyle: "solid",
      fillColor: [0.86, 0.33, 0.18, 1],
      brushProfile: crayonProfile(13n),
    };
    const drawing = closedDrawing(ring, raw);
    drawing.sets.forEach((set, index) => {
      expectClose(
        toFixtureOps(set.ops),
        item.sets![index]!.ops,
        `closed-z-crayon-fill set ${index}`,
      );
    });
    expectCommands(layersFor(ring, raw, false), item.commands!, item.id);
  });

  it("closed-z-ring-same-seed repeats the closed ribbon", () => {
    const item = doc.cases.find((entry) => entry.id === "closed-z-ring-same-seed")!;
    expect(item.identical).toBe(true);
    const raw = {
      seed: 21n,
      roughness: 0.3,
      strokeWidth: 8,
      strokeColor: [0, 0, 0, 1],
      brushProfile: stopsProfile,
    };
    const drawing = closedDrawing(ring, raw);
    drawing.sets.forEach((set, index) => {
      expectClose(
        toFixtureOps(set.ops),
        item.sets![index]!.ops,
        `closed-z-ring-same-seed set ${index}`,
      );
    });
    const first = layersFor(ring, raw);
    const second = layersFor(ring, raw);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expectCommands(first, item.first!, item.id);
    expectCommands(second, item.second!, `${item.id} second`);
  });

  it("fails when a new closed-z case has no recipe", () => {
    const known = new Set([
      "closed-z-ring-stops",
      "closed-z-ring-variable",
      "closed-z-crayon-ring",
      "closed-z-ring-same-seed",
      "closed-z-rounded-rect-stops",
      "closed-z-crayon-fill",
    ]);
    const extra = doc.cases.map((entry) => entry.id).filter((id) => !known.has(id));
    expect(extra, `wire a recipe for ${extra.join(", ")}`).toEqual([]);
  });
});

describe("v1.6.0 contour hole", () => {
  const item = read<{
    cases: {
      id: string;
      commands: Command[];
      clipProbes: { evenOddInside: number[]; windingOnly: number[] };
    }[];
  }>("fills/contour.json").cases.find((entry) => entry.id === "contour-svg-hole")!;

  it("clips the contour even-odd and keeps the hole empty", () => {
    const d = "M10 10 H110 V90 H10 Z M40 30 H80 V70 H40 Z";
    const layers = sceneLayers(
      { kind: "path", d },
      { width: 140, height: 120 },
      {
        seed: 7n,
        roughness: 0,
        bowing: 0,
        maxRandomnessOffset: 0,
        fillStyle: "contour",
        fillColor: [0, 0, 0, 1],
        contourIntensity: 0,
        fillAngle: 0,
        fillSpacing: 4,
        strokeWidth: 1,
      },
    );
    expect(layers.length).toBe(item.commands.length);
    const fill = layers[0]!;
    expect(fill.clip?.fillRule).toBe("evenodd");
    expectClose(toFixtureOps(fill.clip!.paths.flat()), item.commands[0]!.clip!, "clip");
    expectClose(toFixtureOps(fill.paths.flat()), item.commands[0]!.path, "contour strokes");
    expectClose(toFixtureOps(layers[1]!.paths.flat()), item.commands[1]!.path, "outline");

    const polys = polygons(item.commands[0]!.clip!);
    const body = item.clipProbes.evenOddInside;
    const hole = item.clipProbes.windingOnly;
    expect(contains(polys, body[0]!, body[1]!, "evenodd"), "body").toBe(true);
    expect(contains(polys, hole[0]!, hole[1]!, "nonzero"), "hole winding").toBe(true);
    expect(contains(polys, hole[0]!, hole[1]!, "evenodd"), "hole even-odd").toBe(false);
  });
});

describe("v1.6.0 interior shades", () => {
  const doc = read<{
    cases: {
      id: string;
      commands: Command[];
      order: { role: string }[];
      shades: Command["shade"][];
      drawingCacheKeyEqual: boolean;
      generatedSetsEqual: boolean;
    }[];
  }>("fills/interior-shades.json");
  const size = { width: 160, height: 160 };
  const circleShape = circle(80, 80, 100);
  const hole = "M0 0 H160 V160 H0 Z M50 50 H110 V110 H50 Z";
  const shades: Record<string, InteriorShade[]> = {
    "shade-pit-shadow": [pitShadow()],
    "shade-pit-recess": [pitRecess()],
    "shade-edge": [edgeShade()],
    "shade-halo": [halo([0.12, 0.45, 0.92, 1])],
    "shade-hole": [pitRecess()],
  };

  function options(id: string): Record<string, unknown> {
    return {
      seed: 3n,
      roughness: 0,
      bowing: 0,
      maxRandomnessOffset: 0,
      strokeColor: [0, 0, 0, 0],
      strokeWidth: 0,
      fillColor: [1, 1, 1, 1],
      fillStyle: "solid",
      interiorShades: shades[id],
    };
  }

  it.each(doc.cases.map((item) => [item.id, item] as const))("%s", (id, item) => {
    const shape: Shape = id === "shade-hole" ? { kind: "path", d: hole } : circleShape;
    const layers = sceneLayers(shape, size, options(id));
    const order = layers.map((layer) =>
      layer.role === "shade" ? `shade:${layer.shade?.kind}` : layer.role,
    );
    expect(order).toEqual(item.order.map((entry) => entry.role));
    const withShades = generateFixtureDrawing(shape, options(id));
    const bare = generateFixtureDrawing(shape, { ...options(id), interiorShades: [] });
    expect(JSON.stringify(withShades?.sets), `${id} sets`).toBe(JSON.stringify(bare?.sets));

    layers.forEach((layer, index) => {
      const command = item.commands[index]!;
      expectClose(toFixtureOps(layer.paths.flat()), command.path, `${id} ${index}`);
      if (layer.role === "shade") {
        expect(layer.fillRule).toBe("evenodd");
        expectShade(layer.shade!, command.shade!, id);
      }
    });
    if (id === "shade-hole") expect(layers[0]!.fillRule).toBe("evenodd");
  });
});

function expectShade(
  actual: InteriorShade,
  expected: NonNullable<Command["shade"]>,
  id: string,
): void {
  expect(actual.kind, id).toBe(expected.kind);
  if (actual.kind === "innerShadow" && expected.kind === "innerShadow") {
    expect(Math.abs(actual.opacity - (expected.opacity ?? 0)), id).toBeLessThanOrEqual(TOLERANCE);
    expect(Math.abs(actual.x - (expected.x ?? 0)), id).toBeLessThanOrEqual(TOLERANCE);
    expect(Math.abs(actual.y - (expected.y ?? 0)), id).toBeLessThanOrEqual(TOLERANCE);
    expect(Math.abs(actual.blur - (expected.blur ?? 0)), id).toBeLessThanOrEqual(TOLERANCE);
    expectColor(rgba(actual.color), expected.color!, id);
  }
  if (actual.kind === "halo" && expected.kind === "halo") {
    expect(Math.abs(actual.opacity - (expected.opacity ?? 0)), id).toBeLessThanOrEqual(TOLERANCE);
    expect(Math.abs(actual.glow - (expected.glow ?? 0)), id).toBeLessThanOrEqual(TOLERANCE);
    expect(Math.abs(actual.width - (expected.width ?? 0)), id).toBeLessThanOrEqual(TOLERANCE);
    expect(Math.abs(actual.blur - (expected.blur ?? 0)), id).toBeLessThanOrEqual(TOLERANCE);
    expectColor(rgba(actual.color), expected.color!, id);
  }
  if (actual.kind === "linear" && expected.kind === "linear") {
    expect(Math.abs(actual.angle - (expected.angle ?? 0)), id).toBeLessThanOrEqual(TOLERANCE);
    expectStops(actual.stops, expected.stops ?? [], id);
  }
  if (actual.kind === "radial" && expected.kind === "radial") {
    expect(Math.abs(actual.centerX - (expected.center?.[0] ?? 0)), id).toBeLessThanOrEqual(
      TOLERANCE,
    );
    expect(Math.abs(actual.centerY - (expected.center?.[1] ?? 0)), id).toBeLessThanOrEqual(
      TOLERANCE,
    );
    expect(Math.abs(actual.startRadius - (expected.startRadius ?? 0)), id).toBeLessThanOrEqual(
      TOLERANCE,
    );
    expect(Math.abs(actual.endRadius - (expected.endRadius ?? 0)), id).toBeLessThanOrEqual(
      TOLERANCE,
    );
    expectStops(actual.stops, expected.stops ?? [], id);
  }
}

function expectStops(
  actual: readonly { location: number; opacity: number; color: Color }[],
  expected: readonly {
    location: number;
    opacity: number;
    color: { r: number; g: number; b: number; a: number };
  }[],
  id: string,
): void {
  expect(actual.length, id).toBe(expected.length);
  actual.forEach((stop, index) => {
    const exp = expected[index]!;
    expect(Math.abs(stop.location - exp.location), id).toBeLessThanOrEqual(TOLERANCE);
    expect(Math.abs(stop.opacity - exp.opacity), id).toBeLessThanOrEqual(TOLERANCE);
    expectColor(rgba(stop.color), exp.color, id);
  });
}

function polygons(ops: readonly FixtureOp[]): { x: number; y: number }[][] {
  const out: { x: number; y: number }[][] = [];
  let current: { x: number; y: number }[] = [];
  for (const op of ops) {
    if (op[0] === "M" || op[0] === "L") {
      if (op[0] === "M" && current.length > 0) out.push(current);
      if (op[0] === "M") current = [];
      current.push({ x: op[1] ?? 0, y: op[2] ?? 0 });
    } else if (op[0] === "Z" && current.length > 0) {
      out.push(current);
      current = [];
    }
  }
  if (current.length > 0) out.push(current);
  return out;
}

function contains(
  polys: readonly { x: number; y: number }[][],
  x: number,
  y: number,
  rule: "evenodd" | "nonzero",
): boolean {
  let winding = 0;
  for (const poly of polys) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[j]!;
      const b = poly[i]!;
      if (a.y > y === b.y > y) continue;
      const at = a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y);
      if (x < at) winding += b.y > a.y ? 1 : -1;
    }
  }
  return rule === "evenodd" ? winding % 2 !== 0 : winding !== 0;
}
