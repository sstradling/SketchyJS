import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { circle, polygon, thicknessWidth, type Shape } from "@sketchy-js/sketchy/core";
import { planContour, type ContourPlanOptions } from "../../src/fills/internal/contour-geometry.js";
import { toFixtureOps } from "./support/compare-sets.js";
import {
  compareOps,
  fixtureShape,
  generateFixtureDrawing,
  TOLERANCE,
  type FixtureOp,
  type FixtureSet,
} from "./support/swift.js";

/**
 * Darwin oracle for Sketchy 1.6.0. Structure first, then coordinates within
 * 1e-4 px. Fixtures are not edited and the tolerance is not widened.
 */

const root = fileURLToPath(
  new URL("../../../../fixtures/swift-reference/v1.6.0/", import.meta.url),
);
const read = <T>(relative: string): T => JSON.parse(readFileSync(root + relative, "utf8")) as T;

const DOME_GUIDE = { kind: "arc" as const, x: 100, y: 420, radius: 420 };

interface Pt {
  x: number;
  y: number;
}
interface PlanStroke {
  slot: number;
  offset: number;
  scale: number;
  points: [number, number][];
}
interface Plan {
  period: number;
  gap: number;
  slotCount: number;
  phaseSlots: number;
  strokeCount: number;
  strokes: PlanStroke[];
}
interface OpSet extends FixtureSet {
  fillLineScale?: number;
  fillLineWidth?: number;
  opacityScale?: number;
}

function pts(pairs: readonly [number, number][]): Pt[] {
  return pairs.map(([x, y]) => ({ x, y }));
}

function maxCoord(actual: readonly FixtureOp[], expected: readonly FixtureOp[]): number {
  const cmp = compareOps(actual, expected);
  expect(cmp.structural, cmp.message).toBe(true);
  return cmp.maxDelta;
}

function expectOps(
  actual: readonly FixtureOp[],
  expected: readonly FixtureOp[],
  label: string,
): void {
  expect(maxCoord(actual, expected), label).toBeLessThanOrEqual(TOLERANCE);
}

function fillSets(shape: Shape, raw: Record<string, unknown>) {
  const drawing = generateFixtureDrawing(shape, raw);
  expect(drawing, shape.kind).toBeDefined();
  return drawing!.sets.filter((set) => set.type === "fillSketch");
}

function expectSets(
  actual: readonly {
    type: string;
    ops: readonly { op: string }[];
    fillLineScale?: number;
    fillLineWidth?: number;
    opacityScale?: number;
  }[],
  expected: readonly OpSet[],
  label: string,
): void {
  expect(actual.length, `${label} set count ${actual.length} !== ${expected.length}`).toBe(
    expected.length,
  );
  actual.forEach((set, index) => {
    const exp = expected[index]!;
    expect(set.type, label).toBe(exp.type);
    if (exp.fillLineScale !== undefined) {
      expect(
        Math.abs((set.fillLineScale ?? 1) - exp.fillLineScale),
        `${label} scale`,
      ).toBeLessThanOrEqual(TOLERANCE);
    }
    if (exp.fillLineWidth !== undefined) {
      expect(
        Math.abs((set.fillLineWidth ?? 0) - exp.fillLineWidth),
        `${label} width`,
      ).toBeLessThanOrEqual(TOLERANCE);
    }
    if (exp.opacityScale !== undefined) {
      expect(
        Math.abs((set.opacityScale ?? 1) - exp.opacityScale),
        `${label} opacity`,
      ).toBeLessThanOrEqual(TOLERANCE);
    }
    expectOps(toFixtureOps(set.ops), exp.ops, `${label} set ${index}`);
  });
}

function domeOptions(input: {
  intensity: number;
  intensityStart: number | null;
  intensityEnd: number | null;
  gradientAngle: number;
  easing: ContourPlanOptions["easing"];
  falloff: number;
  fillSpacing: number;
  seed: string;
  phase?: number;
  angle?: number;
}): Record<string, unknown> {
  return {
    seed: input.seed,
    roughness: 0,
    bowing: 0,
    maxRandomnessOffset: 0,
    fillWeight: 2,
    fillSpacing: input.fillSpacing,
    fillStyle: "contour",
    contourIntensity: input.intensity,
    contourGradientAngle: input.gradientAngle,
    contourEasing: input.easing,
    contourFalloff: input.falloff,
    contourGuide: DOME_GUIDE,
    ...(input.intensityStart !== null ? { contourIntensityStart: input.intensityStart } : {}),
    ...(input.intensityEnd !== null ? { contourIntensityEnd: input.intensityEnd } : {}),
    ...(input.phase !== undefined && input.angle !== undefined
      ? { contourDrift: { speed: 30, angle: input.angle, phase: input.phase } }
      : {}),
  };
}

