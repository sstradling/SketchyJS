import { controlPointBounds, svgPathToOps } from "@sketchy-js/core";
import type { Matrix2D, Path, PathOp, Size } from "@sketchy-js/types";

/** The identity matrix. */
export const IDENTITY: Matrix2D = [1, 0, 0, 1, 0, 0];

/**
 * `computeSVGTransform`: scale (uniform, `min(w/bw, h/bh)`) and center the path's control-point
 * box in the canvas. A path with a zero-width or zero-height box gets the identity. The canvas
 * is clamped to at least 1x1.
 */
export function computeSvgTransform(d: string, size: Size): Matrix2D {
  const bounds = controlPointBounds(svgPathToOps(d));
  if (!(bounds.width > 0 && bounds.height > 0)) return IDENTITY;
  const width = Math.max(size.width, 1);
  const height = Math.max(size.height, 1);
  const scale = Math.min(width / bounds.width, height / bounds.height);
  const tx = (width - bounds.width * scale) / 2 - bounds.minX * scale;
  const ty = (height - bounds.height * scale) / 2 - bounds.minY * scale;
  return [scale, 0, 0, scale, tx, ty];
}

/** Applies a matrix to one operation. */
function applyOp(op: PathOp, [a, b, c, d, e, f]: Matrix2D): PathOp {
  const x = (px: number, py: number): number => a * px + c * py + e;
  const y = (px: number, py: number): number => b * px + d * py + f;
  switch (op.op) {
    case "M":
    case "L":
      return { op: op.op, x: x(op.x, op.y), y: y(op.x, op.y) };
    case "Q":
      return {
        op: "Q",
        cx: x(op.cx, op.cy),
        cy: y(op.cx, op.cy),
        x: x(op.x, op.y),
        y: y(op.x, op.y),
      };
    case "C":
      return {
        op: "C",
        c1x: x(op.c1x, op.c1y),
        c1y: y(op.c1x, op.c1y),
        c2x: x(op.c2x, op.c2y),
        c2y: y(op.c2x, op.c2y),
        x: x(op.x, op.y),
        y: y(op.x, op.y),
      };
    case "Z":
      return op;
  }
}

/** Applies an affine matrix to every point of a path. */
export function transformPath(path: Path, matrix: Matrix2D): Path {
  return matrix === IDENTITY ? path : path.map((op) => applyOp(op, matrix));
}
