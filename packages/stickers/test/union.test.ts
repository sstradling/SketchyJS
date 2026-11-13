import { describe, expect, it } from "vitest";
import { combineSilhouettes, type SilhouetteRing } from "../src/union.js";

function square(
  x: number,
  y: number,
  w: number,
  h: number,
  shape: number,
  isHole = false,
): SilhouetteRing {
  return {
    shape,
    isHole,
    points: [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ],
  };
}

function covers(point: { x: number; y: number }, rings: readonly SilhouetteRing[]): boolean {
  let hits = 0;
  for (const ring of rings) {
    let inside = false;
    let prev = ring.points.length - 1;
    for (let i = 0; i < ring.points.length; i++) {
      const cy = ring.points[i]!.y;
      const py = ring.points[prev]!.y;
      if (cy > point.y !== py > point.y) {
        const x =
          ((ring.points[prev]!.x - ring.points[i]!.x) * (point.y - cy)) / (py - cy) +
          ring.points[i]!.x;
        if (point.x < x) inside = !inside;
      }
      prev = i;
    }
    if (inside) hits += 1;
  }
  return hits % 2 === 1;
}

describe("silhouette union", () => {
  it("merges overlapping squares into one exterior", () => {
    const combined = combineSilhouettes([square(0, 0, 100, 80, 0), square(60, 0, 100, 80, 1)]);
    expect(combined.filter((ring) => !ring.isHole)).toHaveLength(1);
    expect(covers({ x: 30, y: 40 }, combined)).toBe(true);
    expect(covers({ x: 80, y: 40 }, combined)).toBe(true);
    expect(covers({ x: 140, y: 40 }, combined)).toBe(true);
    expect(covers({ x: 180, y: 40 }, combined)).toBe(false);
  });

  it("keeps disconnected squares apart", () => {
    const combined = combineSilhouettes([square(0, 0, 40, 40, 0), square(200, 10, 40, 40, 1)]);
    expect(combined.filter((ring) => !ring.isHole)).toHaveLength(2);
    expect(covers({ x: 120, y: 20 }, combined)).toBe(false);
  });

  it("does not bridge a shared corner", () => {
    const combined = combineSilhouettes([square(0, 0, 50, 50, 0), square(50, 50, 50, 50, 1)]);
    expect(combined.filter((ring) => !ring.isHole)).toHaveLength(2);
    expect(covers({ x: 10, y: 10 }, combined)).toBe(true);
    expect(covers({ x: 80, y: 80 }, combined)).toBe(true);
    expect(covers({ x: 25, y: 75 }, combined)).toBe(false);
  });

  it("unions 40 disjoint squares", () => {
    const rings = Array.from({ length: 40 }, (_, index) => square(index * 5, 0, 3, 3, index));
    const started = performance.now();
    const combined = combineSilhouettes(rings);
    const elapsed = performance.now() - started;
    expect(combined.filter((ring) => !ring.isHole)).toHaveLength(40);
    expect(elapsed).toBeLessThan(1000);
  });

  it("keeps a nested hole until another shape fills it", () => {
    const open = combineSilhouettes([square(0, 0, 120, 120, 0), square(40, 40, 40, 40, 0, true)]);
    expect(open.filter((ring) => ring.isHole)).toHaveLength(1);
    expect(covers({ x: 60, y: 60 }, open)).toBe(false);
    expect(covers({ x: 20, y: 60 }, open)).toBe(true);
    const filled = combineSilhouettes([
      square(0, 0, 120, 120, 0),
      square(40, 40, 40, 40, 0, true),
      square(36, 36, 48, 48, 1),
    ]);
    expect(filled.every((ring) => !ring.isHole)).toBe(true);
    expect(covers({ x: 60, y: 60 }, filled)).toBe(true);
  });
});