function planOf(options: ContourPlanOptions, polygonPoints: Pt[]) {
  return planContour(polygonPoints, options);
}

function expectPlan(actual: ReturnType<typeof planContour>, expected: Plan, label: string): void {
  expect(actual.strokes.length, `${label} strokes`).toBe(expected.strokeCount);
  expect(actual.slotCount, label).toBe(expected.slotCount);
  expect(Math.abs(actual.period - expected.period), `${label} period`).toBeLessThanOrEqual(
    TOLERANCE,
  );
  expect(Math.abs(actual.gap - expected.gap), `${label} gap`).toBeLessThanOrEqual(TOLERANCE);
  expect(Math.abs(actual.phaseSlots - expected.phaseSlots), `${label} phase`).toBeLessThanOrEqual(
    TOLERANCE,
  );
  actual.strokes.forEach((stroke, index) => {
    const exp = expected.strokes[index]!;
    expect(stroke.slot, `${label} slot ${index}`).toBe(exp.slot);
    expect(Math.abs(stroke.offset - exp.offset), `${label} offset`).toBeLessThanOrEqual(TOLERANCE);
    expect(Math.abs(stroke.scale - exp.scale), `${label} scale`).toBeLessThanOrEqual(TOLERANCE);
    expect(stroke.points.length, `${label} points`).toBe(exp.points.length);
    stroke.points.forEach((point, pointIndex) => {
      const [x, y] = exp.points[pointIndex]!;
      expect(Math.abs(point.x - x), `${label} x`).toBeLessThanOrEqual(TOLERANCE);
      expect(Math.abs(point.y - y), `${label} y`).toBeLessThanOrEqual(TOLERANCE);
    });
  });
}

const contourDoc = read<{
  cases: {
    id: string;
    input?: {
      polygon?: [number, number][];
      intensity?: number;
      intensityStart: number | null;
      intensityEnd: number | null;
      gradientAngle?: number;
      easing?: ContourPlanOptions["easing"];
      falloff?: number;
      fillSpacing?: number;
      seed?: string;
      fillAngle?: number;
      d?: string;
      canvas?: [number, number];
    };
    plan?: Plan;
    sets?: OpSet[];
    frames?: { phase: number; phaseSlots: number; plan: Plan; sets: OpSet[] }[];
    angle?: number;
    phaseZeroMatchesPeriod?: boolean;
    strokeCount?: number;
    minChord?: number;
    maxX?: number;
    pointsWithYBelow30?: number;
    strokes?: PlanStroke[];
    pass?: Record<string, number | string>;
  }[];
}>("fills/contour.json");

