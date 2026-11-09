import type { FillBase, FillInput, FillShape, Path, PathOp, Point } from "@sketchy-js/plugin";
import type { HachureParams } from "./hachure-lines.js";
import type { Pt } from "./line-helper.js";

/** The Swift-facing view of a fill region: a polygon, or an analytic ellipse or arc sector. */
export interface RegionView {
  /** Polygon points of the region (the first ring). */
  readonly polygon: readonly Pt[];
  readonly shape: FillShape | undefined;
}

/** Reads the polygon and optional analytic shape out of a `FillInput`. */
export function regionView(input: FillInput): RegionView {
  const ring = input.region.rings[0];
  const polygon = ring ? ring.points.map((p: Point): Pt => [p.x, p.y]) : [];
  return { polygon, shape: input.region.shape };
}

/** Hachure parameters of a fill input. */
export function hachureParams(fill: FillBase, angle = fill.angle, gap = fill.gap): HachureParams {
  return { angle, gap, strokeWidth: fill.strokeWidth ?? 1 };
}

/** Appends `ops` to a centerline list as one path, preserving operation order. */
export function concat(parts: readonly Path[]): Path {
  const out: PathOp[] = [];
  for (const part of parts) for (const op of part) out.push(op);
  return out;
}
