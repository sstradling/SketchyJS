import { defineBrush, s, type BrushLayer } from "@sketchy-js/plugin";
import { crayonPasses, type CrayonNumbers } from "./crayon-stroke.js";

/**
 * Wax-crayon brush. The same `defineBrush` contract as a contributed brush: one centerline
 * in, filled wax passes out. Sketchy's `CrayonStroke`.
 *
 * Request flow: scene host -> `generate` -> `crayonPasses` -> stroke layers the renderers fill.
 */
export const crayon = /*#__PURE__*/ defineBrush({
  id: "crayon",
  version: "0.1.0",
  api: "1.0",
  title: "Crayon",
  description: "A greasy wax base with grit and detached flakes. Overlaps stack.",
  stochastic: true,
  options: {
    grain: s.number({
      default: 0.28,
      min: 0,
      max: 1,
      description: "How much the grit thins into speckle.",
    }),
    edgeRoughness: s.number({
      default: 0.75,
      min: 0,
      max: 1,
      description: "Raggedness of the grit edge.",
    }),
    widthVariation: s.number({
      default: 0.18,
      min: 0,
      max: 1,
      description: "Along-stroke width wander.",
    }),
    opacityVariation: s.number({
      default: 0.35,
      min: 0,
      max: 1,
      description: "How much later grit passes fade.",
    }),
    passes: s.int({ default: 2, min: 1, max: 3, description: "Grit layers on top of the base." }),
    baseOpacity: s.number({
      default: 0.8,
      min: 0.2,
      max: 1,
      description: "Opacity of the greasy base.",
    }),
    baseSoftness: s.number({
      default: 0.5,
      min: 0,
      max: 1,
      description: "Width of the soft halo.",
    }),
    grit: s.number({ default: 0.92, min: 0, max: 1, description: "Flake density." }),
    flakeSize: s.number({
      default: 1.45,
      min: 0.35,
      max: 3,
      description: "Flake size relative to the preset.",
    }),
  },
  generate(input, options): readonly BrushLayer[] {
    const style = options as unknown as CrayonNumbers;
    const seed = input.seed ?? 1n;
    return crayonPasses(input.path, input.stroke.width, style, seed).map((pass) => ({
      role: "stroke" as const,
      paths: [pass.path],
      paint: { kind: "stroke" as const, alpha: pass.opacity * input.stroke.opacity },
      fillRule: "nonzero" as const,
    }));
  },
});