describe("v1.6.0 contour", () => {
  for (const item of contourDoc.cases) {
    if (item.plan && item.input?.polygon && item.sets && item.input.intensity !== undefined) {
      it(item.id, () => {
        const raw = domeOptions({
          intensity: item.input!.intensity!,
          intensityStart: item.input!.intensityStart,
          intensityEnd: item.input!.intensityEnd,
          gradientAngle: item.input!.gradientAngle!,
          easing: item.input!.easing!,
          falloff: item.input!.falloff!,
          fillSpacing: item.input!.fillSpacing!,
          seed: item.input!.seed!,
        });
        const points = pts(item.input!.polygon!);
        expectPlan(
          planOf(
            {
              gap: 16,
              fillAngle: -41,
              intensity: item.input!.intensity!,
              ...(item.input!.intensityStart !== null
                ? { intensityStart: item.input!.intensityStart }
                : {}),
              ...(item.input!.intensityEnd !== null
                ? { intensityEnd: item.input!.intensityEnd }
                : {}),
              gradientAngle: item.input!.gradientAngle!,
              easing: item.input!.easing!,
              falloff: item.input!.falloff!,
              guide: DOME_GUIDE,
            },
            points,
          ),
          item.plan!,
          item.id,
        );
        expectSets(fillSets(polygon(points), raw), item.sets!, item.id);
      });
    }
  }

  it("contour-animated", () => {
    const item = contourDoc.cases.find((entry) => entry.id === "contour-animated")!;
    expect(item.phaseZeroMatchesPeriod).toBe(true);
    const quiet = contourDoc.cases.find((entry) => entry.id === "contour-intensity-1")!.input!;
    for (const frame of item.frames!) {
      const raw = domeOptions({
        intensity: quiet.intensity!,
        intensityStart: quiet.intensityStart,
        intensityEnd: quiet.intensityEnd,
        gradientAngle: quiet.gradientAngle!,
        easing: quiet.easing!,
        falloff: quiet.falloff!,
        fillSpacing: quiet.fillSpacing!,
        seed: quiet.seed!,
        phase: frame.phase,
        angle: item.angle!,
      });
      const points = pts(quiet.polygon!);
      expectPlan(
        planOf(
          {
            gap: 16,
            fillAngle: -41,
            intensity: 1,
            gradientAngle: 90,
            easing: "linear",
            falloff: 0,
            guide: DOME_GUIDE,
            drift: { angle: item.angle!, phase: frame.phase },
          },
          points,
        ),
        frame.plan,
        `phase ${frame.phase}`,
      );
      expect(Math.abs(frame.phaseSlots - frame.plan.phaseSlots)).toBeLessThanOrEqual(TOLERANCE);
      expectSets(fillSets(polygon(points), raw), frame.sets, `phase ${frame.phase}`);
    }
  });

  it("contour-short-clip", () => {
    const item = contourDoc.cases.find((entry) => entry.id === "contour-short-clip")!;
    const points = pts(item.input!.polygon!);
    const plan = planContour(points, {
      gap: 6,
      fillAngle: 0,
      intensity: 0,
      gradientAngle: 90,
      easing: "linear",
      falloff: 0,
    });
    expect(plan.strokes.length).toBe(item.strokeCount);
    const chords = plan.strokes.map((stroke) => {
      const first = stroke.points[0]!;
      const last = stroke.points[stroke.points.length - 1]!;
      return Math.hypot(last.x - first.x, last.y - first.y);
    });
    expect(Math.abs(Math.min(...chords) - item.minChord!)).toBeLessThanOrEqual(TOLERANCE);
    const maxX = Math.max(
      ...plan.strokes.flatMap((stroke) => stroke.points.map((point) => point.x)),
    );
    expect(Math.abs(maxX - item.maxX!)).toBeLessThanOrEqual(TOLERANCE);
    const below = plan.strokes.flatMap((stroke) => stroke.points).filter((point) => point.y < 30);
    expect(below.length).toBe(item.pointsWithYBelow30);
    expectPlan(
      plan,
      {
        period: plan.period,
        gap: plan.gap,
        slotCount: plan.slotCount,
        phaseSlots: plan.phaseSlots,
        strokeCount: item.strokeCount!,
        strokes: item.strokes!,
      },
      item.id,
    );
  });

  it("contour-wash-passes", () => {
    const item = contourDoc.cases.find((entry) => entry.id === "contour-wash-passes")!;
    const pass = item.pass!;
    const quiet = contourDoc.cases.find((entry) => entry.id === "contour-intensity-1")!.input!;
    const raw = {
      ...domeOptions({
        intensity: 0.8,
        intensityStart: null,
        intensityEnd: null,
        gradientAngle: quiet.gradientAngle!,
        easing: "linear",
        falloff: 0,
        fillSpacing: quiet.fillSpacing!,
        seed: quiet.seed!,
      }),
      washPasses: [
        {
          spacingMin: pass.spacingMin,
          spacingSpan: pass.spacingSpan,
          widthMin: pass.widthMin,
          widthSpan: pass.widthSpan,
          opacityMin: pass.opacityMin,
          opacitySpan: pass.opacitySpan,
          trimMax: pass.trimMax,
          angleSpread: pass.angleSpread,
          bow: pass.bow,
          minLength: pass.minLength,
          roughness: pass.roughness,
          bowing: pass.bowing,
          randomness: pass.randomness,
          seed: pass.seed,
        },
      ],
    };
    expectSets(fillSets(polygon(pts(quiet.polygon!)), raw), item.sets!, item.id);
  });
});

interface WashResult {
  polygon: [number, number][];
  fillAngle: number;
  seed: string;
  sets: OpSet[];
  pass?: Record<string, number | string>;
}

const washDoc = read<{
  cases: (WashResult & {
    id: string;
    straight?: WashResult;
    scattered?: WashResult;
    full?: WashResult;
    trimmed?: WashResult;
    flat?: WashResult;
    bowed?: WashResult;
  })[];
}>("fills/wash.json");

