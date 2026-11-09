import { SplitMix64 } from "../../../packages/core/src/index.ts";
import { circle, type MultiPolygon, type Polygon, type Pt, type Ring } from "./geometry.ts";

/** One benchmark input, shaped after the sticker backing pipeline. */
export interface Fixture {
  id: string;
  description: string;
  polygons: MultiPolygon;
  /** Outward offset in scene units (sticker width plus half the stroke width). */
  offset: number;
}

/** Seeded float in [0, 1) from SplitMix64, so fixtures are identical on every machine. */
function floats(seed: bigint): () => number {
  const rng = new SplitMix64(seed);
  return () => Number(rng.nextU64() >> 11n) / 2 ** 53;
}

/** A spiky concave star: alternating outer and inner radii with jitter. */
function star(center: Pt, outer: number, inner: number, points: number, next: () => number): Ring {
  const ring: Pt[] = [];
  for (let i = 0; i < points * 2; i++) {
    const radius = (i % 2 === 0 ? outer : inner) * (0.9 + 0.2 * next());
    const t = (Math.PI * i) / points;
    ring.push([center[0] + radius * Math.cos(t), center[1] + radius * Math.sin(t)]);
  }
  return ring;
}

/** A rounded rectangle flattened to a polygon, rotated about its center. */
function roundedRect(
  center: Pt,
  w: number,
  h: number,
  radius: number,
  angle: number,
  arcSteps: number,
): Ring {
  const ring: Pt[] = [];
  const corners: [number, number, number][] = [
    [w / 2 - radius, h / 2 - radius, 0],
    [-w / 2 + radius, h / 2 - radius, Math.PI / 2],
    [-w / 2 + radius, -h / 2 + radius, Math.PI],
    [w / 2 - radius, -h / 2 + radius, (3 * Math.PI) / 2],
  ];
  for (const [cx, cy, start] of corners) {
    for (let s = 0; s <= arcSteps; s++) {
      const t = start + ((Math.PI / 2) * s) / arcSteps;
      const x = cx + radius * Math.cos(t);
      const y = cy + radius * Math.sin(t);
      ring.push([
        center[0] + x * Math.cos(angle) - y * Math.sin(angle),
        center[1] + x * Math.sin(angle) + y * Math.cos(angle),
      ]);
    }
  }
  return ring;
}

function concaveStar(points: number, seed: bigint): Fixture {
  const next = floats(seed);
  return {
    id: `concave-star-${points}`,
    description: `Single deeply concave star with ${points * 2} vertices, offset 10 (miter joins would spike at every inner vertex).`,
    polygons: [[star([300, 300], 260, 90, points, next)]],
    offset: 10,
  };
}

/** Outer ring with three holes, one of them thin enough that a large offset closes it. */
function compoundHoles(): Fixture {
  const outer = circle([300, 300], 250, 96);
  const bigHole = circle([220, 300], 70, 64).reverse();
  const smallHole = circle([400, 260], 24, 32).reverse();
  const thinHole: Ring = [
    [330, 360],
    [470, 360],
    [470, 372],
    [330, 372],
  ];
  const polygon: Polygon = [outer, bigHole, smallHole, thinHole.reverse()];
  return {
    id: "compound-holes",
    description:
      "Outer ring and three holes. Offset 8 shrinks the holes and closes the 12 unit slot, so hole topology must change.",
    polygons: [polygon],
    offset: 8,
  };
}

/** Many overlapping rounded rectangles: the SketchGroup shared-sheet case. */
function denseGroup(count: number, seed: bigint): Fixture {
  const next = floats(seed);
  const polygons: MultiPolygon = [];
  for (let i = 0; i < count; i++) {
    const w = 60 + next() * 120;
    const h = 40 + next() * 100;
    polygons.push([
      roundedRect(
        [80 + next() * 440, 80 + next() * 440],
        w,
        h,
        12 + next() * 10,
        next() * Math.PI,
        10,
      ),
    ]);
  }
  return {
    id: `dense-group-${count}`,
    description: `${count} overlapping rotated rounded rectangles (${count * 44} vertices), unioned then offset 8.`,
    polygons,
    offset: 8,
  };
}

/** The fixtures used by the benchmark. Concave, compound-hole and dense-group cases, as the plan requires. */
export function fixtures(): Fixture[] {
  return [
    concaveStar(24, 1n),
    concaveStar(120, 2n),
    compoundHoles(),
    denseGroup(20, 3n),
    denseGroup(80, 4n),
    denseGroup(200, 5n),
  ];
}
