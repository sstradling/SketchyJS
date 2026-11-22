import { describe, expect, it } from "vitest";
import { rectangle } from "@sketchy-js/sketchy/core";
import { resolveSketchOptions } from "@sketchy-js/sketchy/core/options";
import { RoughView } from "@sketchy-js/sketchy/scene/basic";
import type { Point } from "@sketchy-js/sketchy/types";
import {
  easingValue,
  placements,
  planContour,
  widthScale,
  type ContourPlanOptions,
  type ContourStroke,
} from "../../src/fills/internal/contour-geometry.js";

const dome: Point[] = [
  { x: 0, y: 0 },
  { x: 200, y: 0 },
  { x: 200, y: 280 },
  { x: 0, y: 280 },
];

function guide(intensity: number, extra: Partial<ContourPlanOptions> = {}): ContourPlanOptions {
  return {
    gap: 16,
    fillAngle: -41,
    intensity,
    gradientAngle: 90,
    easing: "linear",
    falloff: 0,
    guide: { kind: "arc", x: 100, y: 420, radius: 420 },
    ...extra,
  };
}

function sagitta(points: readonly Point[]): number {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last || points.length < 3) return 0;
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const length = Math.hypot(dx, dy);
  if (!(length > 1)) return 0;
  return points.reduce((best, point) => {
    return Math.max(best, Math.abs((point.x - first.x) * dy - (point.y - first.y) * dx) / length);
  }, 0);
}

function chord(points: readonly Point[]): number {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return 0;
  return Math.hypot(last.x - first.x, last.y - first.y);
}

function meanY(stroke: ContourStroke): number {
  return stroke.points.reduce((sum, point) => sum + point.y, 0) / stroke.points.length;
}

