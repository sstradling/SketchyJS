import { bool, choice, num, type OptionRule } from "./rule.js";

type Table = Readonly<Record<string, OptionRule>>;

const FILL_STYLES = [
  "hachure",
  "solid",
  "zigzag",
  "crossHatch",
  "dots",
  "sunBurst",
  "starBurst",
  "dashed",
  "zigzagLine",
  "scribble",
  "watercolor",
] as const;

/**
 * Options of `SketchOptions` that are plain numbers, booleans and enums. Colors, offsets, profiles
 * and arrays are structural and listed in `STRUCTURAL_SKETCH_KEYS`.
 *
 * Swift `Options` itself stores raw values. Clamps come from `RoughView` modifiers, so the
 * `enforcedBy: "modifier"` rows apply when a value is set through the builder API.
 */
export const SKETCH_OPTIONS = {
  roughness: num("float", "Options.roughness", 1),
  bowing: num("float", "Options.bowing", 1),
  maxRandomnessOffset: num("float", "Options.maxRandomnessOffset", 2),
  curveTightness: num("float", "Options.curveTightness", 0),
  curveStepCount: num("float", "Options.curveStepCount", 9),
  strokeContinuity: choice("Options.strokeContinuity", ["continuous", "legacy"], "continuous"),
  strokeWidth: num("float", "Options.strokeWidth", 1),
  strokeOpacity: num("float", "Options.strokeOpacity", 1, {
    min: 0,
    max: 1,
    enforcedBy: "modifier",
  }),
  strokeMiterLimit: num("double", "Options.strokeMiterLimit", 10, {
    min: 1,
    enforcedBy: "modifier",
  }),
  fillStyle: choice("Options.fillStyle", FILL_STYLES, "hachure"),
  fillOpacity: num("float", "Options.fillOpacity", 1, { min: 0, max: 1, enforcedBy: "modifier" }),
  fillWeight: num("float", "Options.fillWeight", -1),
  fillSpacing: num("float", "Options.fillSpacing", 4, {
    min: 0.5,
    max: 100,
    enforcedBy: "modifier",
  }),
  fillAngle: num("float", "Options.fillAngle", 45),
  fillPadding: num("double", "Options.fillPadding", 0),
  dashOffset: num("float", "Options.dashOffset", -1),
  dashGap: num("float", "Options.dashGap", -1),
  zigzagOffset: num("float", "Options.zigzagOffset", -1),
  scribbleOrigin: num("float", "Options.scribbleOrigin", 0),
  scribbleTightness: num("int", "Options.scribbleTightness", 10, {
    min: 1,
    max: 100,
    enforcedBy: "modifier",
  }),
  scribbleCurvature: num("float", "Options.scribbleCurvature", 0, {
    min: 0,
    max: 50,
    enforcedBy: "modifier",
  }),
  scribbleUseBrushStroke: bool("Options.scribbleUseBrushStroke", false),
  svgFillStrokeAlignment: choice(
    "Options.svgFillStrokeAlignment",
    ["center", "inside", "outside"],
    "center",
  ),
} as const satisfies Table;

/** Keys of `SketchOptions` that are structured values rather than scalars (no scalar rule). */
export const STRUCTURAL_SKETCH_KEYS = [
  "seed",
  "strokeColor",
  "fillColor",
  "fillOffset",
  "fillSpacingPattern",
  "scribbleTightnessPattern",
  "svgFillWeight",
  "svgStrokeWidth",
  "brushProfile",
  "stickerBacking",
] as const;

/** `CrayonStyle` initializer clamps. The default seed is the sentinel `1`. */
export const CRAYON_STYLE = {
  grain: num("float", "CrayonStyle.grain", 0.28, { min: 0, max: 1, enforcedBy: "init" }),
  edgeRoughness: num("float", "CrayonStyle.edgeRoughness", 0.75, {
    min: 0,
    max: 1,
    enforcedBy: "init",
  }),
  widthVariation: num("float", "CrayonStyle.widthVariation", 0.18, {
    min: 0,
    max: 1,
    enforcedBy: "init",
  }),
  opacityVariation: num("float", "CrayonStyle.opacityVariation", 0.35, {
    min: 0,
    max: 1,
    enforcedBy: "init",
  }),
  passes: num("int", "CrayonStyle.passes", 2, { min: 1, max: 3, enforcedBy: "init" }),
  baseOpacity: num("float", "CrayonStyle.baseOpacity", 0.8, {
    min: 0.2,
    max: 1,
    enforcedBy: "init",
  }),
  baseSoftness: num("float", "CrayonStyle.baseSoftness", 0.5, {
    min: 0,
    max: 1,
    enforcedBy: "init",
  }),
  grit: num("float", "CrayonStyle.grit", 0.92, { min: 0, max: 1, enforcedBy: "init" }),
  flakeSize: num("float", "CrayonStyle.flakeSize", 1.45, { min: 0.35, max: 3, enforcedBy: "init" }),
} as const satisfies Table;

