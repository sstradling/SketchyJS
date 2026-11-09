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
  roughness: /*#__PURE__*/ num("float", "Options.roughness", 1),
  bowing: /*#__PURE__*/ num("float", "Options.bowing", 1),
  maxRandomnessOffset: /*#__PURE__*/ num("float", "Options.maxRandomnessOffset", 2),
  curveTightness: /*#__PURE__*/ num("float", "Options.curveTightness", 0),
  curveStepCount: /*#__PURE__*/ num("float", "Options.curveStepCount", 9),
  strokeContinuity: /*#__PURE__*/ choice(
    "Options.strokeContinuity",
    ["continuous", "legacy"],
    "continuous",
  ),
  strokeWidth: /*#__PURE__*/ num("float", "Options.strokeWidth", 1),
  strokeOpacity: /*#__PURE__*/ num("float", "Options.strokeOpacity", 1, {
    min: 0,
    max: 1,
    enforcedBy: "modifier",
  }),
  strokeMiterLimit: /*#__PURE__*/ num("double", "Options.strokeMiterLimit", 10, {
    min: 1,
    enforcedBy: "modifier",
  }),
  fillStyle: /*#__PURE__*/ choice("Options.fillStyle", FILL_STYLES, "hachure"),
  fillOpacity: /*#__PURE__*/ num("float", "Options.fillOpacity", 1, {
    min: 0,
    max: 1,
    enforcedBy: "modifier",
  }),
  fillWeight: /*#__PURE__*/ num("float", "Options.fillWeight", -1),
  fillSpacing: /*#__PURE__*/ num("float", "Options.fillSpacing", 4, {
    min: 0.5,
    max: 100,
    enforcedBy: "modifier",
  }),
  fillAngle: /*#__PURE__*/ num("float", "Options.fillAngle", 45),
  fillPadding: /*#__PURE__*/ num("double", "Options.fillPadding", 0),
  dashOffset: /*#__PURE__*/ num("float", "Options.dashOffset", -1),
  dashGap: /*#__PURE__*/ num("float", "Options.dashGap", -1),
  zigzagOffset: /*#__PURE__*/ num("float", "Options.zigzagOffset", -1),
  scribbleOrigin: /*#__PURE__*/ num("float", "Options.scribbleOrigin", 0),
  scribbleTightness: /*#__PURE__*/ num("int", "Options.scribbleTightness", 10, {
    min: 1,
    max: 100,
    enforcedBy: "modifier",
  }),
  scribbleCurvature: /*#__PURE__*/ num("float", "Options.scribbleCurvature", 0, {
    min: 0,
    max: 50,
    enforcedBy: "modifier",
  }),
  scribbleUseBrushStroke: /*#__PURE__*/ bool("Options.scribbleUseBrushStroke", false),
  svgFillStrokeAlignment: /*#__PURE__*/ choice(
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
  grain: /*#__PURE__*/ num("float", "CrayonStyle.grain", 0.28, {
    min: 0,
    max: 1,
    enforcedBy: "init",
  }),
  edgeRoughness: /*#__PURE__*/ num("float", "CrayonStyle.edgeRoughness", 0.75, {
    min: 0,
    max: 1,
    enforcedBy: "init",
  }),
  widthVariation: /*#__PURE__*/ num("float", "CrayonStyle.widthVariation", 0.18, {
    min: 0,
    max: 1,
    enforcedBy: "init",
  }),
  opacityVariation: /*#__PURE__*/ num("float", "CrayonStyle.opacityVariation", 0.35, {
    min: 0,
    max: 1,
    enforcedBy: "init",
  }),
  passes: /*#__PURE__*/ num("int", "CrayonStyle.passes", 2, { min: 1, max: 3, enforcedBy: "init" }),
  baseOpacity: /*#__PURE__*/ num("float", "CrayonStyle.baseOpacity", 0.8, {
    min: 0.2,
    max: 1,
    enforcedBy: "init",
  }),
  baseSoftness: /*#__PURE__*/ num("float", "CrayonStyle.baseSoftness", 0.5, {
    min: 0,
    max: 1,
    enforcedBy: "init",
  }),
  grit: /*#__PURE__*/ num("float", "CrayonStyle.grit", 0.92, {
    min: 0,
    max: 1,
    enforcedBy: "init",
  }),
  flakeSize: /*#__PURE__*/ num("float", "CrayonStyle.flakeSize", 1.45, {
    min: 0.35,
    max: 3,
    enforcedBy: "init",
  }),
} as const satisfies Table;

