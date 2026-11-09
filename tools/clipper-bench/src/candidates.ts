import polygonClipping from "polygon-clipping";
import * as clipperTs from "clipper2-ts";
import { circle, ringArea, type MultiPolygon, type Pt, type Ring } from "./geometry.ts";

export type JoinStyle = "round" | "miter";

/** What a sticker backing needs from a clipping backend. */
export interface ClipBackend {
  readonly id: string;
  /** Joins the backend can produce for offsets. */
  readonly joins: readonly JoinStyle[];
  /** Union of all polygons (holes preserved). */
  union(polygons: MultiPolygon): MultiPolygon;
  /** Union, then outward offset by `delta`. Returns `null` when the join style is unsupported. */
  offset(polygons: MultiPolygon, delta: number, join: JoinStyle): MultiPolygon | null;
  dispose?(): void;
}

const SCALE = 1000;

/** Orients a polygon's rings: outer counter-clockwise, holes clockwise (positive winding). */
function orient(polygons: MultiPolygon): Ring[] {
  return polygons.flatMap((polygon) =>
    polygon.map((ring, index) => {
      const ccw = ringArea(ring) > 0;
      return (index === 0) === ccw ? ring : [...ring].reverse();
    }),
  );
}

/** Groups signed rings back into polygons: positive-area rings open a polygon, negative rings are holes. */
function groupRings(rings: Ring[]): MultiPolygon {
  const polygons: MultiPolygon = [];
  const holes: Ring[] = [];
  for (const ring of rings) {
    if (ringArea(ring) > 0) polygons.push([ring]);
    else holes.push(ring);
  }
  for (const hole of holes) {
    const [probeX, probeY] = hole[0] as Pt;
    const owner = polygons.find(
      ([outer]) => outer !== undefined && pointInRing(outer, probeX, probeY),
    );
    if (owner) owner.push(hole);
  }
  return polygons;
}

