import { SplitMix64, swiftDoubleInRange } from "@sketchy-js/core";
import type { Pt } from "./geom.js";
import { dist, segmentsIntersect, signedArea } from "./geom.js";
import { outwardNormals } from "./offset.js";

const MASK = (1n << 64n) - 1n;
const wrap = (value: bigint): bigint => value & MASK;

/**
 * Chops a ring along its outward normal. The same seed repeats the facets.
 * `CGFloat.random` is `Double.random`, so the draws go through `swiftDoubleInRange`.
 */
export function chop(
  points: readonly Pt[],
  closed: boolean,
  depth: number,
  length: number,
  jaggedness: number,
  seed: bigint,
): Pt[] {
  if (points.length < 2 || depth <= 0) return points.slice();
  const normals = outwardNormals(points, closed);
  const facetLength = Math.max(4, length);
  let traveled = 0;
  return points.map((point, index) => {
    if (index > 0) traveled += dist(points[index - 1]!, point);
    const facet = Math.floor(traveled / facetLength);
    const facetRng = new SplitMix64(wrap(seed + BigInt(facet) * 0x9e3779b97f4a7c15n));
    const facetShift = swiftDoubleInRange(facetRng, -1, 1) * depth;
    let nick = 0;
    if (jaggedness > 0) {
      const nickRng = new SplitMix64(wrap(seed + BigInt(index) * 0xbf58476d1ce4e5b9n));
      nick = swiftDoubleInRange(nickRng, -1, 1) * jaggedness * depth * 0.35;
    }
    const normal = normals[index]!;
    return {
      x: point.x + normal.x * (facetShift + nick),
      y: point.y + normal.y * (facetShift + nick),
    };
  });
}

/** Chops `ring`, halving the depth until the ring stays simple and keeps its winding. */
export function choppedOffset(
  ring: readonly Pt[],
  depth: number,
  length: number,
  jaggedness: number,
  seed: bigint,
): Pt[] {
  let attempt = depth;
  let best = ring.slice();
  for (let i = 0; i < 5; i++) {
    const chopped = chop(ring, true, attempt, length, jaggedness, seed);
    if (!segmentsIntersect(chopped) && signedArea(chopped) * signedArea(ring) > 0) return chopped;
    best = chopped;
    attempt *= 0.5;
    if (attempt < 0.75) return ring.slice();
  }
  return segmentsIntersect(best) ? ring.slice() : best;
}
