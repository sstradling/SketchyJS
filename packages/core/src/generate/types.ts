import type { FillRule, Path, PathOp, ShapeKind, SketchOptions } from "@sketchy-js/types";
import type { RoughCtx, Pt } from "../rough/context.js";

/**
 * What a generated set of operations is, following Sketchy's `OperationSetType`:
 * `path` outline strokes, `fillPath` a painted area, `fillSketch` fill strokes,
 * `path2DFill` an SVG-path area (the path text is carried in `path`), and `path2DPattern`
 * fill strokes that the renderer clips to the SVG path.
 */
export type OperationSetType = "path" | "fillPath" | "fillSketch" | "path2DFill" | "path2DPattern";

/** One group of operations (`OperationSet`). */
export interface OperationSet {
  readonly type: OperationSetType;
  readonly ops: readonly PathOp[];
  /** SVG path text for `path`-shape outlines and `path2D*` fills. */
  readonly path?: string;
  /** Bounding box size of the SVG path for `path2DPattern`. */
  readonly size?: { readonly width: number; readonly height: number };
  /** Clip applied to this set, in the same space as `ops` (scribble on a polygon or SVG path). */
  readonly clip?: Path;
  /** Per-path opacity for a fill that paints several glazes. Falls back to the shape fill opacity. */
  readonly opacity?: number;
  /** Fill rule for this set. Omitted means nonzero. */
  readonly fillRule?: FillRule;
}

/** Generated geometry for one shape before layer assembly (`Drawing`). */
export interface SketchDrawing {
  readonly shape: ShapeKind;
  readonly sets: readonly OperationSet[];
  readonly options: SketchOptions;
}

/** The area a fill covers, after padding and offset. */
export type FillRegionSpec =
  | { readonly kind: "polygon"; readonly points: readonly Pt[] }
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
      /** `[center, arc samples...]`, the polygon every non-radial fill uses for an arc sector. */
      readonly points: readonly Pt[];
    };

/**
 * The fill generator the host plugs into `generateDrawing`. The core owns padding, offset and
 * draw order; the stage owns choosing and running the fill plugin.
 */
export interface FillStage {
  /** True when `style` paints an area directly, so SVG paths skip the generator (Sketchy's solid shortcut). */
  paintsArea(style: string): boolean;
  /** Runs the fill for `region` on the shared stream and returns its operation sets. */
  run(region: FillRegionSpec, ctx: RoughCtx): readonly OperationSet[];
}
