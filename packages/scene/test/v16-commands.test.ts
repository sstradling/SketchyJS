import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { circle, type Shape } from "@sketchy-js/core";
import { crayon } from "@sketchy-js/brushes";
import { contour, wash } from "@sketchy-js/fills";
import type { Color, DrawLayer, InteriorShade, SceneNode } from "@sketchy-js/types";
import { basicSketchy } from "../src/basic.js";
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

  it("is ready for closed rings whose path contains an explicit Z", () => {
    const known = new Set([
      "width-samples-stops",
      "width-samples-variable",
      "closed-ring-stops",
      "closed-ring-variable",
      "closed-crayon-ring",
      "closed-ring-same-seed",
    ]);
    const extra = doc.cases.map((entry) => entry.id).filter((id) => !known.has(id));
    expect(
      extra,
      "A Mac export added closed-width cases. Wire each id through ribbon() or the crayon comparison.",
    ).toEqual([]);
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
