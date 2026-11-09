import type { FillRule, Path, Point, Rect } from "@sketchy-js/types";

/** Seeded random stream owned by one plugin call. */
export interface Rng {
  /** Uniform double in `[0, 1)`. */
  next(): number;
  range(min: number, max: number): number;
  /** Integer in `[minInclusive, maxExclusive)`. */
  int(minInclusive: number, maxExclusive: number): number;
  normal(mean?: number, sd?: number): number;
  chance(p: number): boolean;
  pick<T>(items: readonly [T, ...T[]]): T;
  /** Pure: the same label on the same parent always returns the same stream. Parent draws are not consumed. */
  fork(label: string): Rng;
}

export interface FlatSubpath {
  readonly points: readonly Point[];
  readonly closed: boolean;
  readonly length: number;
}

export interface Sample {
  readonly point: Point;
  readonly tangent: Point;
  readonly normal: Point;
  readonly s: number;
}

export interface Segment {
  readonly a: Point;
  readonly b: Point;
}

/**
 * Analytic description of an elliptical fill region (API 1.1). Fills that lay out differently
 * for an ellipse than for its polygon approximation (hachure chords, dots, radial rays) read it.
 */
export type FillShape =
  | {
      readonly kind: "ellipse";
      readonly cx: number;
      readonly cy: number;
      readonly rx: number;
      readonly ry: number;
    }
  | {
      readonly kind: "arc";
      readonly cx: number;
      readonly cy: number;
      readonly rx: number;
      readonly ry: number;
      readonly start: number;
      readonly stop: number;
    };

/** Region a fill covers, after padding and offset. */
export interface FillRegion {
  readonly rings: readonly FlatSubpath[];
  readonly path: Path;
  readonly bounds: Rect;
  readonly fillRule: FillRule;
  /** Present when the region is an ellipse or an arc sector (API 1.1). `rings` still holds a polygon of it. */
  readonly shape?: FillShape;
}

/**
 * Rough, seeded drawing helpers that consume the scene's main outline stream with Sketchy's
 * exact draw order (API 1.1). They exist so Swift-parity fills (`stream: "shared"`) can emit the
 * same operations as Sketchy without owning the rough-line math.
 */
export interface RoughKit {
  /** Sketchy `RoughMath.doubleLineOps`: two jittered passes, `M C M C`. */
  line(a: Point, b: Point): Path;
  /** Sketchy `RoughMath.ellipseOps`: two jittered passes of a sampled ellipse. */
  ellipse(center: Point, rx: number, ry: number): Path;
  /** Sketchy `RoughMath.randOffsetWithRange`: `roughness * (unit * (max - min) + min)`. */
  offset(min: number, max: number): number;
  /** Sketchy `RoughMath.solidFillPathOps`: a polyline through the points, each jittered by the shape's `maxRandomnessOffset`. */
  solidPolygon(points: readonly Point[]): Path;
  /** Sketchy `RoughMath.solidEllipseStroke`: one closed, jittered ellipse path for a solid fill. */
  solidEllipse(center: Point, rx: number, ry: number): Path;
}

/** Pure geometry helpers; the only geometry a plugin may use. */
export interface GeometryKit {
  flatten(path: Path, tolerance?: number): readonly FlatSubpath[];
  resample(sub: FlatSubpath, spacing: number): readonly Sample[];
  /** Outline polygon of a variable-width band. `closed` yields two rings (outer and inner) for a loop. */
  ribbon(samples: readonly Sample[], halfWidths: readonly number[], closed: boolean): Path;
  polygon(points: readonly Point[], closed?: boolean): Path;
  bounds(path: Path): Rect;
  clipSegments(region: FillRegion, segments: readonly Segment[]): readonly Segment[];
  /** Seeded rough-drawing helpers bound to the current shape's options and stream (API 1.1). */
  readonly rough: RoughKit;
}

export interface PluginContext {
  readonly rng: Rng;
  readonly geom: GeometryKit;
  readonly quality: "draft" | "final";
  readonly maxOps: number;
  warn(code: string, message: string): void;
}
