import type { Color } from "./color.js";
import type { Point, Size } from "./geometry.js";
import type { Seed } from "./seed.js";

/**
 * Fill styles. The names are camelCase here and map to Swift raw values at the fixture boundary:
 * `crossHatch` is `cross-hatch`, `sunBurst` is `sunburst`, `starBurst` is `starburst` and
 * `zigzagLine` is `zigzag-line`.
 */
export type FillStyle =
  | "hachure"
  | "solid"
  | "zigzag"
  | "crossHatch"
  | "dots"
  | "sunBurst"
  | "starBurst"
  | "dashed"
  | "zigzagLine"
  | "scribble"
  | "watercolor";

/** How consecutive rough passes of one outline are joined. */
export type StrokeContinuity = "continuous" | "legacy";

/** How an SVG fill's stroke is positioned relative to the fitted path. */
export type SvgFillStrokeAlignment = "center" | "inside" | "outside";

export type BrushCap = "butt" | "round" | "square";
export type BrushJoin = "miter" | "round" | "bevel" | { kind: "curvedBevel"; bulge: number };

/** Elliptical brush tip. `roundness` 1 is a circle. */
export interface BrushTip {
  roundness: number;
  /** Radians. */
  angle: number;
  directionSensitive: boolean;
}

export interface WidthStop {
  position: number;
  width: number;
}

export interface OpacityStop {
  position: number;
  opacity: number;
}

export interface VariableStrokeWidth {
  variation: number;
  minimum?: number;
  maximum?: number;
  taperStart: number;
  taperEnd: number;
  pressure: readonly number[];
  seed: Seed;
  frequency: number;
}

export interface OpacityNoise {
  minimum: number;
  maximum: number;
  variation: number;
  seed: Seed;
  frequency: number;
}

export type ThicknessProfile =
  | { kind: "uniform" }
  | { kind: "taperIn"; start: number }
  | { kind: "taperOut"; end: number }
  | { kind: "taperBoth"; start: number; end: number }
  | { kind: "pressure"; values: readonly number[] }
  | { kind: "custom"; values: readonly number[] }
  | { kind: "stops"; stops: readonly WidthStop[] }
  | { kind: "variable"; width: VariableStrokeWidth };

export type OpacityProfile =
  | { kind: "uniform" }
  | { kind: "values"; values: readonly number[] }
  | { kind: "stops"; stops: readonly OpacityStop[] }
  | { kind: "noise"; noise: OpacityNoise };

/** Crayon brush parameters. Ranges and defaults live in `@sketchy-js/core/options`. */
export interface CrayonStyle {
  grain: number;
  edgeRoughness: number;
  widthVariation: number;
  opacityVariation: number;
  passes: number;
  baseOpacity: number;
  baseSoftness: number;
  grit: number;
  flakeSize: number;
  seed: Seed;
}

/** Watercolor brush parameters. */
export interface WatercolorStyle {
  pigment: number;
  wetness: number;
  edgeDarkening: number;
  layers: number;
  variation: number;
  bleed: number;
  seed: Seed;
}

export interface BrushProfile {
  tip: BrushTip;
  thicknessProfile: ThicknessProfile;
  cap: BrushCap;
  join: BrushJoin;
  opacityProfile: OpacityProfile;
  crayon?: CrayonStyle;
  watercolor?: WatercolorStyle;
}

export type StickerEdge =
  | "smooth"
  | { kind: "fullySmooth"; radius: number }
  | { kind: "torn"; depth: number; length: number; jaggedness: number };

export type StickerImagePlacement = "tile" | "stretch" | "fill";

export interface StickerShadow {
  opacity: number;
  x: number;
  y: number;
  radius: number;
  color: Color;
}

export interface StickerTexture {
  amount: number;
  scale: number;
  seed?: Seed;
}

/** Image-masked sticker texture (Sketchy v1.5.0). `source` is an opaque, already-decoded handle. */
export interface StickerImage {
  source: unknown;
  placement: StickerImagePlacement;
  scale: number;
  opacity: number;
}

export interface StickerBacking {
  width: number;
  smoothness: number;
  edge: StickerEdge;
  color: Color;
  texture?: StickerTexture;
  image?: StickerImage;
  shadow?: StickerShadow;
}

/**
 * All sketch options. Field names match Swift `Options`, except where noted:
 * `seed` is `undefined` when unseeded (Swift uses `nil`), colors are `Color`, and `fillOffset` is
 * a `Point` (Swift `CGSize`).
 */
export interface SketchOptions {
  roughness: number;
  bowing: number;
  maxRandomnessOffset: number;
  curveTightness: number;
  curveStepCount: number;
  seed?: Seed;
  strokeContinuity: StrokeContinuity;

  strokeColor: Color;
  strokeWidth: number;
  strokeOpacity: number;
  strokeMiterLimit: number;

  fillStyle: FillStyle;
  fillColor: Color;
  fillOpacity: number;
  fillWeight: number;
  fillSpacing: number;
  fillSpacingPattern?: readonly number[];
  fillAngle: number;
  fillPadding: number;
  fillOffset: Point;
  dashOffset: number;
  dashGap: number;
  zigzagOffset: number;

  scribbleOrigin: number;
  scribbleTightness: number;
  scribbleTightnessPattern?: readonly number[];
  scribbleCurvature: number;
  scribbleUseBrushStroke: boolean;

  svgFillWeight?: number;
  svgStrokeWidth?: number;
  svgFillStrokeAlignment: SvgFillStrokeAlignment;

  brushProfile: BrushProfile;
  stickerBacking?: StickerBacking;
}

/** Fixed canvas size used when a drawing is built. */
export type CanvasSize = Size;