describe("contour field", () => {
  it("slides by one slot and wraps", () => {
    const start = placements(8, 0, 0);
    const shifted = placements(8, 0, 1);
    const wrapped = placements(8, 0, 8);
    const backward = placements(8, 0, -1);
    for (let index = 0; index < 8; index++) {
      expect(shifted[index]!.u).toBeCloseTo(start[(index + 1) % 8]!.u, 5);
      expect(wrapped[index]!.u).toBeCloseTo(start[index]!.u, 5);
      expect(backward[index]!.u).toBeCloseTo(start[(index + 7) % 8]!.u, 5);
    }
  });

  it("packs slots toward the guide and scales width", () => {
    const placed = placements(10, 1, 0)
      .map((item) => item.u)
      .sort((a, b) => a - b);
    expect(placed[1]! - placed[0]!).toBeLessThan(placed[9]! - placed[8]!);
    expect(widthScale(0, 1)).toBeCloseTo(0.22, 3);
    expect(widthScale(1, 1)).toBeCloseTo(1, 3);
    expect(widthScale(0.4, 0)).toBeCloseTo(1, 3);
  });

  it("draws a straight chord at intensity 0", () => {
    const plan = planContour(dome, guide(0));
    expect(plan.strokes.length).toBeGreaterThan(3);
    for (const stroke of plan.strokes) {
      if (chord(stroke.points) > 20) expect(sagitta(stroke.points)).toBeLessThan(0.05);
    }
  });

  it("flattens the inner strokes when intensity ramps down", () => {
    const full = planContour(dome, guide(1));
    const flat = planContour(dome, guide(1, { intensityStart: 1, intensityEnd: 0.25 }));
    const fullBottom = full.strokes.reduce((a, b) => (meanY(a) < meanY(b) ? b : a));
    const flatBottom = flat.strokes.reduce((a, b) => (meanY(a) < meanY(b) ? b : a));
    const fullTop = full.strokes.reduce((a, b) => (meanY(a) < meanY(b) ? a : b));
    const flatTop = flat.strokes.reduce((a, b) => (meanY(a) < meanY(b) ? a : b));
    expect(chord(fullBottom.points)).toBeGreaterThan(160);
    expect(chord(flatBottom.points)).toBeGreaterThan(160);
    expect(sagitta(fullBottom.points)).toBeLessThan(sagitta(fullTop.points) * 1.4);
    expect(sagitta(flatBottom.points)).toBeLessThan(sagitta(flatTop.points) * 0.55);
    expect(sagitta(flatTop.points)).toBeGreaterThan(4);
  });

  it("changes intensity along one stroke without crossings", () => {
    const wide: Point[] = [
      { x: 0, y: 40 },
      { x: 400, y: 40 },
      { x: 400, y: 220 },
      { x: 0, y: 220 },
    ];
    const plan = planContour(
      wide,
      guide(1, {
        guide: { kind: "arc", x: 200, y: 760, radius: 620 },
        intensityStart: 0,
        intensityEnd: 2,
        gradientAngle: 0,
      }),
    );
    const stroke = plan.strokes.reduce((a, b) => (chord(a.points) < chord(b.points) ? b : a));
    const deviation = (points: readonly Point[]): number => {
      const first = stroke.points[0]!;
      const last = stroke.points[stroke.points.length - 1]!;
      const dx = last.x - first.x;
      const dy = last.y - first.y;
      const length = Math.max(Math.hypot(dx, dy), 0.001);
      const total = points.reduce(
        (sum, point) =>
          sum + Math.abs((point.x - first.x) * dy - (point.y - first.y) * dx) / length,
        0,
      );
      return total / points.length;
    };
    const left = stroke.points.filter((point) => point.x > 30 && point.x < 120);
    const right = stroke.points.filter((point) => point.x > 280 && point.x < 370);
    expect(left.length).toBeGreaterThan(1);
    expect(right.length).toBeGreaterThan(1);
    expect(deviation(right)).toBeGreaterThan(deviation(left) * 2.5);
    const ordered = [...plan.strokes].sort((a, b) => meanY(a) - meanY(b));
    const yAt = (points: readonly Point[], x: number): number | undefined => {
      for (let index = 1; index < points.length; index++) {
        const a = points[index - 1]!;
        const b = points[index]!;
        const span = b.x - a.x;
        if (Math.abs(span) <= 0.001) continue;
        const t = (x - a.x) / span;
        if (t >= 0 && t <= 1) return a.y + (b.y - a.y) * t;
      }
      return undefined;
    };
    for (let index = 1; index < ordered.length; index++) {
      for (const x of [80, 200, 320]) {
        const above = yAt(ordered[index - 1]!.points, x);
        const below = yAt(ordered[index]!.points, x);
        if (above !== undefined && below !== undefined) expect(above).toBeLessThan(below + 0.5);
      }
    }
  });

  it("follows the easing curves", () => {
    expect(easingValue("linear", 0.5)).toBeCloseTo(0.5, 3);
    expect(easingValue("easeInOut", 0)).toBeCloseTo(0, 3);
    expect(easingValue("easeInOut", 1)).toBeCloseTo(1, 3);
    expect(easingValue("easeInOut", 0.5)).toBeCloseTo(0.5, 3);
    expect(easingValue("easeIn", 0.5)).toBeLessThan(0.5);
    expect(easingValue("easeOut", 0.5)).toBeGreaterThan(0.5);
  });

  it("keeps a shared guide wide across two shapes", () => {
    const guideArc = { kind: "arc" as const, x: 300, y: 520, radius: 460 };
    const left: Point[] = [
      { x: 20, y: 80 },
      { x: 130, y: 80 },
      { x: 130, y: 170 },
      { x: 20, y: 170 },
    ];
    const lower: Point[] = [
      { x: 180, y: 220 },
      { x: 280, y: 230 },
      { x: 270, y: 300 },
      { x: 170, y: 290 },
    ];
    const options = guide(1, { guide: guideArc });
    const first = planContour(left, options);
    const second = planContour(lower, options);
    expect(first.strokes.length).toBeGreaterThan(0);
    expect(second.strokes.length).toBeGreaterThan(0);
    for (const stroke of [...first.strokes, ...second.strokes]) {
      if (chord(stroke.points) <= 40) continue;
      const sag = sagitta(stroke.points);
      const span = chord(stroke.points);
      const radius = sag > 0.4 ? (span * span) / (8 * sag) : Number.POSITIVE_INFINITY;
      expect(Math.abs(radius - 460)).toBeLessThan(140);
    }
  });

  it("follows a polyline and goes straight at intensity 0", () => {
    const polyline = {
      kind: "polyline" as const,
      points: [
        { x: 0, y: 20 },
        { x: 100, y: 60 },
        { x: 200, y: 30 },
      ],
      closed: false,
    };
    const rect: Point[] = [
      { x: 20, y: 80 },
      { x: 180, y: 80 },
      { x: 180, y: 160 },
      { x: 20, y: 160 },
    ];
    const bowed = planContour(rect, guide(1, { guide: polyline }));
    const flat = planContour(rect, guide(0, { guide: polyline }));
    expect(bowed.strokes.length).toBeGreaterThan(2);
    expect(Math.max(...bowed.strokes.map((stroke) => sagitta(stroke.points)))).toBeGreaterThan(4);
    expect(Math.max(...flat.strokes.map((stroke) => sagitta(stroke.points)))).toBeLessThan(0.05);
  });

  it("leaves an even-odd notch empty", () => {
    const notch: Point[] = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 70 },
      { x: 120, y: 70 },
      { x: 120, y: 130 },
      { x: 200, y: 130 },
      { x: 200, y: 200 },
      { x: 0, y: 200 },
    ];
    const straight = guide(0, { fillAngle: 0, gap: 8 });
    const { guide: _ignored, ...withoutGuide } = straight;
    const plan = planContour(notch, withoutGuide);
    expect(plan.strokes.length).toBeGreaterThan(4);
    for (const stroke of plan.strokes) {
      for (const point of stroke.points) {
        if (point.y > 75 && point.y < 125) expect(point.x).toBeLessThanOrEqual(122);
      }
    }
  });

  it("packs spacing and width toward the guide", () => {
    const plan = planContour(
      dome,
      guide(1, { falloff: 1, guide: { kind: "arc", x: 100, y: 420, radius: 420 } }),
    );
    const ordered = [...plan.strokes].sort((a, b) => meanY(a) - meanY(b));
    expect(ordered.length).toBeGreaterThan(4);
    const topGap = meanY(ordered[1]!) - meanY(ordered[0]!);
    const bottomGap = meanY(ordered[ordered.length - 1]!) - meanY(ordered[ordered.length - 2]!);
    expect(topGap).toBeLessThan(bottomGap * 0.75);
    expect(ordered[0]!.scale).toBeLessThan(ordered[ordered.length - 1]!.scale - 0.2);
  });

  it("wraps a phase back onto the same strokes and moves a half gap", () => {
    const preview = planContour(dome, guide(1));
    const angle = (Math.atan2(preview.travel.y, preview.travel.x) * 180) / Math.PI;
    const still = guide(1, { drift: { angle, phase: 0 } });
    const atZero = planContour(dome, still);
    const atPeriod = planContour(dome, {
      ...still,
      drift: { angle, phase: atZero.period },
    });
    expect(atZero.strokes.length).toBe(atPeriod.strokes.length);
    for (let index = 0; index < atZero.strokes.length; index++) {
      const before = atZero.strokes[index]!;
      const after = atPeriod.strokes[index]!;
      expect(before.slot).toBe(after.slot);
      expect(before.points.length).toBe(after.points.length);
      for (let point = 0; point < before.points.length; point++) {
        expect(before.points[point]!.x).toBeCloseTo(after.points[point]!.x, 1);
        expect(before.points[point]!.y).toBeCloseTo(after.points[point]!.y, 1);
      }
    }
    const shifted = planContour(dome, {
      ...still,
      drift: { angle, phase: atZero.gap * 0.5 },
    });
    expect(atZero.strokes.map((stroke) => stroke.offset).sort()).not.toEqual(
      shifted.strokes.map((stroke) => stroke.offset).sort(),
    );
    expect(shifted.phaseSlots).toBeCloseTo(0.5, 2);
  });
});

