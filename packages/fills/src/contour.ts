import {
  defineFill,
  type FillInput,
  type FillPart,
  type Path,
  type PluginContext,
  type Point,
} from "@sketchy-js/plugin";
import {
  ellipsePolygon,
  planContour,
  type ContourPlanOptions,
  type ContourStroke,
} from "./internal/contour-geometry.js";
import { f } from "./internal/f32.js";
import { mixSeed } from "./internal/mix.js";
import { shapeWash } from "./internal/wash-stroke.js";

/**
 * Contour fill: rough strokes that follow a guide curve. Sketchy's `ContourFiller`.
 *
 * Request flow: scene fill stage copies contour options onto the fill input, this
 * plugin plans centerlines, then `ctx.geom.rough` adds the same bowing as other
 * line fills. A seeded slot keeps its wobble when the field scrolls. `washPasses`
 * replaces that roughening with the shared crayon-wash recipe.
 */

/** Polygon the filler scans. An ellipse is resampled at 80 steps, not the host ring. */
function polygonOf(input: FillInput): Point[] {
  const shape = input.region.shape;
  if (shape?.kind === "ellipse") return ellipsePolygon(shape.cx, shape.cy, shape.rx, shape.ry);
  return input.region.rings[0]?.points.map((point) => ({ x: point.x, y: point.y })) ?? [];
}

function roughen(
  stroke: ContourStroke,
  piece: number,
  seed: bigint | undefined,
  ctx: PluginContext,
): Path {
  if (stroke.points.length < 2) return [];
  if (seed === undefined) return ctx.geom.rough.curve(stroke.points);
  const slotSeed = mixSeed(mixSeed(seed, stroke.slot), piece);
  return ctx.geom.rough.isolated(slotSeed).curve(stroke.points);
}

export const contour = /*#__PURE__*/ defineFill({
  id: "contour",
  version: "0.1.0",
  api: "1.0",
  title: "Contour",
  description: "Rough strokes that follow a guide arc or polyline and span the shape.",
  options: {},
  stochastic: true,
  stream: "shared",
  generate(input, _options, ctx): readonly FillPart[] {
    const contourOptions = input.contour;
    const planOptions: ContourPlanOptions = {
      gap: input.fill.gap,
      fillAngle: input.fill.angle,
      intensity: contourOptions?.intensity ?? 1,
      ...(contourOptions?.intensityStart !== undefined
        ? { intensityStart: contourOptions.intensityStart }
        : {}),
      ...(contourOptions?.intensityEnd !== undefined
        ? { intensityEnd: contourOptions.intensityEnd }
        : {}),
      gradientAngle: contourOptions?.gradientAngle ?? 90,
      easing: contourOptions?.easing ?? "linear",
      falloff: contourOptions?.falloff ?? 0,
      ...(contourOptions?.drift ? { drift: contourOptions.drift } : {}),
      ...(contourOptions?.guide ? { guide: contourOptions.guide } : {}),
    };
    const plan = planContour(polygonOf(input), planOptions);
    if (plan.strokes.length === 0) return [];
    const passes = input.washPasses;
    if (passes && passes.length > 0) {
      const seed = input.seed ?? passes[0]!.seed;
      return passes.flatMap((pass) => {
        const random = ctx.geom.rough.isolated(mixSeed(seed, Number(pass.seed & 0x7fffffffn)));
        const centerlines: Path[] = [];
        for (const stroke of plan.strokes) {
          const trimA = f(pass.trimMax * f(0.35 + f(0.65 * random.unit())));
          const trimB = f(pass.trimMax * f(0.35 + f(0.65 * random.unit())));
          const bow = f(f(random.unit() - 0.5) * Math.min(pass.bow, 8));
          const shaped = shapeWash(stroke.points, trimA, trimB, bow);
          if (shaped.length < 2) continue;
          const slotSeed = mixSeed(mixSeed(seed, stroke.slot), Number(pass.seed & 0x7fffffffn));
          centerlines.push(
            ctx.geom.rough
              .isolated(slotSeed, {
                roughness: pass.roughness,
                bowing: pass.bowing,
                maxRandomnessOffset: pass.randomness,
              })
              .curve(shaped),
          );
        }
        if (centerlines.length === 0) return [];
        const width = f(pass.widthMin + f(pass.widthSpan * 0.5));
        const opacity = Math.min(1, f(pass.opacityMin + f(pass.opacitySpan * 0.5)));
        return [
          {
            kind: "strokes" as const,
            centerlines,
            clip: "none" as const,
            strokeWidth: width,
            opacity,
          },
        ];
      });
    }

    const parts: FillPart[] = [];
    let band: { scale: number; paths: Path[] } | undefined;
    const pieceCount = new Map<number, number>();
    for (const stroke of plan.strokes) {
      const piece = pieceCount.get(stroke.slot) ?? 0;
      pieceCount.set(stroke.slot, piece + 1);
      const quanta = f(roundTenths(stroke.scale));
      const path = roughen(stroke, piece, input.seed, ctx);
      if (path.length === 0) continue;
      if (!band || band.scale !== quanta) {
        if (band && band.paths.length > 0) {
          parts.push({
            kind: "strokes",
            centerlines: band.paths,
            clip: "none",
            strokeScale: band.scale,
          });
        }
        band = { scale: quanta, paths: [] };
      }
      band.paths.push(path);
    }
    if (band && band.paths.length > 0) {
      parts.push({
        kind: "strokes",
        centerlines: band.paths,
        clip: "none",
        strokeScale: band.scale,
      });
    }
    return parts;
  },
});

/** `(scale * 10).rounded() / 10` in Float. */
function roundTenths(scale: number): number {
  return f(f(Math.sign(scale) * Math.round(Math.abs(f(scale * 10)))) / 10);
}
