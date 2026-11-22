/** One drawing operation. Coordinates are absolute. */
export type PathOp =
  | { op: "M"; x: number; y: number }
  | { op: "L"; x: number; y: number }
  | { op: "Q"; cx: number; cy: number; x: number; y: number }
  | { op: "C"; c1x: number; c1y: number; c2x: number; c2y: number; x: number; y: number }
  | { op: "Z" };

/** An ordered list of operations forming one or more subpaths. */
export type Path = readonly PathOp[];

/** SVG fill rule. Sticker sheets use `evenodd` so holes stay empty. */
export type FillRule = "nonzero" | "evenodd";
