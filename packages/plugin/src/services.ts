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

/** Region a fill covers, after padding and offset. */
export interface FillRegion {
  readonly rings: readonly FlatSubpath[];
  readonly path: Path;
  readonly bounds: Rect;
  readonly fillRule: FillRule;
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
}

export interface PluginContext {
  readonly rng: Rng;
  readonly geom: GeometryKit;
  readonly quality: "draft" | "final";
  readonly maxOps: number;
  warn(code: string, message: string): void;
}
