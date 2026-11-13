import type { Path, PathOp } from "@sketchy-js/plugin";

const KAPPA = 0.5522847498307936;

/**
 * Ellipse in a rect centered on the origin, then rotated and translated.
 * Four cubics, starting at the local right point. Matches `CGPath(ellipseIn:transform:)`.
 */
export function ellipsePath(
  centerX: number,
  centerY: number,
  angle: number,
  length: number,
  thickness: number,
): Path {
  const rx = length / 2;
  const ry = thickness / 2;
  const k = KAPPA;
  const local: PathOp[] = [
    { op: "M", x: rx, y: 0 },
    { op: "C", c1x: rx, c1y: ry * k, c2x: rx * k, c2y: ry, x: 0, y: ry },
    { op: "C", c1x: -rx * k, c1y: ry, c2x: -rx, c2y: ry * k, x: -rx, y: 0 },
    { op: "C", c1x: -rx, c1y: -ry * k, c2x: -rx * k, c2y: -ry, x: 0, y: -ry },
    { op: "C", c1x: rx * k, c1y: -ry, c2x: rx, c2y: -ry * k, x: rx, y: 0 },
    { op: "Z" },
  ];
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const map = (x: number, y: number): { x: number; y: number } => ({
    x: c * x - s * y + centerX,
    y: s * x + c * y + centerY,
  });
  return local.map((op): PathOp => {
    if (op.op === "M" || op.op === "L") {
      const p = map(op.x, op.y);
      return { op: op.op, x: p.x, y: p.y };
    }
    if (op.op === "C") {
      const c1 = map(op.c1x, op.c1y);
      const c2 = map(op.c2x, op.c2y);
      const p = map(op.x, op.y);
      return { op: "C", c1x: c1.x, c1y: c1.y, c2x: c2.x, c2y: c2.y, x: p.x, y: p.y };
    }
    return { op: "Z" };
  });
}