function washRaw(result: WashResult, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const pass = result.pass;
  return {
    seed: result.seed,
    fillStyle: "wash",
    fillAngle: result.fillAngle,
    roughness: pass ? 0 : 0.6,
    bowing: pass ? 0 : 1,
    maxRandomnessOffset: pass ? 0 : 2,
    ...(pass
      ? {
          washPasses: [
            {
              spacingMin: pass.spacingMin,
              spacingSpan: pass.spacingSpan,
              widthMin: pass.widthMin,
              widthSpan: pass.widthSpan,
              opacityMin: pass.opacityMin,
              opacitySpan: pass.opacitySpan,
              trimMax: pass.trimMax,
              angleSpread: pass.angleSpread,
              bow: pass.bow,
              minLength: pass.minLength,
              roughness: pass.roughness,
              bowing: pass.bowing,
              randomness: pass.randomness,
              seed: pass.seed,
            },
          ],
        }
      : {}),
    ...extra,
  };
}

describe("v1.6.0 wash", () => {
  for (const item of washDoc.cases) {
    it(item.id, () => {
      const results: [string, WashResult][] = item.sets
        ? [[item.id, item]]
        : [
            ["straight", item.straight!],
            ["scattered", item.scattered!],
            ["full", item.full!],
            ["trimmed", item.trimmed!],
            ["flat", item.flat!],
            ["bowed", item.bowed!],
          ].filter((entry): entry is [string, WashResult] => entry[1] !== undefined);
      for (const [name, result] of results) {
        expectSets(
          fillSets(polygon(pts(result.polygon)), washRaw(result)),
          result.sets,
          `${item.id} ${name}`,
        );
      }
    });
  }
});

describe("v1.6.0 closed width samples", () => {
  const doc = read<{
    cases: {
      id: string;
      samples?: { t: number; open: number; closed: number }[];
      strokeWidth?: number;
      sets?: OpSet[];
      commands?: { style: string; fillRule: string; path: FixtureOp[] }[];
      first?: { style: string; fillRule: string; path: FixtureOp[] }[];
      identical?: boolean;
      seed?: string;
    }[];
  }>("strokes/closed-width.json");

  const stops = {
    kind: "stops" as const,
    stops: [
      { position: 0, width: 4 },
      { position: 0.15, width: 14 },
      { position: 0.85, width: 14 },
      { position: 1, width: 4 },
    ],
  };
  const variable = {
    kind: "variable" as const,
    width: {
      variation: 0.35,
      taperStart: 0,
      taperEnd: 0,
      pressure: [],
      seed: 42,
      frequency: 3,
    },
  };

  it("width-samples-stops", () => {
    const item = doc.cases.find((entry) => entry.id === "width-samples-stops")!;
    for (const sample of item.samples!) {
      expect(
        Math.abs(thicknessWidth(stops, sample.t, item.strokeWidth!, false) - sample.open),
      ).toBeLessThanOrEqual(TOLERANCE);
      expect(
        Math.abs(thicknessWidth(stops, sample.t, item.strokeWidth!, true) - sample.closed),
      ).toBeLessThanOrEqual(TOLERANCE);
    }
  });

  it("width-samples-variable", () => {
    const item = doc.cases.find((entry) => entry.id === "width-samples-variable")!;
    for (const sample of item.samples!) {
      expect(
        Math.abs(thicknessWidth(variable, sample.t, item.strokeWidth!, false) - sample.open),
        `open t=${sample.t}`,
      ).toBeLessThanOrEqual(TOLERANCE);
      expect(
        Math.abs(thicknessWidth(variable, sample.t, item.strokeWidth!, true) - sample.closed),
        `closed t=${sample.t}`,
      ).toBeLessThanOrEqual(TOLERANCE);
    }
  });

  function ringDrawing(raw: Record<string, unknown>) {
    return generateFixtureDrawing(circle(80, 80, 100), raw);
  }

  it("closed-ring-stops", () => {
    const item = doc.cases.find((entry) => entry.id === "closed-ring-stops")!;
    const drawing = ringDrawing({
      seed: "9",
      roughness: 0.25,
      strokeWidth: 8,
      strokeColor: [0, 0, 0, 1],
      brushProfile: {
        tip: { roundness: 1, angle: 0, directionSensitive: false },
        thicknessProfile: stops,
        cap: "round",
        join: "round",
        opacityProfile: { kind: "uniform" },
      },
    });
    expect(drawing).toBeDefined();
    const outline = drawing!.sets.find((set) => set.type === "path");
    expect(outline).toBeDefined();
    // The hachure fill is the stroked command. The winding command is the ribbon,
    // compared after assembly in the renderer test. The centerline is the generator set.
    const strokeCommand = item.commands!.find((command) => command.style === "stroke")!;
    const fillSetsOnly = drawing!.sets.filter((set) => set.type === "fillSketch");
    expect(fillSetsOnly.length).toBeGreaterThan(0);
    const flat = fillSetsOnly.flatMap((set) => toFixtureOps(set.ops));
    expectOps(flat, strokeCommand.path, item.id);
  });

  it("closed-ring-same-seed", () => {
    const item = doc.cases.find((entry) => entry.id === "closed-ring-same-seed")!;
    expect(item.identical).toBe(true);
    const raw = {
      seed: item.seed,
      roughness: 0.3,
      strokeWidth: 8,
      brushProfile: {
        tip: { roundness: 1, angle: 0, directionSensitive: false },
        thicknessProfile: stops,
        cap: "round",
        join: "round",
        opacityProfile: { kind: "uniform" },
      },
    };
    const first = ringDrawing(raw);
    const second = ringDrawing(raw);
    expect(JSON.stringify(first!.sets)).toBe(JSON.stringify(second!.sets));
    const stroke = item.first!.find((command) => command.style === "stroke")!;
    const flat = first!.sets
      .filter((set) => set.type === "fillSketch")
      .flatMap((set) => toFixtureOps(set.ops));
    expectOps(flat, stroke.path, item.id);
  });
});