describe("contour scene", () => {
  it("keeps the outline when the field scrolls a full period", () => {
    const size = { width: 240, height: 300 };
    const base = resolveSketchOptions({
      fillStyle: "contour",
      seed: 42n,
      roughness: 1.4,
      bowing: 1,
      maxRandomnessOffset: 2,
      contourGuide: { kind: "arc", x: 100, y: 420, radius: 420 },
      contourIntensity: 1,
    });
    const rect = [
      { x: 10, y: 10 },
      { x: 210, y: 10 },
      { x: 210, y: 270 },
      { x: 10, y: 270 },
    ];
    const guideArc = base.contourGuide;
    if (!guideArc) throw new Error("contour guide missing");
    const preview = planContour(rect, {
      gap:
        base.fillWeight < 0
          ? Math.max(base.strokeWidth / 2, 1) * base.fillSpacing
          : base.fillWeight * base.fillSpacing,
      fillAngle: base.fillAngle,
      intensity: 1,
      gradientAngle: 90,
      easing: "linear",
      falloff: 0,
      guide: guideArc,
    });
    const angle = (Math.atan2(preview.travel.y, preview.travel.x) * 180) / Math.PI;
    const still = new RoughView()
      .with({ ...base, contourDrift: { speed: 30, angle, phase: 0 } })
      .draw(rectangle(10, 10, 200, 260))
      .build(size);
    const moved = new RoughView()
      .with({ ...base, contourDrift: { speed: 30, angle, phase: preview.period } })
      .draw(rectangle(10, 10, 200, 260))
      .build(size);
    const outline = (scene: typeof still): string =>
      JSON.stringify(
        scene.nodes[0]?.type === "drawing"
          ? scene.nodes[0].drawing.layers.filter((layer) => layer.role === "stroke")
          : [],
      );
    expect(outline(still)).toBe(outline(moved));
  });

  it("does not change the seed stream when interior shades are added", () => {
    const size = { width: 120, height: 80 };
    const plain = new RoughView()
      .with({ seed: 9n, fillStyle: "hachure" })
      .draw(rectangle(10, 10, 80, 50))
      .build(size);
    const shaded = new RoughView()
      .with({
        seed: 9n,
        fillStyle: "hachure",
        interiorShades: [pit()],
      })
      .draw(rectangle(10, 10, 80, 50))
      .build(size);
    const ink = (scene: typeof plain): string =>
      JSON.stringify(
        scene.nodes[0]?.type === "drawing"
          ? scene.nodes[0].drawing.layers.filter((layer) => layer.role !== "shade")
          : [],
      );
    expect(ink(plain)).toBe(ink(shaded));
    const shades =
      shaded.nodes[0]?.type === "drawing"
        ? shaded.nodes[0].drawing.layers.filter((layer) => layer.role === "shade")
        : [];
    expect(shades.length).toBe(1);
  });
});

function pit() {
  return {
    kind: "innerShadow" as const,
    opacity: 0.6,
    x: 0,
    y: 9,
    blur: 4,
    color: [0, 0, 0, 1] as const,
  };
}
