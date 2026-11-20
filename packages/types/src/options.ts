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
  | "watercolor"
  | "contour"
  | "wash";

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

/** How contour intensity moves from the low end of the gradient to the high end. */
export type ContourEasing = "linear" | "easeIn" | "easeOut" | "easeInOut";

/** Guide curve for a contour fill. Coordinates match the shape, before an SVG fit. */
export type ContourGuide =
  | { kind: "arc"; x: number; y: number; radius: number }
  | { kind: "polyline"; points: readonly Point[]; closed: boolean };

/**
 * Scrolls a contour fill along `angle` without re-rolling wobble.
 * `speed` is points per second. `phase` is the distance already traveled.
 */
export interface ContourDrift {
  speed: number;
  angle: number;
  phase: number;
}

/** One crayon-wash band. Lengths are points. `skyWash` is the two-pass sky recipe. */
export interface WashPass {
  spacingMin: number;
  spacingSpan: number;
  widthMin: number;
  widthSpan: number;
  opacityMin: number;
  opacitySpan: number;
  trimMax: number;
  angleSpread: number;
  bow: number;
  minLength: number;
  roughness: number;
  bowing: number;
  randomness: number;
  seed: Seed;
}

/** One colour stop of an interior gradient. `location` and `opacity` are 0...1. */
export interface ShadeStop {
  location: number;
  color: Color;
  opacity: number;
}

/**
 * A shade painted inside a closed shape, or a soft band just outside it.
 * The generator ignores these, so the seed and any geometry cache stay put.
 * Holes stay empty. `StickerShadow` is still the paper's outer drop shadow.
 */
export type InteriorShade =
  | {
      kind: "innerShadow";
      opacity: number;
      x: number;
      y: number;
      blur: number;
      color: Color;
    }
  | { kind: "linear"; stops: readonly ShadeStop[]; angle: number }
  | {
      kind: "radial";
      stops: readonly ShadeStop[];
      centerX: number;
      centerY: number;
      startRadius: number;
      endRadius: number;
    }
  | {
      kind: "halo";
      opacity: number;
      glow: number;
      width: number;
      blur: number;
      color: Color;
    };

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

  /** Guide for `.contour`. Omitted strokes are straight at `fillAngle`. */
  contourGuide?: ContourGuide;
  /** How strongly a contour stroke follows the guide. `0` is a chord, `1` is the guide's bow. */
  contourIntensity: number;
  /** Curvature at the low end of `contourGradientAngle`. Omitted uses `contourIntensity`. */
  contourIntensityStart?: number;
  /** Curvature at the high end of `contourGradientAngle`. Omitted uses `contourIntensity`. */
  contourIntensityEnd?: number;
  /** Direction the contour intensity ramps, in degrees. `90` runs top to bottom. */
  contourGradientAngle: number;
  contourEasing: ContourEasing;
  /** How much contour spacing and stroke width shrink toward the guide. Clamped to 0...1. */
  contourFalloff: number;
  contourDrift?: ContourDrift;
  /**
   * Crayon-wash bands. `.wash` uses the sky recipe when this is omitted.
   * On `.contour`, a non-empty list strokes each centerline with these bands.
   */
  washPasses?: readonly WashPass[];
  /**
   * Shades painted after generation. They do not change the drawing or the seed.
   * An empty list draws nothing.
   */
  interiorShades: readonly InteriorShade[];
}

/** Fixed canvas size used when a drawing is built. */
export type CanvasSize = Size;