/** `WatercolorStyle` initializer clamps. */
export const WATERCOLOR_STYLE = {
  pigment: num("float", "WatercolorStyle.pigment", 0.72, { min: 0, max: 1, enforcedBy: "init" }),
  wetness: num("float", "WatercolorStyle.wetness", 0.6, { min: 0, max: 1, enforcedBy: "init" }),
  edgeDarkening: num("float", "WatercolorStyle.edgeDarkening", 0.75, {
    min: 0,
    max: 1,
    enforcedBy: "init",
  }),
  layers: num("int", "WatercolorStyle.layers", 3, { min: 1, max: 5, enforcedBy: "init" }),
  variation: num("float", "WatercolorStyle.variation", 0.45, {
    min: 0,
    max: 1,
    enforcedBy: "init",
  }),
  bleed: num("float", "WatercolorStyle.bleed", 0.5, { min: 0, max: 1, enforcedBy: "init" }),
} as const satisfies Table;

/** `StickerTear` clamps. `depth` 0 asks the renderer to use `max(3, width * 0.55)`. */
export const STICKER_TEAR = {
  depth: num("double", "StickerTear.depth", 0, { min: 0, enforcedBy: "init" }),
  length: num("double", "StickerTear.length", 16, { min: 4, enforcedBy: "init" }),
  jaggedness: num("double", "StickerTear.jaggedness", 0.35, { min: 0, max: 1, enforcedBy: "init" }),
} as const satisfies Table;

/** `StickerTexture.paper()` clamps. */
export const STICKER_TEXTURE = {
  amount: num("double", "StickerTexture.amount", 0.45, { min: 0, max: 1, enforcedBy: "init" }),
  scale: num("double", "StickerTexture.scale", 11, { min: 4, enforcedBy: "init" }),
} as const satisfies Table;

/** `StickerShadow` clamps. */
export const STICKER_SHADOW = {
  opacity: num("double", "StickerShadow.opacity", 0.35, { min: 0, max: 1, enforcedBy: "init" }),
  x: num("double", "StickerShadow.x", 0),
  y: num("double", "StickerShadow.y", 8),
  radius: num("double", "StickerShadow.radius", 8, { min: 0, enforcedBy: "init" }),
} as const satisfies Table;

/** `StickerBacking` clamps. `fullySmooth` radius uses the same lower bound as `width`. */
export const STICKER_BACKING = {
  width: num("double", "StickerBacking.width", 0, { min: 0, enforcedBy: "init" }),
  smoothness: num("double", "StickerBacking.smoothness", 0, { min: 0, max: 1, enforcedBy: "init" }),
  fullySmoothRadius: num("double", "StickerEdge.fullySmooth.radius", 0, {
    min: 0,
    enforcedBy: "init",
  }),
} as const satisfies Table;

/** `StickerImage` clamps. A non-finite or non-positive `scale` stores 0, which means "natural". */
export const STICKER_IMAGE = {
  opacity: num("double", "StickerImage.opacity", 1, { min: 0, max: 1, enforcedBy: "init" }),
  scale: num("double", "StickerImage.scale", 0, { min: 0, nonFiniteTo: 0, enforcedBy: "init" }),
} as const satisfies Table;

/** `AnimationConfig` clamp. */
export const ANIMATION_CONFIG = {
  steps: num("int", "AnimationConfig.steps", 4, { min: 2, enforcedBy: "init" }),
} as const satisfies Table;

/** All spec tables by group, for tools that walk every option. */
export const OPTION_GROUPS = {
  sketch: SKETCH_OPTIONS,
  crayonStyle: CRAYON_STYLE,
  watercolorStyle: WATERCOLOR_STYLE,
  stickerTear: STICKER_TEAR,
  stickerTexture: STICKER_TEXTURE,
  stickerShadow: STICKER_SHADOW,
  stickerBacking: STICKER_BACKING,
  stickerImage: STICKER_IMAGE,
  animationConfig: ANIMATION_CONFIG,
} as const satisfies Readonly<Record<string, Table>>;

/** Animation speed durations in seconds. */
export const ANIMATION_SPEED_SECONDS = { slow: 0.6, medium: 0.3, fast: 0.1 } as const;

/** Animation variance factors. */
export const ANIMATION_VARIANCE_FACTOR = {
  veryLow: 0.005,
  low: 0.01,
  medium: 0.05,
  high: 0.1,
} as const;

/** Sentinel Swift uses when a style seed is not set. */
export const DEFAULT_STYLE_SEED = 1n;
