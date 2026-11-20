import type { Color, FillRule, Path, Point, Rect, ThicknessProfile } from "@sketchy-js/types";
import type { FillRegion, FlatSubpath } from "./services.js";

export interface StrokeBase {
  readonly width: number;
  readonly color: Color;
  readonly opacity: number;
  readonly cap: "butt" | "round" | "square";
  readonly join: "miter" | "round" | "bevel" | "curvedBevel";
  readonly miterLimit: number;
}

export interface BrushInput {
  readonly path: Path;
  readonly bounds: Rect;
  readonly stroke: StrokeBase;
  /** Resolved brush seed. Crayon and watercolor use it instead of `ctx.rng`. */
  readonly seed?: bigint;
  /**
   * Thickness profile of the shape. Crayon scales wax by it, including on a
   * closed ring. Omitted means a uniform width. API 1.0: additive.
   */
  readonly thickness?: ThicknessProfile;
}

export interface FillBase {
  readonly weight: number;
  readonly gap: number;
  readonly angle: number;
  readonly color: Color;
  readonly opacity: number;
  /** The shape's outline width in px, used by fills that keep a minimum gap. */
  readonly strokeWidth?: number;
  /** Optional numeric pattern from the shape, used by scribble tightness bands. */
  readonly pattern?: readonly number[];
}

/** Circular or polyline guide for a contour fill. Coordinates match the shape. */
export type ContourGuideInput =
  | { readonly kind: "arc"; readonly x: number; readonly y: number; readonly radius: number }
  | { readonly kind: "polyline"; readonly points: readonly Point[]; readonly closed: boolean };

/** How contour intensity moves from the low end of the gradient to the high end. */
export type ContourEasingName = "linear" | "easeIn" | "easeOut" | "easeInOut";

/** Scroll of a contour field. `phase` is points already traveled along `angle`. */
export interface ContourDriftInput {
  readonly speed: number;
  readonly angle: number;
  readonly phase: number;
}

/**
 * Contour options the host copies from the shape. The plugin schema cannot
 * hold a guide curve, so these travel on the fill input. API 1.0: additive.
 */
export interface ContourInput {
  readonly guide?: ContourGuideInput;
  readonly intensity: number;
  readonly intensityStart?: number;
  readonly intensityEnd?: number;
  readonly gradientAngle: number;
  readonly easing: ContourEasingName;
  readonly falloff: number;
  readonly drift?: ContourDriftInput;
}

/** One crayon-wash band. Lengths are points. `WashPass.sky` is the two-pass sky. */
export interface WashPassInput {
  readonly spacingMin: number;
  readonly spacingSpan: number;
  readonly widthMin: number;
  readonly widthSpan: number;
  readonly opacityMin: number;
  readonly opacitySpan: number;
  readonly trimMax: number;
  readonly angleSpread: number;
  readonly bow: number;
  readonly minLength: number;
  readonly roughness: number;
  readonly bowing: number;
  readonly randomness: number;
  /** Mixed into the drawing seed so two passes do not share a sequence. */
  readonly seed: bigint;
}

export interface FillInput {
  readonly region: FillRegion;
  readonly fill: FillBase;
  /**
   * Drawing seed when the shape set one. Contour uses it for per-slot wobble.
   * Absent means the shared stream, matching an unseeded Swift drawing.
   */
  readonly seed?: bigint;
  /** Present for `.contour`. Ignored by other fills. */
  readonly contour?: ContourInput;
  /**
   * Wash bands. `.wash` uses `WashPass.sky` when this is omitted.
   * A `.contour` fill strokes each centerline with these bands when set.
   */
  readonly washPasses?: readonly WashPassInput[];
}

export type PaintRef =
  | { readonly kind: "solid"; readonly color: Color; readonly alpha?: number }
  | { readonly kind: "stroke"; readonly alpha?: number }
  | { readonly kind: "fill"; readonly alpha?: number }
  | { readonly kind: "paper"; readonly alpha?: number };

export type FillPart =
  | {
      readonly kind: "area";
      readonly paths: readonly Path[];
      readonly fillRule?: FillRule;
      readonly paint?: PaintRef;
      readonly clip?: "region" | "none";
      /**
       * Clip in the same space as `paths`. Watercolor clips to the jittered solid outline,
       * which is not the input region. When set, it wins over `clip: "region"`.
       */
      readonly clipPath?: Path;
    }
  | {
      readonly kind: "strokes";
      readonly centerlines: readonly Path[];
      readonly clip?: "region" | "none";
      /**
       * Multiplier of the fill weight. Contour falloff bands use this.
       * The host clamps it to 0.05...4. API 1.0: additive.
       */
      readonly strokeScale?: number;
      /** Absolute stroke width in px. When set, it replaces weight times scale. */
      readonly strokeWidth?: number;
      /** Multiplier of the fill opacity, clamped by the host to 0...1. */
      readonly opacity?: number;
    };

export interface Sheet {
  readonly paths: readonly Path[];
  readonly fillRule: FillRule;
  readonly bounds: Rect;
  readonly margin: number;
}

export interface TextureInput {
  readonly sheet: Sheet;
  readonly paperColor: Color;
}

export interface EdgeRing {
  readonly points: readonly Point[];
  readonly corner: readonly boolean[];
  readonly hole: boolean;
}

export interface EdgeInput {
  readonly rings: readonly EdgeRing[];
  readonly margin: number;
  readonly smoothness: number;
}

export interface EdgeOutRing {
  readonly path: Path;
  readonly hole: boolean;
}

export interface PluginLayer<R extends string> {
  readonly role: R;
  readonly paths: readonly Path[];
  readonly paint: PaintRef;
  readonly fillRule?: FillRule;
}

export type BrushLayer = PluginLayer<"stroke">;
export type TextureLayer = PluginLayer<"texture">;

export type { FillRegion, FlatSubpath };
