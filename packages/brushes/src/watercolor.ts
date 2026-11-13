import {
  defineBrush,
  defineFill,
  s,
  type BrushLayer,
  type FillInput,
  type FillPart,
  type Path,
  type PluginContext,
} from "@sketchy-js/plugin";
import { watercolorFillCommands } from "./watercolor-fill.js";
import { watercolorStrokeCommands } from "./watercolor-stroke.js";
import type { WatercolorNumbers } from "./watercolor-style.js";

/**
 * Shared wash settings. `seed` stays off the brush schema and arrives on `BrushInput.seed`.
 * The fill plugin declares `seed` because a fill has no brush input.
 */
const washFields = {
  pigment: s.number({
    default: 0.72,
    min: 0,
    max: 1,
    description: "Wash strength, from paper to a heavy glaze.",
  }),
  wetness: s.number({
    default: 0.6,
    min: 0,
    max: 1,
    description: "How far wet passes drift.",
  }),
  edgeDarkening: s.number({
    default: 0.75,
    min: 0,
    max: 1,
    description: "How much darker the rim is than the centre.",
  }),
  layers: s.int({ default: 3, min: 1, max: 5, description: "Body passes. Crossings stack." }),
  variation: s.number({
    default: 0.45,
    min: 0,
    max: 1,
    description: "Width, opacity, and grain wander.",
  }),
  bleed: s.number({
    default: 0.5,
    min: 0,
    max: 1,
    description: "Uneven dried edge and backruns. Not a blur.",
  }),
} as const;

function numbers(options: Record<string, unknown>, seed: bigint | number): WatercolorNumbers {
  return {
    pigment: options.pigment as number,
    wetness: options.wetness as number,
    edgeDarkening: options.edgeDarkening as number,
    layers: options.layers as number,
    variation: options.variation as number,
    bleed: options.bleed as number,
    seed,
  };
}

/**
 * Watercolor stroke. One centerline in, glaze fills out. Sketchy's `WatercolorStroke`.
 *
 * Register with `basicSketchy.use(watercolor)`, then set `brushProfile.watercolor`.
 * `scene/basic` does not register it.
 */
export const watercolor = /*#__PURE__*/ defineBrush({
  id: "watercolor",
  version: "0.1.0",
  api: "1.0",
  title: "Watercolor",
  description: "A crisp wash: layered glazes, a broken rim, and a little grain. No blur halo.",
  stochastic: true,
  options: washFields,
  generate(input, options): readonly BrushLayer[] {
    const style = numbers(options, input.seed ?? 1n);
    return watercolorStrokeCommands(
      input.path,
      input.stroke.width,
      style,
      input.stroke.opacity,
      input.stroke.miterLimit,
    ).map((command) => ({
      role: "stroke" as const,
      paths: command.paths,
      paint: { kind: "stroke" as const, alpha: command.opacity },
      fillRule: command.evenOdd ? ("evenodd" as const) : ("nonzero" as const),
    }));
  },
});

/** The jittered outline `SolidFiller` would emit. Watercolor paints the wash of that shape. */
function solidShape(input: FillInput, ctx: PluginContext): Path {
  const ring = input.region.rings[0];
  const polygon = ring ? ring.points : [];
  const shape = input.region.shape;
  if (shape?.kind === "ellipse")
    return ctx.geom.rough.solidEllipse({ x: shape.cx, y: shape.cy }, shape.rx, shape.ry);
  return ctx.geom.rough.solidPolygon(polygon);
}

/**
 * Watercolor fill. The generator still draws the solid outline (so the stroke's random stream
 * stays aligned), then this plugin replaces that area with clipped glazes.
 *
 * A default `seed` of 1 means the host should pass the drawing seed. `fillStyle: "watercolor"`
 * does that when this plugin is registered.
 */
export const watercolorFill = /*#__PURE__*/ defineFill({
  id: "watercolor",
  version: "0.1.0",
  api: "1.0",
  title: "Watercolor fill",
  description: "Layered glazes clipped to the shape, with a darker edge and a little grain.",
  stochastic: true,
  paints: "area",
  stream: "shared",
  options: {
    ...washFields,
    seed: s.int({
      default: 1,
      min: 0,
      max: Number.MAX_SAFE_INTEGER,
      description: "Wash seed. 1 inherits the drawing seed when the host resolves the fill.",
    }),
  },
  generate(input, options, ctx): readonly FillPart[] {
    const shape = solidShape(input, ctx);
    const style = numbers(options, options.seed);
    return watercolorFillCommands(shape, style, input.fill.opacity).map((command) => ({
      kind: "area" as const,
      paths: command.paths,
      fillRule: command.evenOdd ? ("evenodd" as const) : ("nonzero" as const),
      paint: { kind: "fill" as const, alpha: command.opacity },
      clipPath: shape,
    }));
  },
});
