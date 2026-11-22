/** A point in scene coordinates (y grows downward, as in SVG and Canvas). */
export interface Point {
  x: number;
  y: number;
}

/** A width and height in scene units. */
export interface Size {
  width: number;
  height: number;
}

/** An axis-aligned rectangle. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A 2D affine matrix in SVG order: `[a, b, c, d, e, f]` maps (x, y) to (ax + cy + e, bx + dy + f). */
export type Matrix2D = readonly [a: number, b: number, c: number, d: number, e: number, f: number];
