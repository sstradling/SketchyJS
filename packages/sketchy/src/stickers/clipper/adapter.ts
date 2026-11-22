import { EndType, FillRule, JoinType, inflatePaths, union } from "clipper2-ts";

/**
 * The only module that imports `clipper2-ts`.
 *
 * Scale is 1000 (thousandths of a pixel), the same factor the Phase 0 benchmark
 * used. Changing it changes integer rounding and is a geometry change.
 * The Darwin sticker contours do not go through this adapter: they are cubics
 * from Sketchy's own offset, matched in `builder.ts`. This adapter is the
 * general boolean and offset backend.
 */
export const CLIPPER_SCALE = 1000;

export interface Ring {
  readonly points: readonly { x: number; y: number }[];
  /** True when this ring is a hole of the previous outer ring. */
  readonly hole?: boolean;
}

export type PolygonJoin = "miter" | "round";

export interface PolygonBackend {
  readonly id: "clipper2-ts";
  union(rings: readonly Ring[], fillRule: "nonzero" | "evenodd"): Ring[];
  offset(rings: readonly Ring[], delta: number, join: PolygonJoin, miterLimit?: number): Ring[];
}

type Path64 = { x: number; y: number }[];

const toPaths = (rings: readonly Ring[]): Path64[] =>
  rings.map((ring) =>
    ring.points.map((p) => ({
      x: Math.round(p.x * CLIPPER_SCALE),
      y: Math.round(p.y * CLIPPER_SCALE),
    })),
  );

const fromPaths = (paths: Path64[]): Ring[] =>
  paths.map((path) => ({
    points: path.map((p) => ({ x: p.x / CLIPPER_SCALE, y: p.y / CLIPPER_SCALE })),
  }));

function rule(fillRule: "nonzero" | "evenodd"): FillRule {
  return fillRule === "evenodd" ? FillRule.EvenOdd : FillRule.NonZero;
}

/** Clipper2 union and inflate, hidden behind `PolygonBackend`. */
export function clipperBackend(): PolygonBackend {
  return {
    id: "clipper2-ts",
    union(rings, fillRule) {
      return fromPaths(union(toPaths(rings), rule(fillRule)));
    },
    offset(rings, delta, join, miterLimit = 2) {
      const merged = union(toPaths(rings), FillRule.NonZero);
      const inflated = inflatePaths(
        merged,
        delta * CLIPPER_SCALE,
        join === "round" ? JoinType.Round : JoinType.Miter,
        EndType.Polygon,
        miterLimit,
        0.25 * CLIPPER_SCALE,
      );
      return fromPaths(inflated);
    },
  };
}