function pointInRing(ring: Ring, px: number, py: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as Pt;
    const [xj, yj] = ring[j] as Pt;
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const toTsPaths = (rings: Ring[]) =>
  rings.map((ring) =>
    ring.map(([x, y]) => ({ x: Math.round(x * SCALE), y: Math.round(y * SCALE) })),
  );
const fromTsPaths = (paths: { x: number; y: number }[][]): Ring[] =>
  paths.map((path) => path.map((p) => [p.x / SCALE, p.y / SCALE] as Pt));

/** clipper2-ts: pure TypeScript port of Clipper2 (integer coordinates scaled by 1000). */
export function clipper2Ts(): ClipBackend {
  const { FillRule, JoinType, EndType } = clipperTs;
  return {
    id: "clipper2-ts",
    joins: ["round", "miter"],
    union: (polygons) => {
      const result = clipperTs.union(toTsPaths(orient(polygons)), FillRule.NonZero);
      return groupRings(fromTsPaths(result));
    },
    offset(polygons, delta, join) {
      const merged = clipperTs.union(toTsPaths(orient(polygons)), FillRule.NonZero);
      const joinType = join === "round" ? JoinType.Round : JoinType.Miter;
      const inflated = clipperTs.inflatePaths(
        merged,
        delta * SCALE,
        joinType,
        EndType.Polygon,
        4,
        0.25 * SCALE,
      );
      return groupRings(fromTsPaths(inflated));
    },
  };
}

interface WasmModule {
  PathsD: new () => WasmPathsD;
  MakePathD(values: number[]): WasmPathD;
  FillRule: { NonZero: unknown };
  JoinType: { Round: unknown; Miter: unknown };
  EndType: { Polygon: unknown };
  UnionSelfD(paths: WasmPathsD, fillRule: unknown, precision: number): WasmPathsD;
  InflatePathsD(
    paths: WasmPathsD,
    delta: number,
    join: unknown,
    end: unknown,
    miter: number,
    precision: number,
    arcTolerance: number,
  ): WasmPathsD;
}
interface WasmPathD {
  size(): number;
  get(index: number): { x: number; y: number; delete(): void };
  delete(): void;
}
interface WasmPathsD {
  push_back(path: WasmPathD): void;
  size(): number;
  get(index: number): WasmPathD;
  delete(): void;
}

/** clipper2-wasm: the C++ Clipper2 compiled to WebAssembly. Must be loaded asynchronously. */
export async function clipper2Wasm(): Promise<ClipBackend> {
  const factoryModule = (await import("clipper2-wasm/dist/es/clipper2z.js")) as unknown as {
    default: (options?: object) => Promise<WasmModule>;
  };
  const m = await factoryModule.default();
  const toPaths = (rings: Ring[]): WasmPathsD => {
    const paths = new m.PathsD();
    for (const ring of rings) {
      const path = m.MakePathD(ring.flatMap(([x, y]) => [x, y]));
      paths.push_back(path);
      path.delete();
    }
    return paths;
  };
  const fromPaths = (paths: WasmPathsD): Ring[] => {
    const rings: Ring[] = [];
    for (let i = 0; i < paths.size(); i++) {
      const path = paths.get(i);
      const ring: Pt[] = [];
      for (let j = 0; j < path.size(); j++) {
        const point = path.get(j);
        ring.push([point.x, point.y]);
        point.delete();
      }
      path.delete();
      rings.push(ring);
    }
    return rings;
  };
  return {
    id: "clipper2-wasm",
    joins: ["round", "miter"],
    union(polygons) {
      const input = toPaths(orient(polygons));
      const output = m.UnionSelfD(input, m.FillRule.NonZero, 3);
      const rings = fromPaths(output);
      input.delete();
      output.delete();
      return groupRings(rings);
    },
    offset(polygons, delta, join) {
      const input = toPaths(orient(polygons));
      const merged = m.UnionSelfD(input, m.FillRule.NonZero, 3);
      const inflated = m.InflatePathsD(
        merged,
        delta,
        join === "round" ? m.JoinType.Round : m.JoinType.Miter,
        m.EndType.Polygon,
        4,
        3,
        0.25,
      );
      const rings = fromPaths(inflated);
      input.delete();
      merged.delete();
      inflated.delete();
      return groupRings(rings);
    },
  };
}

/**
 * polygon-clipping: robust union only. It has no offsetting, so a round dilation is built as the
 * union of the shape with a rectangle per edge and a disc per vertex, which is the same trick as
 * Sketchy's round-dilation fallback. Miter joins are not available.
 */
export function polygonClippingBackend(): ClipBackend {
  const toGeom = (polygons: MultiPolygon) =>
    polygons.map((polygon) =>
      polygon.map((ring) => [...ring.map(([x, y]) => [x, y] as [number, number])]),
    );
  const fromGeom = (geom: polygonClipping.MultiPolygon): MultiPolygon =>
    geom.map((polygon) =>
      polygon.map((ring) => ring.slice(0, -1).map(([x, y]) => [x, y] as Pt)),
    );
  return {
    id: "polygon-clipping",
    joins: ["round"],
    union(polygons) {
      const [first, ...rest] = toGeom(polygons);
      if (!first) return [];
      return fromGeom(
        polygonClipping.union(
          first,
          ...(rest as polygonClipping.Polygon[]),
        ),
      );
    },
    offset(polygons, delta, join) {
      if (join !== "round") return null;
      const pieces: polygonClipping.Polygon[] = toGeom(polygons);
      for (const polygon of polygons) {
        for (const ring of polygon) {
          ring.forEach((a, index) => {
            const b = ring[(index + 1) % ring.length] as Pt;
            const dx = b[0] - a[0];
            const dy = b[1] - a[1];
            const length = Math.hypot(dx, dy);
            if (length > 0) {
              const nx = (-dy / length) * delta;
              const ny = (dx / length) * delta;
              pieces.push([
                [
                  [a[0] + nx, a[1] + ny],
                  [b[0] + nx, b[1] + ny],
                  [b[0] - nx, b[1] - ny],
                  [a[0] - nx, a[1] - ny],
                ],
              ]);
            }
            pieces.push([circle(a, delta, 12).map(([x, y]) => [x, y] as [number, number])]);
          });
        }
      }
      const [first, ...rest] = pieces;
      if (!first) return [];
      return fromGeom(polygonClipping.union(first, ...rest));
    },
  };
}