describe("v1.6.0 re-run of the 1.5.0 case list", () => {
  const files = ["darwin/fills/fills.json", "darwin/shapes/shapes.json"] as const;
  for (const file of files) {
    const cases = read<{
      cases: {
        id: string;
        shape: { kind: string; args: Record<string, unknown> };
        options: Record<string, unknown>;
        drawing: { sets: FixtureSet[] };
      }[];
    }>(file).cases;
    it.each(cases.map((item) => [file, item.id, item] as const))("%s %s", (_file, id, item) => {
      const drawing = generateFixtureDrawing(fixtureShape(item.shape), item.options);
      expect(drawing, id).toBeDefined();
      expect(drawing!.sets.length, id).toBe(item.drawing.sets.length);
      drawing!.sets.forEach((set, index) => {
        const exp = item.drawing.sets[index]!;
        expect(set.type, id).toBe(exp.type === "path2Dfill" ? "path2DFill" : exp.type);
        expectOps(toFixtureOps(set.ops), exp.ops, `${id} set ${index}`);
      });
    });
  }

  it("options defaults keep every 1.5.0 value and add the 1.6.0 fields", () => {
    const before = JSON.parse(
      readFileSync(
        fileURLToPath(
          new URL(
            "../../../../fixtures/swift-reference/v1.5.0/darwin/options/defaults.json",
            import.meta.url,
          ),
        ),
        "utf8",
      ),
    ) as { options: Record<string, unknown> };
    const after = read<{ options: Record<string, unknown> }>("darwin/options/defaults.json");
    const added = Object.keys(after.options)
      .filter((key) => !(key in before.options))
      .sort();
    expect(added).toEqual([
      "contourDrift",
      "contourEasing",
      "contourFalloff",
      "contourGradientAngle",
      "contourGuide",
      "contourIntensity",
      "contourIntensityEnd",
      "contourIntensityStart",
      "interiorShades",
      "washPasses",
    ]);
    for (const key of Object.keys(before.options)) {
      expect(after.options[key], key).toEqual(before.options[key]);
    }
  });

  it("unchanged v1.6.0 files match the v1.5.0 geometry byte for byte", () => {
    const changed = read<{ unchanged: string[]; provenanceOnly: string[] }>(
      "regression/changed.json",
    );
    const v15 = fileURLToPath(
      new URL("../../../../fixtures/swift-reference/v1.5.0/", import.meta.url),
    );
    for (const relative of [...changed.unchanged, ...changed.provenanceOnly]) {
      const before = JSON.parse(readFileSync(v15 + relative, "utf8")) as {
        cases?: unknown;
        provenance?: unknown;
      };
      const after = JSON.parse(readFileSync(root + relative, "utf8")) as {
        cases?: unknown;
        provenance?: unknown;
      };
      if (before.cases !== undefined) {
        expect(JSON.stringify(after.cases), relative).toBe(JSON.stringify(before.cases));
      }
    }
  });
});