/** `WatercolorStyle` initializer clamps. */
export const WATERCOLOR_STYLE = {
  pigment: /*#__PURE__*/ num("float", "WatercolorStyle.pigment", 0.72, {
    min: 0,
    max: 1,
    enforcedBy: "init",
  }),
  wetness: /*#__PURE__*/ num("float", "WatercolorStyle.wetness", 0.6, {
    min: 0,
    max: 1,
    enforcedBy: "init",
  }),
  edgeDarkening: /*#__PURE__*/ num("float", "WatercolorStyle.edgeDarkening", 0.75, {
    min: 0,
    max: 1,
    enforcedBy: "init",
  }),
  layers: /*#__PURE__*/ num("int", "WatercolorStyle.layers", 3, {
    min: 1,
    max: 5,
    enforcedBy: "init",
  }),
  variation: /*#__PURE__*/ num("float", "WatercolorStyle.variation", 0.45, {
    min: 0,
    max: 1,
    enforcedBy: "init",
  }),
  bleed: /*#__PURE__*/ num("float", "WatercolorStyle.bleed", 0.5, {
    min: 0,
    max: 1,
    enforcedBy: "init",
  }),
} as const satisfies Table;

/** `StickerTear` clamps. `depth` 0 asks the renderer to use `max(3, width * 0.55)`. */
export const STICKER_TEAR = {
  depth: /*#__PURE__*/ num("double", "StickerTear.depth", 0, { min: 0, enforcedBy: "init" }),
  length: /*#__PURE__*/ num("double", "StickerTear.length", 16, { min: 4, enforcedBy: "init" }),
  jaggedness: /*#__PURE__*/ num("double", "StickerTear.jaggedness", 0.35, {
    min: 0,
    max: 1,
    enforcedBy: "init",
  }),
} as const satisfies Table;

/** `StickerTexture.paper()` clamps. */
export const STICKER_TEXTURE = {
  amount: /*#__PURE__*/ num("double", "StickerTexture.amount", 0.45, {
    min: 0,
    max: 1,
    enforcedBy: "init",
  }),
  scale: /*#__PURE__*/ num("double", "StickerTexture.scale", 11, { min: 4, enforcedBy: "init" }),
} as const satisfies Table;

/** `StickerShadow` clamps. */
export const STICKER_SHADOW = {
  opacity: /*#__PURE__*/ num("double", "StickerShadow.opacity", 0.35, {
    min: 0,
    max: 1,
    enforcedBy: "init",
  }),
  x: /*#__PURE__*/ num("double", "StickerShadow.x", 0),
  y: /*#__PURE__*/ num("double", "StickerShadow.y", 8),
  radius: /*#__PURE__*/ num("double", "StickerShadow.radius", 8, { min: 0, enforcedBy: "init" }),
} as const satisfies Table;

/** `StickerBacking` clamps. `fullySmooth` radius uses the same lower bound as `width`. */
export const STICKER_BACKING = {
  width: /*#__PURE__*/ num("double", "StickerBacking.width", 0, { min: 0, enforcedBy: "init" }),
  smoothness: /*#__PURE__*/ num("double", "StickerBacking.smoothness", 0, {
    min: 0,
    max: 1,
    enforcedBy: "init",
  }),
  fullySmoothRadius: /*#__PURE__*/ num("double", "StickerEdge.fullySmooth.radius", 0, {
    min: 0,
    enforcedBy: "init",
  }),
} as const satisfies Table;

/** `StickerImage` clamps. A non-finite or non-positive `scale` stores 0, which means "natural". */
export const STICKER_IMAGE = {
  opacity: /*#__PURE__*/ num("double", "StickerImage.opacity", 1, {
    min: 0,
    max: 1,
    enforcedBy: "init",
  }),
  scale: /*#__PURE__*/ num("double", "StickerImage.scale", 0, {
    min: 0,
    nonFiniteTo: 0,
    enforcedBy: "init",
  }),
} as const satisfies Table;

/** `AnimationConfig` clamp. */
export const ANIMATION_CONFIG = {
  steps: /*#__PURE__*/ num("int", "AnimationConfig.steps", 4, { min: 2, enforcedBy: "init" }),
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
